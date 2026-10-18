import { z } from "zod";
import {
  availability,
  entrySchema,
  ruleSchema,
  stateDuring,
  type Entry,
  type Rule,
} from "../../domain/availability";
import type { User } from "../auth";
import { body, HttpError, json } from "../http";

export async function readAvailability(
  db: D1Database,
  owner: string,
  start: string,
  end: string,
  excludePlan?: string,
) {
  const [entries, rules, version, internal] = await Promise.all([
    db
      .prepare(
        "SELECT id,start,end,state,zone,label FROM availability_entries WHERE user_id=? AND start<? AND end>? ORDER BY start LIMIT 1001",
      )
      .bind(owner, end, start)
      .all<Entry>(),
    db
      .prepare(
        "SELECT id,weekday,start_time AS startTime,end_time AS endTime,effective_start AS effectiveStart,effective_end AS effectiveEnd,state,zone,disambiguation FROM availability_rules WHERE user_id=? ORDER BY weekday,start_time LIMIT 101",
      )
      .bind(owner)
      .all<Rule>(),
    db
      .prepare("SELECT version FROM availability_versions WHERE user_id=?")
      .bind(owner)
      .first<{ version: number }>(),
    db
      .prepare(
        "SELECT p.start_ms AS start,p.end_ms AS end FROM plans p JOIN participation m ON m.plan_id=p.id WHERE m.user_id=? AND m.status IN ('confirmed','reconfirmation') AND p.status='confirmed' AND p.start_ms<? AND p.end_ms>? AND p.id!=? LIMIT 100",
      )
      .bind(owner, Date.parse(end), Date.parse(start), excludePlan ?? "")
      .all<{ start: number; end: number }>(),
  ]);
  if (entries.results.length > 1000 || rules.results.length > 100)
    throw new HttpError(422, "Narrow the date range.");
  return {
    entries: entries.results,
    rules: rules.results,
    version: version?.version ?? 0,
    external: internal.results.map((i) => ({
      ...i,
      state: "Busy" as const,
      priority: 3,
    })),
  };
}
export async function canRead(
  db: D1Database,
  actor: string,
  owner: string,
): Promise<boolean> {
  return (
    actor === owner ||
    Boolean(
      await db
        .prepare(
          "SELECT 1 FROM sharing_grants WHERE owner_id=? AND viewer_id=?",
        )
        .bind(owner, actor)
        .first(),
    )
  );
}
export function windowRange(url: URL): { start: string; end: string } {
  const now = Date.now();
  const start = Date.parse(
    url.searchParams.get("start") ?? new Date(now).toISOString(),
  );
  if (!Number.isFinite(start))
    throw new HttpError(400, "Use a valid start date.");
  const end = Date.parse(
    url.searchParams.get("end") ??
      new Date(start + 31 * 86400000).toISOString(),
  );
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start ||
    end - start > 367 * 86400000
  )
    throw new HttpError(400, "Use a valid range of at most twelve months.");
  if (start < now - 2 * 86400000 || end > now + 367 * 86400000)
    throw new HttpError(400, "Dates must be within the next twelve months.");
  return {
    start: new Date(start).toISOString(),
    end: new Date(end).toISOString(),
  };
}
function requireHorizon(start: string, end: string): void {
  const now = Date.now();
  if (
    Date.parse(start) < now - 86400000 ||
    Date.parse(end) > now + 367 * 86400000
  )
    throw new HttpError(400, "Use dates within the next twelve months.");
}
export async function availabilityRoute(
  request: Request,
  env: Env,
  user: User,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === "GET" && path === "/api/availability") {
    const { start, end } = windowRange(url);
    const owner = url.searchParams.get("owner") ?? user.id;
    if (!(await canRead(env.DB, user.id, owner)))
      throw new HttpError(404, "Availability not found.");
    const result = await readAvailability(env.DB, owner, start, end);
    // Shared data never includes labels; visibility is rechecked on every request.
    return json({
      ...result,
      entries: result.entries.map((e) => ({
        ...e,
        label: owner === user.id ? e.label : "",
      })),
      owner,
      coverage:
        "Manual entries and confirmed plans; uncovered time is Unknown. External calendars are not connected.",
    });
  }
  if (request.method === "POST" && path === "/api/availability/recheck") {
    const input = z
      .object({
        start: z.iso.datetime(),
        end: z.iso.datetime(),
        owners: z.array(z.string().max(100)).min(1).max(20),
      })
      .parse(await body(request));
    if (
      Date.parse(input.end) <= Date.parse(input.start) ||
      Date.parse(input.end) - Date.parse(input.start) > 86400000
    )
      throw new HttpError(400, "Recheck one interval of at most 24 hours.");
    requireHorizon(input.start, input.end);
    const results = [];
    for (const owner of [...new Set(input.owners)]) {
      if (!(await canRead(env.DB, user.id, owner)))
        throw new HttpError(404, "Availability not found.");
      const data = await readAvailability(
        env.DB,
        owner,
        input.start,
        input.end,
      );
      const computed = availability(
        data,
        Date.parse(input.start),
        Date.parse(input.end),
      );
      results.push({
        owner,
        version: data.version,
        state: stateDuring(
          computed.segments,
          Date.parse(input.start),
          Date.parse(input.end),
        ),
        warnings: computed.warnings,
      });
    }
    return json({
      results,
      requiresAcknowledgement: results.some((r) => r.state !== "Available"),
      checkedAt: new Date().toISOString(),
    });
  }
  if (request.method === "POST" && path === "/api/availability/entries") {
    const input = entrySchema.parse(await body(request));
    requireHorizon(input.start, input.end);
    const id = crypto.randomUUID();
    const start = new Date(input.start).toISOString();
    const end = new Date(input.end).toISOString();
    const result = await env.DB.prepare(
      "INSERT INTO availability_entries(id,user_id,start,end,state,zone,label) SELECT ?,?,?,?,?,?,? WHERE (SELECT count(*) FROM availability_entries WHERE user_id=?)<1000",
    )
      .bind(
        id,
        user.id,
        start,
        end,
        input.state,
        input.zone,
        input.label,
        user.id,
      )
      .run();
    if (!result.meta.changes)
      throw new HttpError(409, "The local limit is 1,000 entries per member.");
    return json({ id }, 201);
  }
  if (request.method === "POST" && path === "/api/availability/rules") {
    const input = ruleSchema.parse(await body(request));
    requireHorizon(
      `${input.effectiveStart}T00:00:00Z`,
      `${input.effectiveEnd}T00:00:00Z`,
    );
    const id = crypto.randomUUID();
    const result = await env.DB.prepare(
      "INSERT INTO availability_rules(id,user_id,weekday,start_time,end_time,effective_start,effective_end,state,zone,disambiguation) SELECT ?,?,?,?,?,?,?,?,?,? WHERE (SELECT count(*) FROM availability_rules WHERE user_id=?)<100",
    )
      .bind(
        id,
        user.id,
        input.weekday,
        input.startTime,
        input.endTime,
        input.effectiveStart,
        input.effectiveEnd,
        input.state,
        input.zone,
        input.disambiguation,
        user.id,
      )
      .run();
    if (!result.meta.changes)
      throw new HttpError(
        409,
        "The local limit is 100 weekly rules per member.",
      );
    return json({ id }, 201);
  }
  const item = /^\/api\/availability\/(entries|rules)\/([\w-]+)$/.exec(path);
  if (item && request.method === "DELETE") {
    const table =
      item[1] === "entries" ? "availability_entries" : "availability_rules";
    const result = await env.DB.prepare(
      `DELETE FROM ${table} WHERE id=? AND user_id=?`,
    )
      .bind(item[2], user.id)
      .run();
    if (!result.meta.changes) throw new HttpError(404, "Entry not found.");
    return json({ deleted: true });
  }
  if (item && request.method === "PUT" && item[1] === "entries") {
    const input = entrySchema.parse(await body(request));
    requireHorizon(input.start, input.end);
    const result = await env.DB.prepare(
      "UPDATE availability_entries SET start=?,end=?,state=?,zone=?,label=? WHERE id=? AND user_id=?",
    )
      .bind(
        new Date(input.start).toISOString(),
        new Date(input.end).toISOString(),
        input.state,
        input.zone,
        input.label,
        item[2],
        user.id,
      )
      .run();
    if (!result.meta.changes) throw new HttpError(404, "Entry not found.");
    return json({ updated: true });
  }
  throw new HttpError(404, "Route not found.");
}
