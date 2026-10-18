# Account setup needed to unblock the next stage

This handoff tracks account setup and outstanding verification. Do not paste client secrets, access tokens, or recovery codes into chat, source files, browser storage, or GitHub.

## 1. Cloudflare

The connected API now confirms the existing account namespace `sn-pranav18.workers.dev` (rechecked 10 October 2026). No subdomain creation is needed. In **Workers & Pages**, inspect the current Workers plan/billing screen and retain a redacted confirmation that paid services are not enabled. Choose a stable staging Worker name and a separate eventual production Worker name; their hostnames will have the form `<worker-name>.sn-pranav18.workers.dev`. Finalize the app host and callback routes before registering exact provider callbacks. No RUFree host has been deployed or verified yet. See [workers.dev documentation](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).

The v0.1 public beta is deployed with Google authentication and a fresh production D1 database; local synthetic sessions remain disabled remotely. User confirmed Workers Free on 15 October 2026. Production configuration is generated from ignored deployment.local.json. Local wrangler.jsonc retains a local placeholder database ID; do not substitute production state into local tests. See release.md.

## 2. Google

On 15 October 2026 the user supplied the public development client ID:

`713422493477-nbguv884fnqfigq8p7scrldnm6kaa3cb.apps.googleusercontent.com`

The user confirmed registration of `http://127.0.0.1:5173/api/auth/google/callback` and `https://rufree.sn-pranav18.workers.dev/api/auth/google/callback`. The secret was saved in ignored .dev.vars and uploaded to Worker secrets without printing it. Google identity code and fixture security checks are implemented. Deployed authorization-start checks pass; the owner confirmed reaching My availability through Google sign-in on 15 October 2026. Calendar integration is deferred by explicit user approval.

In a Google Cloud project you control, enable the Calendar API and configure the OAuth consent screen for the small personally known test group. Create a **Web application** OAuth client, initially using named test users. Register exact callback URLs once the staging host and callback routes are finalized; do not guess a workers.dev address. Identity scopes and calendar scopes are separate consent decisions. The registration workflow and strict redirect matching are documented in [Google's web-server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server).

Task 04 must still implement the standards-based OAuth spike, verify state/PKCE/nonce handling, test actual granted scopes, refresh authorization, and create/read/delete one synthetic test-calendar event. The plan's Testing-mode token-lifetime and private-use verification constraints still apply. A client ID alone is not proof of working calendar access.

## 3. Microsoft — deferred

On 15 October 2026 the user explicitly deferred Microsoft integration. No Microsoft account, tenant, app registration or credential is needed for the initial Google-only release. The instructions below are retained for the later phase.

In Microsoft Entra, establish tenant and app-registration access and create an application registration. Select account types appropriate for the group; if personal and organizational calendars are needed, ensure both are covered. Record the Application (client) ID and Directory (tenant) ID. Register the exact server-side web callback after the stable origin is known. Do not provision Azure compute or enable paid services as a workaround. Follow [Microsoft's app-registration prerequisites and steps](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app).

Task 05 must still verify delegated consent, refresh, and create/read/delete on an actual personal Microsoft calendar. Organizational consent is a separate check and may be blocked by tenant policy. Identity consent does not authorize calendar writes.

## 4. Secure configuration and verification

Current configuration uses GOOGLE_CLIENT_ID as a public setting and GOOGLE_CLIENT_SECRET plus ALLOWED_EMAILS as Worker secrets. Local equivalents live in ignored .dev.vars. Never use Vite public variables for secrets. The production deployment sends secrets over stdin and does not embed them in client assets.

The user-approved manual-planning beta supports open Google registration. The owner confirmed real sign-in on 15 October. Test a second Google account after the beta update, then continue deferred calendar work and operational testing. Task 05 remains deferred. Google token refresh/calendar round trips and deployed load profiling have not been established by identity fixture tests.

## Open Google beta (18 October 2026)

The production release scope is `public-beta`, which sets `SIGNUP_MODE=google-beta`. `ALLOWED_EMAILS` is used only in invite-only mode. New Google users need a verified email; signed ID tokens and all state, nonce, PKCE and session checks remain required. No Calendar scopes are requested. Google Auth Platform must have an External audience; basic `openid email profile` requests are exempt from test-user listing even in Testing status (https://support.google.com/cloud/answer/15549945?hl=en). Workspace administrators may restrict third-party sign-in.

To plan with friends: share the app URL, have them sign in, create a group under People & settings, enter their exact Google email, and ask them to accept the in-app invitation. Email delivery is not implemented. Group membership does not automatically share availability.
