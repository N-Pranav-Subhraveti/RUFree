# ADR-005: Owner-controlled group renaming and deletion

Date: 18 October 2026. Status: accepted implementation of the user's group rename/delete request.

Only the owner can rename or delete a group. Names are trimmed and must contain 1–80 characters. Renaming preserves membership, invitations and plan references.

Deletion requires explicit confirmation in the UI and `confirm: true` at the API. In one D1 transaction it cancels unfinished group plans (including drafts), releases participation places through existing cancellation triggers, removes invitations and memberships, and marks the group deleted. Existing personal availability, direct sharing and unrelated plans remain unchanged. Cancelled/completed plan records remain available to their organizers; former members lose group-based access. Do not promise delivery of cancellation inbox messages to removed members, because inbox reads recheck current plan access.

The database retains a deleted group record to preserve plan foreign keys and history. Deleted groups do not appear in active listings or count toward the ten-owned-group limit. Database triggers prevent stale invitation, membership and active-plan writes after deletion. This is a product deletion, not physical erasure of historical records.

API: `PATCH /api/groups/:id` accepts `{ "name": "New name" }`; `DELETE /api/groups/:id` accepts `{ "confirm": true }`. Both require an authenticated owner and the existing Origin check. Missing, deleted or non-owned targets return 404; invalid input returns 400. A stale write against a deleted group returns 409.

Migration 0005 adds `groups.deleted_at`, a plan-group index and stale-write guards. Earlier Worker builds used positional group inserts, so rolling back to those builds after this migration is not compatible without a forward fix. Do not delete production data as a rollback.

Verification covers ownership denial, invalid names, trimmed rename, confirmation requirement, cancellation of another member's group plan, held-seat release, preserved unrelated plans, inaccessible saved links, removed invitations/memberships, stale-write rejection and rollback after an injected transaction failure. Browser coverage checks persisted rename, cancelled deletion and confirmed deletion.
