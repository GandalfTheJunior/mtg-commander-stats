# Play groups API

The backend play-group and membership API is available under `/api/groups`. The
browser My groups feature consumes this contract. Every endpoint requires the existing
authenticated session. Unsafe requests also require the current CSRF token.
The actor comes from the authenticated principal; current permissions come from
server state. Only the role-change endpoint accepts a requested target role.
Create accepts only `name`, and join accepts only `code`. Unknown payload fields (including `actorId`,
`ownerId`, `userId`, and `role`) are rejected on create/join with `400` before any write.
Regeneration, leave, and member removal accept no body or an empty JSON object;
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
    {"userId":"<user UUID>","username":"Gandalf","role":"OWNER"},
    {"userId":"<user UUID>","username":"Aragorn","role":"MEMBER"}
  ]
}
```

Stable user UUIDs distinguish members when display usernames are identical.
Email addresses and credentials are never returned.

## Operations

### Create a group

`POST /api/groups` with `{"name":"Friday Commander"}` returns `201` and a
`GroupSummary`. The name follows the shared `DisplayText` rule. Creation stores
the group, a unique join code, and the actor's active `OWNER` membership in one
transaction.

### List and inspect active groups

`GET /api/groups` returns `200` and `GroupSummary[]` for only the actor's active
memberships. `GET /api/groups/{groupId}` returns `200` and `GroupDetails` for an
active member. Details include only active members.

### Join or rejoin

`POST /api/groups/join` with `{"code":"<join code>"}` returns `200` and a
`GroupSummary`. Joining while already active is idempotent and preserves the
existing role, including `OWNER` and `ADMIN`. Rejoining reactivates the existing
stable membership as `MEMBER`; it does not create a new membership record.

Codes contain exactly 22 case-sensitive URL-safe Base64 characters
(`A-Z`, `a-z`, `0-9`, `_`, and `-`). They encode 128 random bits and have no
padding. Product boundary whitespace around submitted codes is ignored; internal
characters are unchanged. Blank, malformed, unknown, and obsolete codes all use
the same controlled `400` response and do not disclose group information.

### Owner join-code operations

`GET /api/groups/{groupId}/join-code` returns `200` and `{"code":"..."}` to
the active `OWNER` only. `POST /api/groups/{groupId}/join-code` atomically
regenerates the code and returns the same representation with the new value.
Both responses carry `Cache-Control: no-store`. A code remains valid until a
regeneration commits; after that commit the previous code cannot create or
reactivate a membership.

### Leave a group

`DELETE /api/groups/{groupId}/membership` returns `204` and deactivates the
actor's active `MEMBER` or `ADMIN` membership. It retains the membership UUID
and historical record. An `OWNER` cannot leave.

### Manage member roles

`PATCH /api/groups/{groupId}/members/{userId}/role` accepts only
`{"role":"ADMIN"}` or `{"role":"MEMBER"}`. Only the active OWNER can change
an active MEMBER/ADMIN target. OWNER reassignment is forbidden. Success returns
`200` with `{"userId":"<UUID>","username":"<display name>","role":"ADMIN"}`
(or MEMBER). Requesting the current eligible role returns the same `200`
representation without creating a new membership. Missing/null, unsupported or
non-string roles and unknown fields return `400`.

### Remove an ordinary member

`DELETE /api/groups/{groupId}/members/{userId}` accepts no body or `{}` and
returns `204`. An active OWNER or ADMIN may remove only an active ordinary
MEMBER. Neither can remove OWNER or ADMIN; an OWNER can first demote an ADMIN.
Removal deactivates the stable membership, immediately revokes protected access,
and retains games, statistics, membership UUIDs and permanent deck usage.
Removal is not a ban: rejoining with a valid current code reactivates the same
membership as MEMBER, never restoring ADMIN.

Both mutations lock the group row before checking current actor and target
membership, sharing the lock with join, leave, rotation and game operations.
Unauthorized actors receive `403` before target lookup. Otherwise, a missing or
inactive target returns `404`, including repeated removal. Forbidden active
targets return `403`. Integrity/concurrency conflicts return `409`; reload and
retry. ADMIN has no additional join-code permissions.

V11 extends the role CHECK constraint additively. Existing OWNER/MEMBER rows,
the unique active OWNER index and deferred designated-owner checks are retained.
The Members administration UI and single-use invitations are separate follow-on work.

## Status and error behavior

The API uses RFC 9457 problem responses consistently with the existing backend.

| Condition | Status |
| --- | --- |
| Successful create | `201` |
| Successful list, details, join, code operation, or role change | `200` |
| Successful departure or member removal | `204` |
| Malformed/blank name, invalid group UUID syntax, or blank/unknown/obsolete code | `400` |
| Unknown payload fields, unsupported role, or actor/owner tampering | `400` |
| Missing or invalid authenticated session | `401` |
| Existing group but inactive/absent membership, non-owner code access, owner departure, forbidden member-management actor/target, or invalid CSRF | `403` |
| Missing group, or missing/inactive member-management target after authorization | `404` |
| Integrity/concurrency conflict; reload and retry | `409` |

For access-controlled endpoints, `403` responses do not expose protected group
details. A missing group is distinguished with `404` as part of this contract.

Group-authorized deck selection and game history/recording are documented in the
[Commander games API](games-api.md). Departure retains those historical games.

## Ownership transfer

Ownership transfer is a backend prerequisite for the future Members UI. All
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

The future frontend renders the pending banner only for the target ADMIN above
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
authoritative state after conflicts. UI implementation remains separate.
