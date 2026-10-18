import { z } from "zod";
import { body, HttpError, json } from "../http";
import { hash, type User } from "../auth";
export async function groupsRoute(
  request: Request,
  env: Env,
  user: User,
): Promise<Response> {
  const path = new URL(request.url).pathname;
  const db = env.DB;
  const now = Date.now();
  if (path === "/api/groups" && request.method === "GET") {
    const groups = await db
      .prepare(
        "SELECT g.* FROM groups g JOIN group_members m ON m.group_id=g.id WHERE m.user_id=? AND g.deleted_at IS NULL ORDER BY g.created_at LIMIT 20",
      )
      .bind(user.id)
      .all();
    const invitations = await db
      .prepare(
        "SELECT i.id,i.group_id,g.name,i.expires_at FROM group_invitations i JOIN groups g ON g.id=i.group_id WHERE i.recipient_id=? AND i.status='pending' AND i.expires_at>? ORDER BY i.created_at LIMIT 20",
      )
      .bind(user.id, now)
      .all();
    const memberships = await db
      .prepare(
        "SELECT m.group_id,m.user_id,u.name FROM group_members m JOIN users u ON u.id=m.user_id WHERE EXISTS(SELECT 1 FROM group_members a WHERE a.group_id=m.group_id AND a.user_id=?) LIMIT 400",
      )
      .bind(user.id)
      .all();
    const outgoing = await db
      .prepare(
        "SELECT i.id,i.group_id,i.recipient_id FROM group_invitations i JOIN groups g ON g.id=i.group_id WHERE g.owner_id=? AND i.status='pending' AND i.expires_at>? LIMIT 100",
      )
      .bind(user.id, now)
      .all();
    return json({
      groups: groups.results,
      invitations: invitations.results,
      memberships: memberships.results,
      outgoing: outgoing.results,
    });
  }
  if (path === "/api/groups" && request.method === "POST") {
    const input = z
      .object({ name: z.string().trim().min(1).max(80) })
      .parse(await body(request));
    const id = crypto.randomUUID();
    const count = await db
      .prepare(
        "SELECT count(*) AS n FROM groups WHERE owner_id=? AND deleted_at IS NULL",
      )
      .bind(user.id)
      .first<{ n: number }>();
    if ((count?.n ?? 0) >= 10)
      throw new HttpError(409, "Limit of ten owned groups reached.");
    await db.batch([
      db
        .prepare(
          "INSERT INTO groups(id,name,owner_id,created_at) VALUES(?,?,?,?)",
        )
        .bind(id, input.name, user.id, now),
      db.prepare("INSERT INTO group_members VALUES(?,?)").bind(id, user.id),
    ]);
    return json({ id }, 201);
  }
  const target = /^\/api\/groups\/([\w-]+)$/.exec(path);
  if (target && request.method === "PATCH") {
    const input = z
      .object({ name: z.string().trim().min(1).max(80) })
      .strict()
      .parse(await body(request));
    const result = await db
      .prepare(
        "UPDATE groups SET name=? WHERE id=? AND owner_id=? AND deleted_at IS NULL",
      )
      .bind(input.name, target[1], user.id)
      .run();
    if (!result.meta.changes) throw new HttpError(404, "Group not found.");
    return json({ renamed: true });
  }
  if (target && request.method === "DELETE") {
    z.object({ confirm: z.literal(true) })
      .strict()
      .parse(await body(request));
    // One transaction: cancellation triggers release seats and enqueue changes before access is removed.
    const owned =
      "SELECT id FROM groups WHERE id=? AND owner_id=? AND deleted_at IS NULL";
    const result = await db.batch([
      db
        .prepare(
          `UPDATE plans SET status='cancelled',joining_closed=1,version=version+1,mutation_id=?,modified_at=? WHERE group_id IN (${owned}) AND status NOT IN ('cancelled','completed')`,
        )
        .bind(crypto.randomUUID(), now, target[1], user.id),
      db
        .prepare(`DELETE FROM group_invitations WHERE group_id IN (${owned})`)
        .bind(target[1], user.id),
      db
        .prepare(`DELETE FROM group_members WHERE group_id IN (${owned})`)
        .bind(target[1], user.id),
      db
        .prepare(
          "UPDATE groups SET deleted_at=? WHERE id=? AND owner_id=? AND deleted_at IS NULL",
        )
        .bind(now, target[1], user.id),
    ]);
    if (!result[3].meta.changes) throw new HttpError(404, "Group not found.");
    return json({ deleted: true });
  }
  const invite = /^\/api\/groups\/([\w-]+)\/invitations$/.exec(path);
  if (invite && request.method === "POST") {
    if (
      !(await db
        .prepare(
          "SELECT 1 FROM groups WHERE id=? AND owner_id=? AND deleted_at IS NULL",
        )
        .bind(invite[1], user.id)
        .first())
    )
      throw new HttpError(404, "Group not found.");
    const input = z
      .object({
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
    const id = crypto.randomUUID();
    const token = crypto.randomUUID() + crypto.randomUUID();
    await db
      .prepare(
        "INSERT INTO group_invitations(id,group_id,recipient_id,token_hash,expires_at,created_at) VALUES(?,?,?,?,?,?)",
      )
      .bind(
        id,
        invite[1],
        recipient,
        await hash(token),
        now + 7 * 86400000,
        now,
      )
      .run();
    return json(
      {
        id,
        link: `${new URL(request.url).origin}/#settings?invitation=${id}&token=${token}`,
      },
      201,
    );
  }
  const invitation = /^\/api\/group-invitations\/([\w-]+)$/.exec(path);
  if (invitation && request.method === "POST") {
    const input = z
      .object({
        action: z.enum(["accept", "decline"]),
        token: z.string().max(200).optional(),
      })
      .parse(await body(request));
    // An account-bound invitation can be accepted from the recipient's authenticated inbox.
    // A shared link additionally verifies its token; a token never replaces the recipient check.
    const row = await db
      .prepare("SELECT * FROM group_invitations WHERE id=? AND recipient_id=?")
      .bind(invitation[1], user.id)
      .first<{
        id: string;
        group_id: string;
        expires_at: number;
        status: string;
        token_hash: string;
      }>();
    if (!row || (input.token && (await hash(input.token)) !== row.token_hash))
      throw new HttpError(404, "Invitation not found.");
    if (row.status === "accepted" && input.action === "accept")
      return json({ accepted: true });
    if (row.status !== "pending" || row.expires_at <= now)
      throw new HttpError(409, "Invitation is no longer active.");
    if (input.action === "decline")
      await db
        .prepare(
          "UPDATE group_invitations SET status='declined' WHERE id=? AND recipient_id=? AND status='pending'",
        )
        .bind(row.id, user.id)
        .run();
    else
      await db.batch([
        db
          .prepare(
            "INSERT OR IGNORE INTO group_members SELECT group_id,recipient_id FROM group_invitations WHERE id=? AND recipient_id=? AND status='pending' AND expires_at>?",
          )
          .bind(row.id, user.id, now),
        db
          .prepare(
            "UPDATE group_invitations SET status='accepted' WHERE id=? AND recipient_id=? AND status='pending' AND expires_at>?",
          )
          .bind(row.id, user.id, now),
      ]);
    return json({ saved: true });
  }
  const member = /^\/api\/groups\/([\w-]+)\/members\/([\w:-]+)$/.exec(path);
  if (member && request.method === "DELETE") {
    const group = await db
      .prepare("SELECT owner_id FROM groups WHERE id=?")
      .bind(member[1])
      .first<{ owner_id: string }>();
    if (!group || (user.id !== group.owner_id && user.id !== member[2]))
      throw new HttpError(404, "Group not found.");
    if (member[2] === group.owner_id)
      throw new HttpError(
        409,
        "The group owner cannot leave without transferring the group.",
      );
    await db.batch([
      // Membership triggers release seats and record durable work in this same transaction.
      // Organizers retain plan access independently of group membership.
      db
        .prepare(
          `UPDATE participation SET status=?,revision=revision+1,modified_at=?,expires_at=NULL,actor_id=?
           WHERE user_id=? AND status IN ('requested','interested','confirmed','waitlisted','offered','reconfirmation')
           AND plan_id IN (SELECT id FROM plans WHERE group_id=? AND visibility='group'
             AND organizer_id!=? AND status IN ('proposed','confirmed'))`,
        )
        .bind(
          user.id === member[2] ? "left" : "removed",
          now,
          user.id,
          member[2],
          member[1],
          member[2],
        ),
      db
        .prepare(
          `DELETE FROM votes WHERE user_id=? AND candidate_id IN (
            SELECT c.id FROM candidates c JOIN plans p ON p.id=c.plan_id
            WHERE p.group_id=? AND p.visibility='group' AND p.organizer_id!=?
              AND p.status IN ('proposed','confirmed'))`,
        )
        .bind(member[2], member[1], member[2]),
      db
        .prepare("DELETE FROM group_members WHERE group_id=? AND user_id=?")
        .bind(member[1], member[2]),
      db
        .prepare(
          "UPDATE group_invitations SET status='revoked' WHERE group_id=? AND recipient_id=? AND status='pending'",
        )
        .bind(member[1], member[2]),
    ]);
    return json({ removed: true });
  }
  const revoke = /^\/api\/groups\/([\w-]+)\/invitations\/([\w-]+)$/.exec(path);
  if (revoke && request.method === "DELETE") {
    const r = await db
      .prepare(
        "UPDATE group_invitations SET status='revoked' WHERE id=? AND group_id=? AND status='pending' AND EXISTS(SELECT 1 FROM groups WHERE id=? AND owner_id=?)",
      )
      .bind(revoke[2], revoke[1], revoke[1], user.id)
      .run();
    if (!r.meta.changes) throw new HttpError(404, "Invitation not found.");
    return json({ revoked: true });
  }
  throw new HttpError(404, "Route not found.");
}
