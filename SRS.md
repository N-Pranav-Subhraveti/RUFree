# Software Requirements Specification

## Schedule Tracker and Shared Activity Planner

**Version:** 0.1 — Draft for review  
**Date:** 10 October 2026  
**Status:** Proposed product requirements; no implementation or technology selection implied.

## 1. Purpose

Build a website that helps people understand when they are available, find suitable times for activities, publish plans that others can join, and add confirmed activities to Google or Microsoft calendars.

The website should support both near-term coordination, such as dinner next week, and longer-term planning, such as a group holiday several months ahead.

### 1.1 User objectives and traceability

| User objective | Requirement groups | Acceptance scenarios |
|---|---|---|
| Track people's short- and long-term schedules to plan activities | AV, MT | AT-01–AT-04 |
| Push planned activities into Google/Microsoft calendars | CA | AT-07–AT-09 |
| Create and post plans that others can join | PL, JP | AT-05, AT-06, AT-10 |

### 1.2 Language and priorities

“Shall” identifies a required behavior within the stated release scope. All requirements are MVP requirements unless explicitly marked Future. Numeric limits and service targets are proposed defaults, subject to product review.

## 2. Scope

### 2.1 MVP

- User accounts, profiles, time zones, groups, and privacy controls.
- Manual availability, recurring availability rules, exceptions, and calendar-derived busy times.
- Daily, weekly, monthly, and annual summaries of availability.
- Suggestions for mutually suitable activity times.
- Draft and published plans with either a confirmed time or candidate times.
- Public, group-only, and invite-only plans.
- Joining, leaving, approval requests, participant limits, and waitlists.
- Google Calendar and Microsoft calendar connections for availability import and confirmed activity export.
- In-app notifications, optional email notifications, and synchronization status.

### 2.2 Outside MVP

Payments, ticket sales, travel reservations, native mobile apps, live location tracking, chat, AI-generated itineraries, recurring activity series, and editing arbitrary external calendar events are excluded. Full two-way editing of activity details through external calendars is Future scope.

### 2.3 Working assumptions

1. The primary audience is informal groups, families, friends, and small teams; enterprise resource scheduling is not required.
2. Short term means today through the next four weeks. Long term means beyond four weeks through the next twelve months. These are views of the same data, not separate scheduling systems.
3. People maintain their own availability. Organizers cannot inspect another person's private calendar details or write into that person's calendar without authorization.
4. Calendar access is optional. Users can use manual availability and join plans without a calendar connection.
5. The website is authoritative for plan time, location, cancellation, and membership. External calendars supply busy intervals and receive copies of confirmed plans.
6. Public discovery is part of the draft MVP. Exact venues and participant identities remain restricted unless explicitly shared.
7. English is the initial interface language. Time zones and regional date/time formatting are supported from the first release.

## 3. Users and access

| Role | Permissions |
|---|---|
| Visitor | View public plan summaries; register or sign in to join |
| Member | Manage own availability and calendar connections; create and join eligible plans |
| Organizer | Manage their own plans, candidate times, join requests, participant limits, and cancellations |
| Group administrator | Manage group membership and group settings; cannot override members' privacy choices |
| Platform administrator | Moderate reported public content and manage accounts through audited administrative access |

A member may hold multiple roles. Organizer permissions apply only to plans they own. Administrative access shall not grant routine access to private calendar event contents.

## 4. Capability boundaries

This map describes product responsibilities; it is not an approved implementation plan.

| Module ID | Responsibility | Depends on |
|---|---|---|
| identity-access | Accounts, profiles, groups, permissions, blocking | — |
| availability | Manual rules, exceptions, normalized busy intervals, sharing, time suggestions | identity-access |
| plans-participation | Publication, proposals, voting, joining, capacity, lifecycle | identity-access, availability |
| calendar-integration | Provider consent, busy-time import, activity export, recovery | identity-access, availability, plans-participation |
| notifications | User-facing activity and integration notifications | identity-access, plans-participation, calendar-integration |

Suggested delivery order: identity-access → availability → plans-participation → calendar-integration → notifications. Core planning shall work without a provider connection.

## 5. Functional requirements

### 5.1 Accounts, groups, and privacy

