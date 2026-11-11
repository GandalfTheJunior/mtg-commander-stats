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
| GET | `/api/groups/{groupId}/games/history?cursor=<opaque-token>` | `200 {games: GameDetails[], nextCursor: string or null}` |
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
| WIN / false | Exactly one player: `placement: 1`; all other placements are either omitted/null or all are known integers | `winner`, `stillInGame` |
| WIN / true | Sole winner: `winner: true`; every opponent has either unknown status and placement, or an explicit boolean status with a complete effective ranking | Winner: placement/status; opponents: `winner` (even false); surviving opponents: placement |
| DRAW / false | Every player: boolean `stillInGame`; at least one survivor | `winner`, `placement` |

`DRAW/true` is invalid. A complete alternate victory requires at least one surviving opponent.
The server derives alternate winner rank 1 and surviving-opponent rank 2; these
are never separately stored. In complete mode, eliminated opponents submit ranks
greater than 2 and at most N, compatible with the number of survivors. In
winner-only mode, every opponent status and placement is unknown. Normal WIN
still requires exactly one submitted rank 1; alternate WIN still requires
exactly one explicit `winner: true` marker.

Every WIN write is either winner-only or a complete standard-competition ranking.
Winner-only normal WIN has no other known rank. Winner-only alternate WIN has no
known opponent status or placement, and needs no identified survivor. Complete
alternate WIN has an explicit boolean status for every opponent and a known rank
for every eliminated opponent. All survivors have derived rank 2. `1,2,2,4`
and `1,2,3,3` are valid; `1,2,2,3` and mixed known/unknown outcomes are invalid.
Two alternate survivors occupy rank 2, so the first eliminated rank is 4.
The backend checks numeric ranks only; users assign ties for eliminations during
the same turn. No turn/event log, elimination timestamps or timing verification
exists.

Example normal WIN with an unknown non-winner placement (array order does not imply starting order):

```json
{
  "result": "WIN",
  "alternateWinCon": false,
  "participants": [
    {"userId": "<user A UUID>", "deckId": "<A deck UUID>", "startPosition": 2, "placement": 1},
    {"userId": "<user B UUID>", "deckId": "<B deck UUID>", "startPosition": 1, "placement": null}
  ]
}
```

