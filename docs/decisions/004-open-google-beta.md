# 004: Open Google registration for the manual-planning beta

Date: 2026-10-18. Status: accepted by the user's request to allow anyone with a Google account to beta test.

Supersedes the owner-only access decision in 003. Google Calendar and Microsoft remain deferred.

The production release scope `public-beta` sets `SIGNUP_MODE=google-beta`. Authentication continues to require a signed Google ID token, verified email, correct issuer/audience/nonce, browser-bound state, PKCE, and an active local account. Invite-only mode remains fail-closed for deployments without this explicit setting. Migration 0004 removes the global twenty-account trigger; existing per-group and planning limits remain.

Open registration must not create a global profile directory. Production member discovery returns only the caller, shared-group members, and explicit sharing relationships. Group owners can invite an already registered user by exact Google email. Invitations remain account-bound and require acceptance; no mail is sent. Availability grants and plan authorization remain independent of registration and group membership. Google user IDs containing a colon are supported by group-removal routes.

The beta retains the existing Cloudflare Free deployment and bounded job processing. Open registration does not promise unlimited capacity. Moderation tooling, automated account deletion, calendar integration and full recovery/load validation remain unfinished. No new OAuth scopes or provider-token storage are introduced.

Validation must cover registration beyond twenty accounts, an empty allowlist in beta mode, rejection of unverified identities, private-mode allowlist enforcement, suspended accounts, restricted directory results, email invitations and membership removal. Signed identity fixtures do not replace a second user's live Google sign-in check.

Rollback: change the release scope to `manual-preview` and redeploy with the intended ALLOWED_EMAILS. The removed global trigger need not be restored: application authorization enforces invite-only mode. Preserve production D1 and existing accounts.
