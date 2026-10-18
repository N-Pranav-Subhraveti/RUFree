import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "cloudflare:workers";
import app from "../../src/server/index";
import { hash } from "../../src/server/auth";
const origin = "https://rufree.sn-pranav18.workers.dev";
const settings = () =>
  Object.assign(
    { ...env },
    {
      ENVIRONMENT: "production",
      APP_ORIGIN: origin,
      GOOGLE_CLIENT_ID: "test-client",
      GOOGLE_CLIENT_SECRET: "test-secret",
      ALLOWED_EMAILS: "owner@gmail.com",
    },
  );
const call = (
  path: string,
  method = "GET",
  cookie = "",
  data?: unknown,
  config = settings(),
) =>
  app.fetch(
    new Request(origin + "/api" + path, {
      method,
      headers: {
        Origin: origin,
        Cookie: cookie,
        "Content-Type": "application/json",
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
    config,
  );
afterEach(() => vi.restoreAllMocks());
async function start(config = settings()) {
  const response = await call("/auth/google/start", "POST", "", {}, config);
  expect(response.status).toBe(200);
  const target = new URL(
    ((await response.json()) as { authorizationUrl: string }).authorizationUrl,
  );
  return {
    target,
    cookie: response.headers.get("Set-Cookie")!.split(";")[0],
    state: target.searchParams.get("state")!,
    nonce: target.searchParams.get("nonce")!,
  };
}
function encode(value: unknown) {
  return btoa(JSON.stringify(value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
const signingKeys = crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"],
);
async function provider(
  nonce: string,
  overrides: Record<string, unknown> = {},
  badSignature = false,
) {
  const keys = await signingKeys;
  const publicKey = {
    ...(await crypto.subtle.exportKey("jwk", keys.publicKey)),
    kid: "test-key",
    alg: "RS256",
    use: "sig",
  };
  const now = Math.floor(Date.now() / 1000);
  const payload = encode({
    iss: "https://accounts.google.com",
    aud: "test-client",
    sub: "subject-1",
    iat: now,
    exp: now + 3600,
    nonce,
    email: "owner@gmail.com",
    email_verified: true,
    name: "Owner",
    ...overrides,
  });
  const content = encode({ alg: "RS256", kid: "test-key" }) + "." + payload;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      keys.privateKey,
      new TextEncoder().encode(content),
    ),
  );
  if (badSignature) signature[0] ^= 1;
  const jwt =
    content +
    "." +
    btoa(String.fromCharCode(...signature))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "https://oauth2.googleapis.com/token") {
        const form = new URLSearchParams(String(init?.body));
        expect(form.get("client_secret")).toBe("test-secret");
        expect(form.get("code_verifier")).toBeTruthy();
        return Response.json({
          access_token: "test-token",
          token_type: "Bearer",
          expires_in: 3600,
          id_token: jwt,
        });
      }
      if (url === "https://www.googleapis.com/oauth2/v3/certs")
        return Response.json({ keys: [publicKey] });
      throw new Error("Unexpected external request");
    });
}
const callback = (state: string, cookie: string, config = settings()) =>
  call(
    "/auth/google/callback?code=test-code&state=" + encodeURIComponent(state),
    "GET",
    cookie,
    undefined,
    config,
  );
