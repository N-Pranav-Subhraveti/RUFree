import { HttpError } from "./http";
import { emailAllowed, googleReady } from "./google-auth";
export type User = { id: string; name: string; zone: string };
export async function hash(token: string): Promise<string> {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export function cookieToken(request: Request): string | undefined {
  return request.headers
    .get("Cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("rufree_session="))
    ?.slice(15);
}
export function isLocal(request: Request, env: Env): boolean {
  return (
    env.ENVIRONMENT === "local" &&
    ["127.0.0.1", "localhost", "[::1]"].includes(new URL(request.url).hostname)
  );
}
export async function actor(request: Request, env: Env): Promise<User> {
  const token = cookieToken(request);
  if (!token) throw new HttpError(401, "Sign in to continue.");
  const local = isLocal(request, env);
  if (
    !local &&
    (!["staging", "production"].includes(String(env.ENVIRONMENT)) ||
      !googleReady(env) ||
      new URL(request.url).origin !== env.APP_ORIGIN)
  )
    throw new HttpError(
      503,
      "Private sign-in is awaiting provider verification.",
    );
  const user = await env.DB.prepare(
    "SELECT u.id,u.name,u.zone FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.status='active'",
  )
    .bind(await hash(token), Date.now())
    .first<User>();
  if (!user) throw new HttpError(401, "Your session expired. Sign in again.");
  if (!local || user.id.startsWith("google:")) {
    const identity = await env.DB.prepare(
      "SELECT email FROM google_identities WHERE user_id=?",
    )
      .bind(user.id)
      .first<{ email: string }>();
    if (!identity || !emailAllowed(env, identity.email))
      throw new HttpError(403, "This account is not invited.");
  }
  return user;
}
export function requireOrigin(request: Request, env: Env): void {
  const origin = request.headers.get("Origin");
  if (
    origin !== new URL(request.url).origin ||
    (!isLocal(request, env) && origin !== env.APP_ORIGIN)
  )
    throw new HttpError(403, "Request origin not allowed.");
}
export function sessionCookie(
  request: Request,
  token: string,
  seconds = 28800,
): string {
  return `rufree_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${seconds}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
}
