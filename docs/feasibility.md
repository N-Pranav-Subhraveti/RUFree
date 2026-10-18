# Feasibility evidence — updated 15 October 2026

## Current gate result

**Owner-only manual-planning preview deployed; full release feasibility remains open.** The user explicitly deferred Google Calendar sync and Microsoft integration for this preview. No full-SRS, provider-calendar, performance or reliability claim is made.

| Check | Evidence / result |
|---|---|
| RUFree repository | Authenticated repository/contents inspection found `N-Pranav-Subhraveti/RUFree`, public, with only `LICENSE`; no reusable application code. No writes performed. |
| Cloudflare account | Connected API successfully listed an account. This proves account access only. |
| Workers Free status | User confirmed Workers Free in the dashboard on 15 October 2026. Earlier subscription API read failed with error 10000; no upgrade was requested or performed. |
| Stable workers.dev host | Rechecked on 10 October 2026 after the user's correction: GET workers/subdomain succeeded (HTTP 200), returning `sn-pranav18`. Account namespace is `sn-pranav18.workers.dev`. This supersedes the earlier error 10007. Worker-specific staging/production hosts and OAuth callback paths remain to be finalized; no app deployment performed. |
| Google registration | Public client ID supplied, user confirmed exact local/production callbacks, secret saved locally and uploaded securely to Worker secrets. Deployed authorization-start checks pass. The owner confirmed reaching My availability through real Google sign-in on 15 October 2026; Calendar scopes/refresh/round trips are deferred. |
| Microsoft registration | Deferred by the user on 15 October 2026. Not a blocker for the initial Google-only release; no registration or real-provider verification claimed. |
| Local runtime | Actual workerd and D1 execute the integration suite. Windows sandbox denied workerd SQLite startup; approved local execution outside that sandbox succeeded. |
| Build/deployment | Exact production dry-run, fresh remote D1 migrations, Worker/assets/cron deployment and two secret uploads succeeded. Live health/access-control/start-callback checks pass. See release.md. |
| Runtime date | Installed workerd is 2026-10-06. Integration rejected 2026-10-10 as a future compatibility date. Config is pinned to supported 2026-10-06. |
| Real CPU, D1 budget, provider quotas | Not measured. Local test duration is not Cloudflare CPU billing. |
| Restore / soak | Not performed; 48-hour soak and Time Travel recovery remain release gates. |

## Implementation boundary

The user approved Google-authenticated manual planning as v0.1. Production requires verified, allowlisted Google identity; local synthetic identities remain loopback-only. A fresh Cloudflare D1 database and Worker were created without a paid-plan upgrade. No external calendar events were created. Remote scripts require explicit release configuration and credentials. Automated fixture success is not live Google login evidence.

Tasks 04 and 06 must establish real Google and free-runtime evidence before production identity and downstream integration are accepted. Task 05 and Microsoft-specific requirements are deferred by explicit user instruction dated 15 October 2026. Do not mark a mock or a local shell command as real provider evidence. Proposed admission limits and free budgets are still design assumptions.

## Sources consulted

- [Cloudflare Workers practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/), [Vite tutorial](https://developers.cloudflare.com/workers/vite-plugin/tutorial/), [Worker test harness](https://developers.cloudflare.com/workers/testing/vitest-integration/write-your-first-test/).
- [workers.dev setup](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/).
- [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server).
- [Microsoft app registration](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app).

Cloudflare runtime/configuration signatures were additionally checked against installed, pinned package declarations and Wrangler's generated types. The old `@cloudflare/vitest-pool-workers` package is deprecated and incompatible with installed Vitest 5; the maintained `@cloudflare/vitest-plugin` replaces it. The final dependency audit is recorded in acceptance.md.
