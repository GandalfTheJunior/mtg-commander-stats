# Play groups API

The backend play-group and membership API is available under `/api/groups`. A
group browser UI is not implemented yet. Every endpoint requires the existing
authenticated session. Unsafe requests also require the current CSRF token.
Actor, owner, and role always come from the authenticated principal and server
state; request fields cannot select or override them.

## Representations

`GroupSummary` is returned by create, list, and join:

```json
{"id":"<group UUID>","name":"Friday Commander","role":"OWNER"}
```

`role` is the current actor's `OWNER` or `MEMBER` role. Ordinary group responses
never contain the join code.

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
existing role, including `OWNER`. Rejoining reactivates the existing stable
membership as `MEMBER`; it does not create a new membership record.

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
actor's active `MEMBER` membership. It retains the membership UUID and historical
record. An `OWNER` cannot leave.

## Status and error behavior

The API uses RFC 9457 problem responses consistently with the existing backend.

| Condition | Status |
| --- | --- |
| Successful create | `201` |
| Successful list, details, join, or code operation | `200` |
| Successful member departure | `204` |
| Malformed/blank name, invalid group UUID syntax, or blank/unknown/obsolete code | `400` |
| Missing or invalid authenticated session | `401` |
| Existing group but inactive/absent membership, non-owner code access, owner departure, or invalid CSRF | `403` |
| Well-formed group UUID that does not exist | `404` |

For access-controlled endpoints, `403` responses do not expose protected group
details. A missing group is distinguished with `404` as part of this contract.
