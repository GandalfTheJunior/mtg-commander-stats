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

POST and PUT accept the same complete replacement payload. Every write requires
`result: "WIN" | "DRAW"`, boolean `alternateWinCon`, and 2–6 distinct participants
with distinct owned decks. Every participant supplies `userId`, `deckId`, and an
integer `startPosition`: unique contiguous seats 1…N, independent of array order.

| Mode | Required participant result fields | Forbidden fields |
| --- | --- | --- |
| WIN / false | Every player: integer `placement`; exactly one rank 1 | `winner`, `stillInGame` |
| WIN / true | Sole winner: `winner: true`; every opponent: boolean `stillInGame`; eliminated opponents also supply `placement` | Winner: placement/status; opponents: `winner` (even false); surviving opponents: placement |
| DRAW / false | Every player: boolean `stillInGame`; at least one survivor | `winner`, `placement` |

`DRAW/true` is invalid. Alternate victory requires at least one surviving opponent.
The server derives alternate winner rank 1 and surviving-opponent rank 2; these
are never separately stored. Eliminated opponents submit ranks greater than 2.
Normal WIN and alternate effective ranks use standard competition ranking:
`1,2,2,4` is valid; `1,2,2,3` is invalid. The backend checks numeric ranks only;
users assign ties for eliminations during the same turn. No turn/event log,
elimination timestamps or timing verification exists.

Example normal WIN (physical array order does not imply starting order):

```json
{
  "result": "WIN",
  "alternateWinCon": false,
  "participants": [
    {"userId": "<user A UUID>", "deckId": "<A deck UUID>", "startPosition": 2, "placement": 1},
    {"userId": "<user B UUID>", "deckId": "<B deck UUID>", "startPosition": 1, "placement": 2}
  ]
}
```

`winnerUserId` is read-only and always rejected on writes, including null.
Extraneous mode-specific fields, including explicit nulls, are rejected rather
than ignored. Missing/null required fields, unknown fields, fractional seats or
ranks and malformed UUIDs fail. UUIDs require standard hyphenated representation.
There is no partial update or incomplete historical-game edit path.

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
  "alternateWinCon": false,
  "winnerUserId": "<participating user UUID>",
  "participants": [
    {
      "userId": "<user UUID>",
      "username": "Gandalf",
      "startPosition": 2,
      "placement": 1,
      "stillInGame": true,
      "deckId": "<deck UUID>",
      "deck": {
        "id": "<same deck UUID>",
        "name": "Goblins",
        "commanders": [{"name": "Krenko", "position": 1, "oracleId": "<Oracle UUID>", "selectionRef": {"scryfallCardId": "<printing UUID>"}}],
        "colorIdentity": ["R"],
        "archived": false
      }
    },
    {
      "userId": "<other user UUID>",
      "username": "Aragorn",
      "startPosition": 1,
      "placement": 2,
      "stillInGame": false,
      "deckId": "<other deck UUID>",
      "deck": {
        "id": "<same other deck UUID>",
        "name": "Colorless",
        "commanders": [{"name": "Karn", "position": 1, "oracleId": "<Oracle UUID>", "selectionRef": {"scryfallCardId": "<printing UUID>"}}],
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
    "commanders": [{"name": "Atraxa, Praetors' Voice", "position": 1, "oracleId": "<Oracle UUID>", "selectionRef": {"scryfallCardId": "<printing UUID>"}}],
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

Commander arrays in the examples abbreviate the full saved snapshot contract.
Each item contains all fields documented in [Deck API](decks-api.md#saved-snapshots-and-updates),
including choice, base/effective colors and nullable artwork/attribution snapshots.

## Read facts and schema upgrade

GET list/detail always include the same keys: game `result`, boolean
`alternateWinCon`, derived `winnerUserId` (explicit JSON null for DRAW); participant
`startPosition`, effective `placement` (explicit JSON null for DRAW) and boolean
`stillInGame`. Normal WIN survival derives from rank 1. Alternate WIN survival is
true for the winner and active opponents. DRAW reflects stored survivor flags.
Participant UUID ordering is retained and never defines start order. Basic
player/deck games, wins and win-rate semantics remain unchanged; DRAW adds no win.

V8 adds canonical seat, manual-rank and mode-specific winner/survivor facts and
removes the independently stored winner UUID. Deferred database constraints check
complete games after atomic replacement. Applied migrations remain unchanged.
V8 stops before schema changes if **any** legacy game rows exist, with an actionable
error. It never reconstructs facts or deletes records. An owner may separately
reset an explicitly isolated disposable local demo database; shared/production
records require a separately approved retention/migration plan.

## Browser game editor

The editor records the final outcome after a completed match. Player cards are
ordered by saved start seat; dragging the left grip (pointer/touch), its arrow
keys, or the up/down buttons changes only start order. Fully blank placeholders
are omitted and complete assignments receive contiguous seats. Partial cards
block saving.

Result controls remain visible outside the collapsible player/deck selection.
Normal WIN uses manual numeric place buttons with competition ties and exactly
one first place. Alternate WinCon, selected at the upper right, uses an explicit
Winner marker and surviving opponents at derived place 2; only eliminated
opponents select manual later ranks. DRAW records survivor status without ranks.
Alternate victory requires a surviving opponent; DRAW requires a survivor.
New Alternate opponents and DRAW participants default to still in the game.

Each mode retains its own unsaved in-memory results while the editor is open.
Only active-mode fields reach POST/PUT. A player change clears only that card's
results across modes; a deck-only change preserves results. The leave guard
includes seat order, mode and inactive cached results. No cross-session draft
recovery, live match tracking or partial historical-game correction is provided.
