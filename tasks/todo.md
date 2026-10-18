# Execution checklist: free private-group Schedule Tracker

Local progress, 18 October 2026: group-removal participation cleanup from Tasks 10/20 is implemented and integration-tested. It releases seats and clears votes atomically, preserves organizer-owned plans, and uses existing durable waitlist processing. See [ADR-007](../docs/decisions/007-group-departure-cleanup.md). Full task acceptance and production rollout remain open.

Date: 10 October 2026. Status: Tasks 02–03 implemented and verified locally; Task 01 and provider feasibility remain unresolved. Local portions of 08–24 and 31 cover profiles, group invitations, sharing, availability, matching, plan lifecycle, seats, waitlists, reconfirmation, outbox and inbox. Their full acceptance gates remain open; unchecked tasks are not claims that no local code exists. See [implementation status](../docs/implementation-status.md) and [acceptance evidence](../docs/acceptance.md). See [plan.md](plan.md) for architecture, sources, free limits, and scope differences.

Each task is intended as a small or medium focused session (one to five likely source files). Generated lockfiles are maintained with dependency changes. If investigation expands a task beyond this scope, split it before implementation. Commands refer to the proposed scripts established in Tasks 02–03. Early feasibility tasks use manual/provider evidence until the harness exists.

For every task: run its focused checks, keep previously passing relevant checks green, document scope or security changes, and verify runtime behavior. Checkpoints include review before proceeding when feasibility, cost, or scope changes. Implementation is not authorized by the existence of this checklist alone.

## Task 01: Validate free accounts and provider prerequisites

**v0.1 preview checkpoint — 15 October 2026:** User confirmed Workers Free and approved an owner-only Google-sign-in/manual-planning release, deferring Google Calendar sync. Fresh D1 and Worker deployment, secrets and live unauthenticated smoke checks succeeded. Google callback configuration and secret were supplied; the owner confirmed successful real Google sign-in on 15 October 2026. Full unchecked acceptance gates stay open; see release.md rather than interpreting the original sequence as a completed release.

**Scope override — 15 October 2026:** Initial release is Google-only, per user instruction. Microsoft-specific acceptance checks are deferred, not completed. Tasks 05 and 27 are future work. Task 06 depends on Task 04 instead of 05; Task 28 depends on Task 26 instead of 27. Shared provider tasks, export verification and the 48-hour soak require Google only for this release. This override takes precedence over original both-provider wording below; retain Microsoft requirements for later integration.

- [ ] Completed and verified

**Description:** Confirm that the required accounts can host this private app without enabling paid resources.

**SRS trace:** AC-01, CA-01; free-deployment constraint  
**Dependencies:** None  
**Estimated scope:** Small

**Acceptance criteria:**

- [ ] Record Free-plan access, stable workers.dev callback candidates, Google personal-use eligibility, and Microsoft tenant/app-registration access.
- [ ] Record blockers and any identity/card-verification prerequisite; do not call calendar integration feasible if registrations cannot be obtained.

**Verification:** Manual console review; preserve redacted evidence and current pricing links.

**Files likely touched:** `docs/feasibility.md`.

## Task 02: Bootstrap the smallest runnable website

- [x] Completed and verified

**Description:** Create the local React/TypeScript and Worker build foundation with local D1 support.

**SRS trace:** NF-07, NF-11  
**Dependencies:** 01  
**Estimated scope:** Medium

**Acceptance criteria:**

- [x] A local page calls a Worker health endpoint; public assets do not unnecessarily invoke the API.
- [x] Implement the command contract in plan.md; build and dry-run deployment succeed.

**Verification:** npm run typecheck; npm run build; npm run deploy:dry-run; local health smoke test.

**Files likely touched:** `package.json`, `vite.config.ts`, `wrangler.jsonc`, `src/web/main.tsx`, `src/server/index.ts`.

## Task 03: Establish the verification harness

- [x] Completed and verified

**Description:** Add repeatable unit, Worker/D1 integration, and browser smoke checks before domain features.

**SRS trace:** SRS section 11  
**Dependencies:** 02  
**Estimated scope:** Medium

**Acceptance criteria:**

- [x] Tests use local/synthetic data and cannot target production by default.
- [x] A browser smoke test and Worker/D1 test pass; each can be made to fail deliberately.

