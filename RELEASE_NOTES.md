# RUFree v0.1 — Public beta

18 October 2026

RUFree is open for beta testing. Sign in with a verified Google account, add your availability, and find a time to meet with your group.

[Try RUFree](https://rufree.sn-pranav18.workers.dev/)

## Additional plan invitations

Organizers can now use **Invite more people** on published invite-only plans. Choose a connected member or enter the Google email of someone who has already signed in to RUFree. Invitations appear in the app; no email is sent. Adding an invitation preserves existing places and acceptances. The existing twenty-invitee limit applies, and joining must be open. Group-only plans continue to use group membership.

## Group management update

Group owners can now rename a group or delete it from **People & settings**. Deletion requires confirmation, removes memberships and invitations, cancels unfinished group plans and releases their held places. Organizers retain their plan records. Personal availability and direct sharing are unchanged.

## New in this release

- **Open Google registration.** Join without being added to an invitation list. The previous twenty-account registration cap has been removed.
- **Worldwide time zones.** Search time-zone suggestions by city or region in your profile and when creating a plan. Location-based zones account for daylight saving time. Changing your profile zone preserves existing availability entries.
- **Group invitations by Google email.** Once a friend has signed in, invite them using their Google email address. They can accept the invitation inside RUFree; no invitation email is sent.
- **Private member discovery.** Find people through shared groups and explicit availability-sharing connections. Unrelated registered accounts do not appear in a public directory.

## Available in the beta

- Set available or busy times, all-day and multi-day entries, weekly recurring availability, and dated exceptions.
- Browse daily, weekly, monthly and twelve-month availability views.
- Compare shared availability, find overlapping times and turn a suggestion into a plan.
- Create private plans with fixed times or candidate voting, participant approval, capacity limits and waitlists.
- Manage plan changes, reconfirmation and cancellation, with updates in the in-app inbox.

Availability stays private until you choose to share it. Joining a group does not automatically share your availability, and opening registration does not make plans public.

## Fixed

- Google account members can now leave groups or be removed by the group owner correctly.

## Get started with friends

1. Open RUFree and choose **Continue with Google**.
2. Set your time zone and add your availability.
3. Ask your friends to sign in, then create a group under **People & settings** and invite them by Google email.
4. Have them accept their in-app invitations. Choose who can see your availability, then use **Find a time** to plan together.

## Beta limitations

Google Calendar sync and Microsoft integration are not available yet; scheduling currently uses manually entered availability. Email delivery, automatic reminders and notifications while the browser is closed are also unavailable.

Group removal revokes access to group plans, but automatic cleanup of existing held places in those plans remains unfinished. Organizers may need to remove affected participants separately.

Moderation tools, automatic account deletion, broader browser testing and full load/recovery validation are still in progress. This beta does not promise unlimited capacity.

## Validation

This release passed 65 automated tests: 15 domain tests, 41 Worker integration tests and nine Chromium browser tests. TypeScript, lint, production deployment and live health/security checks also passed. The owner previously confirmed real Google sign-in; sign-in by a second person after opening registration remains a live beta check.

When reporting a problem, include the steps to reproduce it, what you expected, what happened, and your browser and time zone. Keep passwords, verification codes and private scheduling details out of reports.

For deployment details and remaining work, see [the deployment record](docs/release.md) and [the project handoff](HANDOFF.md).
