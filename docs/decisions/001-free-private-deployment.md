# ADR-001: Free private-group deployment on Cloudflare

## Status

Proposed; subject to feasibility tasks 01–06 in the implementation checklist.

The dual-provider initial release scope is superseded by [ADR-002](002-google-first-release.md), which defers Microsoft at the user's request.

## Date

10 October 2026

## Context

The user requires free deployment for a small private group and owns no domain. The SRS requires durable group scheduling, external calendar integration, joining workflows, privacy, and asynchronous recovery. There is currently no application code or established architecture.

## Decision

Use a React/TypeScript/Vite frontend, a small TypeScript Cloudflare Worker API, D1 SQL storage, and a database outbox serviced by a minute cron. Serve the private hobby deployment on workers.dev and build/upload locally. Use Google/Microsoft OIDC sign-in with an application allowlist and separate calendar consent. Use in-app notifications initially.

Keep membership and job state transactional. Profile the complete Worker path against the free runtime's CPU budget before building the rest. Run large matching computations in the browser using only authorized data; confirm selected slots on the server. Launch as a private application with explicit admission limits.

See the [plan](../../tasks/plan.md) for source-linked limits, scope changes, provider prerequisites, budget calculations, and verification gates.

## Alternatives considered

- **Supabase-backed application:** Postgres and managed auth are attractive. Free projects can pause after low activity, creating an additional operational dependency for a lightly used group scheduler. Retain as a fallback candidate if D1/runtime feasibility fails; re-evaluate the complete cost and background-job design first. [Supabase pausing](https://supabase.com/docs/guides/platform/free-project-pausing).
- **Conventional Python web server:** Familiar and viable in general, but adds a continuously hosted process to a project with no existing Python implementation. The selected edge/static design has an explicit free hosting path without that process.
- **Static-only website with calendar links/files:** Very inexpensive but cannot meet shared authoritative membership, secure refresh-token storage, automatic updates/cancellations, or background calendar synchronization.
- **Self-hosting on the user's computer:** Avoids a cloud compute bill but requires a continuously available machine, connectivity, security maintenance, and external OAuth callback access; unsuitable as the default shared app deployment.
- **Paid serverless tier:** May simplify CPU constraints, but violates the current zero-cost requirement and is not an automatic fallback.

## Consequences

Hosting can remain $0 within the documented free envelope. This is a private hobby deployment, not an unlimited public service. Provider setup and consent may require user account access and can impose warnings or restrictions. No new domain, paid email, paid queue, or managed paid CI is required by this architecture.

D1 requires careful SQL invariants and adds migration effort if later replaced with Postgres. Free runtime limits demand small operations and measured capacity. Jobs are durable because they live in D1, not because a request is kept alive. Pricing changes, growth, and public launch require a new decision.

The original SRS is preserved. Private-only launch, deferred optional email, and non-guaranteed service targets are explicitly listed in the plan; they must not be misrepresented as complete compliance with every original requirement.
