import { describe, expect, it } from "vitest";
import { env, exports } from "cloudflare:workers";
import { dispatch, expirePlan } from "../../src/server/jobs";
import type { DraftInput, PlanDetail } from "../../src/domain/plans";
const origin = "http://127.0.0.1:5173";
const call = (path: string, method = "GET", data?: unknown, cookie = "") =>
  exports.default.fetch(origin + "/api" + path, {
    method,
    headers: {
      Origin: origin,
      Cookie: cookie,
      "Content-Type": "application/json",
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
async function login(member: string) {
  const r = await call("/local-session", "POST", { member });
  expect(r.status).toBe(200);
  return r.headers.get("Set-Cookie")!.split(";")[0];
}
async function users() {
  return {
    alex: await login("local-alex"),
    jamie: await login("local-jamie"),
    sam: await login("local-sam"),
  };
}
const time = (days = 2) => ({
  start: new Date(Date.now() + days * 86400000).toISOString(),
  end: new Date(Date.now() + days * 86400000 + 3600000).toISOString(),
});
const draft = (overrides: Partial<DraftInput> = {}): DraftInput => ({
  title: "Dinner",
  description: "A private plan",
  category: "Social",
  venue: "Private venue",
  zone: "Asia/Seoul",
  visibility: "invite",
  groupId: null,
  invitees: ["local-jamie", "local-sam"],
  joinPolicy: "immediate",
  capacity: 1,
  organizerAttends: false,
  time: time(),
  candidates: [],
  joinDeadline: null,
  ...overrides,
});
async function create(cookie: string, input = draft()) {
  const r = await call("/plans", "POST", input, cookie);
  expect(r.status).toBe(201);
  return ((await r.json()) as { id: string }).id;
}
async function read(id: string, cookie: string) {
  const r = await call("/plans/" + id, "GET", undefined, cookie);
  expect(r.status).toBe(200);
  return r.json() as Promise<PlanDetail>;
}
async function publish(id: string, cookie: string) {
  const r = await call(
    "/plans/" + id + "/publish",
    "POST",
    { expectedVersion: 1, acknowledge: true },
    cookie,
  );
  expect(r.status).toBe(200);
}
const join = (
  id: string,
  cookie: string,
  extra: Record<string, unknown> = {},
) =>
  call(
    "/plans/" + id + "/participation",
    "POST",
    {
      action: "join",
      expectedVersion: 2,
      acknowledge: true,
      waitlist: true,
      ...extra,
    },
    cookie,
  );

describe("plans and transactional membership", () => {
  it("saves additional invitations from a published plan editor and preserves existing invitations", async () => {
    const u = await users();
    const input = draft({ invitees: ["local-jamie"] });
    const id = await create(u.alex, input);
    await publish(id, u.alex);
    expect(
      (
        await call(
          `/plans/${id}`,
          "PUT",
          {
            expectedVersion: 2,
            acknowledge: true,
            draft: { ...input, invitees: ["local-sam"] },
          },
          u.alex,
        )
      ).status,
    ).toBe(200);
    expect((await read(id, u.sam)).invitees.sort()).toEqual([
      "local-jamie",
      "local-sam",
    ]);
    expect((await read(id, u.jamie)).plan.status).toBe("confirmed");
    expect(
      await env.DB.prepare(
        "SELECT count(*) AS n FROM outbox WHERE plan_id=? AND user_id='local-sam' AND event='invited'",
      )
        .bind(id)
        .first(),
    ).toEqual({ n: 1 });
  });
  it("adds published invitations by member or email without changing places or accepted versions", async () => {
    const u = await users();
    const id = await create(u.alex, draft({ invitees: ["local-jamie"] }));
    await publish(id, u.alex);
    await join(id, u.jamie);
    const path = `/plans/${id}/invitations`;
    expect((await call(`/plans/${id}`, "GET", undefined, u.sam)).status).toBe(
      404,
    );
    expect(
      (
        await call(
          path,
          "POST",
          { recipient: "local-sam", expectedVersion: 2 },
          u.jamie,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          path,
          "POST",
          { recipient: "local-sam", expectedVersion: 1 },
          u.alex,
        )
      ).status,
    ).toBe(409);
    await env.DB.prepare("INSERT INTO google_identities VALUES(?,?,?,?)")
      .bind("sam-subject", "local-sam", "sam@gmail.com", Date.now())
      .run();
    expect(
      (
        await call(
          path,
          "POST",
          { email: "SAM@gmail.com", expectedVersion: 2 },
          u.alex,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          path,
          "POST",
          { recipient: "local-sam", expectedVersion: 2 },
          u.alex,
        )
      ).status,
    ).toBe(200);
    const result = await read(id, u.sam);
    expect(result.invitees.sort()).toEqual(["local-jamie", "local-sam"]);
    expect(result.plan).toMatchObject({ held: 1, version: 2 });
    expect(result.participants[0]).toMatchObject({
      user_id: "local-jamie",
      status: "confirmed",
      accepted_version: 2,
    });
    expect(
      await env.DB.prepare(
        "SELECT count(*) AS n FROM outbox WHERE plan_id=? AND event='invited'",
      )
        .bind(id)
        .first(),
    ).toEqual({ n: 1 });
    for (let i = 0; i < 5; i++) await dispatch(env.DB);
    expect(
      await env.DB.prepare(
        "SELECT count(*) AS n FROM notifications WHERE plan_id=? AND event='invited'",
      )
        .bind(id)
        .first(),
    ).toEqual({ n: 1 });
    await call(
      `/plans/${id}/joining`,
      "POST",
      { expectedVersion: 2, closed: true },
      u.alex,
    );
    const closed = await read(id, u.alex);
    expect(
      (
        await call(
          path,
          "POST",
          { recipient: "local-sam", expectedVersion: closed.plan.version },
          u.alex,
        )
      ).status,
    ).toBe(409);
  });
  it("rolls back an invitation if its inbox job fails", async () => {
    const u = await users();
    const id = await create(u.alex, draft({ invitees: [] }));
    await publish(id, u.alex);
    await env.DB.prepare(
      "CREATE TRIGGER reject_invitation_job BEFORE INSERT ON outbox WHEN NEW.event='invited' BEGIN SELECT RAISE(ABORT,'test failure'); END",
    ).run();
    expect(
      (
        await call(
          `/plans/${id}/invitations`,
          "POST",
          { recipient: "local-sam", expectedVersion: 2 },
          u.alex,
        )
      ).status,
    ).toBe(500);
    await env.DB.prepare("DROP TRIGGER reject_invitation_job").run();
    expect((await read(id, u.alex)).invitees).toEqual([]);
    expect((await call(`/plans/${id}`, "GET", undefined, u.sam)).status).toBe(
      404,
    );
  });
  it("rolls back the seat and membership when its outbox write fails", async () => {
    const u = await users();
    const id = await create(u.alex);
    await publish(id, u.alex);
    await env.DB.prepare(
      "CREATE TRIGGER reject_test_job BEFORE INSERT ON outbox BEGIN SELECT RAISE(ABORT,'injected outbox failure'); END",
    ).run();
    try {
      expect((await join(id, u.jamie)).status).toBe(500);
      const result = await read(id, u.alex);
      expect(result.plan.held).toBe(0);
      expect(result.participants).toHaveLength(0);
    } finally {
      await env.DB.prepare("DROP TRIGGER reject_test_job").run();
    }
    expect((await join(id, u.jamie)).status).toBe(200);
    expect((await read(id, u.alex)).plan.held).toBe(1);
  });
  it("keeps drafts and private plan links inaccessible to outsiders", async () => {
    const u = await users();
    const id = await create(u.alex, draft({ invitees: ["local-jamie"] }));
    expect((await call("/plans/" + id, "GET", undefined, u.jamie)).status).toBe(
      404,
    );
    await publish(id, u.alex);
    expect((await call("/plans/" + id, "GET", undefined, u.jamie)).status).toBe(
      200,
    );
    expect((await call("/plans/" + id, "GET", undefined, u.sam)).status).toBe(
      404,
    );
    expect(
      (
        await call(
          "/plans/" + id + "/cancel",
          "POST",
          { expectedVersion: 2 },
          u.jamie,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await call(
          "/plans",
          "POST",
          { ...draft(), visibility: "public" },
          u.alex,
        )
      ).status,
    ).toBe(400);
  });
  it("guards stale draft edits including invitee child rows", async () => {
    const u = await users();
    const id = await create(u.alex);
    expect(
      (
        await call(
          "/plans/" + id,
          "PUT",
          {
            expectedVersion: 1,
            draft: draft({ title: "First edit", invitees: ["local-jamie"] }),
          },
          u.alex,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          "/plans/" + id,
          "PUT",
          {
            expectedVersion: 1,
            draft: draft({ title: "Stale edit", invitees: ["local-sam"] }),
          },
          u.alex,
        )
      ).status,
    ).toBe(409);
    const p = await read(id, u.alex);
    expect(p.plan.title).toBe("First edit");
    expect(p.invitees).toEqual(["local-jamie"]);
  });
  it("allocates exactly one last seat under concurrent requests; duplicates are idempotent", async () => {
    const u = await users();
    const id = await create(u.alex);
    await publish(id, u.alex);
    const results = await Promise.all([join(id, u.jamie), join(id, u.sam)]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const p = await read(id, u.alex);
    expect(p.plan.held).toBe(1);
    expect(p.participants.map((m) => m.status).sort()).toEqual([
      "confirmed",
      "waitlisted",
    ]);
    await join(id, u.jamie);
    expect((await read(id, u.alex)).participants).toHaveLength(2);
    const count = await env.DB.prepare(
      "SELECT count(*) AS n FROM outbox WHERE plan_id=?",
    )
      .bind(id)
      .first<{ n: number }>();
    expect(count?.n).toBe(2);
  });
  it("leaving reserves an offer and accepting retains exactly one seat", async () => {
    const u = await users();
    const id = await create(u.alex);
    await publish(id, u.alex);
    await join(id, u.jamie);
    await join(id, u.sam);
    expect(
      (
        await call(
          "/plans/" + id + "/participation",
          "POST",
          { action: "leave", expectedVersion: 2 },
          u.jamie,
        )
      ).status,
    ).toBe(200);
    const p = await read(id, u.alex);
    expect(p.plan.held).toBe(1);
    expect(p.participants.find((m) => m.user_id === "local-sam")?.status).toBe(
      "offered",
    );
    expect(
      (
        await call(
          "/plans/" + id + "/participation",
          "POST",
          { action: "accept", expectedVersion: 2, acknowledge: true },
          u.sam,
        )
      ).status,
    ).toBe(200);
    expect((await read(id, u.alex)).plan.held).toBe(1);
  });
  it("expiring an offer frees a seat and makes late acceptance fail", async () => {
    const u = await users();
    const id = await create(u.alex);
    await publish(id, u.alex);
    await join(id, u.jamie);
    await join(id, u.sam);
    await call(
      "/plans/" + id + "/participation",
      "POST",
      { action: "leave", expectedVersion: 2 },
      u.jamie,
    );
    await env.DB.prepare(
      "UPDATE participation SET expires_at=? WHERE plan_id=? AND user_id=?",
    )
      .bind(Date.now() - 1, id, "local-sam")
      .run();
    expect(
      (
        await call(
          "/plans/" + id + "/participation",
          "POST",
          { action: "accept", expectedVersion: 2, acknowledge: true },
          u.sam,
        )
      ).status,
    ).toBe(409);
    expect((await read(id, u.alex)).plan.held).toBe(0);
  });
  it("approval requests consume no seats and organizer attendance consumes one", async () => {
    const u = await users();
    const id = await create(
      u.alex,
      draft({ joinPolicy: "approval", organizerAttends: true, capacity: 2 }),
    );
    await publish(id, u.alex);
    await join(id, u.jamie);
    await join(id, u.sam);
    expect((await read(id, u.alex)).plan.held).toBe(1);
    const results = await Promise.all(
      ["local-jamie", "local-sam"].map((target) =>
        call(
          "/plans/" + id + "/participation",
          "POST",
          { action: "approve", target, expectedVersion: 2, acknowledge: true },
          u.alex,
        ),
      ),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect((await read(id, u.alex)).plan.held).toBe(2);
  });
  it("votes allocate no seats; interested members must reconfirm a chosen candidate", async () => {
    const u = await users();
    const id = await create(
      u.alex,
      draft({ time: null, candidates: [time(2), time(3)], capacity: 2 }),
    );
    await publish(id, u.alex);
    const candidate = (await read(id, u.alex)).candidates[0];
    expect(
      (
        await call(
          "/plans/" + id + "/votes",
          "POST",
          {
            expectedVersion: 2,
            candidateId: candidate.id,
            response: "Available",
          },
          u.jamie,
        )
      ).status,
    ).toBe(200);
    expect((await read(id, u.alex)).plan.held).toBe(0);
    await join(id, u.jamie);
    expect((await read(id, u.alex)).participants[0].status).toBe("interested");
    expect(
      (
        await call(
          "/plans/" + id + "/confirm",
          "POST",
          { expectedVersion: 2, candidateId: candidate.id, acknowledge: true },
          u.alex,
        )
      ).status,
    ).toBe(200);
    const p = await read(id, u.alex);
    expect(p.plan.version).toBe(3);
    expect(p.participants[0].status).toBe("reconfirmation");
    expect(p.plan.held).toBe(1);
    expect(
      (
        await call(
          "/plans/" + id + "/votes",
          "POST",
          { expectedVersion: 3, candidateId: candidate.id, response: "Maybe" },
          u.jamie,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await call(
          "/plans/" + id + "/participation",
          "POST",
          { action: "accept", expectedVersion: 3, acknowledge: true },
          u.jamie,
        )
      ).status,
    ).toBe(200);
  });
  it("material edits require reconfirmation and cancellation releases all holds atomically", async () => {
    const u = await users();
    const input = draft({ capacity: 2 });
    const id = await create(u.alex, input);
    await publish(id, u.alex);
    await join(id, u.jamie);
    await join(id, u.sam);
    expect(
      (
        await call(
          "/plans/" + id,
          "PUT",
          {
            expectedVersion: 2,
            acknowledge: true,
            draft: { ...input, capacity: 1 },
          },
          u.alex,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await call(
          "/plans/" + id,
          "PUT",
          {
            expectedVersion: 2,
            acknowledge: true,
            draft: { ...input, time: time(4) },
          },
          u.alex,
        )
      ).status,
    ).toBe(200);
    const p = await read(id, u.alex);
    expect(p.plan.held).toBe(2);
    expect(p.participants.every((m) => m.status === "reconfirmation")).toBe(
      true,
    );
    expect(
      (
        await call(
          "/plans/" + id + "/cancel",
          "POST",
          { expectedVersion: 3 },
          u.alex,
        )
      ).status,
    ).toBe(200);
    const cancelled = await read(id, u.alex);
    expect(cancelled.plan.held).toBe(0);
    expect(cancelled.participants.every((m) => m.status === "cancelled")).toBe(
      true,
    );
    expect((await join(id, u.jamie, { expectedVersion: 4 })).status).toBe(409);
  });
  it("requires explicit acknowledgement for unknown availability and does not self-conflict when rescheduling", async () => {
    const u = await users();
    const input = draft({ organizerAttends: true });
    const id = await create(u.alex, input);
    expect(
      (
        await call(
          "/plans/" + id + "/publish",
          "POST",
          { expectedVersion: 1 },
          u.alex,
        )
      ).status,
    ).toBe(409);
    await call(
      "/availability/entries",
      "POST",
      { ...input.time!, state: "Available", zone: "Asia/Seoul", label: "" },
      u.alex,
    );
    expect(
      (
        await call(
          "/plans/" + id + "/publish",
          "POST",
          { expectedVersion: 1 },
          u.alex,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          "/plans/" + id,
          "PUT",
          { expectedVersion: 2, draft: { ...input, title: "New title" } },
          u.alex,
        )
      ).status,
    ).toBe(200);
  });
});

describe("group boundaries and durable notifications", () => {
  async function groupFixture() {
    const u = await users();
    const { id: groupId } = (await (
      await call("/groups", "POST", { name: "Departure tests" }, u.alex)
    ).json()) as { id: string };
    await env.DB.batch([
      env.DB.prepare("INSERT INTO group_members VALUES(?,?)").bind(
        groupId,
        "local-jamie",
      ),
      env.DB.prepare("INSERT INTO group_members VALUES(?,?)").bind(
        groupId,
        "local-sam",
      ),
    ]);
    const id = await create(
      u.alex,
      draft({ visibility: "group", groupId, invitees: [] }),
    );
    await publish(id, u.alex);
    return { u, groupId, id };
  }
  it("releases a removed member's seat and promotes the eligible waitlist without leaking notifications", async () => {
    const { u, groupId, id } = await groupFixture();
    await join(id, u.jamie);
    await join(id, u.sam);
    const path = `/groups/${groupId}/members/local-jamie`;
    expect((await call(path, "DELETE", undefined, u.sam)).status).toBe(404);
    expect((await read(id, u.alex)).plan.held).toBe(1);
    expect((await call(path, "DELETE", undefined, u.alex)).status).toBe(200);
    expect(
      await env.DB.prepare(
        "SELECT status,actor_id,revision FROM participation WHERE plan_id=? AND user_id='local-jamie'",
      )
        .bind(id)
        .first(),
    ).toEqual({ status: "removed", actor_id: "local-alex", revision: 2 });
    expect(
      await env.DB.prepare("SELECT held FROM plans WHERE id=?")
        .bind(id)
        .first(),
    ).toEqual({ held: 0 });
    expect((await call(`/plans/${id}`, "GET", undefined, u.jamie)).status).toBe(
      404,
    );
    for (let n = 0; n < 6; n++) await dispatch(env.DB);
    expect(
      await env.DB.prepare(
        "SELECT status FROM participation WHERE plan_id=? AND user_id='local-sam'",
      )
        .bind(id)
        .first(),
    ).toEqual({ status: "offered" });
    expect((await read(id, u.alex)).plan.held).toBe(1);
    expect(
      await env.DB.prepare(
        "SELECT count(*) AS n FROM notifications WHERE user_id='local-jamie'",
      ).first(),
    ).toEqual({ n: 0 });
    expect((await call(path, "DELETE", undefined, u.alex)).status).toBe(200);
    expect(
      await env.DB.prepare(
        "SELECT revision FROM participation WHERE plan_id=? AND user_id='local-jamie'",
      )
        .bind(id)
        .first(),
    ).toEqual({ revision: 2 });
  });
  it("cleans pending membership and votes on departure but preserves organizer and independent plans", async () => {
    const { u, groupId, id } = await groupFixture();
    await join(id, u.jamie);
    const own = await create(
      u.jamie,
      draft({
        visibility: "group",
        groupId,
        invitees: [],
        organizerAttends: true,
      }),
    );
    await publish(own, u.jamie);
    const independent = await create(u.alex);
    await publish(independent, u.alex);
    await join(independent, u.jamie);
    const proposed = await create(
      u.alex,
      draft({
        visibility: "group",
        groupId,
        invitees: [],
        time: null,
        candidates: [time(3), time(4)],
      }),
    );
    await publish(proposed, u.alex);
    const candidate = await env.DB.prepare(
      "SELECT id FROM candidates WHERE plan_id=? LIMIT 1",
    )
      .bind(proposed)
      .first<{ id: string }>();
    await env.DB.prepare("INSERT INTO votes VALUES(?,?,?)")
      .bind(candidate!.id, "local-jamie", "Available")
      .run();
    await join(proposed, u.jamie);
    expect(
      (
        await call(
          `/groups/${groupId}/members/local-jamie`,
          "DELETE",
          undefined,
          u.jamie,
        )
      ).status,
    ).toBe(200);
    expect(
      await env.DB.prepare(
        "SELECT status,expires_at FROM participation WHERE plan_id=? AND user_id='local-jamie'",
      )
        .bind(proposed)
        .first(),
    ).toEqual({ status: "left", expires_at: null });
    expect(
      await env.DB.prepare(
        "SELECT count(*) AS n FROM votes WHERE user_id='local-jamie'",
      ).first(),
    ).toEqual({ n: 0 });
    expect((await read(own, u.jamie)).plan.held).toBe(1);
    expect((await read(independent, u.jamie)).plan.held).toBe(1);
  });
  it("rolls group departure back when its durable membership job cannot be written", async () => {
    const { u, groupId, id } = await groupFixture();
    await join(id, u.jamie);
    await env.DB.prepare(
      "CREATE TRIGGER reject_departure BEFORE INSERT ON outbox WHEN NEW.event='left' BEGIN SELECT RAISE(ABORT,'test failure'); END",
    ).run();
    expect(
      (
        await call(
          `/groups/${groupId}/members/local-jamie`,
          "DELETE",
          undefined,
          u.jamie,
        )
      ).status,
    ).toBe(500);
    expect((await read(id, u.jamie)).plan.held).toBe(1);
    expect(
      await env.DB.prepare(
        "SELECT status FROM participation WHERE plan_id=? AND user_id='local-jamie'",
      )
        .bind(id)
        .first(),
    ).toEqual({ status: "confirmed" });
  });
  it("restricts rename and deletion to owners and atomically cancels group plans", async () => {
    const u = await users();
    const { id: groupId } = (await (
      await call("/groups", "POST", { name: "Old name" }, u.alex)
    ).json()) as { id: string };
    const path = `/groups/${groupId}`;
    expect(
      (await call(path, "PATCH", { name: "Hijacked" }, u.sam)).status,
    ).toBe(404);
    expect((await call(path, "DELETE", { confirm: true }, u.sam)).status).toBe(
      404,
    );
    expect((await call(path, "PATCH", { name: "   " }, u.alex)).status).toBe(
      400,
    );
    expect(
      (await call(path, "PATCH", { name: " New name " }, u.alex)).status,
    ).toBe(200);
    expect(
      await env.DB.prepare("SELECT name FROM groups WHERE id=?")
        .bind(groupId)
        .first(),
    ).toEqual({ name: "New name" });
    const invitation = (await (
      await call(
        path + "/invitations",
        "POST",
        { recipient: "local-jamie" },
        u.alex,
      )
    ).json()) as { id: string };
    await call(
      `/group-invitations/${invitation.id}`,
      "POST",
      { action: "accept" },
      u.jamie,
    );
    await call(
      path + "/invitations",
      "POST",
      { recipient: "local-sam" },
      u.alex,
    );
    const id = await create(
      u.jamie,
      draft({ visibility: "group", groupId, invitees: [] }),
    );
    await publish(id, u.jamie);
    expect((await join(id, u.alex)).status).toBe(200);
    expect((await read(id, u.jamie)).plan.held).toBe(1);
    const draftId = await create(
      u.alex,
      draft({ visibility: "group", groupId, invitees: [] }),
    );
    const otherId = await create(u.alex);
    expect(
      (await call(path, "DELETE", { confirm: false }, u.alex)).status,
    ).toBe(400);
    await env.DB.prepare(
      "CREATE TRIGGER reject_delete_test BEFORE UPDATE OF deleted_at ON groups BEGIN SELECT RAISE(ABORT,'test failure'); END",
    ).run();
    expect((await call(path, "DELETE", { confirm: true }, u.alex)).status).toBe(
      500,
    );
    await env.DB.prepare("DROP TRIGGER reject_delete_test").run();
    expect((await read(id, u.jamie)).plan).toMatchObject({
      status: "confirmed",
      held: 1,
    });
    expect((await call(path, "DELETE", { confirm: true }, u.alex)).status).toBe(
      200,
    );
    expect((await read(id, u.jamie)).plan).toMatchObject({
      status: "cancelled",
      held: 0,
    });
    expect((await read(draftId, u.alex)).plan.status).toBe("cancelled");
    expect((await read(otherId, u.alex)).plan.status).toBe("draft");
    expect((await call(`/plans/${id}`, "GET", undefined, u.alex)).status).toBe(
      404,
    );
    expect(
      await env.DB.prepare(
        "SELECT count(*) AS n FROM group_members WHERE group_id=?",
      )
        .bind(groupId)
        .first(),
    ).toEqual({ n: 0 });
    expect(
      await env.DB.prepare(
        "SELECT count(*) AS n FROM group_invitations WHERE group_id=?",
      )
        .bind(groupId)
        .first(),
    ).toEqual({ n: 0 });
    expect((await call(path, "PATCH", { name: "Revive" }, u.alex)).status).toBe(
      404,
    );
    expect(
      (
        await call(
          path + "/invitations",
          "POST",
          { recipient: "local-sam" },
          u.alex,
        )
      ).status,
    ).toBe(404);
    await expect(
      env.DB.prepare("INSERT INTO group_members VALUES(?,?)")
        .bind(groupId, "local-sam")
        .run(),
    ).rejects.toThrow(/group_deleted/);
    expect(
      await (await call("/groups", "GET", undefined, u.alex)).json(),
    ).toMatchObject({ groups: [] });
  });
  it("reconfirmation remains possible after joining closes", async () => {
    const u = await users();
    const input = draft();
    const id = await create(u.alex, input);
    await publish(id, u.alex);
    await join(id, u.jamie);
    await call(
      "/plans/" + id,
      "PUT",
      {
        expectedVersion: 2,
        acknowledge: true,
        draft: { ...input, time: time(4) },
      },
      u.alex,
    );
    await call(
      "/plans/" + id + "/joining",
      "POST",
      { expectedVersion: 3, closed: true },
      u.alex,
    );
    expect(
      (
        await call(
          "/plans/" + id + "/participation",
          "POST",
          { action: "accept", expectedVersion: 4, acknowledge: true },
          u.jamie,
        )
      ).status,
    ).toBe(200);
  });
  it("suppresses a confirmed notification after that member leaves", async () => {
    const u = await users();
    const id = await create(u.alex);
    await publish(id, u.alex);
    await join(id, u.jamie);
    await call(
      "/plans/" + id + "/participation",
      "POST",
      { action: "leave", expectedVersion: 2 },
      u.jamie,
    );
    for (let n = 0; n < 4; n++) await dispatch(env.DB);
    const rows = await env.DB.prepare("SELECT event FROM notifications").all<{
      event: string;
    }>();
    expect(rows.results).toEqual([{ event: "left" }]);
  });
  it("binds invitations to their recipient and revokes saved group-plan links on removal", async () => {
    const u = await users();
    const group = await call("/groups", "POST", { name: "Friends" }, u.alex);
    const { id: groupId } = (await group.json()) as { id: string };
    const invitation = await call(
      "/groups/" + groupId + "/invitations",
      "POST",
      { recipient: "local-jamie" },
      u.alex,
    );
    const { id } = (await invitation.json()) as { id: string };
    expect(
      (
        await call(
          "/group-invitations/" + id,
          "POST",
          { action: "accept" },
          u.sam,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await call(
          "/group-invitations/" + id,
          "POST",
          { action: "accept" },
          u.jamie,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await call(
          "/group-invitations/" + id,
          "POST",
          { action: "accept" },
          u.jamie,
        )
      ).status,
    ).toBe(200);
    const plan = await create(
      u.alex,
      draft({ visibility: "group", groupId, invitees: [] }),
    );
    await publish(plan, u.alex);
    expect(
      (await call("/plans/" + plan, "GET", undefined, u.jamie)).status,
    ).toBe(200);
    await call(
      "/groups/" + groupId + "/members/local-jamie",
      "DELETE",
      undefined,
      u.alex,
    );
    expect(
      (await call("/plans/" + plan, "GET", undefined, u.jamie)).status,
    ).toBe(404);
  });
  it("recovers an abandoned lease and suppresses duplicate notifications", async () => {
    const u = await users();
    const id = await create(u.alex);
    await publish(id, u.alex);
    await join(id, u.jamie);
    await env.DB.prepare(
      "UPDATE outbox SET state='leased',lease_token='crashed',lease_until=0",
    ).run();
    await Promise.all([dispatch(env.DB), dispatch(env.DB)]);
    await dispatch(env.DB);
    expect(
      await env.DB.prepare("SELECT count(*) AS n FROM notifications").first(),
    ).toEqual({ n: 1 });
    expect(
      await env.DB.prepare(
        "SELECT count(*) AS n FROM outbox WHERE state='done'",
      ).first(),
    ).toEqual({ n: 1 });
  });
  it("does not deliver stale plan-version notifications", async () => {
    const u = await users();
    const input = draft();
    const id = await create(u.alex, input);
    await publish(id, u.alex);
    await join(id, u.jamie);
    await call(
      "/plans/" + id + "/cancel",
      "POST",
      { expectedVersion: 2 },
      u.alex,
    );
    for (let n = 0; n < 5; n++) await dispatch(env.DB);
    const rows = await env.DB.prepare(
      "SELECT plan_version FROM notifications",
    ).all<{ plan_version: number }>();
    expect(rows.results.length).toBeGreaterThan(0);
    expect(rows.results.every((r) => r.plan_version === 3)).toBe(true);
  });
  it("scheduled expiry bounds reconfirmation and completed plans reject joins", async () => {
    const u = await users();
    const id = await create(u.alex);
    await publish(id, u.alex);
    await join(id, u.jamie);
    const p = await read(id, u.alex);
    await expirePlan(env.DB, id, p.plan.end_ms! + 1);
    expect((await read(id, u.alex)).plan.status).toBe("completed");
    expect((await join(id, u.sam, { expectedVersion: 3 })).status).toBe(409);
  });
});
