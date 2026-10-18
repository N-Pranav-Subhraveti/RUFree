import assert from "node:assert/strict";
import { URL } from "node:url";
const { fetch } = globalThis;
const origin = "https://rufree.sn-pranav18.workers.dev";
const health = await fetch(origin + "/api/health");
assert.equal(health.status, 200);
assert.equal((await health.json()).database, "reachable");
const session = await fetch(origin + "/api/session");
assert.deepEqual(await session.json(), {
  user: null,
  local: false,
  providersReady: true,
});
assert.equal((await fetch(origin + "/api/plans")).status, 401);
assert.equal(
  (
    await fetch(origin + "/api/local-session", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ member: "local-alex" }),
    })
  ).status,
  404,
);
assert.equal(
  (
    await fetch(origin + "/api/auth/google/start", {
      method: "POST",
      headers: {
        Origin: "https://attacker.example",
        "Content-Type": "application/json",
      },
      body: "{}",
    })
  ).status,
  403,
);
const start = await fetch(origin + "/api/auth/google/start", {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: "{}",
});
assert.equal(start.status, 200);
assert.match(start.headers.get("set-cookie"), /HttpOnly; SameSite=Lax/);
assert.match(start.headers.get("set-cookie"), /Secure/);
const url = new URL((await start.json()).authorizationUrl);
assert.equal(url.origin, "https://accounts.google.com");
assert.equal(
  url.searchParams.get("redirect_uri"),
  origin + "/api/auth/google/callback",
);
assert.equal(url.searchParams.get("scope"), "openid email profile");
assert.equal(url.searchParams.get("code_challenge_method"), "S256");
const replay = await fetch(
  origin + "/api/auth/google/callback?state=invalid&code=invalid",
  { redirect: "manual" },
);
assert.equal(replay.status, 303);
assert.equal(replay.headers.get("location"), origin + "/?signin=failed");
const landing = await fetch(origin);
assert.equal(landing.status, 200);
assert.match(
  landing.headers.get("content-security-policy"),
  /frame-ancestors 'none'/,
);
assert.match(await landing.text(), /RUFree/);
console.log(
  "PASS: live health/D1, private API denial, synthetic login denial, CSRF, Google start/cookie/PKCE, invalid callback rejection, landing/CSP. Real Google sign-in requires a human account; this smoke test does not complete it.",
);