**Verification:** npm run test -- --run; npm run test:integration; npm run test:e2e.

**Files likely touched:** `vitest.config.ts`, `playwright.config.ts`, `tests/integration/health.test.ts`, `tests/e2e/smoke.spec.ts`, `package.json`.

### Checkpoint after Tasks 01–03

- [ ] All focused tests pass and the application builds (or pre-build feasibility evidence is complete).
- [ ] Demonstrate the new flow and inspect privacy, failure, and free-budget behavior.
- [ ] Record/review blockers and scope changes before the next dependent stage; do not mark unresolved gates complete.

## Task 04: Prove Google OAuth on the free deployment

- [ ] Completed and verified

**Description:** Implement a minimal isolated Google authorization/refresh and one synthetic-calendar round trip.

**SRS trace:** CA-01/02/05/06  
**Dependencies:** 03  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Exact workers.dev callback works; inspect real granted scopes and record the private-use or Testing-mode limitation.
- [ ] Create/read/delete one test event and refresh credentials without exposing secrets; select a Worker-compatible OAuth library.

**Verification:** Real test-account flow; deployed CPU measurement; Google state-replay rejection check.

**Files likely touched:** `src/providers/google.ts`, `src/server/routes/google-oauth.ts`, `tests/integration/google.test.ts`, `docs/feasibility.md`, `package.json`.

## Task 05: Prove Microsoft calendar access

- [ ] Completed and verified

**Description:** Validate Microsoft delegated authorization and the selected event APIs with actual account types.

**SRS trace:** CA-01/02/05/06  
**Dependencies:** 04  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] A personal Microsoft account completes create/read/delete and refresh on the test calendar.
- [ ] Record organizational-account consent results if one is available; an unavailable account type remains unverified.

**Verification:** Real provider smoke test; revoked-consent test; no Azure paid-resource creation.

**Files likely touched:** `src/providers/microsoft.ts`, `src/server/routes/microsoft-oauth.ts`, `tests/integration/microsoft.test.ts`, `docs/feasibility.md`.

## Task 06: Prove free-runtime and SQL feasibility

- [ ] Completed and verified

**Description:** Measure the highest-risk primitives before feature development.

**SRS trace:** JP-03, NF-01/02/08  
**Dependencies:** 05  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] OAuth/JSON/job operations fit 10 ms CPU with headroom, or record a design change before proceeding.
- [ ] Atomic seat allocation passes concurrent last-seat tests; D1 metadata provides a plausible daily read/write budget.

**Verification:** Deployed synthetic benchmarks and D1 contention test; repeat token refresh and paginated import with realistic payloads.

**Files likely touched:** `tests/integration/capacity-spike.test.ts`, `tests/integration/runtime-budget.test.ts`, `docs/feasibility.md`, `migrations/0001-foundation.sql`.

### Checkpoint after Tasks 04–06

- [ ] All focused tests pass and the application builds (or pre-build feasibility evidence is complete).
- [ ] Demonstrate the new flow and inspect privacy, failure, and free-budget behavior.
- [ ] Record/review blockers and scope changes before the next dependent stage; do not mark unresolved gates complete.

## Task 07: Deliver private sign-in and sessions

- [ ] Completed and verified

**Description:** Turn the validated identity flow into allowlisted member access.

**SRS trace:** AC-01, NF-05  
**Dependencies:** 06  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Invited identities can sign in/out; unknown identities are denied before obtaining private data.
- [ ] Session rotation, OAuth replay rejection, expiry, CSRF/Origin controls, and provider-subject identity keys are enforced.

**Verification:** Auth integration suite plus signed-in/signed-out browser flow.

**Files likely touched:** `src/server/auth.ts`, `src/server/routes/session.ts`, `src/web/SignIn.tsx`, `migrations/0002-identities.sql`, `tests/integration/auth.test.ts`.

## Task 08: Deliver profile and identity linking

- [ ] Completed and verified

**Description:** Let a member maintain timezone/profile and deliberately link another login provider.

**SRS trace:** AC-02  
**Dependencies:** 07  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Member can confirm/change IANA timezone and display name.
- [ ] Linking requires recent authentication and does not merge users solely by email.

