# Single-use invitation cutover (#187 / #200)

This backend PR is reviewable independently but **must not merge or deploy alone**.
There is no feature flag or dual acceptance period. The current frontend still
calls removed reusable-code endpoints; #200 is a hard release dependency.

## Required deployment sequence

1. Complete and independently review #200 against the invitation contract in
   [groups API](../product/groups-api.md). Verify native share/Copy link, public
   name-only preview, explicit join, already-member/expired/consumed feedback,
   and registration followed by required login returning to the same invitation.
2. Build the coordinated backend/frontend release. Verify it on a PostgreSQL 18
   copy with existing groups, legacy codes, memberships and historical games.
   Run `cd backend && ./mvnw verify` and the frontend verification sequence.
3. Before accepting traffic, stop old backend instances and block application/API
   ingress. Back up the database; prevent old browser bundles/service workers
   from using stale routes. Apply V13 with the new backend. It drops every legacy
   verifier and creates an empty invitation table; no legacy code is converted.
4. Deploy #200 assets and the new backend together. Configure the frontend public
   base URL for same-origin share links. Send `Cache-Control: no-store` and
   `Referrer-Policy: no-referrer` on invitation pages as well as API responses.
   Exclude token-bearing routes and bodies from proxy/access logs, analytics and
   tracing. Keep request logging disabled. Configure aggregate edge rate limits
   for preview/join across replicas; the local bounded peer limit is supplemental
   and shared NAT/proxy peers share its quota. Do not trust arbitrary forwarded IPs.
5. While ingress remains blocked, smoke-test using non-sensitive accounts:
   legacy codes fail, old GET/POST join-code routes return 404, all active roles
   create invitations, preview contains exactly `groupName`, preview/auth do not
   consume, explicit join consumes once, duplicate/parallel redemption cannot
   admit another person, and a former member rejoins as MEMBER with the same ID.
   Check exact 24-hour expiry, history/statistics preservation and no secret logs.
6. Reopen traffic only after these checks. Old links intentionally become
   unavailable; members create fresh invitations. No revocation or grace path
   exists. Do not roll an old binary against the migrated database. Recovery
   requires stopping traffic and restoring the coordinated database/assets/binary
   backup, accounting for writes since the backup before any restoration.

## Automated evidence and remaining release gate

`GameRecordsMigrationTest.invitationCutoverInvalidatesLegacyCodesWithoutChangingMemberships`
upgrades a populated V12 schema to V13, checks stable memberships, absence of the
legacy column and an empty invitation table. `InvitationTest` checks removed
routes, one-time redemption, preview privacy, expiry, rollback and concurrent
admission on PostgreSQL. `GroupManagementTest` checks late expiry after initial
validation, membership integrity, collision retries and actual group-lock waits.
These backend tests do not establish that #200 is ready: execute the coordinated
browser and operational checks above on the final combined release before merge
or deployment. There is no background cleanup; expired/consumed verifier records
remain inert, and cleanup must never restore their validity.
