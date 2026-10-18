# RUFree

The [v0.1 public beta](https://rufree.sn-pranav18.workers.dev/) is deployed with Google sign-in and manual planning, open to verified Google accounts. Google Calendar sync and Microsoft integration are deferred by the user. See [release notes](docs/release.md).

A private scheduling implementation of the Schedule Tracker plan. React and TypeScript run against a Cloudflare Worker and D1, with a separate local development database.

**This is a manual-planning beta, not the completed 39-task release.** Calendar sync, reminders, moderation, automatic account deletion, operational dashboards and full soak/recovery checks remain unfinished. Google identity has automated security coverage; the owner confirmed successful real Google sign-in on 15 October 2026. See [implementation status](docs/implementation-status.md) and [feasibility evidence](docs/feasibility.md).

## Run locally

Use Node 22.12 or later (verified with Node 24.21 and npm 11.19):

```sh
npm ci
npm run db:migrate:local
npm run dev
```

Open `http://127.0.0.1:5173` and select a synthetic profile. No account credentials are needed for local test profiles. Local D1 persists under `.wrangler/state`. The synthetic sign-in route requires both a local environment setting and a loopback host. Production allows verified Google identities to register. Member discovery is limited to shared groups and explicit sharing relationships. Local Google testing is optional and requires `.dev.vars` configuration and the registered local callback.

The UI supports dated availability, all-day and multi-day entries, weekly rules, dated overrides, explicit DST handling, daily/weekly/monthly/annual views, per-person sharing, and cancellable matching with current-data rechecks. Unknown time is never treated as confirmed availability. External calendars are not connected.

To test sharing: open Alex, sign out, open Jamie once, sign out, and return to Alex. Share with Jamie under People & settings. Jamie can then include Alex in Find a time. Revoke sharing to deny subsequent reads and rechecks.

Plans supports private drafts, invite-only/group-only publication, candidate voting, approval, capacity, waitlists with expiring offers, material-change reconfirmation, and cancellation. Matching suggestions prefill drafts. Confirmed internal plans contribute Busy intervals. Groups have account-bound invitations and immediate read-access revocation. The inbox processes durable local outbox jobs when refreshed; a bounded scheduled handler is also implemented and deployed to production. For multi-person checks use separate browser profiles or private windows.

## Checks

```sh
npm run typecheck
npm run lint
npm run test -- --run
npm run test:integration
node scripts/run.mjs playwright install chromium
npm run test:e2e
npm run build
npm run deploy:dry-run
npm run licenses
```

Unit tests exercise time semantics. Integration tests run the actual Worker and D1 locally with isolated data. Browser tests use a fresh, isolated local database each run, not the development database. Tests never target remote services. The test runtime and logs live under `.runtime`; Windows sandboxes may require permission for the workerd process to access SQLite. This does not require deploying anything.

`npm run types` regenerates Worker binding types. `npm run licenses` generates the dependency license inventory from the pinned lockfile. Compatibility date is `2026-10-06`, matching the installed runtime; using the local calendar date `2026-10-10` caused a runtime rejection because it was ahead of supported compatibility dates.

## Before any deployment

Follow [release.md](docs/release.md). Production migration/deployment requires the explicitly approved preview configuration in ignored `deployment.local.json` and credentials in `.dev.vars`. The deployment script builds a production configuration and never publishes local test identities. A dry-run does not establish free-runtime performance.

Source requirements: [SRS.md](SRS.md), [plan](tasks/plan.md), [checklist](tasks/todo.md), and [ADR-001](docs/decisions/001-free-private-deployment.md). The referenced [RUFree repository](https://github.com/N-Pranav-Subhraveti/RUFree) contained only its license when inspected. No source or remote resources were overwritten.
