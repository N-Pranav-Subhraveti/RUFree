import { z, ZodError } from "zod";
import {
  actor,
  cookieToken,
  hash,
  isLocal,
  requireOrigin,
  sessionCookie,
  type User,
} from "./auth";
import { body, HttpError, json } from "./http";
import { availabilityRoute } from "./routes/availability";
import { zoneSchema } from "../domain/availability";
import { plansRoute } from "./routes/plans";
import { groupsRoute } from "./routes/groups";
import { dispatch } from "./jobs";
import { planAccess } from "./plans-access";
import { googleAuth, googleReady } from "./google-auth";

const localMembers = [
  { id: "local-alex", name: "Alex" },
  { id: "local-jamie", name: "Jamie" },
  { id: "local-sam", name: "Sam" },
];
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
      if (
        !["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].includes(
          request.method,
        )
      )
        throw new HttpError(405, "Method not allowed.");
      if (!["GET", "HEAD"].includes(request.method))
        requireOrigin(request, env);
      if (url.pathname.startsWith("/api/auth/google/"))
        return await googleAuth(request, env);
      if (url.pathname === "/api/health" && request.method === "GET") {
        await env.DB.prepare("SELECT 1 AS ok").first();
        return json({ status: "ok", service: "RUFree", database: "reachable" });
      }
      if (url.pathname === "/api/session" && request.method === "GET") {
        let user: User | null = null;
        try {
          user = await actor(request, env);
        } catch (error) {
          if (
            !(error instanceof HttpError) ||
            ![401, 503].includes(error.status)
          )
            throw error;
        }
        return json({
          user,
          local: isLocal(request, env),
          providersReady: googleReady(env),
        });
      }
      if (url.pathname === "/api/local-session" && request.method === "POST") {
        if (!isLocal(request, env))
          throw new HttpError(404, "Route not found.");
        const input = z
          .object({
            member: z.enum(["local-alex", "local-jamie", "local-sam"]),
          })
          .parse(await body(request));
        const chosen = localMembers.find((m) => m.id === input.member)!;
        const token = Array.from(
          crypto.getRandomValues(new Uint8Array(32)),
          (b) => b.toString(16).padStart(2, "0"),
        ).join("");
        const previous = cookieToken(request);
        const now = Date.now();
        await env.DB.batch([
          env.DB.prepare(
            "INSERT OR IGNORE INTO users(id,name,zone,created_at) VALUES(?,?,?,?)",
          ).bind(chosen.id, chosen.name, "Asia/Seoul", now),
          env.DB.prepare(
            "DELETE FROM sessions WHERE token_hash=? OR expires_at<=?",
          ).bind(previous ? await hash(previous) : "", now),
          env.DB.prepare(
            "INSERT INTO sessions(token_hash,user_id,expires_at,authenticated_at) VALUES(?,?,?,?)",
          ).bind(await hash(token), chosen.id, now + 28800000, now),
        ]);
        return json({ signedIn: true }, 200, {
          "Set-Cookie": sessionCookie(request, token),
        });
      }
      if (url.pathname === "/api/session" && request.method === "DELETE") {
        const token = cookieToken(request);
        if (token)
          await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
            .bind(await hash(token))
            .run();
        return json({ signedOut: true }, 200, {
          "Set-Cookie": sessionCookie(request, "", 0),
        });
      }
      const user = await actor(request, env);
      if (url.pathname.startsWith("/api/plans"))
        return await plansRoute(request, env, user);
      if (
        url.pathname.startsWith("/api/groups") ||
        url.pathname.startsWith("/api/group-invitations")
      )
        return await groupsRoute(request, env, user);
      if (url.pathname === "/api/notifications" && request.method === "GET") {
        const items = await env.DB.prepare(
          `SELECT n.id,n.event,n.plan_id,n.created_at,n.read_at,p.title,p.status FROM notifications n JOIN plans p ON p.id=n.plan_id WHERE n.user_id=? AND n.plan_version=p.version AND (n.membership_revision IS NULL OR EXISTS(SELECT 1 FROM participation m WHERE m.plan_id=n.plan_id AND m.user_id=n.user_id AND m.revision=n.membership_revision)) AND ${planAccess} ORDER BY n.created_at DESC LIMIT 50`,
        )
          .bind(user.id, user.id, user.id, user.id)
          .all();
        return json({ notifications: items.results });
      }
      if (
        url.pathname === "/api/notifications/read" &&
        request.method === "POST"
      ) {
        const input = z
          .object({ id: z.string().max(250) })
          .parse(await body(request));
        await env.DB.prepare(
          "UPDATE notifications SET read_at=? WHERE id=? AND user_id=?",
        )
          .bind(Date.now(), input.id, user.id)
          .run();
        return json({ saved: true });
      }
      if (url.pathname === "/api/local-jobs" && request.method === "POST") {
        if (!isLocal(request, env))
          throw new HttpError(404, "Route not found.");
        z.object({})
          .strict()
          .parse(await body(request));
        return json(await dispatch(env.DB));
      }
      if (url.pathname.startsWith("/api/availability"))
        return await availabilityRoute(request, env, user);
      if (url.pathname === "/api/profile" && request.method === "PUT") {
        const input = z
          .object({ name: z.string().trim().min(1).max(80), zone: zoneSchema })
          .parse(await body(request));
        await env.DB.prepare("UPDATE users SET name=?,zone=? WHERE id=?")
          .bind(input.name, input.zone, user.id)
          .run();
        return json({ ...user, ...input });
      }
      if (url.pathname === "/api/members" && request.method === "GET") {
        // Public registration must not expose a directory of unrelated accounts.
        const members = await (
          isLocal(request, env)
            ? env.DB.prepare(
                "SELECT id,name,zone FROM users WHERE status='active' ORDER BY name LIMIT 20",
              )
            : env.DB.prepare(
                `SELECT u.id,u.name,u.zone FROM users u WHERE u.status='active' AND (
              u.id=? OR EXISTS(SELECT 1 FROM group_members a JOIN group_members b ON a.group_id=b.group_id WHERE a.user_id=? AND b.user_id=u.id)
              OR EXISTS(SELECT 1 FROM sharing_grants s WHERE (s.owner_id=? AND s.viewer_id=u.id) OR (s.viewer_id=? AND s.owner_id=u.id))
            ) ORDER BY u.name,u.id LIMIT 400`,
              ).bind(user.id, user.id, user.id, user.id)
        ).all<User>();
        const grants = await env.DB.prepare(
          "SELECT owner_id,viewer_id FROM sharing_grants WHERE owner_id=? OR viewer_id=?",
        )
          .bind(user.id, user.id)
          .all<{ owner_id: string; viewer_id: string }>();
        return json({ members: members.results, grants: grants.results });
      }
      if (
        url.pathname === "/api/sharing" &&
        ["POST", "DELETE"].includes(request.method)
      ) {
        const input = z
          .object({ viewer: z.string().max(100) })
          .parse(await body(request));
        if (
          input.viewer === user.id ||
          !(await env.DB.prepare(
            "SELECT id FROM users WHERE id=? AND status='active'",
          )
            .bind(input.viewer)
            .first())
        )
          throw new HttpError(400, "Choose another active member.");
        if (request.method === "POST")
          await env.DB.prepare(
            "INSERT OR IGNORE INTO sharing_grants(owner_id,viewer_id) VALUES(?,?)",
          )
            .bind(user.id, input.viewer)
            .run();
        else
          await env.DB.prepare(
            "DELETE FROM sharing_grants WHERE owner_id=? AND viewer_id=?",
          )
            .bind(user.id, input.viewer)
            .run();
        return json({ saved: true });
      }
      throw new HttpError(404, "Route not found.");
    } catch (error) {
      if (error instanceof HttpError)
        return json({ error: error.message }, error.status);
      if (error instanceof ZodError)
        return json(
          { error: error.issues.map((i) => i.message).join(" ") },
          400,
        );
      if (error instanceof Error && /group_deleted/.test(error.message))
        return json(
          { error: "This group was deleted. Reload to continue." },
          409,
        );
      if (error instanceof Error && /plan_limit/.test(error.message))
        return json(
          { error: "The limit of 100 active plans has been reached." },
          409,
        );
      // Do not serialize requests, cookie values, submitted data, or database errors.
      console.error(
        JSON.stringify({
          event: "request_failed",
          requestId: crypto.randomUUID(),
        }),
      );
      return json(
        { error: "Unable to complete this request. Try again." },
        500,
      );
    }
  },
  async scheduled(_event, env): Promise<void> {
    await dispatch(env.DB);
  },
} satisfies ExportedHandler<Env>;