**Verification:** Profile tests; two-account linking rejection test; browser timezone change.

**Files likely touched:** `src/server/routes/profile.ts`, `src/server/identities.ts`, `src/web/Profile.tsx`, `tests/integration/profile.test.ts`.

## Task 09: Deliver private group invitations

- [ ] Completed and verified

**Description:** Create the group membership path without a paid email dependency.

**SRS trace:** AC-03  
**Dependencies:** 08  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Administrator creates a group and account-bound, expiring invitation link to share manually.
- [ ] Only the intended signed-in recipient can accept; duplicate acceptance is idempotent.

**Verification:** Invitation expiry/replay/recipient tests and two-member browser walkthrough.

**Files likely touched:** `migrations/0003-groups.sql`, `src/server/routes/groups.ts`, `src/web/Groups.tsx`, `tests/integration/groups.test.ts`.

### Checkpoint after Tasks 07–09

- [ ] All focused tests pass and the application builds (or pre-build feasibility evidence is complete).
- [ ] Demonstrate the new flow and inspect privacy, failure, and free-budget behavior.
- [ ] Record/review blockers and scope changes before the next dependent stage; do not mark unresolved gates complete.

## Task 10: Enforce sharing and group revocation

- [ ] Completed and verified

**Description:** Provide privacy controls and immediate permission rechecks.

**SRS trace:** AC-04/05  
**Dependencies:** 09  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Availability defaults private; selected members/groups can be granted access.
- [ ] Leaving/removal/revocation closes access on subsequent requests including saved links.

**Verification:** Access matrix integration tests across owner/member/removed/stranger.

**Files likely touched:** `migrations/0004-sharing.sql`, `src/domain/access.ts`, `src/server/routes/sharing.ts`, `src/web/Sharing.tsx`, `tests/integration/access.test.ts`.

## Task 11: Deliver dated availability

- [ ] Completed and verified

**Description:** Create a complete manual-availability editor and day view.

**SRS trace:** AV-01/04/08/09  
**Dependencies:** 10  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Members save/edit/delete available or busy intervals, all-day entries, and multi-day absences.
- [ ] Intervals validate duration and end-exclusive dates; uncovered time is Unknown.

**Verification:** AT-01 partial; boundary/overlap tests; keyboard entry smoke test.

**Files likely touched:** `migrations/0005-availability.sql`, `src/server/routes/availability.ts`, `src/domain/intervals.ts`, `src/web/Availability.tsx`, `tests/unit/intervals.test.ts`.

## Task 12: Deliver recurring availability and exceptions

- [ ] Completed and verified

**Description:** Add local weekly rules with correct DST and precedence behavior.

**SRS trace:** AV-02/07/08  
**Dependencies:** 11  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Weekly rules honor effective dates and dated overrides.
- [ ] Nonexistent/repeated local times are handled explicitly; busy has defined precedence.

**Verification:** AT-04 fixtures for Seoul/New York, spring gap, autumn fold, and cross-midnight rules.

**Files likely touched:** `src/domain/recurrence.ts`, `src/server/routes/availability.ts`, `src/web/Availability.tsx`, `tests/unit/recurrence.test.ts`.

### Checkpoint after Tasks 10–12

- [ ] All focused tests pass and the application builds (or pre-build feasibility evidence is complete).
- [ ] Demonstrate the new flow and inspect privacy, failure, and free-budget behavior.
- [ ] Record/review blockers and scope changes before the next dependent stage; do not mark unresolved gates complete.

## Task 13: Deliver long-term views

- [ ] Completed and verified

**Description:** Expose week/month/year summaries with permission-aware date-window fetching.

**SRS trace:** AV-03/06  
**Dependencies:** 12  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Twelve-month navigation and summary drill-down work without eagerly materializing every minute.
- [ ] Views distinguish Busy/Available/Unknown and avoid exposing labels to unauthorized users.

**Verification:** AT-01; annual synthetic dataset and narrow-viewport browser checks.

**Files likely touched:** `src/web/CalendarViews.tsx`, `src/server/routes/availability.ts`, `src/web/availability-client.ts`, `tests/e2e/availability.spec.ts`.

## Task 14: Deliver matching suggestions

- [ ] Completed and verified

**Description:** Find complete/partial matches in a cancellable browser worker.

