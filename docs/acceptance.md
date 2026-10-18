# Preview verification — 15 October 2026

## 18 October 2026: worldwide-zone update

TypeScript, lint, production build and all **9 Chromium tests** pass for the worldwide profile/plan zone selectors. The new browser scenario verifies more than 400 suggestions across world regions, Kathmandu profile persistence, Chatham plan persistence and unchanged timestamps/zone for an existing Seoul availability entry. Existing mobile overflow and accessibility checks pass. Deployment completed and live health/security plus the new client bundle were verified. Backend behavior is unchanged; the 15-domain/39-Worker test counts below are the earlier baseline, not a claim that those suites were rerun for this UI change.

## Deployment checkpoint

The user approved an owner-only manual-planning preview with calendar sync deferred. It is deployed at `https://rufree.sn-pranav18.workers.dev/` on the user's confirmed Workers Free plan. Production D1 migrations applied successfully. `node scripts/release-smoke.mjs` passes live health/D1, private API denial, synthetic-login denial, CSRF, Google authorization URL/PKCE/secure cookie, invalid callback rejection and CSP checks. The owner confirmed reaching My availability through real Google sign-in on 15 October 2026; no real Calendar calls or full soak/performance/restore validation claimed.

Current local total: **62 passing tests** (15 domain, 39 Worker/D1, 8 Chromium), plus TypeScript, lint, build and exact production packaging dry-run. The additional 11 Google identity tests cover signed identity acceptance, PKCE/browser binding, callback replay, invalid issuer/audience/nonce/expiry/signature, unverified/uninvited email, revoked allowlist access, denial/expiry and synthetic-login exclusion. Provider responses in these tests are signed fixtures, not live Google responses.

## Outcome

This verifies the local foundation, manual availability, group access and core plan/inbox workflows. It does not establish full SRS conformance, real OAuth/provider interoperability, deployed Cloudflare CPU usage, cloud reliability, or production readiness.

| Check | Result |
|---|---|
| TypeScript | `npm run typecheck` passes. |
| ESLint | `npm run lint` passes, including floating-promise checks. |
| Domain suite | 15 passing tests: interval precedence, Busy ties, Unknown coverage, half-open boundaries, all-day exclusive ends, stale coverage, Seoul/New York DST, spring gaps, autumn folds, cross-midnight recurrence, matching counts/ranking/buffers. |
| Worker/D1 suite | 28 passing tests on actual local workerd/D1. Includes the original 12 health/auth/session/availability/privacy checks and 16 plan/group/outbox checks: private links, stale edits, last-seat contention, approvals, FIFO offers/expiry, votes versus seats, reconfirmation, cancellation, current availability, account-bound invitations/revocation, lease recovery, stale notice suppression, completion and transactional rollback when an outbox insert fails. |
| Browser suite | 8 passing Chromium tests. Original availability/sharing/cancellation checks now include suggestion-to-draft creation; new multi-context tests cover last seat → waitlist → offer → accept → edit → reconfirm → cancel → inbox, candidate voting/confirmation, and group invitation acceptance/access revocation. |
| Accessibility | Automated axe WCAG 2 A/AA, 2.1 AA, and 2.2 AA tags pass on enabled screens at 360px and the desktop availability screen. Contrast defects found during implementation were corrected. Keyboard login and visible focus are exercised; this is not a complete manual WCAG audit. |
| Visual review | Inspected desktop availability and plan-detail screenshots and 360px settings, including the fully loaded calendar. Automated mobile overflow checks include plan editor and inbox. |
| Build and dry-run | Client/Worker build and Wrangler packaging dry-run pass. They create local artifacts only. Vite warns that the main client chunk is 517 kB uncompressed (152 kB gzip); route splitting and performance measurement remain. |
| Database migration | Local migration executes successfully. Integration and browser tests use isolated local state. |
| Dependencies | Exact package versions and lockfile retained. Final installation reports zero known npm audit vulnerabilities. License inventory generated in dependency-licenses.md. |
| Negative controls | Temporarily changed the Worker health expectation and browser heading expectation to an incorrect sentinel, separately. Both suites exited 1. Original tests were restored immediately and rerun successfully. Logs retained under ignored `.runtime`. |

## SRS evidence boundaries

| Scenario | Local evidence | Outstanding acceptance |
|---|---|---|
| AT-01 | Rules, dated overrides, twelve-month summaries and drill-down implemented; unit/browser checks | Full authenticated member/group workflow and broader datasets |
| AT-02/03 | Matching complete/partial counts and Unknown behavior tested; Busy removes overlap | Real provider coverage and 50-person p95 benchmark |
| AT-04 | Seoul/New York same instant, DST gap/fold, recurring wall-clock fixtures; plans retain reference zones | Real calendar timezone round trips |
| AT-05 | Availability grants plus invite/group plan authorization and immediate revocation tested | Production identities, blocking, broader privacy audit |
| AT-06 | Local SQL last-seat contention, waitlist offers, approval capacity and expiry tested | Deployed D1 contention/CPU measurements |
| AT-07–10/12/13 | Local candidate confirmation, reconfirmation and cancellation flows exercised | Provider round trips/retries, external deletion, reminders and complete SRS scenarios |
| AT-11 | Enabled local screens have Chromium keyboard/axe checks, including plan editor and inbox | Calendar setup, complete manual audit, full browser matrix |

## Required next verification

1. Complete account setup and real Google/Microsoft feasibility checks with isolated provider calendars.
2. Prove production identity/security and deployed SQL capacity transitions; benchmark deployed CPU and D1 work before accepting the architecture for the complete app.
3. Implement remaining checklist stages and their corresponding acceptance tests.
4. Run complete cross-browser, 100-concurrent/50-participant performance, restore, provider-failure, and 48-hour free-tier soak checks.

No performance, pricing, SLA, restore-time, or real-calendar claim is inferred from these local test passes. See implementation-status.md for the full unfinished scope.

## Defects found and corrected in this checkpoint

- Inbox refresh originally left POST bodies unread, causing the local Vite/Worker proxy to fail on a subsequent keep-alive request. The endpoint now consumes and validates the bounded JSON body; the formerly failing multi-person browser flow and full suite pass.
- Membership notifications previously could outlive a newer leave/rejoin revision. Delivery and inbox reads now require the current membership revision.
- Reconfirmation remains possible after joining closes, while new joins/offers still obey joining deadlines. Material edits shorten outstanding offer expiry to the new start time.
- Exact text label selectors included option text in two browser checks; role-based combobox selectors now exercise the rendered accessible names.