| ID | Requirement |
|---|---|
| AC-01 | The system shall support registration, sign-in, sign-out, account recovery where applicable, and account deletion. Account authentication and calendar authorization shall be separate decisions. |
| AC-02 | Members shall maintain a display name, IANA time zone, and notification preferences. Browser-detected time zones shall require confirmation and remain editable. |
| AC-03 | Members shall create groups, invite members, accept or decline invitations, and leave groups. Group administrators shall remove members and revoke outstanding invitations. |
| AC-04 | Availability sharing shall default to private and allow selected groups or selected members. Shared data shall contain only free/busy/unknown state unless the owner deliberately supplies an optional availability label. |
| AC-05 | Permission checks shall apply to pages, APIs, exports, search, and notifications. Revoked access shall cease on subsequent requests, including previously issued sharing links. |
| AC-06 | Members shall be able to block other members and report public plans. Blocked members shall be prevented from newly joining the blocking member's plans or viewing their shared availability. Existing shared-plan membership shall be flagged for organizer action rather than silently removed. |

### 5.2 Short- and long-term availability

| ID | Requirement |
|---|---|
| AV-01 | Members shall create, edit, and delete dated available or unavailable intervals, including multi-day and all-day intervals. |
| AV-02 | Members shall define weekly recurring availability with an effective start date and optional end date, plus dated exceptions such as holidays, travel, or leave. |
| AV-03 | The website shall display day, week, month, and annual summary views within the supported twelve-month horizon, with a drill-down from summary to date-level detail. |
| AV-04 | Availability shall distinguish Available, Busy, and Unknown. Missing data, inaccessible data, and stale calendar data shall not be represented as confirmed availability. |
| AV-05 | Calendar-derived busy intervals shall affect availability only for calendars selected by the member. A member shall choose which connected calendars are included. |
| AV-06 | Members shall see their own detailed manual entries and the shared availability of permitted members, with provider freshness indicators where relevant. Other members shall not see imported event titles, descriptions, attendees, or locations. |
| AV-07 | Recurring rules shall retain the owner's local wall-clock time across daylight-saving transitions. The editor shall reject nonexistent local times or request correction, and request disambiguation for repeated local times. |
| AV-08 | A one-off manual entry shall override the recurring manual rule for its interval. External busy intervals and confirmed website activities shall take precedence over manual availability. Conflicting manual entries at the same precedence shall resolve to Busy. |
| AV-09 | Multi-day events shall retain their start/end dates and source time zone. All-day end dates shall be treated as exclusive, preventing an additional blocked day. |

### 5.3 Finding suitable times

| ID | Requirement |
|---|---|
| MT-01 | An organizer shall specify participants or a group, date range, duration, permitted local-time window, and optional buffer before/after an activity. |
| MT-02 | The system shall identify intervals in which all selected required participants are available, using only availability the organizer is authorized to access. |
| MT-03 | When no complete match exists, the system shall offer clearly labeled partial matches and show available/busy/unknown counts. Individual states shall be shown only where sharing permissions allow. |
| MT-04 | Results shall rank complete matches first, then partial matches by available participant count, then earliest start time. Unknown participants shall never count as available. |
| MT-05 | Members shall see suggested times in their own time zones, with the plan's reference time zone accessible. The organizer shall be able to turn a suggestion into a plan or candidate time. |
| MT-06 | Saving or confirming a time shall recheck current availability. New conflicts shall produce a warning that the organizer must acknowledge; the system shall not claim to reserve external calendar time. |

### 5.4 Plan creation and publication

| ID | Requirement |
|---|---|
| PL-01 | Members shall create and save draft plans with a title, description, category, reference time zone, physical location or online link, visibility, join policy, and optional participant limit and joining deadline. |
| PL-02 | A published plan shall have either one confirmed start/end time or two or more candidate intervals. Intervals shall have positive duration; confirmed start times and joining deadlines shall pass validation. |
| PL-03 | Visibility shall be Public, Group-only, or Invite-only. Public summaries shall be discoverable. Group-only plans shall be accessible only to members of selected groups. Invite-only plans shall require an authorized invitee account; possession of a URL alone shall not grant access. |
| PL-04 | Members shall browse and filter eligible published plans by date range, category, online/in-person format, and remaining capacity. Public summaries shall display only an organizer-approved location summary, not the private venue or meeting link. |
| PL-05 | Eligible members shall vote Available, Unavailable, or Maybe for each candidate time and revise their votes until voting closes. An organizer shall choose the final time; the system shall show who must reconfirm. |
| PL-06 | An organizer shall edit, close joining for, confirm, or cancel their plan. The system shall record material changes and notify affected members. Confirmed start/end, reference time zone, or venue/link changes shall require existing participants to reconfirm. |
| PL-07 | Candidate-time plans shall not generate external calendar events. Once a time is confirmed, only confirmed participants with calendar export enabled shall receive calendar copies. |
| PL-08 | Cancelled plans shall remain visibly cancelled to affected members; cancellation shall initiate removal of website-managed calendar copies and notifications. |