**SRS trace:** MT-01/02/03/04/05  
**Dependencies:** 13  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Inputs include required participants, range, duration, local window, and buffers; results follow SRS ranking.
- [ ] Only authorized availability reaches the browser; unknown does not count as available.

**Verification:** AT-02/03; 50-participant, 90-day benchmark; cancelled twelve-month search.

**Files likely touched:** `src/domain/matching.ts`, `src/web/matching.worker.ts`, `src/web/FindTime.tsx`, `src/server/routes/matching.ts`, `tests/unit/matching.test.ts`.

## Task 15: Recheck selected slots on the server

- [ ] Completed and verified

**Description:** Protect final planning against changed or untrusted client availability.

**SRS trace:** MT-06  
**Dependencies:** 14  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Selected slot is validated against fresh authorized data and current versions.
- [ ] New conflicts/unknown coverage require explicit acknowledgement rather than silently confirming.

**Verification:** Race test that changes availability between suggestion and selection.

**Files likely touched:** `src/server/routes/matching.ts`, `src/web/FindTime.tsx`, `tests/integration/matching.test.ts`.

### Checkpoint after Tasks 13–15

- [ ] All focused tests pass and the application builds (or pre-build feasibility evidence is complete).
- [ ] Demonstrate the new flow and inspect privacy, failure, and free-budget behavior.
- [ ] Record/review blockers and scope changes before the next dependent stage; do not mark unresolved gates complete.

## Task 16: Deliver plan drafts

- [ ] Completed and verified

**Description:** Allow organizers to create and edit their own plan.

**SRS trace:** PL-01/02  
**Dependencies:** 15  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Save fixed-time or candidate-time drafts with title, venue, timezone, capacity, and deadlines.
- [ ] Validation rejects invalid duration/deadlines and editing by nonowners.

**Verification:** Plan draft integration tests plus browser create/edit flow.

**Files likely touched:** `migrations/0006-plans.sql`, `src/domain/plans.ts`, `src/server/routes/plans.ts`, `src/web/PlanEditor.tsx`, `tests/integration/plans.test.ts`.

## Task 17: Publish private plans

- [ ] Completed and verified

**Description:** Make group/invite plans visible to authorized members.

**SRS trace:** PL-03/04; private-release scope  
**Dependencies:** 16  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Authorized members browse/filter eligible plans and open details; outsiders cannot see private venue or metadata.
- [ ] Public publishing is disabled and described as deferred.

**Verification:** AT-05; API/list/filter/link access tests.

**Files likely touched:** `src/server/routes/plans.ts`, `src/web/Explore.tsx`, `src/web/PlanDetail.tsx`, `tests/e2e/plans.spec.ts`.

## Task 18: Deliver candidate voting and time confirmation

- [ ] Completed and verified

**Description:** Collect preferences before selecting the final activity time.

**SRS trace:** PL-05/07, AT-10  
**Dependencies:** 17  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Members vote Available/Unavailable/Maybe until closed; votes alone allocate no seats.
- [ ] Organizer confirms a candidate and creates the required membership transition; proposed plans cannot export.

**Verification:** Candidate/vote access and closure tests; proposal-to-confirmed browser flow.

**Files likely touched:** `migrations/0007-votes.sql`, `src/server/routes/votes.ts`, `src/web/CandidateTimes.tsx`, `src/domain/plans.ts`, `tests/integration/votes.test.ts`.

### Checkpoint after Tasks 16–18

- [ ] All focused tests pass and the application builds (or pre-build feasibility evidence is complete).
- [ ] Demonstrate the new flow and inspect privacy, failure, and free-budget behavior.
- [ ] Record/review blockers and scope changes before the next dependent stage; do not mark unresolved gates complete.

## Task 19: Deliver atomic immediate joining

- [ ] Completed and verified

**Description:** Connect seat allocation to the user-facing join flow.

**SRS trace:** JP-01/02/03/08/09  
**Dependencies:** 18  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Duplicate joins are idempotent; last-seat races cannot exceed capacity; organizer attendance consumes a seat when enabled.
- [ ] Conflict acknowledgement and access/deadline/status checks run before joining; proposed plans allocate Interested status.

**Verification:** AT-06 contention tests plus conflict/join UI walkthrough.

