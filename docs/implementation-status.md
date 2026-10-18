# Implementation checkpoint — 15 October 2026

## Local continuation — 18 October 2026

Group departure now ends active participation and clears candidate votes in proposed/confirmed group-only plans, releasing held places transactionally. Existing jobs and plan reads promote eligible waitlisted members. Organizer-owned plans and independent invitations are preserved. Three new regressions passed with the full 48-test integration suite; type checking, lint and production build passed. See [ADR-007](decisions/007-group-departure-cleanup.md). This change has not been deployed; references below to group-removal cleanup being unfinished describe the previous release.

This file records actual scope. The SRS and the 39-task plan have **not** been fully implemented. The user-approved v0.1 manual-planning beta is deployed at `https://rufree.sn-pranav18.workers.dev/`. Fresh production D1 migrations and live unauthenticated security checks pass. The owner confirmed successful real Google sign-in on 15 October 2026.

**Preview scope update — 15 October 2026:** User explicitly approved shipping manual planning first and adding Google Calendar sync later. Google OIDC sign-in is implemented using oauth4webapi, PKCE, nonce, browser-bound single-use state, verified token signatures and an email allowlist. Only identity scopes are requested; provider access tokens are not retained. Local synthetic sessions remain loopback-only. Full operational gates are retained for broader release, not represented as complete by this preview.

**Scope update — 15 October 2026:** User requested Google-only initial integration. Microsoft authentication, import/export, registrations and verification are deferred to a later phase, not release blockers or completed work. Tasks 05/27 and Microsoft portions of shared tasks remain in the future backlog. Current provider gates concern Google only.

## Delivered locally

| Plan area | Implementation | Limits |
|---|---|---|
| Task 02 | React/Vite/TypeScript, Worker health endpoint, D1 migrations, pinned dependencies, binding types, production build/dry-run and owner-preview deployment | Full release acceptance remains open. Production deploy requires explicit approved configuration. |
| Task 03 | Vitest domain tests, real local Worker/D1 tests, Playwright/axe browser checks, isolated synthetic databases, negative controls | Browser coverage is Chromium only. No provider tests or deployed measurements. |
| Profile / groups / privacy primitives from 08–10 | Editable name/IANA zone, per-person grants, private defaults, label redaction, account-bound expiring group invitations, membership removal, request-time revocation | Production registration is open to verified Google accounts as authorized on 18 October. Discovery is restricted to groups and explicit sharing; group invitations support an exact email of an existing registered account. No identity linking, group availability grants, blocking, or ownership transfer. |
| Manual availability from 11/12 | Dated create/edit/delete, all-day/multi-day exclusive ends, weekly rules, effective dates, one-off overrides, Busy precedence, DST gap rejection/fold choices | Weekly rules can be created/deleted; no rule-edit UI. Imported calendars absent. |
| Views from 13 | Day/week/month/rolling twelve-month summaries and drill-down; browser worker computes recurrence/segments | Currently loads the owner's bounded year in one request with entry/rule caps; date-window paging for larger datasets remains. |
| Matching from 14/15 | Authorized member selection, duration/local window/buffers, complete/partial/unknown counts, ranking, browser worker progress/cancellation, current-data recheck, prefilled plan drafts | Matching recheck is advisory; plan commands independently recheck interval availability. No claimed NF-02 benchmark. |
| Plans / participation from 16–23 | Drafts, invite/group visibility, fixed/candidate times, votes, publication, capacity/organizer seats, approval, FIFO offers/expiry, reconfirmation, cancellation and completion | Local SQL contention evidence only. Published invitee removal or visibility changes, richer discovery filters, calendar jobs, group-removal membership cleanup and production identity integration remain. |
| Jobs / inbox from 24/31 | Transactional outbox, lease recovery, idempotent notification insertion, current version/revision/access guards, bounded expiry/completion/promotion, inbox and read state; one-minute cron deployed | No reminder scheduler or operational dashboard. Full cron soak remains open. Inbox refresh processes jobs only locally; production reads results from scheduled processing. A closed browser is not notified. |

The local-session route is deliberately limited to three synthetic identities and loopback hosts. Production has a separate Google identity path, with hashed sessions and request-time allowlist checks. Full identity linking/admission UI and broader Task 07 acceptance are not complete.

## Still required

| Tasks | Status / next work |
|---|---|
| 01 | Namespace confirmed; Free plan confirmed by user; Google client/callback/secret configuration supplied. Owner-only Worker and fresh D1 deployed. Microsoft deferred. |
| 04–06 | Google identity code and fixture security checks implemented; live owner sign-in confirmed by the user on 15 October 2026. Calendar OAuth/refresh/round trips deferred for preview. Deployed load/CPU/contention benchmarks remain. |
| 07–10 | Allowlisted Google OIDC and provider-subject identities implemented. Identity linking, group availability grants and ownership transfer remain. Full task gates are open. |
| 11–15 | Finish identity integration, group-aware fetching, rule editor, bounded pagination, benchmarks, and atomic selected-time confirmation once the required foundations are available. |
| 16–24 | Core local flows implemented and tested. Integrate verified private identity and provider jobs, complete remaining controls above, and measure deployed transactional/CPU behavior. These tasks remain open against full acceptance criteria. |
| 25–30 | Provider connection/consent, encrypted token vault, imports/coverage, idempotent exports, retries, external-deletion detection, destination migration and cleanup. Not implemented. |
| 31–36 | Local inbox implemented. Reminders, blocking/reporting/moderation, ownership transfer/deletion/retention, quota dashboard/controls, restore/rollback rehearsal remain. |
| 37–39 | Complete cross-browser accessibility and acceptance, performance tests, deployed provider checks, 48-hour soak, and reviewed private release. Not performed. |

## Review decisions

- After the user confirmed OAuth registrations need setup and asked to continue, implemented local manual availability and plan-domain workflows. Provider functionality remains a required release gate.
- Participation triggers update capacity, availability versions, audit and outbox in the same transaction. Injecting an outbox failure verifies that seat/membership writes roll back. Separate database-guarded promotion preserves FIFO eligibility and capacity.
- Both queued and delivered membership notices carry a membership revision, preventing an old confirmation from appearing after a leave. Every inbox read rechecks current plan visibility.
- Kept all remote writes and deployment disabled while real private identity is absent. No mock calendar integrations or misleading connect buttons.
- Used the maintained Cloudflare Vitest plugin after package metadata showed the older package was deprecated and incompatible with Vitest 5.
- Pinned compatibility to the installed runtime's supported date. No inference of cloud CPU feasibility from local success.
- Browser computations run in dedicated workers; cancellation terminates the matching worker and invalidates any in-flight data-read result.
- Tests use isolated local databases; browser test runs cannot mutate the development D1 store.

Read [acceptance.md](acceptance.md) for exact verification and [setup.md](setup.md) for the next account steps.