describe("Google private identity", () => {
  it("allows a verified new beta account beyond twenty members without an allowlist", async () => {
    const config = Object.assign(settings(), {
      SIGNUP_MODE: "google-beta",
      ALLOWED_EMAILS: "",
    });
    for (let i = 0; i < 20; i++) {
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO users(id,name,zone,created_at) VALUES(?,?,?,?)",
        ).bind(`google:seed-${i}`, "Member", "UTC", Date.now()),
        env.DB.prepare("INSERT INTO google_identities VALUES(?,?,?,?)").bind(
          `seed-${i}`,
          `google:seed-${i}`,
          `seed${i}@gmail.com`,
          Date.now(),
        ),
      ]);
    }
    const s = await start(config);
    await provider(s.nonce, { email: "newcomer@gmail.com" });
    const result = await callback(s.state, s.cookie, config);
    expect(result.headers.get("Location")).toBe(origin + "/#availability");
    const session = result.headers
      .getSetCookie()
      .find((c) => c.startsWith("rufree_session="))!
      .split(";")[0];
    expect(
      (await call("/plans", "GET", session, undefined, config)).status,
    ).toBe(200);
    expect(
      await (await call("/members", "GET", session, undefined, config)).json(),
    ).toMatchObject({ members: [{ id: "google:subject-1" }] });
    const group = (await (
      await call("/groups", "POST", session, { name: "Beta friends" }, config)
    ).json()) as { id: string };
    const invitation = await call(
      `/groups/${group.id}/invitations`,
      "POST",
      session,
      { email: "SEED0@gmail.com" },
      config,
    );
    expect(invitation.status).toBe(201);
    const invite = (await invitation.json()) as { id: string };
    await env.DB.prepare("INSERT INTO sessions VALUES(?,?,?,?)")
      .bind(
        await hash("friend-session"),
        "google:seed-0",
        Date.now() + 60000,
        Date.now(),
      )
      .run();
    const friend = "rufree_session=friend-session";
    expect(
      (
        await call(
          `/group-invitations/${invite.id}`,
          "POST",
          friend,
          { action: "accept" },
          config,
        )
      ).status,
    ).toBe(200);
    const members = (await (
      await call("/members", "GET", session, undefined, config)
    ).json()) as { members: { id: string }[] };
    expect(members.members.map((m) => m.id).sort()).toEqual([
      "google:seed-0",
      "google:subject-1",
    ]);
    expect(
      (
        await call(
          `/groups/${group.id}/members/google:seed-0`,
          "DELETE",
          session,
          undefined,
          config,
        )
      ).status,
    ).toBe(200);
    expect(
      await (await call("/members", "GET", friend, undefined, config)).json(),
    ).toMatchObject({ members: [{ id: "google:seed-0" }] });
    await env.DB.prepare(
      "UPDATE users SET status='suspended' WHERE id='google:subject-1'",
    ).run();
    expect(
      (await call("/plans", "GET", session, undefined, config)).status,
    ).toBe(401);
  });
  it("still rejects unverified email in the open beta", async () => {
    const config = Object.assign(settings(), {
      SIGNUP_MODE: "google-beta",
      ALLOWED_EMAILS: "",
    });
    const s = await start(config);
    await provider(s.nonce, {
      email: "newcomer@gmail.com",
      email_verified: false,
    });
    expect(
      (await callback(s.state, s.cookie, config)).headers.get("Location"),
    ).toContain("signin=not-allowed");
    expect(
      await env.DB.prepare("SELECT count(*) AS n FROM sessions").first(),
    ).toEqual({ n: 0 });
  });
  it("uses PKCE and a browser-bound short-lived transaction with minimal identity scopes", async () => {
    const s = await start();
    expect(s.target.searchParams.get("scope")).toBe("openid email profile");
    expect(s.target.searchParams.get("code_challenge_method")).toBe("S256");
    expect(s.target.searchParams.get("redirect_uri")).toBe(
      origin + "/api/auth/google/callback",
    );
    expect(
      await env.DB.prepare("SELECT state_hash FROM oauth_transactions").first(),
    ).toEqual({ state_hash: await hash(s.state) });
    const mismatch = await callback(s.state, "rufree_oauth=other-browser");
    expect(mismatch.headers.get("Location")).toContain("signin=failed");
    expect(
      await env.DB.prepare(
        "SELECT count(*) AS n FROM oauth_transactions",
      ).first(),
    ).toEqual({ n: 1 });
  });
  it("validates a signed Google identity, creates a secure session and rejects callback replay", async () => {
    const s = await start();
    const fetch = await provider(s.nonce);
    const result = await callback(s.state, s.cookie);
    expect(result.headers.get("Location")).toBe(origin + "/#availability");
    const cookies = result.headers.getSetCookie();
    const session = cookies.find((c) => c.startsWith("rufree_session="))!;
    expect(session).toContain("HttpOnly");
    expect(session).toContain("Secure");
    const status = await call("/session", "GET", session.split(";")[0]);
    expect(await status.json()).toMatchObject({
      user: { id: "google:subject-1", name: "Owner" },
      local: false,
    });
    const replay = await callback(s.state, s.cookie);
    expect(replay.headers.get("Location")).toContain("signin=failed");
    expect(
      fetch.mock.calls.filter(
        ([url]) => String(url) === "https://oauth2.googleapis.com/token",
      ),
    ).toHaveLength(1);
    const removed = Object.assign(settings(), {
      ALLOWED_EMAILS: "someone-else@gmail.com",
    });
    expect(
      (await call("/plans", "GET", session.split(";")[0], undefined, removed))
        .status,
    ).toBe(403);
  });
  it.each([
    ["issuer", { iss: "https://attacker.example" }],
    ["audience", { aud: "other-client" }],
    ["nonce", { nonce: "other" }],
    ["expiry", { exp: 1 }],
    ["unverified email", { email_verified: false }],
    ["uninvited email", { email: "outsider@gmail.com" }],
  ])("rejects an invalid %s", async (_name, overrides) => {
    const s = await start();
    await provider(s.nonce, overrides);
    const result = await callback(s.state, s.cookie);
    expect(result.headers.get("Location")).toMatch(
      /signin=(failed|not-allowed)/,
    );
    expect(
      await env.DB.prepare("SELECT count(*) AS n FROM sessions").first(),
    ).toEqual({ n: 0 });
  });
  it("rejects a forged signature", async () => {
    const s = await start();
    await provider(s.nonce, {}, true);
    expect(
      (await callback(s.state, s.cookie)).headers.get("Location"),
    ).toContain("signin=failed");
    expect(
      await env.DB.prepare("SELECT count(*) AS n FROM users").first(),
    ).toEqual({ n: 0 });
  });
  it("rejects expired state and provider denial without creating identities", async () => {
    const s = await start();
    await env.DB.prepare("UPDATE oauth_transactions SET expires_at=0").run();
    expect(
      (await callback(s.state, s.cookie)).headers.get("Location"),
    ).toContain("signin=failed");
    const next = await start();
    const denied = await call(
      "/auth/google/callback?error=access_denied&state=" + next.state,
      "GET",
      next.cookie,
    );
    expect(denied.headers.get("Location")).toContain("signin=failed");
    expect(
      await env.DB.prepare("SELECT count(*) AS n FROM users").first(),
    ).toEqual({ n: 0 });
  });
  it("never enables synthetic sign-in on the production host", async () => {
    expect(
      (await call("/local-session", "POST", "", { member: "local-alex" }))
        .status,
    ).toBe(404);
    expect(
      (
        await call(
          "/auth/google/start",
          "POST",
          "",
          {},
          Object.assign(settings(), { GOOGLE_CLIENT_SECRET: "" }),
        )
      ).status,
    ).toBe(503);
  });
});