**Files likely touched:** `migrations/0008-participation.sql`, `src/server/routes/participation.ts`, `src/domain/participation.ts`, `src/web/JoinPlan.tsx`, `tests/integration/participation.test.ts`.

## Task 20: Deliver approval and departure

- [ ] Completed and verified

**Description:** Support requested membership, organizer decisions, leaving, and removal.

**SRS trace:** JP-05/06  
**Dependencies:** 19  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Pending requests consume no seats; approving consumes a seat atomically.
- [ ] Departure/removal releases seats, records audit intent, and exposes correct member status.

**Verification:** Approval/leave/remove tests including stale decisions and unauthorized organizer.

**Files likely touched:** `src/server/routes/participation.ts`, `src/domain/participation.ts`, `src/web/Participants.tsx`, `tests/integration/participation.test.ts`.

## Task 21: Deliver waitlist offers

- [ ] Completed and verified

**Description:** Implement FIFO reserved offers with expiry-aware state transitions.

**SRS trace:** JP-04  
**Dependencies:** 20  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] A freed seat creates one offer for the first eligible member; offer holds a seat until accepted/declined/expired.
- [ ] Acceptance checks deadline, access, and blocking again; expiry can also be evaluated on the next membership command.

**Verification:** Concurrent expiry/acceptance tests; 24-hour/deadline/start-time boundaries.

**Files likely touched:** `src/domain/waitlist.ts`, `src/server/routes/participation.ts`, `src/web/Waitlist.tsx`, `tests/integration/waitlist.test.ts`.

### Checkpoint after Tasks 19–21

- [ ] All focused tests pass and the application builds (or pre-build feasibility evidence is complete).
- [ ] Demonstrate the new flow and inspect privacy, failure, and free-budget behavior.
- [ ] Record/review blockers and scope changes before the next dependent stage; do not mark unresolved gates complete.

## Task 22: Deliver reconfirmation and plan cancellation

- [ ] Completed and verified

**Description:** Preserve membership correctness when activity details change.

**SRS trace:** PL-06/08, JP-07  
**Dependencies:** 21  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Material edits increment plan version and hold seats pending reconfirmation until the correct capped deadline.
- [ ] Cancellation blocks new joins and records desired calendar removals; completion closes joining.

**Verification:** AT-08 state tests; reconfirm/decline/expiry and cancellation browser checks.

**Files likely touched:** `src/domain/plans.ts`, `src/domain/participation.ts`, `src/server/routes/plans.ts`, `src/web/PlanDetail.tsx`, `tests/integration/plan-changes.test.ts`.

## Task 23: Create the durable outbox

- [ ] Completed and verified

**Description:** Persist follow-up work with each relevant business transition.

**SRS trace:** CA-06/09, NT-03, NF-08  
**Dependencies:** 22  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Plan/membership changes and corresponding deduplicated jobs commit atomically.
- [ ] Lease claim, retry, desired-version handling, and abandoned-lease recovery work.

**Verification:** Crash-before/after-commit and duplicate-delivery integration tests.

**Files likely touched:** `migrations/0009-jobs.sql`, `src/server/jobs/outbox.ts`, `src/server/routes/plans.ts`, `src/server/routes/participation.ts`, `tests/integration/outbox.test.ts`.

## Task 24: Run scheduled expiry and bounded jobs

- [ ] Completed and verified

**Description:** Connect pending jobs and deadlines to one minute cron.

**SRS trace:** JP-04/07, NF-08  
**Dependencies:** 23  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Cron recovers pending work, expires offers/reconfirmation holds, and does bounded work within free limits.
- [ ] No publicly callable unauthenticated dispatcher; overlapping runs do not double-process.

**Verification:** Scheduled-handler tests; deployed CPU/queue-age measurements; forced process termination recovery.

**Files likely touched:** `src/server/jobs/dispatcher.ts`, `src/server/index.ts`, `wrangler.jsonc`, `tests/integration/scheduler.test.ts`.

### Checkpoint after Tasks 22–24

- [ ] All focused tests pass and the application builds (or pre-build feasibility evidence is complete).
- [ ] Demonstrate the new flow and inspect privacy, failure, and free-budget behavior.
- [ ] Record/review blockers and scope changes before the next dependent stage; do not mark unresolved gates complete.