### 5.5 Joining and participation

| ID | Requirement |
|---|---|
| JP-01 | Members shall join an eligible plan through either immediate joining or organizer approval, as configured by the organizer. A member shall have at most one active participation record per plan. |
| JP-02 | Before joining a confirmed plan, members shall see known conflicts and may acknowledge them to proceed. Lack of calendar access shall not prevent joining. |
| JP-03 | Capacity allocation shall be atomic so concurrent joins or approvals cannot exceed the participant limit. Pending approval and waitlisted requests shall not consume confirmed places. |
| JP-04 | When capacity is full, eligible members shall be offered a first-in-first-out waitlist. When a place opens, the first eligible member shall receive a 24-hour offer that reserves the place; an expired or declined offer shall pass to the next member. Offers shall expire earlier at the joining deadline or activity start. |
| JP-05 | Members shall withdraw requests, leave a plan, decline a waitlist offer, or leave the waitlist. Leaving shall release any held place and initiate removal of their website-managed calendar copy. |
| JP-06 | Organizers shall approve or reject requests and remove participants. Actions shall notify the affected member and preserve an audit record. |
| JP-07 | A material plan change shall mark existing confirmed participants as Reconfirmation required, retain their places until a stated deadline, and label their calendar copies as awaiting reconfirmation. Decline or expiry shall release the place and remove the copy. |
| JP-08 | The participant limit shall include the organizer when the organizer attends. The organizer shall explicitly choose whether they occupy a place. Reducing capacity below currently held places shall be rejected. |
| JP-09 | Joining, approving, and accepting waitlist offers shall revalidate plan status, access, deadline, blocking rules, and capacity. Completed or cancelled plans shall not accept new participants. |

### 5.6 Google and Microsoft calendars

| ID | Requirement |
|---|---|
| CA-01 | Members shall connect Google Calendar and/or Microsoft calendars using provider-supported delegated authorization. The website shall never collect provider passwords. |
| CA-02 | Members shall separately understand and authorize availability reading and activity writing, with minimum required permissions. Refused or revoked access shall leave manual planning usable. |
| CA-03 | Members shall select source calendars for busy-time import and one writable destination calendar per plan. Google and Microsoft connections may coexist, but a plan shall not be exported to both unless a future feature explicitly enables it. |
| CA-04 | A member shall enable automatic export for their participation or explicitly add an individual confirmed plan. An organizer's connection shall not authorize writes into other members' calendars. |
| CA-05 | Exported events shall include the plan title, start/end, reference time zone, location or meeting link accessible to that participant, and a link back to the website. Descriptions shall omit private participant data. |
| CA-06 | The system shall persist the relationship between plan, participant, provider, destination calendar, and external event ID. Repeated requests and retries shall update the same copy rather than create duplicates. |
| CA-07 | Confirmed plan edits shall update website-managed copies. Cancellation, leaving, or removal shall remove those copies. Unrelated external events shall never be modified or deleted. |
| CA-08 | Each export shall show Pending, Synced, Failed, or Reauthorization required, plus the latest successful synchronization time and an actionable retry or reconnect option. Partial failure for one participant shall not undo successful exports for others. |
| CA-09 | Provider throttling and temporary errors shall trigger bounded retries with backoff. Exhausted retries shall produce a visible failure and user notification. Unauthorized connections shall stop retrying until reauthorized. |
| CA-10 | Busy-time imports shall refresh periodically and on supported provider change signals. Stale or failed imports shall be visibly marked and treated as Unknown outside known busy intervals. |
| CA-11 | Disconnecting shall stop future access and remove stored authorization tokens. Existing external copies may remain; this consequence shall be displayed before disconnection. Removing website-managed copies first shall be offered while access remains valid. |
| CA-12 | Editing or deleting a calendar copy externally shall not alter the website plan or membership. On detecting a discrepancy, the website shall indicate it and offer explicit resynchronization; it shall not silently recreate a deliberately deleted copy. |
| CA-13 | Imported copies of a member's own website plans shall be deduplicated against internal activity intervals. Availability checks for rescheduling a plan shall exclude that plan's existing interval and its known copies. |

