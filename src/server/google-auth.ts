import * as oauth from "oauth4webapi";
import { z } from "zod";
import { cookieToken, hash, isLocal, sessionCookie } from "./auth";
import { body, HttpError, json } from "./http";

// Fixed Google endpoints prevent discovery or callback input from choosing a token destination.
export const googleServer: oauth.AuthorizationServer = {
  issuer: "https://accounts.google.com",
  authorization_endpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  token_endpoint: "https://oauth2.googleapis.com/token",
  jwks_uri: "https://www.googleapis.com/oauth2/v3/certs",
};
export function allowedEmails(env: Env): string[] {
  return (env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20);
}
export function googleReady(env: Env): boolean {
  return Boolean(
    env.GOOGLE_CLIENT_ID &&
    env.GOOGLE_CLIENT_SECRET &&
    (env.SIGNUP_MODE === "google-beta" || allowedEmails(env).length),
  );
}
export function emailAllowed(env: Env, email: string): boolean {
  return (
    env.SIGNUP_MODE === "google-beta" ||
    allowedEmails(env).includes(email.toLowerCase())
  );
}
function origin(request: Request, env: Env): string {
  const target = new URL(request.url);
  if (
    target.origin !== env.APP_ORIGIN ||
    (!isLocal(request, env) && target.protocol !== "https:")
  )
    throw new HttpError(403, "Sign-in host not allowed.");
  return target.origin;
}
const browserCookie = (request: Request, value: string, age = 600) =>
  `rufree_oauth=${value}; HttpOnly; SameSite=Lax; Path=/api/auth/google; Max-Age=${age}${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
function redirect(
  request: Request,
  location: string,
  session?: string,
): Response {
  const headers = new Headers({
    Location: location,
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  });
  headers.append("Set-Cookie", browserCookie(request, "", 0));
  if (session) headers.append("Set-Cookie", sessionCookie(request, session));
  return new Response(null, { status: 303, headers });
}
type Transaction = {
  verifier: string;
  nonce: string;
  previous_session_hash: string;
};
export async function googleAuth(
  request: Request,
  env: Env,
): Promise<Response> {
  const appOrigin = origin(request, env);
  if (!googleReady(env))
    throw new HttpError(503, "Google sign-in is not configured yet.");
  const url = new URL(request.url);
  const client: oauth.Client = {
    client_id: env.GOOGLE_CLIENT_ID,
    id_token_signed_response_alg: "RS256",
  };
  const callback = appOrigin + "/api/auth/google/callback";
  if (url.pathname === "/api/auth/google/start" && request.method === "POST") {
    z.object({})
      .strict()
      .parse(await body(request));
    const state = oauth.generateRandomState();
    const browser = oauth.generateRandomState();
    const verifier = oauth.generateRandomCodeVerifier();
    const nonce = oauth.generateRandomNonce();
    const oldBrowser = request.headers
      .get("Cookie")
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("rufree_oauth="))
      ?.slice(13);
    const previous = cookieToken(request);
    const saved = await env.DB.batch([
      env.DB.prepare(
        "DELETE FROM oauth_transactions WHERE expires_at<=? OR browser_hash=?",
      ).bind(Date.now(), await hash(oldBrowser ?? "")),
      env.DB.prepare(
        "INSERT INTO oauth_transactions SELECT ?,?,?,?,?,? WHERE (SELECT count(*) FROM oauth_transactions)<100",
      ).bind(
        await hash(state),
        await hash(browser),
        verifier,
        nonce,
        await hash(previous ?? ""),
        Date.now() + 600000,
      ),
    ]);
    if (!saved[1].meta.changes)
      throw new HttpError(
        429,
        "Sign-in is busy. Please try again in a few minutes.",
      );
    const target = new URL(googleServer.authorization_endpoint!);
    target.search = new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: callback,
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: await oauth.calculatePKCECodeChallenge(verifier),
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    return json({ authorizationUrl: target.toString() }, 200, {
      "Set-Cookie": browserCookie(request, browser),
    });
  }
  if (url.pathname !== "/api/auth/google/callback" || request.method !== "GET")
    throw new HttpError(404, "Route not found.");
  try {
    const state = url.searchParams.get("state");
    const browser = request.headers
      .get("Cookie")
      ?.split(";")
      .map((v) => v.trim())
      .find((v) => v.startsWith("rufree_oauth="))
      ?.slice(13);
    if (!state || state.length > 200 || !browser || browser.length > 200)
      throw new Error("Missing transaction");
    // Delete/return atomically before exchanging a code: callbacks are single use, including failures.
    const transaction = await env.DB.prepare(
      "DELETE FROM oauth_transactions WHERE state_hash=? AND browser_hash=? AND expires_at>? RETURNING verifier,nonce,previous_session_hash",
    )
      .bind(await hash(state), await hash(browser), Date.now())
      .first<Transaction>();
    if (!transaction) throw new Error("Expired transaction");
    const params = oauth.validateAuthResponse(googleServer, client, url, state);
    const response = await oauth.authorizationCodeGrantRequest(
      googleServer,
      client,
      oauth.ClientSecretPost(env.GOOGLE_CLIENT_SECRET),
      params,
      callback,
      transaction.verifier,
      { signal: AbortSignal.timeout(15000) },
    );
    const tokens = await oauth.processAuthorizationCodeResponse(
      googleServer,
      client,
      response,
      { expectedNonce: transaction.nonce, requireIdToken: true },
    );
    await oauth.validateApplicationLevelSignature(googleServer, response, {
      signal: AbortSignal.timeout(15000),
    });
    const claims = oauth.getValidatedIdTokenClaims(tokens)!;
    if (
      claims.email_verified !== true ||
      typeof claims.email !== "string" ||
      !emailAllowed(env, claims.email)
    )
      return redirect(request, appOrigin + "/?signin=not-allowed");
    const userId = "google:" + claims.sub;
    const token = oauth.generateRandomState();
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT OR IGNORE INTO users(id,name,zone,created_at) VALUES(?,?,?,?)",
      ).bind(
        userId,
        typeof claims.name === "string" && claims.name.trim()
          ? claims.name.trim().slice(0, 80)
          : "Member",
        "Asia/Seoul",
        now,
      ),
      env.DB.prepare(
        "INSERT INTO google_identities(subject,user_id,email,created_at) VALUES(?,?,?,?) ON CONFLICT(subject) DO UPDATE SET email=excluded.email",
      ).bind(claims.sub, userId, claims.email.toLowerCase(), now),
      env.DB.prepare(
        "DELETE FROM sessions WHERE token_hash=? OR expires_at<=?",
      ).bind(transaction.previous_session_hash, now),
      env.DB.prepare(
        "INSERT INTO sessions SELECT ?,id,?,? FROM users WHERE id=? AND status='active'",
      ).bind(await hash(token), now + 28800000, now, userId),
    ]);
    return redirect(request, appOrigin + "/#availability", token);
  } catch {
    // Never log callback URLs, codes, tokens, claims, or provider error bodies.
    return redirect(request, appOrigin + "/?signin=failed");
  }
}