`winnerUserId` is read-only and always rejected on writes, including null.
Extraneous mode-specific fields, including explicit nulls, are rejected rather
than ignored. The nullable-placement exception applies only to normal-WIN
non-winners and alternate-WIN opponents with unknown or eliminated status.
Alternate opponents may omit or explicitly null `stillInGame` only in winner-only
mode. DRAW participants, alternate winners and alternate surviving opponents must
omit `placement` entirely.
Missing/null required fields, unknown fields, fractional seats or
ranks and malformed UUIDs fail. UUIDs require standard hyphenated representation.
There is no partial update. Participants and seats remain complete on PUT; switching
to winner-only clears every optional rank and, for alternate WIN, every opponent
status. Editing a historical partial result requires explicitly choosing a complete
ranking or winner-only. The separate omission-preserves-value behavior of
`playedOn` does not apply to ranks.

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
      "quickProfile": false,
      "deleted": false,
      "deletedNumber": null,
      "startPosition": 2,
      "placement": 1,
      "stillInGame": true,
      "deckId": "<deck UUID>",
      "deck": {
        "id": "<same deck UUID>",
        "name": "Goblins",
        "commanders": [{"name": "Krenko", "position": 1, "oracleId": "<Oracle UUID>", "selectionRef": {"scryfallCardId": "<printing UUID>"}}],
        "colorIdentity": ["R"],
        "format": "COMMANDER",
        "archived": false
      }
    },
    {
      "userId": "<other user UUID>",
      "username": "Deleted profile",
      "quickProfile": true,
      "deleted": true,
      "deletedNumber": 1,
      "startPosition": 1,
      "placement": null,
      "stillInGame": false,
      "deckId": "<other deck UUID>",
      "deck": {
        "id": "<same other deck UUID>",
        "name": "Colorless",
        "commanders": [{"name": "Karn", "position": 1, "oracleId": "<Oracle UUID>", "selectionRef": {"scryfallCardId": "<printing UUID>"}}],
        "colorIdentity": [],
        "format": "PAUPER_COMMANDER",
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

`quickProfile` marks [quick profiles](groups-api.md#quick-profiles), which take
part in games like accounts, including as winners. They can never be the game
creator. An anonymized (deleted) profile keeps its participations with
`deleted: true`, the stored placeholder `username` `Deleted profile` and a stable
per-group `deletedNumber`; clients display a localized label such as
"Gelöschtes Profil 1". Account usernames and quick-profile names can be equal;
the user UUID keeps them distinct.

When a [profile invitation](groups-api.md#profile-invitations-and-claiming) is
accepted, the profile's participations reference the claiming account. Game IDs,
creator, recording time, seats, placements, winners and survivor facts are
preserved. A same-game account/profile collision blocks the entire claim with
`409` until an authorized game edit resolves it.

### ManaBox links in authorized reads

`GET /api/groups/{groupId}/games/{gameId}` may add `deck.manaBoxUrl` to a
participant's deck. The requesting user must be an active member of the requested
group, and the deck owner must also be a **currently active member of that same
group**. A stored non-null link is then included, even for an archived deck.
Otherwise the key is omitted. The link reflects the current valid, normalized
saved deck value; there is no per-game link snapshot. See
[link validation and owner updates](decks-api.md#optional-manabox-share-link).

Membership checks and reading the game occur under the existing group lock shared
with join/leave, role changes and member removal. Departure/removal revokes the
former member's own read access and suppresses their links for other readers. Their historical participant/deck
names, assignments and statistics remain visible, and their stored link is not
changed. Rejoining restores eligibility for detail-link visibility.

Although the endpoints share response DTOs, GET list, POST and PUT game responses
deliberately omit this key for everyone. The authorized member-deck GET described
below is the other read that may include a link. Statistics omit links. No
unrelated deck or group becomes accessible. All these reads use saved data
without contacting ManaBox or Scryfall.

The dedicated browser details view renders one safe external ManaBox action for
each participant whose fresh response includes a valid link. Omission is normal:
the frontend neither infers membership permission nor recovers previously seen
links. Historical presentation remains intact. History cards, game editing and
selection, Dashboard and statistics expose no ManaBox actions.

## Paginated history

`GET /api/groups/{groupId}/games/history` returns the newest **at most 20** games
in `playedOn DESC NULLS LAST, recordedAt DESC, id DESC` order. Unknown play dates
remain last, regardless of recording time. UUID ties use PostgreSQL UUID order.
The existing `/games` route remains an unpaginated bare `GameDetails[]`, ordered
by `recordedAt DESC, id DESC`; details by UUID remain unchanged.

Example requests:

```http
GET /api/groups/<group UUID>/games/history
GET /api/groups/<group UUID>/games/history?cursor=<nextCursor from previous response>
```

A response contains actual full `GameDetails` objects under `games`, using the
representation above, including saved Commander/Companion display data, nullable
placements and play dates. Listing does not include optional ManaBox links.
`nextCursor` is an opaque URL-safe string only when more games exist; otherwise
it is explicit JSON null. Empty history returns:

```json
{"games": [], "nextCursor": null}
```

For a nonempty page, the schema is:

```text
{ "games": [ GameDetails, ... ], "nextCursor": string | null }
```

For example, this abbreviated response shows one game on a final page (the
remaining `GameDetails` fields are as defined above):

```json
{
  "games": [{
    "id": "cd57aa28-83d5-4d28-9abd-b514dccdcd70",
    "playedOn": "2026-10-31",
    "recordedAt": "2026-11-01T08:00:00.123456Z",
    "result": "DRAW",
    "winnerUserId": null
  }],
  "nextCursor": null
}
```

Clients pass the returned cursor unchanged. There is no client-controlled page
size, offset, sorting or filtering. Even an exhausted page of exactly 20 games
has null `nextCursor`; no additional empty request is needed.

Cursors encode a version, group UUID and the last selected complete sort tuple,
including the unknown-date branch. Invalid, oversized (over 256 characters),
noncanonical, wrong-group and unsupported-version tokens return `400`
`application/problem+json` with a safe cursor-specific detail. Encoding is not
an authorization control: session and active requesting membership are checked
on every page, including old cursors after leaving/removal (existing `401`, `403`
and `404` conventions apply). Tokens are positions, not signed capabilities.

Paging uses bounded ID/sort-tuple queries (21 candidates), then loads participants and
batched display data for only the selected at-most-20 games. V19 adds a group /
play-date / recording-time / UUID index, retaining the legacy history index.
Known-date continuation bounds both the known and unknown candidate branches
before merging at most 42 IDs; no collection-fetch pagination is used.

This is not a multi-request snapshot. New entries before a cursor appear on a
fresh first page. Date edits or deletions between requests may move/remove rows;
a cursor still works if its original game has changed or disappeared. Continuation
is anchored to the last selected sort tuple, even if rows disappear before
participant hydration. Such a page may be short or empty and still have a
non-null `nextCursor`; clients must use the cursor to determine exhaustion. Consumers
refresh and deduplicate by game ID when needed. Writes, statistics, deck lifecycle
and external-provider access remain unchanged. UI scrolling belongs to #194.

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
    "colorIdentity": ["W", "U", "B", "G"],
    "manaBoxUrl": "https://manabox.app/decks/Synthetic-Mixed_123"
  }
]
```

`manaBoxUrl` is present only when the deck has a currently saved, valid, normalized
ManaBox URL; otherwise the property is omitted, including after the owner clears
the link. The group lock protects the current requester and target membership
checks through the read. The match editor may receive the field but does not
render or persist a ManaBox action; the read-only member-deck view in #199 owns
that presentation.

No eligible decks returns `200 []`. Archived decks and decks of former members or
users outside the group are excluded. Active quick profiles of the group are
selectable members; anonymized profiles are no longer members, so selection
returns `404` and new assignments are rejected with `400`, while unchanged
assignments in existing games are retained on replacement. Selection never grants modification,
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

Commander snapshots additionally include nullable `relatedTokens` under the
[linked token contract](decks-api.md#linked-commander-token-snapshots). These are
current saved printing snapshots, including recovered token enrichment, rather
than frozen match facts. Detail reads and full-card opening/expansion never
resolve provider metadata. Existing group authorization and deck identities
remain unchanged; Companion snapshots do not gain token metadata.

Both Commander and Companion snapshots include nullable `cardFaces`, using the
[full-card display contract](decks-api.md#full-card-display-snapshots): saved
printing faces with `faceIndex`, `name`, `typeLine`, `oracleText` and `imageUrl`.
Game details can display the full card without an additional metadata request.
The shared summaries also include these fields in game list/write responses and
member deck selection; this additive payload does not enable card preloading or
card-view actions in history or record-match rows. Legacy snapshots return null.

## Read facts and schema upgrade

POST, GET list/detail and PUT always include `playedOn` (an ISO date string or
explicit JSON null), alongside unchanged `recordedAt`.
GET list/detail always include the same keys: game `result`, boolean
`alternateWinCon`, derived `winnerUserId` (explicit JSON null for DRAW); participant
`startPosition`, effective `placement` (explicit JSON null for DRAW and unknown
non-winner ranks) and nullable boolean `stillInGame`. Unknown ranks are never inferred
from seats, array order, timestamps or other players. Normal WIN survival is true
only for rank 1; an unknown non-winner rank still has `stillInGame: false`.
Alternate WIN survival is true for the winner and active opponents, false for known
eliminated opponents, and null when an opponent's outcome is unknown. DRAW reflects
stored survivor flags.
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

V17 replaces the existing deferred complete-game validator to permit unknown
non-winner placements and validate partial standard-competition rankings. The
existing nullable column, range/uniqueness/foreign-key constraints and atomic
replacement remain in use. It preserves all existing rows, including complete
rankings, and needs no data reset, reconstruction or backfill. Previously applied
migrations are unchanged. Player/deck wins, seat totals and Mana-color statistics
continue to use the sole actual winner; an unknown placement adds no inferred win
or rank.

V23 replaces the deferred validator to require winner-only or complete WIN writes.
It preserves existing partial rows without backfill or changes to applied migrations.
Historical list/detail reads continue to return their stored known and unknown facts;
any subsequent write must satisfy the new two-state rule. Statistics still count
only the actual winner.

## Browser integration handoff (#196, #195)

The backend two-state ranking contract is required for the complete #172 release.
The existing browser parser in `frontend/src/api.ts` still requires numeric WIN
placements and boolean survivor flags; the current editor also requires complete
ranks. They must be aligned as part of the dependent frontend work before
winner-only recording is released.
No frontend changes are included in backend issue #228.

- #196 must accept/display unknown non-winner and eliminated-opponent placements
  without selecting or submitting inferred ranks, including when editing an
  existing game. Its transport/read parser must allow explicit null WIN ranks.
- #195 must render null as unknown, omit numeric place/indentation claims for that
  participant, and highlight the winner using `winnerUserId`. Details always
  sort by saved start seat without rank indentation.
- #196 must discard all optional ranks and alternate opponent statuses when the
  user confirms saving without placements. #195 must display unknown alternate
  survival without an invented alive/dead status or rank 2.
- #194/#193 history/overview must consume the nullable read contract while deriving
  the displayed winner/draw from `winnerUserId`/`result`, never a reconstructed
  complete ranking. The shared parser must accept these responses.

The following browser sections describe the current UI, pending those changes.

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

The group-scoped Spieldetails view follows the approved #195 wireframes. One
compact card per participant is stacked vertically on mobile and desktop,
strictly ascending by saved `startPosition` for every result. This supersedes
#134's placement-first ordering, rank indentation and artwork-background layout.
Effective GET placements are independent labels, including competition ties;
unknown placements omit the label. DRAW has one subtle note below the play date,
no ranks and no highlighted winner. Only `winnerUserId` identifies the WIN card:
a normal victory has a trophy and secondary accent; an alternate victory has a
distinct sparkle icon and info accent. Activating either icon explains the win
kind without inventing a specific cause.

Player name, equally prominent saved Commander names and the smaller deck name
form the primary hierarchy. Compact saved artworks sit left of text: two
Commanders have equal adjacent foreground images; an actual Companion has a
smaller image offset downward behind them. Its icon beside the first Commander
name reveals the saved Companion name. Artwork opens the shared full-card viewer.
Missing, unsafe and broken sources use fallbacks; no provider lookup is performed.
A fresh details load reflects the associated decks' saved snapshots. Survivor
facts, colors, archived decks and former-member indicators remain secondary.

The top date uses nullable `playedOn` (DD.MM.YYYY), or exactly
`Spieldatum unbekannt`; immutable `recordedAt` appears as `Erfasst am` after the
participants. A permitted valid ManaBox URL from the fresh authorized detail
response has an external-link icon immediately beside the deck name, opening
directly in a safe new tab. Suppressed links are never reconstructed.

Only the active original creator or active group OWNER/ADMIN sees adjacent
bottom `Spiel bearbeiten` and `Spiel löschen` buttons. Deletion requires explicit
confirmation, supports cancellation and returns to freshly loaded group history
only after confirmed success. Server authorization, auth/CSRF checks and retired
request fencing remain authoritative. Informational icons support click, touch,
keyboard activation, dismissal and Escape.

## Persisted deck format in reads

Authorized member deck-selection summaries and all participant deck summaries
(including details and history) include `format`: `COMMANDER` or
`PAUPER_COMMANDER`, read from the saved deck in the existing batched lookups.
Archived decks and former-member historical assignments retain their format.
Existing membership/ownership authorization applies, including the optional
authorized member-deck link. Games may freely mix both formats; writes still
assign stable deck IDs and contain no format field. Game edits/deletes never unlock a used deck's
format. No Scryfall access is required for game assignment or reads.
