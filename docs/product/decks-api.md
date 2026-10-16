# Deck API and permanent lifecycle

Deck operations use the authenticated principal's user UUID. Only the owner may
create, change, delete, or archive their decks. Group deck selection is a
separate [read-only game API](games-api.md#read-only-member-deck-selection).

| Method | Route | Success |
| --- | --- | --- |
| GET | `/api/decks` | `200 DeckResponse[]`, all of the actor's decks, including archived |
| POST | `/api/decks` | `201 DeckResponse` |
| PUT | `/api/decks/{deckId}` | `200 DeckResponse` |
| DELETE | `/api/decks/{deckId}` | `204`, only when never used |
| POST | `/api/decks/{deckId}/archive` | `200 DeckResponse` |

POST and PUT accept the existing full deck payload:

```json
{"name":"Goblins","commander":"Krenko","colorIdentity":["R"]}
```

Name and commander use the shared DisplayText rule. Color identity is a distinct
subset of WUBRG and responses always use canonical WUBRG order. Owner and
lifecycle state are server-controlled; the existing create/update parser ignores
unrecognized fields and cannot assign ownership or flags from the payload.

Every deck response now includes two independent boolean flags:

```json
{
  "id":"<deck UUID>",
  "name":"Goblins",
  "commander":"Krenko",
  "colorIdentity":["R"],
  "everUsed":true,
  "archived":false
}
```

Both flags default to false, including for decks existing before this migration.
First successful game use sets `everUsed` in the same transaction as the game,
including newly assigned decks on edits. Usage stays true forever after commit,
even if assignments are removed or the last game is deleted. Failed and rolled
back writes do not mark decks used.

Before first use, commander and color identity remain editable. After first use,
changes to either return `409`; sending their existing canonical values to rename
a deck remains valid. Name changes remain allowed, including on archived decks.
Deleting an unused deck physically removes it. Deleting a used deck returns
`409`, with no implicit archive or deletion. Owners may explicitly archive a used
or unused deck. An archived unused deck still follows the unused delete rule.

Archive accepts no body, `null`, or an empty JSON object `{}`; fields are rejected
with `400`. It is idempotent, sets only `archived = true`, and returns the complete
deck response. It never marks an unused deck used. No unarchive operation exists.
Archived decks stay stored and appear in existing history, but cannot be newly
assigned to games or appear in game deck selection. Unchanged historical game
assignments may still reference them.

Unsafe requests require the current CSRF token. Missing authentication returns
`401`, non-owners and invalid CSRF return `403`, missing deck UUIDs return `404`,
malformed IDs/data return `400`, and permanent lifecycle or persisted-state
conflicts return `409`. Application failures use ProblemDetail; existing security
filters retain their status-only responses.
