import { z } from "zod";
import {
  draftSchema,
  validatePlanTimes,
  type DraftInput,
  type Plan,
} from "../../domain/plans";
import { availability, stateDuring } from "../../domain/availability";
import { body, HttpError, json } from "../http";
import type { User } from "../auth";
import { accessiblePlan, planAccess } from "../plans-access";
import { expirePlan, promote } from "../jobs";
import { readAvailability, canRead } from "./availability";

async function validateDraft(db: D1Database, input: DraftInput, user: User) {
  try {
    validatePlanTimes(input);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  if (
    input.visibility === "group" &&
    !(await db
      .prepare("SELECT 1 FROM group_members WHERE group_id=? AND user_id=?")
      .bind(input.groupId, user.id)
      .first())
  )
    throw new HttpError(403, "Choose a group you belong to.");
  for (const id of new Set(input.invitees))
    if (
      !(await db
        .prepare("SELECT 1 FROM users WHERE id=? AND status='active'")
        .bind(id)
        .first())
    )
      throw new HttpError(400, "An invitee is not an active member.");
}
async function conflict(
  db: D1Database,
  viewer: string,
  owner: string,
  start: number,
  end: number,
  excludePlan?: string,
) {
  if (!(await canRead(db, viewer, owner))) return true;
  const data = await readAvailability(
    db,
    owner,
    new Date(start).toISOString(),
    new Date(end).toISOString(),
    excludePlan,
  );
  return (
    stateDuring(availability(data, start, end).segments, start, end) !==
    "Available"
  );
}
async function requireAcknowledgement(
  db: D1Database,
  viewer: string,
  owners: string[],
  start: number | null,
  end: number | null,
  acknowledged: boolean,
  excludePlan?: string,
) {
  if (start === null || end === null) return;
  for (const owner of owners)
    if (
      (await conflict(db, viewer, owner, start, end, excludePlan)) &&
      !acknowledged
    )
      throw new HttpError(
        409,
        "This time includes Busy or Unknown availability. Review it and acknowledge the uncertainty to continue.",
      );
}
async function detail(db: D1Database, plan: Plan) {
  const candidates = await db
    .prepare(
      "SELECT id,start_ms,end_ms FROM candidates WHERE plan_id=? ORDER BY start_ms",
    )
    .bind(plan.id)
    .all<{ id: string; start_ms: number; end_ms: number }>();
  const votes = await db
    .prepare(
      "SELECT v.* FROM votes v JOIN candidates c ON c.id=v.candidate_id WHERE c.plan_id=?",
    )
    .bind(plan.id)
    .all<{ candidate_id: string; user_id: string; response: string }>();
  const participants = await db
    .prepare(
      "SELECT m.user_id,u.name,m.status,m.accepted_version,m.expires_at,m.revision FROM participation m JOIN users u ON u.id=m.user_id WHERE m.plan_id=? ORDER BY m.joined_at,m.user_id",
    )
    .bind(plan.id)
    .all();
  const invitees = await db
    .prepare("SELECT user_id FROM plan_invitees WHERE plan_id=?")
    .bind(plan.id)
    .all<{ user_id: string }>();
  return {
    plan,
    candidates: candidates.results.map((c) => ({
      ...c,
      votes: votes.results
        .filter((v) => v.candidate_id === c.id)
        .map((v) => ({ user_id: v.user_id, response: v.response })),
    })),
    participants: participants.results,
    invitees: invitees.results.map((i) => i.user_id),
  };
}
function childRows(
  db: D1Database,
  id: string,
  mutation: string,
  input: DraftInput,
): D1PreparedStatement[] {
  const rows: D1PreparedStatement[] = [
    db
      .prepare(
        "DELETE FROM plan_invitees WHERE plan_id=? AND EXISTS(SELECT 1 FROM plans WHERE id=? AND mutation_id=?)",
      )
      .bind(id, id, mutation),
    db
      .prepare(
        "DELETE FROM candidates WHERE plan_id=? AND EXISTS(SELECT 1 FROM plans WHERE id=? AND mutation_id=?)",
      )
      .bind(id, id, mutation),
  ];
  for (const user of new Set(input.invitees))
    rows.push(
      db
        .prepare(
          "INSERT INTO plan_invitees SELECT ?,? WHERE EXISTS(SELECT 1 FROM plans WHERE id=? AND mutation_id=?)",
        )
        .bind(id, user, id, mutation),
    );
  for (const time of input.time ? [] : input.candidates)
    rows.push(
      db
        .prepare(
          "INSERT INTO candidates SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM plans WHERE id=? AND mutation_id=?)",
        )
        .bind(
          crypto.randomUUID(),
          id,
          Date.parse(time.start),
          Date.parse(time.end),
          id,
          mutation,
        ),
    );
  return rows;
}
export async function plansRoute(
  request: Request,
  env: Env,
  user: User,
): Promise<Response> {
  const db = env.DB;
  const url = new URL(request.url);
  const path = url.pathname;
  const now = Date.now();
  if (path === "/api/plans" && request.method === "GET") {
    const results = await db
      .prepare(
        `SELECT p.* FROM plans p WHERE ${planAccess} ORDER BY p.created_at DESC,p.id LIMIT 100`,
      )
      .bind(user.id, user.id, user.id)
      .all<Plan>();
    return json({
      plans: results.results.map((p) => ({
        ...p,
        status:
          p.status === "confirmed" && p.end_ms !== null && p.end_ms <= now
            ? "completed"
            : p.status,
      })),
    });
  }
  if (path === "/api/plans" && request.method === "POST") {
    const input = draftSchema.parse(await body(request));
    await validateDraft(db, input, user);
    const id = crypto.randomUUID();
    const mutation = crypto.randomUUID();
    await db.batch([
      db
        .prepare(
          `INSERT INTO plans(id,organizer_id,title,description,category,venue,zone,visibility,group_id,join_policy,capacity,organizer_attends,start_ms,end_ms,join_deadline,mutation_id,modified_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          id,
          user.id,
          input.title,
          input.description,
          input.category,
          input.venue,
          input.zone,
          input.visibility,
          input.groupId,
          input.joinPolicy,
          input.capacity,
          Number(input.organizerAttends),
          input.time ? Date.parse(input.time.start) : null,
          input.time ? Date.parse(input.time.end) : null,
          input.joinDeadline ? Date.parse(input.joinDeadline) : null,
          mutation,
          now,
          now,
        ),
      ...childRows(db, id, mutation, input),
    ]);
    return json({ id }, 201);
  }
  const match =
    /^\/api\/plans\/([\w-]+)(?:\/(publish|confirm|cancel|joining|participation|votes|invitations))?$/.exec(
      path,
    );
  if (!match) throw new HttpError(404, "Route not found.");
  const id = match[1];
  const action = match[2];
  await accessiblePlan(db, id, user.id);
  await expirePlan(db, id, now);
  const plan = await accessiblePlan(db, id, user.id);
  if (!action && request.method === "GET") return json(await detail(db, plan));
  if (action === "votes" && request.method === "POST") {
    const input = z
      .object({
        candidateId: z.string().max(100),
        response: z.enum(["Available", "Unavailable", "Maybe"]),
        expectedVersion: z.number().int().positive(),
      })
      .parse(await body(request));
    const result = await db
      .prepare(
        `INSERT INTO votes(candidate_id,user_id,response) SELECT c.id,?,? FROM candidates c JOIN plans p ON p.id=c.plan_id
      WHERE c.id=? AND p.id=? AND p.version=? AND p.status='proposed' AND c.start_ms>? AND (p.join_deadline IS NULL OR p.join_deadline>?) AND ${planAccess}
      ON CONFLICT(candidate_id,user_id) DO UPDATE SET response=excluded.response`,
      )
      .bind(
        user.id,
        input.response,
        input.candidateId,
        id,
        input.expectedVersion,
        now,
        now,
        user.id,
        user.id,
        user.id,
      )
      .run();
    if (!result.meta.changes)
      throw new HttpError(409, "Voting is closed or this plan changed.");
    return json({ saved: true });
  }
  if (action === "participation" && request.method === "POST")
    return participation(request, db, plan, user, now);
  if (plan.organizer_id !== user.id)
    throw new HttpError(403, "Only the organizer can change this plan.");
  if (action === "invitations" && request.method === "POST") {
    const input = z
      .object({
        expectedVersion: z.number().int().positive(),
        recipient: z.string().min(1).max(100).optional(),
        email: z.email().max(254).optional(),
      })
      .strict()
      .refine(
        (v) => Boolean(v.recipient) !== Boolean(v.email),
        "Choose a member or enter their Google email.",
      )
      .parse(await body(request));
    const recipient = input.email
      ? (
          await db
            .prepare(
              "SELECT user_id FROM google_identities WHERE email=? LIMIT 1",
            )
            .bind(input.email.toLowerCase())
            .first<{ user_id: string }>()
        )?.user_id
      : input.recipient;
    if (
      !recipient ||
      recipient === user.id ||
      !(await db
        .prepare("SELECT 1 FROM users WHERE id=? AND status='active'")
        .bind(recipient)
        .first())
    )
      throw new HttpError(
        400,
        "Choose another active member. For email invitations, ask them to sign in to RUFree first.",
      );
    const mutation = crypto.randomUUID();
    const result = await db.batch([
      // Invitation additions do not change plan terms or invalidate existing acceptances.
      db
        .prepare(
          `UPDATE plans SET mutation_id=? WHERE id=? AND organizer_id=? AND version=? AND visibility='invite' AND status IN ('proposed','confirmed') AND joining_closed=0 AND (start_ms IS NULL OR start_ms>?) AND (join_deadline IS NULL OR join_deadline>?) AND ((SELECT count(*) FROM plan_invitees WHERE plan_id=?)<20 OR EXISTS(SELECT 1 FROM plan_invitees WHERE plan_id=? AND user_id=?))`,
        )
        .bind(
          mutation,
          id,
          user.id,
          input.expectedVersion,
          now,
          now,
          id,
          id,
          recipient,
        ),
      db
        .prepare(
          "INSERT OR IGNORE INTO plan_invitees SELECT id,? FROM plans WHERE id=? AND mutation_id=?",
        )
        .bind(recipient, id, mutation),
      db
        .prepare(
          "INSERT OR IGNORE INTO outbox(id,plan_id,user_id,event,plan_version,available_at,created_at) SELECT id||':invited:'||?,id,?,'invited',version,?,? FROM plans WHERE id=? AND mutation_id=?",
        )
        .bind(recipient, recipient, now, now, id, mutation),
    ]);
    if (!result[0].meta.changes)
      throw new HttpError(
        409,
        "Invitations are closed, this plan changed, or its twenty-invitee limit was reached. Group plans use group membership.",
      );
    return json({ invited: true });
  }
  if (!action && request.method === "DELETE") {
    const input = z
      .object({ expectedVersion: z.number().int().positive() })
      .parse(await body(request));
    const result = await db
      .prepare(
        "DELETE FROM plans WHERE id=? AND organizer_id=? AND status='draft' AND version=?",
      )
      .bind(id, user.id, input.expectedVersion)
      .run();
    if (!result.meta.changes)
      throw new HttpError(409, "Only an unchanged draft can be deleted.");
    return json({ deleted: true });
  }
  if (!action && request.method === "PUT") {
    const raw = z
      .object({
        expectedVersion: z.number().int().positive(),
        acknowledge: z.boolean().default(false),
        draft: draftSchema,
      })
      .parse(await body(request));
    const input = raw.draft;
    await validateDraft(db, input, user);
    const existing = await db
      .prepare("SELECT user_id FROM plan_invitees WHERE plan_id=?")
      .bind(id)
      .all<{ user_id: string }>();
    const invitees = [...new Set(input.invitees)];
    const additions =
      plan.status !== "draft" && plan.visibility === "invite"
        ? invitees.filter(
            (uid) => !existing.results.some((row) => row.user_id === uid),
          )
        : [];
    if (
      additions.length &&
      (plan.joining_closed ||
        (plan.join_deadline !== null && plan.join_deadline <= now))
    )
      throw new HttpError(
        409,
        "Reopen joining before adding invitations; the joining deadline must be in the future.",
      );
    if (
      plan.status === "completed" ||
      plan.status === "cancelled" ||
      (plan.start_ms !== null && plan.start_ms <= now)
    )
      throw new HttpError(409, "This plan can no longer be edited.");
    if (
      plan.status !== "draft" &&
      (input.visibility !== plan.visibility ||
        input.groupId !== plan.group_id ||
        input.organizerAttends !== Boolean(plan.organizer_attends) ||
        (plan.status === "confirmed" && !input.time) ||
        plan.status === "proposed")
    )
      throw new HttpError(
        409,
        "Published visibility, proposal options, and organizer attendance cannot be changed here. Confirm a candidate or create a new draft.",
      );
    const active = await db
      .prepare(
        "SELECT user_id FROM participation WHERE plan_id=? AND status IN ('interested','confirmed','reconfirmation')",
      )
      .bind(id)
      .all<{ user_id: string }>();
    await requireAcknowledgement(
      db,
      user.id,
      active.results.map((p) => p.user_id),
      input.time ? Date.parse(input.time.start) : null,
      input.time ? Date.parse(input.time.end) : null,
      raw.acknowledge,
      id,
    );
    const mutation = crypto.randomUUID();
    const first = db
      .prepare(
        `UPDATE plans SET title=?,description=?,category=?,venue=?,zone=?,visibility=?,group_id=?,join_policy=?,capacity=?,organizer_attends=?,start_ms=?,end_ms=?,join_deadline=?,version=version+1,mutation_id=?,modified_at=? WHERE id=? AND organizer_id=? AND version=? AND capacity>=0 AND held<=? AND (status='draft' OR (SELECT count(*) FROM plan_invitees WHERE plan_id=? AND user_id NOT IN (${invitees.map(() => "?").join(",") || "NULL"})) + ? <= 20)`,
      )
      .bind(
        input.title,
        input.description,
        input.category,
        input.venue,
        input.zone,
        input.visibility,
        input.groupId,
        input.joinPolicy,
        input.capacity,
        Number(input.organizerAttends),
        input.time ? Date.parse(input.time.start) : null,
        input.time ? Date.parse(input.time.end) : null,
        input.joinDeadline ? Date.parse(input.joinDeadline) : null,
        mutation,
        now,
        id,
        user.id,
        raw.expectedVersion,
        input.capacity,
        id,
        ...invitees,
        invitees.length,
      );
    const rows = await db.batch([
      first,
      ...(plan.status === "draft" ? childRows(db, id, mutation, input) : []),
      ...additions.flatMap((recipient) => [
        db
          .prepare(
            "INSERT OR IGNORE INTO plan_invitees SELECT id,? FROM plans WHERE id=? AND mutation_id=?",
          )
          .bind(recipient, id, mutation),
        db
          .prepare(
            "INSERT OR IGNORE INTO outbox(id,plan_id,user_id,event,plan_version,available_at,created_at) SELECT id||':invited:'||?,id,?,'invited',version,?,? FROM plans WHERE id=? AND mutation_id=?",
          )
          .bind(recipient, recipient, now, now, id, mutation),
      ]),
      promote(db, id, now),
    ]);
    if (!rows[0].meta.changes)
      throw new HttpError(
        409,
        "Plan changed, capacity is below held places, or the twenty-invitee limit was reached. Reload before editing.",
      );
    return json({ saved: true });
  }
  if (request.method !== "POST")
    throw new HttpError(405, "Method not allowed.");
  const input = z
    .object({
      expectedVersion: z.number().int().positive(),
      acknowledge: z.boolean().default(false),
      candidateId: z.string().max(100).optional(),
      closed: z.boolean().optional(),
    })
    .parse(await body(request));
  if (input.expectedVersion !== plan.version)
    throw new HttpError(409, "Plan changed. Reload before continuing.");
  const mutation = crypto.randomUUID();
  let statement: D1PreparedStatement;
  const after: D1PreparedStatement[] = [];
  if (action === "publish") {
    if (plan.status !== "draft")
      throw new HttpError(409, "Only drafts can be published.");
    const times =
      plan.start_ms === null
        ? await db
            .prepare("SELECT start_ms,end_ms FROM candidates WHERE plan_id=?")
            .bind(id)
            .all<{ start_ms: number; end_ms: number }>()
        : { results: [{ start_ms: plan.start_ms, end_ms: plan.end_ms! }] };
    if (
      times.results.length < (plan.start_ms === null ? 2 : 1) ||
      times.results.some((t) => t.start_ms <= now) ||
      (plan.join_deadline !== null && plan.join_deadline <= now)
    )
      throw new HttpError(
        409,
        "Plan dates or joining deadline have passed. Edit the draft.",
      );
    await requireAcknowledgement(
      db,
      user.id,
      plan.organizer_attends ? [user.id] : [],
      plan.start_ms,
      plan.end_ms,
      input.acknowledge,
      id,
    );
    statement = db
      .prepare(
        "UPDATE plans SET status=CASE WHEN start_ms IS NULL THEN 'proposed' ELSE 'confirmed' END,version=version+1,mutation_id=?,modified_at=? WHERE id=? AND organizer_id=? AND status='draft' AND version=?",
      )
      .bind(mutation, now, id, user.id, input.expectedVersion);
    if (plan.organizer_attends)
      after.push(
        db
          .prepare(
            `INSERT INTO participation(plan_id,user_id,status,accepted_version,joined_at,modified_at,actor_id) SELECT id,organizer_id,CASE WHEN status='confirmed' THEN 'confirmed' ELSE 'interested' END,version,?,?,organizer_id FROM plans WHERE id=? AND mutation_id=?`,
          )
          .bind(now, now, id, mutation),
      );
  } else if (action === "confirm") {
    const candidate = await db
      .prepare(
        "SELECT start_ms,end_ms FROM candidates WHERE id=? AND plan_id=?",
      )
      .bind(input.candidateId ?? "", id)
      .first<{ start_ms: number; end_ms: number }>();
    if (!candidate || candidate.start_ms <= now || plan.status !== "proposed")
      throw new HttpError(409, "Choose a future candidate on a proposed plan.");
    const owners = await db
      .prepare(
        "SELECT user_id FROM participation WHERE plan_id=? AND status='interested'",
      )
      .bind(id)
      .all<{ user_id: string }>();
    await requireAcknowledgement(
      db,
      user.id,
      owners.results.map((p) => p.user_id),
      candidate.start_ms,
      candidate.end_ms,
      input.acknowledge,
      id,
    );
    statement = db
      .prepare(
        "UPDATE plans SET start_ms=?,end_ms=?,status='confirmed',version=version+1,mutation_id=?,modified_at=? WHERE id=? AND organizer_id=? AND version=? AND status='proposed'",
      )
      .bind(
        candidate.start_ms,
        candidate.end_ms,
        mutation,
        now,
        id,
        user.id,
        input.expectedVersion,
      );
  } else if (action === "cancel") {
    if (["draft", "cancelled", "completed"].includes(plan.status))
      throw new HttpError(409, "Only active published plans can be cancelled.");
    statement = db
      .prepare(
        "UPDATE plans SET status='cancelled',joining_closed=1,version=version+1,mutation_id=?,modified_at=? WHERE id=? AND organizer_id=? AND version=? AND status IN ('proposed','confirmed')",
      )
      .bind(mutation, now, id, user.id, input.expectedVersion);
  } else if (action === "joining") {
    if (
      input.closed === undefined ||
      !["proposed", "confirmed"].includes(plan.status) ||
      (plan.start_ms !== null && plan.start_ms <= now)
    )
      throw new HttpError(
        409,
        "Joining can only change for future published plans.",
      );
    statement = db
      .prepare(
        "UPDATE plans SET joining_closed=?,version=version+1,mutation_id=?,modified_at=? WHERE id=? AND organizer_id=? AND version=?",
      )
      .bind(
        Number(input.closed),
        mutation,
        now,
        id,
        user.id,
        input.expectedVersion,
      );
    after.push(promote(db, id, now));
  } else throw new HttpError(404, "Route not found.");
  const result = await db.batch([statement, ...after]);
  if (!result[0].meta.changes)
    throw new HttpError(409, "Plan changed. Reload before continuing.");
  return json({ saved: true });
}

async function participation(
  request: Request,
  db: D1Database,
  plan: Plan,
  user: User,
  now: number,
): Promise<Response> {
  const input = z
    .object({
      action: z.enum([
        "join",
        "leave",
        "accept",
        "decline",
        "approve",
        "reject",
        "remove",
      ]),
      expectedVersion: z.number().int().positive(),
      target: z.string().max(100).optional(),
      acknowledge: z.boolean().default(false),
      waitlist: z.boolean().default(false),
    })
    .parse(await body(request));
  if (input.expectedVersion !== plan.version)
    throw new HttpError(409, "Plan changed. Reload before continuing.");
  const organizerAction = ["approve", "reject", "remove"].includes(
    input.action,
  );
  const target = organizerAction ? input.target : user.id;
  if (!target || (organizerAction && plan.organizer_id !== user.id))
    throw new HttpError(403, "Only the organizer can manage another member.");
  const existingMembership = await db
    .prepare("SELECT status FROM participation WHERE plan_id=? AND user_id=?")
    .bind(plan.id, target)
    .first<{ status: string }>();
  const reconfirming =
    input.action === "accept" &&
    existingMembership?.status === "reconfirmation";
  if (["join", "accept", "approve"].includes(input.action)) {
    if (
      !["proposed", "confirmed"].includes(plan.status) ||
      (!reconfirming &&
        (plan.joining_closed ||
          (plan.join_deadline !== null && plan.join_deadline <= now))) ||
      (plan.start_ms !== null && plan.start_ms <= now)
    )
      throw new HttpError(409, "Joining is closed.");
    await accessiblePlan(db, plan.id, target);
    await requireAcknowledgement(
      db,
      user.id,
      [target],
      plan.start_ms,
      plan.end_ms,
      input.acknowledge,
      plan.id,
    );
  }
  const guard = `EXISTS(SELECT 1 FROM plans p WHERE p.id=? AND p.version=? AND ${planAccess})`;
  const live = `p.status IN ('proposed','confirmed') AND p.joining_closed=0 AND (p.join_deadline IS NULL OR p.join_deadline>?) AND (p.start_ms IS NULL OR p.start_ms>?)`;
  const accepting = `p.status IN ('proposed','confirmed') AND (participation.status='reconfirmation' OR (p.joining_closed=0 AND (p.join_deadline IS NULL OR p.join_deadline>?))) AND (p.start_ms IS NULL OR p.start_ms>?)`;
  let statement: D1PreparedStatement;
  if (input.action === "join") {
    const existing = await db
      .prepare("SELECT status FROM participation WHERE plan_id=? AND user_id=?")
      .bind(plan.id, target)
      .first<{ status: string }>();
    if (
      existing &&
      [
        "requested",
        "interested",
        "confirmed",
        "waitlisted",
        "offered",
        "reconfirmation",
      ].includes(existing.status)
    )
      return json({ status: existing.status });
    statement = db
      .prepare(
        `INSERT INTO participation(plan_id,user_id,status,accepted_version,joined_at,modified_at,actor_id)
      SELECT p.id,?,CASE WHEN p.join_policy='approval' THEN 'requested' WHEN p.held<p.capacity AND NOT EXISTS(SELECT 1 FROM participation q WHERE q.plan_id=p.id AND q.status='waitlisted') THEN CASE WHEN p.status='confirmed' THEN 'confirmed' ELSE 'interested' END ELSE 'waitlisted' END,p.version,?,?,?
      FROM plans p WHERE p.id=? AND p.version=? AND ${live} AND ${planAccess}
      AND (p.join_policy='approval' OR ? OR (p.held<p.capacity AND NOT EXISTS(SELECT 1 FROM participation q WHERE q.plan_id=p.id AND q.status='waitlisted')))
      ON CONFLICT(plan_id,user_id) DO UPDATE SET status=excluded.status,accepted_version=excluded.accepted_version,joined_at=excluded.joined_at,modified_at=excluded.modified_at,expires_at=NULL,revision=participation.revision+1,actor_id=excluded.actor_id
      WHERE participation.status IN ('left','declined','expired')`,
      )
      .bind(
        target,
        now,
        now,
        user.id,
        plan.id,
        input.expectedVersion,
        now,
        now,
        target,
        target,
        target,
        Number(input.waitlist),
      );
  } else if (input.action === "accept" || input.action === "approve") {
    const from =
      input.action === "approve"
        ? "status='requested'"
        : "status IN ('offered','reconfirmation') AND expires_at>?";
    const bindings: (string | number)[] = [now, user.id, plan.id, target];
    if (input.action === "accept") bindings.push(now);
    bindings.push(
      plan.id,
      input.expectedVersion,
      now,
      now,
      target,
      target,
      target,
    );
    statement = db
      .prepare(
        `UPDATE participation SET status=(SELECT CASE WHEN status='confirmed' THEN 'confirmed' ELSE 'interested' END FROM plans WHERE id=participation.plan_id),accepted_version=(SELECT version FROM plans WHERE id=participation.plan_id),expires_at=NULL,revision=revision+1,modified_at=?,actor_id=?
      WHERE plan_id=? AND user_id=? AND ${from} AND EXISTS(SELECT 1 FROM plans p WHERE p.id=? AND p.version=? AND ${accepting} AND ${planAccess}
      AND (participation.status IN ('offered','reconfirmation') OR (p.held<p.capacity AND NOT EXISTS(SELECT 1 FROM participation q WHERE q.plan_id=p.id AND q.status='waitlisted'))))`,
      )
      .bind(...bindings);
  } else {
    const status = {
      leave: "left",
      decline: "declined",
      reject: "rejected",
      remove: "removed",
    }[input.action];
    const allowed =
      input.action === "reject"
        ? "status='requested'"
        : input.action === "decline"
          ? "status IN ('offered','reconfirmation')"
          : "status IN ('requested','interested','confirmed','waitlisted','offered','reconfirmation')";
    statement = db
      .prepare(
        `UPDATE participation SET status=?,expires_at=NULL,revision=revision+1,modified_at=?,actor_id=? WHERE plan_id=? AND user_id=? AND ${allowed} AND ${guard}`,
      )
      .bind(
        status,
        now,
        user.id,
        plan.id,
        target,
        plan.id,
        input.expectedVersion,
        user.id,
        user.id,
        user.id,
      );
  }
  const result = await db.batch([statement, promote(db, plan.id, now)]);
  if (!result[0].meta.changes)
    throw new HttpError(
      409,
      "No change: the place is full, the membership changed, or access expired. Reload or choose the waitlist.",
    );
  const row = await db
    .prepare("SELECT status FROM participation WHERE plan_id=? AND user_id=?")
    .bind(plan.id, target)
    .first();
  return json(row);
}
