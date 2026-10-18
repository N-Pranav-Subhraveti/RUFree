# ADR-003: Release an owner-only manual-planning preview

## Status

Accepted by explicit user instruction. Owner-only access is superseded by ADR-004 on 18 October 2026; the manual-planning feature scope remains. Supersedes the initial Google Calendar release gate in ADR-002 for v0.1 only.

## Date

15 October 2026

## Context

The user requested a first release, confirmed Workers Free, supplied the Google client configuration, and selected “Release manual planning first; add calendar sync later.” The complete SRS and operational acceptance remain unfinished.

## Decision

Deploy existing manual availability and planning with verified Google identity, restricted to the owner's allowlisted email. Use a fresh production D1 database and disable synthetic profiles outside local loopback. Request identity scopes only, keep Google secrets server-side, and defer Google Calendar sync and Microsoft integration.

## Consequences

The URL is accessible publicly, but application data requires an invited Google identity. Calendar sync, reminders, moderation, automated deletion, operational dashboards and full soak/recovery checks remain future work. The UI and release notes identify these preview limits. Broader member admission requires additional review; this preview is not full SRS completion. Live owner sign-in must be confirmed separately from signed fixture tests.
