# ADR-006: Additional invitations after publication

Date: 18 October 2026. Status: implemented to fix the user's inability to invite additional plan members.

The published plan editor locked invitees, and the update API only changed invitee rows for drafts. Add an explicit organizer-only `POST /api/plans/:id/invitations` action for proposed/confirmed invite-only plans. Input contains `expectedVersion` and exactly one of `recipient` (member ID) or `email` (the Google email of an already registered active account).

The mutation checks the current version, future start/joining deadline, open joining and the existing twenty-invitee cap inside the transaction. It adds one invitee and one idempotent outbox notification. Repeated invitations do not duplicate rows or jobs. Invitation changes do not alter plan terms, reserve places, change the plan version or invalidate prior acceptances. Existing capacity, approval and waitlist rules apply when the recipient joins. Outbox delivery and inbox reads retain the existing current-version/access checks.

Group-only plans retain group-based access. Their UI directs organizers to group membership controls rather than granting outside accounts access to a private group plan. Draft invitees remain managed in the draft editor. The new form supports an exact Google email without introducing a public member directory or sending email.

The UI explains the separate published invitation controls and the twenty-invitee limit. Matching suggestion IDs now retain colons so Google identity IDs survive prefilling the draft.

Validation covers unauthorized and stale requests, email and member-ID invitations, duplicate delivery, preserved held places and accepted versions, closed joining, atomic rollback after an outbox failure, and a browser invitation that persists after reload. No database migration is required.

## Editor follow-up

The user showed the disabled checkboxes inside Edit your plan. Published invite-only editors now enable previously uninvited members. Existing invitations stay checked/read-only. Saving performs an additive invitation merge in the same version-guarded transaction as the plan edit, preserving any invitations added concurrently and enforcing the union's twenty-invitee limit. New invitees receive the same idempotent inbox job. Existing invitations cannot be removed through this editor. The normal plan-edit version and material-change rules still apply; the separate invitation form remains available for invitation-only changes.