## Task 25: Deliver calendar connection settings

- [ ] Completed and verified

**Description:** Give each member independent consent and calendar selection controls.

**SRS trace:** CA-01/02/03/11  
**Dependencies:** 24  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Source calendars and one owned writable destination are selectable; read/write purposes are explained separately.
- [ ] Credentials are encrypted server-side; disconnect removes tokens and explains remaining copies.

**Verification:** Two-user authorization isolation, token redaction, disconnect/revoke tests.

**Files likely touched:** `migrations/0010-calendar-connections.sql`, `src/server/routes/connections.ts`, `src/server/token-vault.ts`, `src/web/CalendarSettings.tsx`, `tests/integration/connections.test.ts`.

## Task 26: Import Google busy intervals

- [ ] Completed and verified

**Description:** Convert Google calendar data into private normalized availability.

**SRS trace:** AV-05/06, CA-10/13  
**Dependencies:** 25  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Bounded/paginated import records coverage, freshness, transparent/cancelled events, recurrence, and managed-copy deduplication.
- [ ] Only changed intervals are persisted; invalid sync cursor triggers safe rebuild with Unknown coverage.

**Verification:** Google fixtures and real test calendar; measure rows written on unchanged refresh.

**Files likely touched:** `src/providers/google.ts`, `src/server/jobs/google-import.ts`, `migrations/0011-busy-coverage.sql`, `tests/integration/google-import.test.ts`.

## Task 27: Import Microsoft busy intervals

- [ ] Completed and verified

**Description:** Extend normalized import to personal and supported organizational calendars.

**SRS trace:** AV-05/06, CA-10/13  
**Dependencies:** 26  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] calendarView pagination, showAs mapping, timezone conversion, and all-day boundaries are normalized.
- [ ] Stale and incomplete ranges are Unknown; import cannot reveal subjects or attendee data to peers.

**Verification:** Microsoft provider fixtures and personal-account smoke; organizational-account evidence when available.

**Files likely touched:** `src/providers/microsoft.ts`, `src/server/jobs/microsoft-import.ts`, `src/domain/provider-intervals.ts`, `tests/integration/microsoft-import.test.ts`.

### Checkpoint after Tasks 25–27

- [ ] All focused tests pass and the application builds (or pre-build feasibility evidence is complete).
- [ ] Demonstrate the new flow and inspect privacy, failure, and free-budget behavior.
- [ ] Record/review blockers and scope changes before the next dependent stage; do not mark unresolved gates complete.

## Task 28: Export confirmed plans to both providers

- [ ] Completed and verified

**Description:** Create one managed calendar copy for an opted-in confirmed participant.

**SRS trace:** CA-04/05/06/07  
**Dependencies:** 27  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Create/update/delete jobs use persisted mappings and ownership checks; candidate plans and unconfirmed members cannot export.
- [ ] A successful remote insert followed by a lost response reconciles to one event; unrelated events remain untouched.

**Verification:** AT-07 for both providers including injected timeout-after-create.

**Files likely touched:** `migrations/0012-calendar-exports.sql`, `src/server/jobs/export.ts`, `src/providers/google.ts`, `src/providers/microsoft.ts`, `tests/integration/export.test.ts`.

## Task 29: Recover and display calendar synchronization failures

- [ ] Completed and verified

**Description:** Give members accurate export status and safe retries.

**SRS trace:** CA-08/09/12  
**Dependencies:** 28  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Pending/Synced/Failed/Reauthorization states and last success are visible; Retry-After and revocation are handled.
- [ ] External deletion does not silently recreate a copy; explicit resync is required.

**Verification:** AT-09/12 with throttling, 401, 404, partial participant failure, and retry.

**Files likely touched:** `src/server/jobs/export.ts`, `src/server/routes/exports.ts`, `src/web/CalendarStatus.tsx`, `tests/integration/export-recovery.test.ts`.

## Task 30: Handle edits, destination migration, and disconnect cleanup

- [ ] Completed and verified

**Description:** Complete calendar lifecycle across changing plans and connections.

**SRS trace:** CA-07/11/12, JP-07  
**Dependencies:** 29  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Reschedule/reconfirmation/cancel/leave update or remove only intended managed copies.
- [ ] Destination change tracks old/new generations and unresolved cleanup; disconnect can clean copies before losing authorization.

