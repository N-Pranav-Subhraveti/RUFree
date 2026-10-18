import { describe, expect, it } from "vitest";
import { env, exports } from "cloudflare:workers";
import { hash } from "../../src/server/auth";
const origin = "http://127.0.0.1:5173";
const fetchApp = (
  path: string,
  method = "GET",
  data?: unknown,
  cookie?: string,
  source = origin,
) =>
  exports.default.fetch(`${origin}/api${path}`, {
    method,
    headers: {
      Origin: source,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
async function login(member = "local-alex") {
  const result = await fetchApp("/local-session", "POST", { member });
  expect(result.status).toBe(200);
  return result.headers.get("Set-Cookie")!.split(";")[0];
}
const future = (hours: number) =>
  new Date(Date.now() + hours * 3600000).toISOString();
const entry = () => ({
  start: future(24),
  end: future(26),
  state: "Available",
  zone: "Asia/Seoul",
  label: "Private travel details",
});
const window = () =>
  `start=${encodeURIComponent(future(1))}&end=${encodeURIComponent(future(72))}`;

describe("Worker and local D1", () => {
  it("health endpoint executes a D1 query", async () => {
    const result = await fetchApp("/health");
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({
      status: "ok",
      service: "RUFree",
      database: "reachable",
    });
    expect(result.headers.get("Cache-Control")).toBe("no-store");
  });
  it("requires authentication for private data", async () => {
    expect((await fetchApp("/availability")).status).toBe(401);
    expect((await fetchApp("/members")).status).toBe(401);
  });
  it("disables synthetic identities on non-loopback hosts", async () => {
    const response = await exports.default.fetch(
      "https://rufree.example/api/local-session",
      {
        method: "POST",
        headers: {
          Origin: "https://rufree.example",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ member: "local-alex" }),
      },
    );
    expect(response.status).toBe(403);
    const session = await exports.default.fetch(
      "https://rufree.example/api/session",
    );
    expect(await session.json()).toMatchObject({
      user: null,
      local: false,
      providersReady: false,
    });
  });
  it("rejects cross-origin writes and missing Origin", async () => {
    expect(
      (
        await fetchApp(
          "/local-session",
          "POST",
          { member: "local-alex" },
          undefined,
          "https://attacker.example",
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await exports.default.fetch(`${origin}/api/local-session`, {
          method: "POST",
        })
      ).status,
    ).toBe(403);
  });
  it("hashes tokens, rotates sessions and clears logout", async () => {
    const first = await login();
    const token = first.slice("rufree_session=".length);
    const row = await env.DB.prepare("SELECT token_hash FROM sessions").first<{
      token_hash: string;
    }>();
    expect(row?.token_hash).toBe(await hash(token));
    expect(row?.token_hash).not.toBe(token);
    const rotated = await fetchApp(
      "/local-session",
      "POST",
      { member: "local-alex" },
      first,
    );
    const next = rotated.headers.get("Set-Cookie")!.split(";")[0];
    expect(rotated.headers.get("Set-Cookie")).toContain("HttpOnly");
    expect(rotated.headers.get("Set-Cookie")).toContain("SameSite=Strict");
    expect((await fetchApp("/members", "GET", undefined, first)).status).toBe(
      401,
    );
    expect((await fetchApp("/members", "GET", undefined, next)).status).toBe(
      200,
    );
    await fetchApp("/session", "DELETE", undefined, next);
    expect((await fetchApp("/members", "GET", undefined, next)).status).toBe(
      401,
    );
  });
  it("rejects expired and suspended sessions", async () => {
    const cookie = await login();
    await env.DB.prepare("UPDATE sessions SET expires_at=0").run();
    expect((await fetchApp("/members", "GET", undefined, cookie)).status).toBe(
      401,
    );
    const another = await login();
    await env.DB.prepare("UPDATE users SET status='suspended'").run();
    expect((await fetchApp("/members", "GET", undefined, another)).status).toBe(
      401,
    );
  });
  it("validates bounded JSON and time zones", async () => {
    const cookie = await login();
    expect(
      (
        await fetchApp(
          "/profile",
          "PUT",
          { name: "A", zone: "Not/AZone" },
          cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await fetchApp(
          "/profile",
          "PUT",
          { name: "x".repeat(17000), zone: "UTC" },
          cookie,
        )
      ).status,
    ).toBe(413);
    expect(
      (
        await fetchApp(
          "/profile",
          "PUT",
          { name: "Alex edited", zone: "America/New_York" },
          cookie,
        )
      ).status,
    ).toBe(200);
  });
  it("persists dated edits, enforces ownership, and tracks revisions", async () => {
    const alice = await login();
    const jamie = await login("local-jamie");
    const created = await fetchApp(
      "/availability/entries",
      "POST",
      entry(),
      alice,
    );
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect(
      (
        await fetchApp(
          `/availability/entries/${id}`,
          "DELETE",
          undefined,
          jamie,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await fetchApp(
          `/availability/entries/${id}`,
          "PUT",
          { ...entry(), state: "Busy" },
          jamie,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await fetchApp(
          `/availability/entries/${id}`,
          "PUT",
          { ...entry(), state: "Busy" },
          alice,
        )
      ).status,
    ).toBe(200);
    const data = (await (
      await fetchApp(`/availability?${window()}`, "GET", undefined, alice)
    ).json()) as { entries: { state: string }[]; version: number };
    expect(data.entries[0].state).toBe("Busy");
    expect(data.version).toBe(2);
    expect(
      (
        await fetchApp(
          `/availability/entries/${id}`,
          "DELETE",
          undefined,
          alice,
        )
      ).status,
    ).toBe(200);
    expect(
      await env.DB.prepare(
        "SELECT count(*) AS total FROM availability_entries",
      ).first(),
    ).toEqual({ total: 0 });
  });
  it("defaults private, redacts labels and revokes subsequent reads", async () => {
    const alex = await login();
    const jamie = await login("local-jamie");
    await fetchApp("/availability/entries", "POST", entry(), alex);
    const path = `/availability?owner=local-alex&${window()}`;
    expect((await fetchApp(path, "GET", undefined, jamie)).status).toBe(404);
    await fetchApp("/sharing", "POST", { viewer: "local-jamie" }, alex);
    const shared = await fetchApp(path, "GET", undefined, jamie);
    expect(shared.status).toBe(200);
    const data = (await shared.json()) as { entries: { label: string }[] };
    expect(data.entries[0].label).toBe("");
    expect(JSON.stringify(data)).not.toContain("Private travel");
    await fetchApp("/sharing", "DELETE", { viewer: "local-jamie" }, alex);
    expect((await fetchApp(path, "GET", undefined, jamie)).status).toBe(404);
  });
  it("rejects invalid dates, horizons, states and offset ordering", async () => {
    const cookie = await login();
    for (const value of [
      { ...entry(), end: future(23) },
      { ...entry(), state: "Free" },
      { ...entry(), end: future(24 * 400) },
    ])
      expect(
        (await fetchApp("/availability/entries", "POST", value, cookie)).status,
      ).toBe(400);
    expect(
      (await fetchApp("/availability?start=invalid", "GET", undefined, cookie))
        .status,
    ).toBe(400);
  });
  it("rechecks changed availability instead of trusting browser suggestions", async () => {
    const cookie = await login();
    const interval = entry();
    await fetchApp("/availability/entries", "POST", interval, cookie);
    const request = {
      start: interval.start,
      end: interval.end,
      owners: ["local-alex"],
    };
    expect(
      await (
        await fetchApp("/availability/recheck", "POST", request, cookie)
      ).json(),
    ).toMatchObject({ requiresAcknowledgement: false });
    await fetchApp(
      "/availability/entries",
      "POST",
      { ...interval, state: "Busy" },
      cookie,
    );
    expect(
      await (
        await fetchApp("/availability/recheck", "POST", request, cookie)
      ).json(),
    ).toMatchObject({
      requiresAcknowledgement: true,
      results: [{ state: "Busy", version: 2 }],
    });
  });
  it("persists rules without allowing writes to another owner", async () => {
    const cookie = await login();
    const day = future(24).slice(0, 10);
    const response = await fetchApp(
      "/availability/rules",
      "POST",
      {
        weekday: 1,
        startTime: "18:00",
        endTime: "21:00",
        effectiveStart: day,
        effectiveEnd: future(24 * 90).slice(0, 10),
        state: "Available",
        zone: "Asia/Seoul",
        user_id: "local-jamie",
      },
      cookie,
    );
    expect(response.status).toBe(201);
    expect(
      await env.DB.prepare("SELECT user_id FROM availability_rules").first(),
    ).toEqual({ user_id: "local-alex" });
  });
});
