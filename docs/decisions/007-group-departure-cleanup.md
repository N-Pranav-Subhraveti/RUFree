# ADR-007: Release participation when a member leaves a group

Status: Implemented locally; not deployed by this change.

Date: 18 October 2026

## Decision

Leaving a group or being removed ends active participation in its proposed and confirmed group-only plans. Self-departure records `left`; owner removal records `removed`. Pending requests, waitlist entries, reserved offers, interested membership, confirmed membership, and reconfirmation holds are included. Candidate votes for those plans are removed as well.

The membership transition, vote cleanup, group removal, and pending invitation revocation execute in one D1 batch. Existing participation triggers release held places, invalidate availability, and append audit/outbox records in the same transaction. The existing dispatcher or plan-read expiry path offers the freed place to the next eligible waitlisted member. No new scheduler or migration is required.

Organizers retain access independently of group membership, so their own plans and participation are preserved. Independent invite-only plans and completed/cancelled plan history are preserved. Repeated removal does not create extra participation revisions. Rejoining a group does not silently restore prior participation.

## Privacy and failure handling

Existing access checks prevent removed members from reading group plans and suppress plan notifications once access is revoked. Do not bypass those checks to send a removal message containing private plan details. If a trigger cannot write its durable job, the membership changes and group removal roll back together.

## Verification

Three new integration regressions cover authorization, seat release and waitlist promotion, notification privacy, idempotent repeated removal, self-departure, proposed-plan votes, organizer/independent-plan preservation, and injected outbox failure rollback. All 48 Worker/D1 integration tests pass locally. The sandboxed runtime initially failed to load its test module; the suite passed with the required local runtime permissions. No remote data was used.

TypeScript, lint, and the production build pass. The existing Chromium group-management regression also passes using a separate output directory (`npm run test:e2e -- tests/e2e/groups.spec.ts --output .runtime/group-departure-results`); the default output directory could not be removed due to a local filesystem permission error. The build retains its existing large-client-chunk warning.
