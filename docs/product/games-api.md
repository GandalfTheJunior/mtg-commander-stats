# Commander games API

The backend records free-for-all Commander games within play groups. This API
uses the existing session authentication and CSRF semantics. The selected group
browser experience consumes this contract; see the [usage guide](../../README.md#local-development).
The backend [group statistics API](statistics-api.md) derives current player/deck
totals from these games. Opened browser groups display those figures and reload
them after acknowledged game creation, replacement or deletion.

## Routes

| Method | Route | Success |
| --- | --- | --- |
| GET | `/api/groups/{groupId}/members/{userId}/decks` | `200 DeckSelectionSummary[]` |
| POST | `/api/groups/{groupId}/games` | `201 GameDetails` |
| GET | `/api/groups/{groupId}/games` | `200 GameDetails[]` |
| GET | `/api/groups/{groupId}/games/{gameId}` | `200 GameDetails` |
| PUT | `/api/groups/{groupId}/games/{gameId}` | `200 GameDetails` |
| DELETE | `/api/groups/{groupId}/games/{gameId}` | `204`, empty body |

An active member may create games and read their group's history. The creator
need not participate. Only the active original creator or an active OWNER may
replace or delete a game. Leaving immediately removes protected access while
preserving historical games and stable participant references.

## Recording and replacing a game

POST and PUT accept the same complete replacement payload:

```json
{
  "participants": [
    {"userId": "<registered user UUID>", "deckId": "<that user's deck UUID>"},
    {"userId": "<another user UUID>", "deckId": "<that user's deck UUID>"}
  ],
  "result": "WIN",
  "winnerUserId": "<one participating user's UUID>"
}
```

There must be 2–6 distinct users, each with exactly one owned deck. `WIN` requires
exactly one participant as winner. `DRAW` requires `winnerUserId: null` (an omitted
winner is also treated as null). Result names are case-sensitive. Unknown fields,
including nested fields and server-owned `id`, `groupId`, `creatorId`, and
`recordedAt`, are rejected. Missing/null required data and malformed UUIDs fail. Body UUID values must use
the standard hyphenated representation; empty/blank strings are invalid,
including a DRAW winner supplied as an empty string.

On creation, every participant must be an active member of this group, and each
selected deck must be theirs and unarchived. On replacement, an unchanged
`(userId, deckId)` pair stays valid even if its member has left or its deck has
been archived. Every new or replaced pair must meet the current membership,
ownership, and unarchived-deck rules. A removed pair added again on a later edit
is new. Result and assignments can change; game UUID, group, original creator,
and server recording timestamp remain fixed.

Game writes and permanent first-use deck flags commit together. Failed requests
and transaction rollbacks leave both unchanged. Hard deletion removes the game
and participant associations, and never resets deck usage. See
[Deck lifecycle API](decks-api.md).

## Game response and history

```json
{
  "id": "<game UUID>",
  "groupId": "<group UUID>",
  "creatorId": "<original creator's user UUID>",
  "recordedAt": "2026-10-16T08:00:00.123456Z",
  "result": "WIN",
  "winnerUserId": "<participating user UUID>",
  "participants": [
    {
      "userId": "<user UUID>",
      "username": "Gandalf",
      "deckId": "<deck UUID>",
      "deck": {
        "id": "<same deck UUID>",
        "name": "Goblins",
        "commander": "Krenko",
        "colorIdentity": ["R"],
        "archived": false
      }
    },
    {
      "userId": "<other user UUID>",
      "username": "Aragorn",
      "deckId": "<other deck UUID>",
      "deck": {
        "id": "<same other deck UUID>",
        "name": "Colorless",
        "commander": "Karn",
        "colorIdentity": [],
        "archived": true
      }
    }
  ]
}
```

Display information reflects current stored public usernames and deck names;
there is no name snapshot or deck version. Stable UUIDs distinguish identical
display names. Former users and archived decks remain identifiable. No email,
credentials, or invitation code is exposed. The list returns all group games,
newest `recordedAt` first, then UUID descending for ties. Participants are ordered
by user UUID using Java UUID ordering. This history route has no pagination;
statistics use the separate [group statistics endpoint](statistics-api.md).

## Read-only member deck selection

The authenticated requester and the target `userId` must both be currently active
members of `groupId`. `userId` selects the target, never the actor. All of that
target's unarchived decks are returned, including both unused and previously
used decks, ordered by name then deck UUID ascending:

```json
[
  {
    "id": "<deck UUID>",
    "name": "Atraxa",
    "commander": "Atraxa, Praetors' Voice",
    "colorIdentity": ["W", "U", "B", "G"]
  }
]
```

No eligible decks returns `200 []`. Archived decks and decks of former members or
users outside the group are excluded. Selection never grants modification,
deletion, or archival rights to another member's decks. There is no opt-in,
private-deck mode, or visibility setting in this milestone.

## Failures

Application errors use RFC 9457 ProblemDetail without protected record details.
Existing authentication and CSRF filters retain their status-only responses.

| Status | Condition |
| --- | --- |
| `400` | Invalid UUID/body, unknown fields, invalid count/duplicates/result/winner, ineligible new participant or deck assignment |
| `401` | Missing or invalid authenticated session |
| `403` | Missing active requesting membership, insufficient modification rights, missing/invalid CSRF |
| `404` | Missing group/game, game not in the supplied group, or inactive/absent target member for selection |
| `409` | Persisted integrity or concurrency conflict; reload and retry |

Group existence and requesting membership are checked before fetching protected
games or the target's decks. For a supplied existing group, unauthorized actors
receive `403` without revealing whether a particular game or target exists.