**Verification:** AT-08 plus destination-write failure, stale-version completion, and token-revocation during cleanup.

**Files likely touched:** `src/server/jobs/export.ts`, `src/server/routes/connections.ts`, `src/web/CalendarSettings.tsx`, `tests/integration/calendar-lifecycle.test.ts`.

### Checkpoint after Tasks 28–30

- [ ] All focused tests pass and the application builds (or pre-build feasibility evidence is complete).
- [ ] Demonstrate the new flow and inspect privacy, failure, and free-budget behavior.
- [ ] Record/review blockers and scope changes before the next dependent stage; do not mark unresolved gates complete.

## Task 31: Deliver the notification inbox

- [ ] Completed and verified

**Description:** Show membership, plan, waitlist, and sync notifications inside the app.

**SRS trace:** NT-01/03/04  
**Dependencies:** 30  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Deduplicated notifications reflect current accessible state; links recheck access.
- [ ] Offline members see notifications on return; UI does not promise background email/browser delivery.

**Verification:** Notification access/revocation tests and inbox browser flow.

**Files likely touched:** `migrations/0013-notifications.sql`, `src/server/jobs/notifications.ts`, `src/server/routes/notifications.ts`, `src/web/Inbox.tsx`, `tests/integration/notifications.test.ts`.

## Task 32: Deliver preferences and reminders

- [ ] Completed and verified

**Description:** Schedule the default one-day and one-hour reminders with user controls.

**SRS trace:** NT-02/03  
**Dependencies:** 31  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Preferences persist; elapsed reminder times are skipped.
- [ ] Cancellation/departure/time edits invalidate obsolete reminders before delivery.

**Verification:** AT-13 with deterministic clock and race tests.

**Files likely touched:** `src/server/jobs/reminders.ts`, `src/server/routes/profile.ts`, `src/web/Profile.tsx`, `tests/integration/reminders.test.ts`.

## Task 33: Deliver member blocking and reporting

- [ ] Completed and verified

**Description:** Provide private-group abuse controls and audited administrative actions.

**SRS trace:** AC-06, MD-01  
**Dependencies:** 32  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Blocking prevents new joins and availability access, flags existing shared membership, and respects pending waitlist offers.
- [ ] Members report content; authorized admin can review/suspend/hide with notices and audit records.

**Verification:** Block/administrator access matrix; no privilege escalation through report endpoints.

**Files likely touched:** `migrations/0014-moderation.sql`, `src/server/routes/moderation.ts`, `src/domain/access.ts`, `src/web/Moderation.tsx`, `tests/integration/moderation.test.ts`.

### Checkpoint after Tasks 31–33

- [ ] All focused tests pass and the application builds (or pre-build feasibility evidence is complete).
- [ ] Demonstrate the new flow and inspect privacy, failure, and free-budget behavior.
- [ ] Record/review blockers and scope changes before the next dependent stage; do not mark unresolved gates complete.

## Task 34: Deliver ownership transfer and account deletion

- [ ] Completed and verified

**Description:** Complete privacy lifecycle without orphaning future activities.

**SRS trace:** AC-01; SRS section 7  
**Dependencies:** 33  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Transfer requires recipient acceptance; deletion requires resolving future ownership and attempts managed-copy cleanup.
- [ ] Sessions/tokens revoke promptly; staged deletion/retention jobs remove or anonymize data on schedule.

**Verification:** Deletion/transfer interruption tests and retention time-travel fixtures.

**Files likely touched:** `src/server/routes/account.ts`, `src/server/jobs/retention.ts`, `src/web/AccountSettings.tsx`, `tests/integration/account-deletion.test.ts`.

## Task 35: Deliver quota controls and operational status

- [ ] Completed and verified

**Description:** Keep workload inside the planned free envelope.

**SRS trace:** NF-03/09; zero-cost constraint  
**Dependencies:** 34  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Admin can inspect job lag, CPU observations, D1 usage, storage, connection health, and allowance thresholds.
- [ ] Admission caps and degraded/stale states activate without enabling a paid tier; logs remain redacted.

**Verification:** Budget simulation, large-calendar import, API abuse limits, and measured daily-use report.