**Integration boundary:** Exact provider APIs, permission scopes, subscription renewal rules, quotas, account restrictions, and supported account types shall be verified against current Google and Microsoft documentation during technical design. They are not asserted by this SRS. Unsupported tenant policies shall produce a clear connection failure with a manual-planning fallback.

### 5.7 Notifications and moderation

| ID | Requirement |
|---|---|
| NT-01 | The system shall create in-app notifications for invitations, join decisions, waitlist offers, time confirmation, material changes, cancellations, reconfirmation requests, and calendar failures. |
| NT-02 | Members shall configure optional email notifications and reminders. Default activity reminders shall be 24 hours and 1 hour before start; elapsed reminder times shall be skipped. |
| NT-03 | Notification processing shall suppress duplicates and obsolete reminders. Cancellation, departure, and time changes shall invalidate or reschedule pending reminders. |
| NT-04 | Notifications shall reveal only content accessible to the recipient, and access shall be rechecked when opening linked content. |
| MD-01 | Members shall report public plans. Administrators shall review reports, hide content, and suspend abusive accounts using logged actions. Hidden plans shall cease public discovery, and affected organizers shall receive notice. |

## 6. Lifecycle and business rules

### 6.1 Plan lifecycle

Draft → Published—Time proposed → Published—Confirmed → Completed.

A draft with a fixed time may publish directly as Confirmed. Drafts may be deleted. Any published plan may be Cancelled before completion. Completion occurs after the confirmed end time. Joining open/closed is a separate attribute. A published proposed plan remains unresolved until confirmed or cancelled and cannot be exported.

### 6.2 Participation lifecycle

Requested → Confirmed, Waitlisted, or Rejected. Waitlisted → Offered → Confirmed, Declined, or Expired. Confirmed → Reconfirmation required → Confirmed, Declined, or Expired. Members may transition to Left, and organizers may transition them to Removed.

For proposed-time plans, approved membership is Interested, rather than Confirmed, and reserves a place. Once a final time is selected, Interested members become Reconfirmation required. Interested, Confirmed, Reconfirmation required, and unexpired Offered records consume capacity. Votes alone do not reserve places.

### 6.3 Additional rules

- Time intervals use inclusive start and exclusive end boundaries. Adjacent activities do not conflict unless a buffer is configured.
- Store absolute event instants and the originating IANA time zone; store recurring availability as local rules plus a time zone.
- A default reconfirmation deadline is 48 hours after the change, capped at activity start. Changes at or after start are disallowed in MVP except cancellation or administrative correction.
- Changing a destination calendar requires confirmation and migration of the website-managed copy. Failure shall expose any remaining old copy and shall not report migration as complete.
- Provider synchronization is asynchronous. A confirmed website membership does not imply a successful external calendar write.
- Public availability browsing is excluded. Public plans do not expose their creator's calendar or free/busy history.

## 7. Data requirements

| Entity | Essential information |
|---|---|
| User | ID, display name, authentication reference, time zone, preferences, account status |
| Group / Membership | Group ID, member ID, role, invitation and membership state |
| Availability rule / Exception | Owner, local interval or date range, recurrence, time zone, availability state, sharing scope |
| Calendar connection | Owner, provider, account reference, encrypted authorization material, selected calendars, connection state |
| Busy interval | Owner, connection/source reference, start/end, freshness, external deduplication reference |
| Plan | Organizer, content, visibility, join policy, location summary/private venue, capacity, lifecycle, version, deadlines |
| Candidate time / Vote | Plan, interval, time zone, voter, response |
| Participation | Plan, user, status, accepted plan version, offer/reconfirmation expiry |
| Calendar export | Plan, participant, provider/calendar/event references, desired version, synced version, state, retry details |
| Notification / Moderation report / Audit event | Actor or recipient, resource reference, event type, timestamp, processing state |

