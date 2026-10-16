# Group statistics API

`GET /api/groups/{groupId}/statistics` returns the current basic player and deck
statistics for exactly that play group. It uses existing session authentication.
Only an active member of the path group may read it, including an active member
who has never played. Actor identity comes exclusively from `UserPrincipal`;
there is no actor, member or owner selector. GET needs no CSRF token. There are
no statistics write routes. The opened group's browser Statistics section consumes
this contract; see the [usage guide](../../README.md#local-development).

## Response

Success is `200` with this shape (UUID placeholders stand for UUID strings):

```json
{
  "players": [
    {"userId":"<UUID>","username":"Ada","games":12,"wins":6,"winRatePercent":50}
  ],
  "decks": [
    {"deckId":"<UUID>","ownerUserId":"<UUID>","ownerUsername":"Ada","name":"Dragon Engine","commander":"The Ur-Dragon","archived":false,"games":6,"wins":6,"winRatePercent":100}
  ]
}
```

The top-level fields are arrays. IDs are UUID strings; usernames, deck names and
commanders are current public display strings; `archived` is boolean; `games`
and `wins` are integer counts; `winRatePercent` is a JSON number in percent units.
All documented fields are present and non-null. Empty history returns exactly
`{"players":[],"decks":[]}`. Emails, credentials and join codes are never exposed.
Stable IDs distinguish duplicate display names.

## Counting and ordering

- A player appears only when they participate in at least one currently persisted
  game in this group. Each such game adds one player game.
- A deck appears only when it is the selected assignment in at least one such
  game. Each assignment adds one deck game. Active but unplayed members and
  unplayed decks are omitted.
- WIN adds one win to the winner and to the deck that winner used in that game.
  DRAW adds games to participants and selected decks, with no wins.
- `winRatePercent = 100 * wins / games`, calculated with decimal arithmetic and
  rounded to two decimal places using HALF_UP, e.g. `1/12` is `8.33`, `6/12` is
  `50`, and `6/6` is `100`. Trailing decimal zeros are not significant.
- Results derive from current games, without counters or cached totals. Creation,
  full replacement and hard deletion affect the next GET after commit. Last
  appearances disappear. A deck's permanent `everUsed` flag contributes no games.
- Former members and archived decks remain when recorded games reference them.
  Display data is current, with no snapshots. Former members cannot read after
  leaving, even when their rows remain.
- Players sort by username then user UUID; decks sort by owner username, deck
  name, then deck UUID, ascending. Strings use Java's case-sensitive natural
  order and UUID ties use Java UUID natural order. Counts do not affect order;
  these lists have no ranking or leaderboard semantics.

## Authorization, consistency and errors

The application acquires the same group row lock as game operations, joins and
leaves, then checks active actor membership before loading any game or display
data. The transaction retains that lock through aggregation. A committed game
change or departure therefore applies to the next read. This is a read-only API;
the transaction permits locking but performs no data mutations.

| Status | Condition |
| --- | --- |
| `400` | Malformed group UUID |
| `401` | Missing or invalid authenticated session |
| `403` | Existing group without active actor membership, including a former member |
| `404` | Absent well-formed group UUID |
| `409` | Controlled persistence/concurrency conflict; reload and retry |

Application errors use RFC 9457 ProblemDetail without protected fields; existing
security filters retain status-only responses. Authorization precedes user/deck
lookup, preventing protected existence probing on denial.

See [games](games-api.md) for recording rules and
[the existing demo](../development/demo.md#read-the-statistics-api-with-existing-demo-data)
for a read-only exercise with known expected figures.
