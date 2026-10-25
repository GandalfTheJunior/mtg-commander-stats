# Group statistics API

`GET /api/groups/{groupId}/statistics` returns the current player, deck,
starting-seat and Mana-color statistics for exactly that play group. It uses existing session authentication.
Only an active member of the path group may read it, including an active member
who has never played. Actor identity comes exclusively from `UserPrincipal`;
there is no actor, member or owner selector. GET needs no CSRF token. There are
no statistics write routes. The opened group's browser Statistics section consumes
this contract; see the [usage guide](../../README.md#local-development).

## Response

The optional `?playerCount=N` selects games with exactly N participants and applies
to **all four** datasets. Omit it for All table sizes. Exactly one value, `2`, `3`,
`4`, `5` or `6`, is accepted. Empty, repeated (even identical), signed, padded,
non-integer, comma-separated and out-of-range values return `400`.

Success is `200` with four top-level arrays:

| Field | Row contract |
| --- | --- |
| `players` | `{userId, username, games, wins, winRatePercent}` |
| `decks` | `{deckId, ownerUserId, ownerUsername, name, commanders, archived, games, wins, winRatePercent}` |
| `startPositions` | `{playerCount, seats: [{startPosition, games, wins, winRatePercent}]}` |
| `manaColors` | `{color, games, wins, winRatePercent}` |

IDs are UUID strings; usernames and deck names are current saved display data.
`commanders` contains ordered [saved Commander snapshots](decks-api.md#saved-snapshots-and-updates),
including artwork and chosen-color fields which can be null. `archived` is boolean.
Counts are integers. Percentages are JSON numbers for measured rates, including
numeric `0` for observations without wins. **No observations** always means
`games: 0`, `wins: 0`, `winRatePercent: null`.
Emails, credentials and join codes are never exposed. Stable IDs distinguish
duplicate display names.

`startPositions` always has five sections ordered 2,3,4,5,6 for All, or exactly
the selected N section. Each contains every seat 1…N in ascending order, even
without observations. Seats from different table sizes are never pooled.
`manaColors` always contains all six categories W,U,B,R,G,C, ordered by the
rules below. Empty history or an empty filtered subset returns empty player/deck
arrays and the complete zero-observation seat/color categories.

For example, this is the complete response to `?playerCount=4` with no eligible
four-player games, even if the group has games of other sizes:

```json
{
  "players": [],
  "decks": [],
  "startPositions": [
    {
      "playerCount": 4,
      "seats": [
        {
          "startPosition": 1,
          "games": 0,
          "wins": 0,
          "winRatePercent": null
        },
        {
          "startPosition": 2,
          "games": 0,
          "wins": 0,
          "winRatePercent": null
        },
        {
          "startPosition": 3,
          "games": 0,
          "wins": 0,
          "winRatePercent": null
        },
        {
          "startPosition": 4,
          "games": 0,
          "wins": 0,
          "winRatePercent": null
        }
      ]
    }
  ],
  "manaColors": [
    {
      "color": "W",
      "games": 0,
      "wins": 0,
      "winRatePercent": null
    },
    {
      "color": "U",
      "games": 0,
      "wins": 0,
      "winRatePercent": null
    },
    {
      "color": "B",
      "games": 0,
      "wins": 0,
      "winRatePercent": null
    },
    {
      "color": "R",
      "games": 0,
      "wins": 0,
      "winRatePercent": null
    },
    {
      "color": "G",
      "games": 0,
      "wins": 0,
      "winRatePercent": null
    },
    {
      "color": "C",
      "games": 0,
      "wins": 0,
      "winRatePercent": null
    }
  ]
}
```

## Counting and ordering

- A player appears only when they participate in at least one currently persisted
  game in this group and the selected table-size subset. Each such game adds one
  player game.
- A deck appears only when it is the selected assignment in at least one such
  game. Each assignment adds one deck game. Active but unplayed members and
  unplayed decks are omitted.
- Normal WIN and Alternate WinCon each add exactly one win to the winner and
  to the deck that winner used in that game.
  DRAW adds games to participants and selected decks, with no wins.
- `winRatePercent = 100 * wins / games`, calculated with decimal arithmetic and
  rounded to two decimal places using HALF_UP, e.g. `1/12` is `8.33`, `6/12` is
  `50`, and `6/6` is `100`. Trailing decimal zeros are not significant.
- A seat's games count is the number of eligible N-player games containing that
  seat; wins count actual winners starting there. DRAW counts games but no wins.
  Complete unique start seats come from Game Records v2; no historical seats are
  inferred. For eight four-player games with three seat-1 wins, that seat returns
  `games: 8`, `wins: 3`, `winRatePercent: 37.5`, alongside the participating
  player/deck rows and the remaining seat/color rows.
- Mana-color games count **deck/game color appearances**, not distinct games.
  Each deck contributes once in full to every W/U/B/R/G in its saved deck color
  identity, and a win to each only when it wins. A UG deck contributes to U and G;
  a five-color deck contributes to all five. Empty identity contributes only to
  C (colorless). No fractional weighting applies. Categories overlap, so color
  appearances may exceed game participations and percentages need not sum to 100%.
- Colors sort by actual descending `wins/games` ratio, then more games, then
  W,U,B,R,G,C. Compare unrounded ratios. Categories with no observations follow
  every measured rate, including measured 0%; missing-category ties use W,U,B,R,G,C.
- Results derive from current games, without counters or cached totals. Creation,
  full replacement and hard deletion affect the next GET after commit. Last
  appearances disappear. A deck's permanent `everUsed` flag contributes no games.
- Former members and archived decks remain when recorded games reference them.
  User and deck labels are current; Commanders use the saved deck snapshots.
  Former members cannot read after leaving, even when their rows remain.
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
| `400` | Malformed group UUID or invalid/repeated `playerCount` |
| `401` | Missing or invalid authenticated session |
| `403` | Existing group without active actor membership, including a former member |
| `404` | Absent well-formed group UUID |
| `409` | Controlled persistence/concurrency conflict; reload and retry |

Application errors use RFC 9457 ProblemDetail without protected fields; existing
security filters retain status-only responses. Authorization precedes user/deck
lookup, preventing protected existence probing on denial.

Reads retain a bounded number of queries independent of game count: existing
history/participant fetches plus one batched user lookup and one batched deck
lookup for nonempty subsets; empty subsets skip both display lookups. No database
writes, persisted counters, provider calls or statistics write endpoint are added.

See [games](games-api.md) for recording rules. Backend/API tests use dedicated
fixtures without opt-in demo seeding. The optional demo fixture, manifest and
smoke verification adapt to this contract separately in #123; this API change
does not rewrite or reset demo data.
