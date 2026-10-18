# RUFree v0.1 public beta

Deployed 15 October 2026 at `https://rufree.sn-pranav18.workers.dev/`. Fresh production migrations, Worker/assets upload, one-minute cron and secret upload succeeded. Live unauthenticated smoke checks and Chromium landing inspection pass. Initial version after secret upload: `89f6cbc9-fb5a-4953-80fe-f4e462993a01`. The owner confirmed successful real Google sign-in on 15 October 2026.

## 18 October update: worldwide time zones

Profile settings and the plan editor now offer the browser's complete supported IANA time-zone catalog, UTC, existing saved zones and common modern aliases. Type a city or region to filter the suggestions. Date conversion continues to use location-based daylight-saving rules; changing a profile preference does not rewrite existing availability or recurring-rule zones.

TypeScript, lint and all nine Chromium tests passed, including a new profile/plan persistence and unchanged-availability check covering zones beyond the original eight suggestions. Production build/deployment and live health/security smoke checks passed. The live page serves client bundle `index-B7ZC-2sx.js`; upload version was `0c80622c-4497-40bc-b039-47ef6b52b41c`, followed by the deployment script's secret update. No database migration or user-data changes were needed.

## 18 October update: open Google beta

Production is deployed with `SIGNUP_MODE=google-beta`. Any verified Google identity can register without an operator allowlist; migration `0004_public_beta.sql` removed the global twenty-account cap. Production member discovery is restricted to shared groups and explicit sharing. Group owners can invite existing registered accounts by exact Google email, and Google members can leave or be removed from groups. No email is sent.

Validation: TypeScript, lint, 15 domain tests, 41 Worker integration tests, and nine Chromium tests passed. Integration coverage includes a twenty-first registration with an empty allowlist, rejected unverified email, suspended-account denial, restricted directory results, email invitations and group removal. Live health/security/OAuth-redirect checks and updated client asset checks passed. Real sign-in by a second Google account is still a human beta check.

The D1 recovery bookmark immediately before migration was `00000026-00000018-00005108-8d22e3bbe1159af562853ff1481cf227`. Migration and deployment succeeded. Worker upload version: `ab6cd474-d057-4013-8fa2-cf5a16d6176d`, followed by the script's secret update. Live client bundle: `index-BGHuPqHP.js`. See ADR-004 for scope and rollback.

## Approved scope

On 15 October 2026 the user authorized release with Google sign-in and existing manual availability/planning features. Google Calendar sync is deferred; Microsoft integration is also deferred. On 18 October the user authorized open beta registration for anyone with a Google account. This remains a manual-planning beta, not completion of the full SRS. SIGNUP_MODE=google-beta permits verified Google identities; invite-only mode remains available for rollback.

## Configuration

- Intended origin: `https://rufree.sn-pranav18.workers.dev`
- Google callback: `/api/auth/google/callback` on that exact origin; local testing uses `http://127.0.0.1:5173/api/auth/google/callback`.
- Public Google development client ID is recorded in setup.md.
- `.dev.vars` holds the local client secret and invitation list. Do not commit or paste these values.
- `deployment.local.json` holds the account/database identifiers, name `rufree`, origin, `scope: "public-beta"`, and `freePlanConfirmed: true` after operator confirmation.
- Production uses a fresh D1 database. Never upload the local synthetic database.

## Deploy

Authenticate the CLI with Worker and D1 permissions. Run checks before `npm run db:migrate:production` and `npm run deploy:production`. The deployment script builds the app, generates an ignored production configuration, uploads the Worker/assets, then sends the secret and allowlist to Wrangler over stdin. Until secrets exist, authentication fails closed. Invocation logging is disabled to avoid retaining OAuth callback queries.

## Verify

Check health, unauthenticated private-API denial, synthetic-login denial, and the Google authorization redirect. The owner then signs in through Google and verifies a saved availability entry. Fixture tests are not evidence of real Google interoperability. Confirmed authentication does not imply Calendar access: the app requests only `openid email profile` and does not retain provider access tokens.

## Limits and recovery

Calendar imports/exports, reminders, moderation, automatic account deletion, quota dashboards and a full restore/48-hour-soak rehearsal are not included. Data remains in D1 until the operator deletes it. The one-minute cron processes bounded inbox/expiry work; no email or closed-browser notification is promised. Operational checks remain open; open registration does not imply unlimited free-tier capacity.

If a release fails, disable its workers.dev route or roll back to a previously verified Worker version after assessing schema compatibility. Do not delete production D1 as a rollback. Before later schema changes, retain an export or verify the available recovery point and rehearse restoration separately.

## 18 October update: rename and delete groups

Owner-only rename and confirmed deletion are deployed. Migration 0005 retains a deleted group reference for historical plans while removing memberships and invitations. Unfinished group plans are cancelled atomically and their held places released; organizers retain their plan records. Direct sharing and personal availability are unchanged. See ADR-005 for API behavior and schema-aware rollback requirements.

TypeScript/lint and all 42 integration tests passed, including owner authorization and injected-failure rollback. Nine existing browser scenarios passed, and the new rename/delete browser scenario passed on rerun after fixing the API PATCH method gate. Migration and deployment succeeded. Upload version: `8daaddae-6505-4628-b3cb-4cdcccf7bbd5`, followed by secret upload. Client bundle: `index-DHxNLIp_.js`. Pre-migration recovery bookmark: `00000026-00000084-00005108-3ba400f4a9fb3089604259b39a1700cb`.

## 18 October fix: additional published-plan invitations

Published invite-only plans now have an organizer-only Invite more people form, supporting connected members or the exact Google email of an existing active account. Joining must be open, deadlines/start must be in the future, and the twenty-invitee limit remains. An atomic addition queues one idempotent inbox notice without reserving a place or changing existing acceptances. Group-only plans direct organizers to group membership. See ADR-006. Matching suggestion parsing also preserves Google IDs containing colons.

Typecheck/lint and all 44 integration tests passed. Four relevant browser scenarios passed across the initial run and a group-navigation rerun after distinguishing the new group-management link from sidebar navigation. Production build/deployment and live health/security and client checks passed. No schema migration was needed. Worker upload version `690b427c-ef50-446d-8fe7-92258998ab9f`, followed by secret upload; live client `index-DU2H89LO.js`.

## 18 October follow-up: invitation checkboxes in Edit your plan

The screenshot exposed a remaining disabled-checkbox path. Published invite-only editors now enable uninvited members; existing invitations stay checked/read-only. Save changes adds selected invitees transactionally while preserving existing invitations, including concurrent additions, and guarding the twenty-invitee limit. Updated editor instructions replace the misleading draft-only introduction. The separate Invite more people form remains available.

Typecheck/lint and all 48 current integration tests passed. The screenshot's select/save/reload browser scenario and the plan regressions passed; the group scenario required a clean rerun after an edit-triggered development hot reload interrupted it. Production build/deployment and live health/security/client checks passed. No migration. Upload version `756fb286-fc97-420a-85c8-d7ff22662d44`, followed by secret upload; live client `index-DY5-CbpU.js`.