Provider tokens shall be encrypted at rest and excluded from logs. Busy-time import shall retain the minimum metadata needed for availability and deduplication. Proposed retention: busy intervals within the supported planning window, completed plans for twelve months, operational logs for thirty days, and security audit logs for ninety days. Final retention periods require product review.

Account deletion shall revoke sessions and remove tokens promptly, delete or anonymize personal data within thirty days, and expire corresponding backups within ninety days. Before deletion, the user shall resolve owned future plans by transferring ownership to a consenting member or cancelling them. External-copy cleanup shall be attempted before token removal, with unresolved cleanup disclosed.

## 8. External interfaces and screens

### 8.1 Main screens

1. **Dashboard:** upcoming activities, join requests, reconfirmations, and calendar connection health.
2. **My availability:** calendar views, recurring rules, exceptions, and sharing settings.
3. **Find a time:** participant selection, duration/window controls, ranked suggestions, and uncertainty labels.
4. **Explore plans:** eligible plan listings, filters, capacity, and date summaries.
5. **Plan detail:** description, candidate voting or confirmed time, join action, membership state, and calendar export status.
6. **Create/edit plan:** content, visibility, time candidates, venue, capacity, and deadlines.
7. **Groups and settings:** membership, profile, privacy, provider connections, notification preferences, and account deletion.
8. **Moderation:** restricted report review and action history.

### 8.2 System interfaces

The website shall integrate with Google and Microsoft calendar services, an authentication mechanism, and an email delivery service if email notifications are enabled. Provider failures shall be isolated from the core planning flow. Browser-facing operations shall use authenticated authorization checks and validate all submitted data. Any future public API is outside MVP.

## 9. Nonfunctional requirements

These are proposed acceptance targets, to be validated against an agreed deployment size and budget.

| ID | Requirement and measurement |
|---|---|
| NF-01 | Core page data requests shall complete within 2 seconds at the 95th percentile with 100 concurrent active users, excluding external-provider latency. |
| NF-02 | Time matching for 50 participants across 90 days shall complete within 5 seconds at the 95th percentile in the same load environment. The full twelve-month horizon shall remain supported, with progress and cancellation for longer computations. |
| NF-03 | Under healthy provider conditions, 95% of calendar writes shall complete within 60 seconds and busy imports shall be no more than 15 minutes behind provider state. Missed targets shall surface a delayed/stale state. |
| NF-04 | The core website shall target 99.5% monthly availability, measured by authenticated synthetic dashboard and plan-read checks. Provider integration availability shall be reported separately. |
| NF-05 | All network traffic shall use TLS. The system shall protect sessions, enforce object-level authorization, validate inputs, encode output, limit abusive requests, and defend against CSRF where applicable. |
| NF-06 | All core flows shall be keyboard operable, provide meaningful accessible names and visible focus, and communicate availability through text as well as color. WCAG 2.2 AA is the proposed accessibility verification target. |
| NF-07 | Layouts shall support viewport widths from 360 px through desktop and the latest two major releases of Chrome, Edge, Firefox, and Safari at acceptance testing. |
| NF-08 | Background jobs shall tolerate retries, restarts, and duplicate delivery. Calendar writes, joins, and notifications shall have deduplication controls. |
| NF-09 | Monitoring shall cover provider failures, job lag, notification failures, latency, and authorization errors without exposing tokens or private event contents. |
| NF-10 | Backups shall support a proposed recovery point of 24 hours and recovery time of 8 hours, demonstrated by a restore exercise before production release. |
| NF-11 | Calendar adapters shall be independently testable. Provider-specific failures shall not prevent use of the other provider or manual scheduling. |

## 10. Acceptance scenarios

