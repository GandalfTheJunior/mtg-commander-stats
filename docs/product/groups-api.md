# Play groups API

The backend play-group and membership API is available under `/api/groups`. The
invitation frontend (#200) must ship with this breaking contract; see the
[cutover runbook](../development/invitation-cutover.md). Every group endpoint requires the existing
authenticated session. Only the minimal invitation preview is public. Unsafe requests also require the current CSRF token.
The actor comes from the authenticated principal; current permissions come from
server state. Only the role-change endpoint accepts a requested target role.
Create accepts only `name`, and join accepts only `code`. Unknown payload fields (including `actorId`,
`ownerId`, `userId`, and `role`) are rejected on create/join with `400` before any write.
Invitation creation, leave, and member removal accept no body or an empty JSON object;
a body containing fields is rejected with `400`. In particular, a leave request cannot name another
member: it either leaves for the authenticated actor or fails without changing
either membership. This strict payload handling is scoped to the group API.

## Representations

`GroupSummary` is returned by create, list, and join:

```json
{"id":"<group UUID>","name":"Friday Commander","role":"OWNER"}
```

`role` is the current actor's `OWNER`, `ADMIN`, or `MEMBER` role. Ordinary group
responses never contain the join code.

`GroupDetails` adds the active members:

```json
{
  "id":"<group UUID>",
  "name":"Friday Commander",
  "role":"MEMBER",
  "members":[
    {"userId":"<user UUID>","username":"Gandalf","role":"OWNER","quickProfile":false},
    {"userId":"<user UUID>","username":"Hairy Zombie","role":"MEMBER","quickProfile":true}
  ]
}
```

`quickProfile` marks [quick profiles](#quick-profiles). Members are ordered by
role, display name and user UUID, so an account and a quick profile with the same
display name keep a deterministic order.

Stable user UUIDs identify members; account usernames are case-insensitively
unique (see [registration rules](mvp-scope.md#user-identity-and-registration)).
Email addresses and credentials are never returned.

## Operations

### Create a group

`POST /api/groups` with `{"name":"Friday Commander"}` returns `201` and a
`GroupSummary`. The name follows the [naming conventions](mvp-scope.md#naming-conventions), with a maximum of 30 grapheme clusters. Name validation returns a 400 ProblemDetail with one `errors` entry (`field=name`, stable name error code, and `maxLength=30` for length errors). Creation stores
the group and the actor's active `OWNER` membership in one
transaction.

### List and inspect active groups

`GET /api/groups` returns `200` and `GroupSummary[]` for only the actor's active
memberships. `GET /api/groups/{groupId}` returns `200` and `GroupDetails` for an
active member. Details include only active members.

### Join or rejoin

`POST /api/groups/join` with `{"code":"<join code>"}` returns `200` and a
`GroupSummary`. Only an explicit authenticated join consumes an invitation, in the
same transaction as admission. Already-active members receive `409` without
consumption or role changes. Rejoining reactivates the existing
stable membership as `MEMBER`; it does not create a new membership record.

Codes contain exactly 22 case-sensitive URL-safe Base64 characters
(`A-Z`, `a-z`, `0-9`, `_`, and `-`). They encode 128 random bits and have no
padding. Product boundary whitespace around submitted codes is ignored; internal
characters are unchanged. Blank, malformed, unknown, expired, consumed, and legacy codes all use
the same controlled `400` response and do not disclose group information.

### Create and preview invitations

`POST /api/groups/{groupId}/invitations` accepts no body or `{}` and returns
`201` with `{"code":"<22 characters>","expiresAt":"<UTC instant>"}`. Any active
OWNER, ADMIN or MEMBER can issue independent invitations. The code is returned
once; only its SHA-256 hash is stored. No token listing, rotation, cancellation
or revocation exists. Ordinary group DTOs never expose tokens.

`GET /api/invitations/{code}` is public and returns `200` with only
`{"groupName":"Friday Commander"}` for an unused, unexpired invitation. It never
consumes the token. Unknown, malformed, expired and consumed codes return the
same generic `400` problem, without the secret in its instance URI. Unexpected
preview exceptions are handled at the controller boundary with a generic `500`,
constant instance URI and an ERROR operator signal containing only the exception
class (no exception message, cause, stack trace or request path); they do not
enter the servlet container's default `/error` dispatch. Preview and
creation responses use `Cache-Control: no-store`; referrer policy is `no-referrer`.

Every token expires at exactly creation + 24 hours, using database wall time.
Redemption serializes on the group row, flushes membership writes, then checks
expiry again while atomically marking consumption. Failure rolls back both.
Tokens remain valid even if their issuer leaves or is removed. Removal is not
a ban and does not revoke a leaked unused token: that is an explicit product
trade-off. A former member needs a different valid token to rejoin as MEMBER.

The frontend builds a same-origin share link referencing this exact code.
Opening a link, previewing, registering and logging in never admit a user.
The #200 UI must preserve the token through registration and subsequent login
and require explicit confirmation. Manual code redemption through the API uses
the same validation; there is no separate admission model or manual-entry UI.
Legacy GET/POST `/api/groups/{groupId}/join-code` routes are removed (`404`).

### Leave a group

`DELETE /api/groups/{groupId}/membership` returns `204` and deactivates the
actor's active `MEMBER` or `ADMIN` membership. It retains the membership UUID
and historical record. An `OWNER` cannot leave.

### Manage member roles

`PATCH /api/groups/{groupId}/members/{userId}/role` accepts only
`{"role":"ADMIN"}` or `{"role":"MEMBER"}`. Only the active OWNER can change
an active MEMBER/ADMIN target. OWNER reassignment is forbidden. Success returns
`200` with `{"userId":"<UUID>","username":"<display name>","role":"ADMIN","quickProfile":false}`
(or MEMBER). A quick profile target returns `403`: quick profiles never hold
elevated roles. Requesting the current eligible role returns the same `200`
representation without creating a new membership. Missing/null, unsupported or
non-string roles and unknown fields return `400`.

### Remove an ordinary member

`DELETE /api/groups/{groupId}/members/{userId}` accepts no body or `{}` and
returns `204`. An active OWNER or ADMIN may remove only an active ordinary
MEMBER. Neither can remove OWNER or ADMIN; an OWNER can first demote an ADMIN.
Removal deactivates the stable membership, immediately revokes protected access,
and retains games, statistics, membership UUIDs and permanent deck usage.
Removal is not a ban: rejoining with a valid unused invitation reactivates the same
membership as MEMBER, never restoring ADMIN. Removal does not apply to quick
profiles (`403`); [deleting the profile](#quick-profiles) replaces it.

Both mutations lock the group row before checking current actor and target
membership, sharing the lock with join, leave, invitation creation and game operations.
Unauthorized actors receive `403` before target lookup. Otherwise, a missing or
inactive target returns `404`, including repeated removal. Forbidden active
targets return `403`. Integrity/concurrency conflicts return `409`; reload and
retry. All active roles may create invitations.

V11 extends the role CHECK constraint additively. Existing OWNER/MEMBER rows,
the unique active OWNER index and deferred designated-owner checks are retained.
The Members administration UI is implemented by #198; the invitation UI is implemented by #200.

## Status and error behavior

The API uses RFC 9457 problem responses consistently with the existing backend.

| Condition | Status |
| --- | --- |
| Successful group or invitation create | `201` |
| Successful list, details, join, public preview, or role change | `200` |
| Successful departure or member removal | `204` |
| Malformed/blank name, invalid group UUID syntax, or blank/unknown/expired/consumed code | `400` |
| Unknown payload fields, unsupported role, or actor/owner tampering | `400` |
| Missing or invalid authenticated session | `401` |
| Existing group but inactive/absent membership, owner departure, forbidden member-management actor/target, or invalid CSRF | `403` |
| Missing group, or missing/inactive member-management target after authorization | `404` |
| Already-active join or integrity/concurrency conflict; reload and retry | `409` |

Invitation preview and join share a per-process, per-network-peer limit of 120
attempts per minute (`429` with `Retry-After: 60`), with at most 4096 tracked
peers. IPv6 addresses share a bucket per /64 prefix, including alternate literal
spellings. At capacity, the oldest window is evicted so new peers can still
proceed; this bounded local cache is not a global abuse-prevention guarantee.
Forwarded headers are not trusted. Shared proxies/NAT share a bucket;
production edge limits are needed across replicas. Token-bearing paths and
payloads must be redacted from access logs, analytics and tracing; the application
does not enable request/access logging. See the cutover runbook for edge duties.

For access-controlled endpoints, `403` responses do not expose protected group
details. A missing group is distinguished with `404` as part of this contract.

Group-authorized deck selection and game history/recording are documented in the
[Commander games API](games-api.md). Departure retains those historical games.

## Quick profiles

Quick profiles (#223) are credential-less placeholder members for friends without
an account; see the [product rules](mvp-scope.md#quick-profiles). Every route
requires an authenticated active member of the path group and CSRF for writes.
Mutations lock the group row first, sharing the lock with membership changes and
game writes.

| Route | Who | Result |
| --- | --- | --- |
| `POST /api/groups/{groupId}/quick-profiles` (no body or `{}`) | any active member | `201` and the profile |
| `PATCH /api/groups/{groupId}/quick-profiles/{userId}` with `{"name":"Lena"}` | any active member | `200` and the profile |
| `DELETE /api/groups/{groupId}/quick-profiles/{userId}` (no body or `{}`) | active OWNER/ADMIN | `204` |

The profile representation matches a member entry:

```json
{"userId":"<user UUID>","username":"Hairy Zombie","role":"MEMBER","quickProfile":true}
```

- **Create** accepts no name: the server generates `<adjective> <creature type>`
  from the curated word lists and stores the profile with its active `MEMBER`
  membership in one transaction. Fields in the body return `400`.
- **Rename** applies the username [naming conventions](mvp-scope.md#naming-conventions)
  (maximum 20 graphemes) and returns the shared name `errors` array on invalid
  input. A name already used by another non-deleted quick profile of the group,
  compared case-insensitively in the #214 canonical form, returns `409` with
  `code: "QUICK_PROFILE_NAME_TAKEN"`. Account usernames never conflict with
  quick-profile names.
- **Delete** physically removes a profile without games together with its decks
  (also decks with the permanent usage lock, since no game references them). A
  profile with games is anonymized instead: its stored name becomes the fixed
  placeholder `Deleted profile` (the previous name is not retained), it is marked
  `deleted` with a stable per-group `deletedNumber` (1, 2, …), its membership is
  deactivated and its decks are archived. It disappears from group details and
  deck selection and cannot be selected for new games, while existing games keep
  it as a participant. Decks are locked in ascending UUID order after the group,
  like game writes, so concurrent deletion and game writes serialize.
- MEMBER delete attempts return `403`; outsiders and former members receive `403`
  for every route; an unknown, deleted or other-group profile, or an account
  UUID, returns `404`.

Deck management for a profile uses the [group-scoped deck routes](decks-api.md#quick-profile-decks).

Quick profiles cannot be promoted, receive ownership transfers, leave, be
removed, issue or consume invitations, own groups or create games. The API
rejects such targets with `403`, and database triggers reject any such reference
regardless of the API. Login and `/api/me` never resolve a quick profile.

`V20` stores profiles in `users` with `kind = 'QUICK_PROFILE'`, a non-null
`home_group_id` and null email/password, enforced by `CHECK` constraints. A
deferred trigger requires exactly one membership per profile: `MEMBER` in the
home group, active unless anonymized. The #214 username index now covers accounts
only; the partial index `users_quick_profile_name_key` enforces per-group profile
name uniqueness. Existing rows become accounts unchanged.

### Profile invitations and claiming

An active OWNER or ADMIN can invite an active, non-anonymized quick profile's
future account holder. All management routes are under
`/api/groups/{groupId}/quick-profiles/{profileId}/invitation`:

| Method | Success | Response |
| --- | --- | --- |
| `POST` (empty body or `{}`) | `201` | `{"code":"<22-character code>","expiresAt":"<UTC instant>"}` |
| `GET` | `200` | `{"active":true,"expiresAt":"<UTC instant>"}` or `{"active":false,"expiresAt":null}`; never the code |
| `DELETE` (empty body or `{}`) | `204` | No body |

Creation revokes the prior open invitation, including an expired one. The new
code expires exactly one hour after database creation time. Issuer departure does
not revoke it. `DELETE` revokes the open invitation, if any. Deleting or
anonymizing the profile also revokes its invitation. MEMBERs and outsiders
receive `403`; unknown, anonymized, claimed or other-group profiles receive `404`.
The status `GET` authorizes without taking an exclusive group lock. Every
response uses `Cache-Control: no-store`.

`GET /api/profile-invitations/{code}` is public. An available code returns only
`{"groupName":"<name>","profileName":"<name>"}`. A malformed, unknown,
expired, consumed, revoked, superseded or deleted-profile code returns the same
`400` problem. The frontend constructs the shareable link and QR code; the API
has no token-bearing image endpoint. Preview never consumes the invitation.

`POST /api/profile-invitations/{code}/accept` is the explicit, authenticated,
CSRF-protected confirmation and returns `204`. It merges the profile into the
authenticated account in one transaction. If both already participated in one
game it returns `409` with `code: "PROFILE_CLAIM_SAME_GAME"`, changes nothing,
and leaves the code available until expiry. Otherwise, all decks and game
participations move to the account, which joins the group as MEMBER unless it
already has an active membership. An inactive membership is reactivated as
MEMBER; an active role is preserved. The profile and its membership are removed.
Unavailable codes return the same `400` as preview, including after a lock wait.

Preview and accept share the invitation request limit (120 requests per minute
per peer, IPv6 peers grouped by /64). All profile-invitation responses are
`no-store` with `Referrer-Policy: no-referrer`. Only SHA-256 token hashes are
stored. Consumed and revoked rows remain for audit; a claimed profile's
`profile_id` becomes null when the profile is deleted.

## Ownership transfer

Ownership transfer backs the #198 Members UI. All
routes below are under `/api/groups/{groupId}/ownership-transfer`. Session and
CSRF requirements are unchanged. No frontend, email, push or live notification
infrastructure is included.

| Method / suffix | Strict input | Success |
| --- | --- | --- |
| POST (base) | `{"targetUserId":"<UUID>"}` | 201 transfer status |
| GET (base) | None | 200 pending transfer status |
| POST `/accept` | `{"requestId":"<UUID>"}` | 200 accepted transfer status |
| POST `/decline` | `{"requestId":"<UUID>"}` | 200 declined transfer status |
| DELETE (base) | `{"requestId":"<UUID>"}` | 204 |
| GET `/notices` | None | 200 array of unacknowledged outcomes |
| POST `/notices/{noticeId}/acknowledge` | No body or `{}` | 204 |

Unknown fields, missing/null/non-string/invalid UUIDs and malformed JSON produce
400. Transition IDs are mandatory, including on withdrawal; a stale action must
never apply to a newer request. Authentication failures use 401, invalid CSRF 403,
missing groups/resources 404 and stale/duplicate/conflicting transitions 409.
Only the active current OWNER can initiate, for an existing active ADMIN in the
same group. Other actors receive 403 before target lookup; absent/inactive targets
return 404 and active non-ADMIN targets 403. Only the named target can accept or
decline; only the initiating OWNER can withdraw. An inaccessible request ID returns
404, just like an absent ID. A completed request returns 409 to its designated
actor, including repeated acceptance, decline, withdrawal or acknowledgement.
A demoted/removed/departed target receives 409 on response, without changing roles;
the still-current requesting OWNER can withdraw that stale request.

Transfer status contains `id`, `groupId`, `requesterId`, `requesterUsername`,
`targetUserId`, `targetUsername`, `state`, `createdAt`, and nullable `resolvedAt`.
Names are current public display names; emails and join codes are never included.
GET base returns only the pending request to the active current OWNER or named
active ADMIN; ordinary/inactive members receive 403, unrelated ADMINs and absent
pending requests 404. Pending and notice GET responses use `Cache-Control: no-store`.

V12 adds `ownership_transfers` with stable UUIDs, user/group foreign keys,
timestamps, state checks, a partial unique index allowing at most one PENDING
request per group, and a recipient/outcome index. State transitions are strictly
`PENDING → ACCEPTED | DECLINED | CANCELLED`. Terminal requests are retained;
there is no automatic expiry or cleanup that could discard an unread outcome.
Acceptance atomically demotes the original OWNER to MEMBER, promotes the target
to OWNER, updates `play_groups.owner_id` and resolves the request. The previous
OWNER is explicitly flushed first to release the immediate unique OWNER index;
the existing deferred designated-owner triggers validate the final transaction.
All reads and writes take the group row lock before loading request/membership
state, sharing the same ordering with join/leave, role changes, removal and game
operations. This group lock serializes relevant row access; no additional request
or membership row locks are needed by application operations. Errors roll back
roles, designated owner, request status and outcome together. Membership IDs,
games, participants, decks and statistics stay intact. The former OWNER can leave
as MEMBER. Permissions are rechecked from persisted state on each operation,
including in existing sessions.

### Frontend handoff and durable outcomes

The frontend (#198) renders the pending banner only for the target ADMIN above
the group tabs, using requester display information. Acceptance requires an
explicit confirmation dialog describing both role changes. The OWNER sees pending
status and can withdraw using that request's ID. Decline needs no extra dialog.
Only a confirmed response justifies success feedback; after acceptance refresh
authoritative group details and permissions. Ambiguous writes must be reconciled
by reads rather than blindly repeated or presented as successful.

The transfer itself is the narrow outcome notice: its ID is the notice ID.
GET `/notices` returns only the authenticated original requester's unacknowledged
ACCEPTED/DECLINED outcomes for this group, in creation-time/UUID order, up to 20
per read. Other active members get an empty array; inactive members receive 403.
Notice eligibility depends on the recipient UUID, not OWNER role, session or
browser memory, and therefore survives acceptance and new login/device sessions.
Display each returned accepted/declined outcome once, then explicitly acknowledge
its ID. GET never consumes it; retrying a read can return the same notice until
acknowledged. After acknowledging the batch, read again to drain any remaining
outcomes. Acknowledging another recipient's or non-outcome ID returns 404.
Withdrawal creates no notice. The incoming OWNER's immediate success toast uses
the confirmed acceptance response; the former OWNER's next-open toast uses these
persisted outcomes. Retain the request ID locally during actions and refresh
authoritative state after conflicts. See the
[frontend routing notes](../development/frontend-routing.md#members-directory-and-administration-198).