**Files likely touched:** `src/server/usage.ts`, `src/server/jobs/dispatcher.ts`, `src/web/AdminHealth.tsx`, `tests/integration/budgets.test.ts`, `docs/operations.md`.

## Task 36: Prove backup recovery and rollback

- [ ] Completed and verified

**Description:** Write and rehearse recovery before real private-group data is admitted.

**SRS trace:** NF-10  
**Dependencies:** 35  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Restore synthetic D1 state within target time and document recovery point; rollback code with compatible migrations.
- [ ] Post-restore procedure invalidates resurrected credentials, reapplies deletions, and reconciles calendar state.

**Verification:** Staging Time Travel restore drill and version rollback; record timestamps/results.

**Files likely touched:** `docs/operations.md`, `docs/recovery-evidence.md`, `tests/integration/reconciliation.test.ts`.

### Checkpoint after Tasks 34–36

- [ ] All focused tests pass and the application builds (or pre-build feasibility evidence is complete).
- [ ] Demonstrate the new flow and inspect privacy, failure, and free-budget behavior.
- [ ] Record/review blockers and scope changes before the next dependent stage; do not mark unresolved gates complete.

## Task 37: Verify usability and accessibility

- [ ] Completed and verified

**Description:** Verify every enabled core screen across input modes and viewport sizes.

**SRS trace:** NF-06/07, AT-11  
**Dependencies:** 36  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Keyboard/focus/labels/text status checks pass for planning, joining, and connection flows.
- [ ] 360px and desktop layouts are usable in the agreed browser matrix; fix defects in focused follow-up tasks.

**Verification:** Playwright browser/accessibility suite and manual keyboard audit.

**Files likely touched:** `tests/e2e/accessibility.spec.ts`, `tests/e2e/responsive.spec.ts`, `docs/acceptance.md`.

## Task 38: Run full acceptance and the free-tier soak

- [ ] Completed and verified

**Description:** Collect release evidence rather than assuming mocks prove deployment behavior.

**SRS trace:** AT-01–13, NF-01–11  
**Dependencies:** 37  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Enabled-scope acceptance scenarios pass; deferred scope and failed nonfunctional targets are explicitly listed.
- [ ] A 48-hour synthetic/private test run stays within free budgets, with both providers, quota margins, and retry recovery observed.

**Verification:** Full test suite; deployed provider smoke; 50-person matching/100-concurrent synthetic benchmarks in isolated test windows.

**Files likely touched:** `tests/e2e/release.spec.ts`, `tests/integration/release-budget.test.ts`, `docs/acceptance.md`, `docs/feasibility.md`.

## Task 39: Release to the private group

- [ ] Completed and verified

**Description:** Deploy the reviewed build with only invited personally known members admitted.

**SRS trace:** All enabled release requirements  
**Dependencies:** 38  
**Estimated scope:** Medium

**Acceptance criteria:**

- [ ] Free-plan status, production secrets, allowlist, stable callbacks, and recovery bookmark are verified before deploy.
- [ ] Post-deploy join/export/edit/reconfirm/cancel smoke passes; publish member instructions and current limitations.

**Verification:** npm run build; npm run deploy:dry-run; production migration/deploy scripts after release review; manual smoke and billing inspection.

**Files likely touched:** `docs/release.md`, `docs/member-guide.md`, `docs/operations.md`.

### Checkpoint after Tasks 37–39

- [ ] All focused tests pass and the application builds (or pre-build feasibility evidence is complete).
- [ ] Demonstrate the new flow and inspect privacy, failure, and free-budget behavior.
- [ ] Record/review blockers and scope changes before the next dependent stage; do not mark unresolved gates complete.

## Deferred scope index

- Public publishing, anonymous exploration, and public moderation: deferred with the user's private launch scope; revisit domain/OAuth verification and load limits before enabling.
- Optional email notifications: deferred until a free sender setup is demonstrated; no email dependency in login/invitations.
- Provider webhooks: optional optimization after polling measurements; implement if required to meet the selected budget/targets.
- Existing Future SRS features remain out of scope.

No calendar provider is silently deferred. If Task 04 or 05 cannot pass, document the blocker and replan that requirement rather than declaring the full private release complete.