| ID | Scenario and expected result |
|---|---|
| AT-01 | A member adds weekday evening availability and marks a holiday unavailable three months ahead. Weekly and monthly views show the correct intervals, and the annual summary links to the holiday. |
| AT-02 | Three authorized members have a shared 90-minute opening next week. A 90-minute search returns it; adding a 30-minute busy interval removes it from complete matches. |
| AT-03 | A participant has no data or a stale provider connection. Suggestions label that participant Unknown and do not claim everyone is available. |
| AT-04 | Members in Asia/Seoul and America/New_York view the same confirmed activity around a daylight-saving change. Both see the correct local time for one shared instant; recurring local availability retains its intended wall-clock time. |
| AT-05 | An organizer posts an invite-only plan. An unauthorized user with its URL cannot view private details or join; an authorized invitee can. A group member loses access after removal from the group. |
| AT-06 | Two members simultaneously request the last available place in an immediate-join plan. Exactly one becomes Confirmed and the other is offered the waitlist. Leaving triggers a reserved offer for the first eligible waitlisted member. |
| AT-07 | Confirmed participants independently enable Google and Microsoft export. Each receives one correctly timed event in their selected calendar. Retrying export does not create duplicates. Run the flow against both provider test accounts. |
| AT-08 | The organizer changes a confirmed plan's time. Participants receive reconfirmation requests, calendar copies reflect the new time and pending response, and declining removes the appropriate copy. Cancellation removes all reachable managed copies and exposes any failures. |
| AT-09 | A provider returns a temporary error, then succeeds. The export progresses through pending/retry to Synced without duplication. Revoked access instead produces Reauthorization required while manual planning remains usable. |
| AT-10 | An organizer publishes candidate times, members vote, and the organizer confirms one. Voting alone does not allocate seats or export events. Interested members reconfirm before their calendar copies are created. |
| AT-11 | A keyboard-only user completes availability entry, plan creation, joining, and calendar connection setup without inaccessible controls or color-only status indicators. |
| AT-12 | A member externally deletes their calendar copy. Once detected, the website reports the discrepancy and does not recreate it without the member's resynchronization action. |
| AT-13 | A scheduled reminder is pending when a member leaves or the activity is cancelled. The obsolete reminder is suppressed and does not disclose the former participant's private venue. |

## 11. Verification and release criteria

Verification shall include rule-level tests for availability precedence, interval boundaries, recurrence, daylight-saving handling, state transitions, capacity, and deadlines; integration tests for provider failures and duplicate jobs; end-to-end tests for all acceptance scenarios; and load, access-control, accessibility, and restore checks against Section 9.

Provider tests shall cover at least one Google account, one Microsoft personal account, and one Microsoft organizational account where tenant policy permits. Unsupported account classes or tenant restrictions shall be explicitly documented before release. Test data shall be synthetic and isolated from users' real calendars.

MVP acceptance requires all in-scope functional requirements to pass, all acceptance scenarios to pass, and no unresolved defect permitting unauthorized disclosure, incorrect capacity allocation, or modification of unrelated calendar events. Any unmet nonfunctional target shall be recorded as an explicit release exception rather than silently removed.

## 12. Risks and unresolved decisions

| Decision or risk | Draft position / resolution needed |
|---|---|
| Target audience | Friends, families, and small teams assumed; confirm whether business-only scheduling is intended. |
| Public discovery | Included; confirm whether the first release should instead limit plans to groups and invitations. |
| Planning horizon | Twelve months proposed; confirm whether multi-year planning is necessary. |
| Scale and budget | Targets assume small-group use; expected total users, hosting budget, and peak load remain open. |
| Calendar permissions and account restrictions | Validate consent requirements and tenant policies during provider integration design. |
| Long-term availability changes | Label freshness and reconfirm before finalizing plans; predictions are not guarantees. |
| Approval, waitlist, and reconfirmation defaults | Proposed workflows are specified above; confirm whether all are needed at launch. |
| Ownership transfer | Require recipient acceptance; designate no automatic successor. |
| Data residency and retention | Confirm hosting region, intended audience jurisdictions, and final retention periods before production. |
| Email and reminders | In-app required; email optional and subject to delivery-service selection. |

## 13. Implementation handoff

This SRS defines product behavior. Frameworks, database, hosting, authentication provider, provider API scopes, source-tree structure, coding conventions, and executable build/test commands remain intentionally unselected because no implementation has been established.

The technical design shall define those choices and map each requirement ID to implementation and verification work. Development shall preserve the privacy defaults, ownership boundaries, and calendar consent rules specified here. This draft can be reviewed as a complete document before a detailed implementation plan is prepared.
