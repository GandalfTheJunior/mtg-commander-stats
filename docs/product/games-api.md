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
need not participate. Only the active original creator or an active OWNER/ADMIN
may replace or delete a game. Leaving immediately removes protected access while
preserving historical games and stable participant references.

## Recording and replacing a game

POST and PUT accept the same gameplay replacement payload, with the optional
`playedOn` field described below. Every write requires
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

## Played-on date and recording timestamp

The two independent facts are:

- `recordedAt`: the existing server-assigned immutable `Instant`, recording when
  the game was saved. Clients cannot supply or change it.
- `playedOn`: nullable `LocalDate`, stored as PostgreSQL `DATE`, recording the
  actual calendar day of play. JSON uses an ISO `YYYY-MM-DD` string (for example
  `"2026-10-31"`) or explicit `null` for unknown. It has no time of day or timezone.

POST with `playedOn` absent or null stores unknown. PUT with the field absent
preserves the stored date so older clients cannot erase it; an explicit date
replaces it and explicit null clears it. All other gameplay fields still require
complete replacement. The same active original creator/OWNER/ADMIN authorization
applies to date corrections; there is no separate date-edit endpoint.

Malformed strings, impossible calendar dates, date-time timestamps, other JSON
types and unknown fields produce the existing `400` response. The backend never
fills a missing date from its clock, the recording timestamp or an inferred user
timezone. Existing saved games remain unknown after migration, without a backfill.

The future client flow in [#172](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/172)
will explicitly submit the user's local current calendar day for ordinary new
entries and support past-date entry. Client display/timezone decisions and UI
changes are separate work. Historical CSV import in
[#170](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/170) may lack a
reliable play date; null represents that uncertainty without inventing a day.
Neither the UI flow nor the importer is implemented by this backend contract.

## Game response and history

```json
{
  "id": "<game UUID>",
  "groupId": "<group UUID>",
  "creatorId": "<original creator's user UUID>",
  "recordedAt": "2026-11-01T08:00:00.123456Z",
  "playedOn": "2026-10-31",
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
newest `recordedAt` first, then UUID descending for ties. This API ordering is
retained regardless of `playedOn`, including unknown dates. Participants are ordered
by user UUID using Java UUID ordering. This history route has no pagination;
statistics use the separate [group statistics endpoint](statistics-api.md).

### ManaBox links in game details

Only `GET /api/groups/{groupId}/games/{gameId}` may add `deck.manaBoxUrl` to a
participant's deck. The requesting user must be an active member of the requested
group, and the deck owner must also be a **currently active member of that same
group**. A stored non-null link is then included, even for an archived deck.
Otherwise the key is omitted. The link reflects the current saved deck value;
there is no per-game link snapshot. See [link validation and owner updates](decks-api.md#optional-manabox-share-link).

Membership checks and reading the game occur under the existing group lock shared
with join/leave, role changes and member removal. Departure/removal revokes the
former member's own read access and suppresses their links for other readers. Their historical participant/deck
names, assignments and statistics remain visible, and their stored link is not
changed. Rejoining restores eligibility for detail-link visibility.

Although the endpoints share response DTOs, GET list, POST and PUT game responses
deliberately omit this key for everyone. Member deck selection and statistics
also omit links. No unrelated deck or group becomes accessible. All these reads
use saved data without contacting ManaBox or Scryfall.

The dedicated browser details view renders one safe external ManaBox action for
each participant whose fresh response includes a valid link. Omission is normal:
the frontend neither infers membership permission nor recovers previously seen
links. Historical presentation remains intact. History cards, game editing and
selection, Dashboard and statistics expose no ManaBox actions.

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
| `400` | Invalid UUID/body/date, unknown fields, invalid count/duplicates/result/winner, ineligible new participant or deck assignment |
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
Owner-authorized decks, game list/detail/write deck displays and member deck
selection additionally include nullable `companion`, using the full
[Companion snapshot](decks-api.md#optional-mtg-companion). It is independent of
Commander count/colors and is read from the referenced deck without provider
requests. Game write bodies gain no Companion input or match-level snapshot;
first committed deck use permanently locks Companion identity.

## Read facts and schema upgrade

POST, GET list/detail and PUT always include `playedOn` (an ISO date string or
explicit JSON null), alongside unchanged `recordedAt`.
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

V9 adds only nullable `games.played_on DATE`, without a default or backfill.
V8 games, recording timestamps, results, participants and permanent deck-use
flags are preserved.

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

## Read-only game details presentation

Game details show one artwork card per participant in a vertical stack on mobile
and desktop. WIN uses effective GET placement, then saved start seat for ties;
equal ranks have equal indentation. DRAW uses only saved start seats, without
finish ranks or a winner. Cards label seats, placements, survival and the sole WIN
winner explicitly, retaining archived-deck and former-member information.

Each card uses the currently associated deck's saved Commander artwork from the
GET response, with equal adjacent panels for two Commanders. Images use a cover
crop and names over a dark gradient. Missing, unsafe or failed sources fall back;
changing the Commander/source resets image failure state. A fresh details load
reflects current deck assignment and saved artwork, without provider lookups or
separate game-level artwork storage. Artwork selection remains in deck editing.
