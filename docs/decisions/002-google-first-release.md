# ADR-002: Google-only initial release

## Status

Accepted scope decision. Supersedes the initial dual-provider release scope in [ADR-001](001-free-private-deployment.md); other architecture decisions and feasibility checks remain unchanged.

For v0.1, [ADR-003](003-manual-planning-preview.md) additionally defers Google Calendar sync at the user's request and authorizes an owner-only manual-planning preview.

## Date

15 October 2026

## Context

The user supplied a Google development client ID and explicitly requested that Microsoft integration be postponed.

## Decision

Implement Google sign-in and Google Calendar for the initial private release. Defer Microsoft sign-in, registration, calendar import/export and provider verification. Preserve Microsoft requirements as later work without requiring its setup for Google development or release.

## Consequences

- Tasks 05 and 27 are deferred, not complete. Task 06 follows 04; Task 28 follows 26 for this release.
- Shared provider acceptance and soak checks apply to Google initially. Google consent, security, calendar round trips, free-runtime feasibility and operational gates remain required.
- Initial members need a supported Google identity. Do not advertise Microsoft support until it is implemented and verified.
- No code or production configuration changes are implied by this scope decision.
