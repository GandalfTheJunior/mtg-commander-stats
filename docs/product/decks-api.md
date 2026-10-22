# Deck API and permanent lifecycle

Deck operations use the authenticated principal's user UUID. Only the owner may
create, change, delete, or archive their decks. Group deck selection is a
separate [read-only game API](games-api.md#read-only-member-deck-selection).

| Method | Route | Success |
| --- | --- | --- |
| GET | `/api/decks` | `200 DeckResponse[]`, including archived decks |
| POST | `/api/decks` | `201 DeckResponse` |
| PUT | `/api/decks/{deckId}` | `200 DeckResponse` |
| PUT | `/api/decks/{deckId}/commanders/{position}/artwork` | `200 DeckResponse` |
| DELETE | `/api/decks/{deckId}` | `204`, only when never used |
| POST | `/api/decks/{deckId}/archive` | `200 DeckResponse` |

## Authoritative Commander selection

POST requires one standalone-eligible Commander or two distinct compatible
Commanders in ordered slots. PUT requires a name and optionally replaces that
configuration before first use. The backend validates both identities and
pairing roles from fresh authoritative Scryfall metadata. Zero, more than two,
duplicate identities and incompatible pairs return `400`. No free-text/manual or offline creation
is supported. Names use DisplayText; Commander names come from Scryfall.

```json
{
  "name": "Goblins",
  "commanders": [{"selectionRef": {"scryfallCardId": "<printing UUID>"}}]
}
```

Use the complete selection reference supplied by [Commander search](scryfall-api.md),
including `gameplayFaceIndex` only for exceptional reversible gameplay identities.
Missing-required, inapplicable and invalid face selectors fail with `400`.
Ordinary transform/modal cards have one gameplay identity; artwork sides do not
select another Commander. Partner-required candidates such as ordinary Backgrounds cannot be saved alone.
Standalone eligibility is independent of pairing roles: Faceless One can remain
alone with its required chosen color. Supported pairs are ordinary Partner,
reciprocal Partner with, Choose a Background + legendary Background, qualified
legendary Time Lord Doctor + Doctor's companion, and matching named Partner
variants (including Friends forever). A card can have several roles; any one
valid pairing rule suffices. Different named variants, ordinary Partner and
Partner with are not interchangeable. See [partner lookup](scryfall-api.md#partner-filtered-search).

For a Commander with `requiresChosenColor=true`, supply exactly one W/U/B/R/G:

```json
{"name":"Piper","commanders":[{"selectionRef":{"scryfallCardId":"<printing UUID>"},"chosenColor":"R"}]}
```

Missing, colorless, multiple, lowercase or unexpected choices return `400`.
The backend resolves every new/changed selection online and derives effective
Commander colors from base Scryfall colors plus the choice. The deck identity is
the canonical WUBRG union; empty means colorless. The old `commander` and
client-supplied `colorIdentity` write contract is deliberately removed. Unknown
write fields, including ownership, lifecycle flags, identities and raw artwork
URLs, are rejected; clients cannot assign authoritative card metadata.

## Saved snapshots and updates

Every deck response contains `id`, `name`, `commanders`, `colorIdentity`,
`everUsed` and `archived`. Each ordered `commanders` item contains:

| Fields | Meaning |
| --- | --- |
| `position` | 1 or 2; list ordered by slot |
| `oracleId`, `name` | Stable printing-independent gameplay identity and snapshotted English name |
| `selectionRef`, `scryfallCardId` | Current printing and its gameplay-face selector when applicable |
| `pairing` | Snapshotted sets of pairing roles, reciprocal counterpart names and normalized variant labels |
| `canBeSoleCommander`, `requiresChosenColor` | Saved normalized selection capabilities |
| `colorIdentity`, `chosenColor`, `effectiveColorIdentity` | Base WUBRG, nullable per-card choice, derived effective WUBRG |
| `artworkFaceIndex`, `artCropUrl`, `illustrationId`, `artist`, `scryfallUri` | Nullable displayed-illustration/printing snapshots |

`artworkFaceIndex` retains the original printing-local face index, including 1
when only a back image exists; it is independent of the gameplay-face selector.
Attribution belongs to the displayed illustration; source belongs to its printing.
Initial artwork is automatically selected, preferring the gameplay face when
available. Missing art/attribution does not invalidate an otherwise legal card.
Reads of decks, game selection/history/details and statistics use these snapshots
without calling Scryfall. Those display APIs also return `commanders` arrays,
in place of their former `commander` strings; game references and calculations
remain based on deck IDs.

Rename with `{"name":"New name"}` and omit `commanders`. This preserves every
Commander, color and presentation field without online resolution, for unused,
used and archived decks. Unchanged full references/choices are also idempotent
and preserves existing snapshots. Any PUT attempting only to change a printing
of the same gameplay identity returns `400` directing clients to the artwork
operation; stale full updates cannot overwrite newer presentation snapshots. This applies
to both slots even when the other Commander is being replaced or a chosen color
is changed.

## Artwork-only updates and gallery

`PUT /api/decks/{deckId}/commanders/{position}/artwork` changes only an existing
slot's presentation. Position is 1 or 2; an absent slot returns `404` and an
invalid position returns `400`. Supply a printing UUID and, for multiple
face-local images, the original printing-local image index:

```json
{"scryfallCardId":"<printing UUID>","artworkFaceIndex":1}
```

A sole available image resolves automatically when the selector is omitted,
including a back-only image retaining index 1. Top-level imagery has no selector:
omit it. Explicit selectors must be non-negative JSON integers identifying an
available face; null, strings, fractions, inapplicable or unavailable sides and
missing selectors for multiple images return `400`. No usable `art_crop` means
the artwork write is rejected, while initial Commander creation remains allowed.
Unknown fields, including image URLs, attribution and gameplay selectors, fail.
The response is the complete updated deck, after the transaction succeeds.

The owner can update unused, permanently used and archived decks. The service
locks the same deck row as full updates and first-game writes, fetches the new
printing online and matches its gameplay Oracle identity to the persisted slot.
For reversible cards it matches the authoritative face Oracle identity, remapping
the printing-local gameplay reference when necessary. Either available artwork
side can be displayed independently. Image, display-face index, illustration ID,
artist and source are derived and saved together. Missing attribution is nullable.
All gameplay snapshots, chosen colors, effective/deck WUBRG, slot order, lifecycle
flags and historical references remain unchanged. Failed validation/upstream
resolution changes nothing; reads remain offline.

On saved Dashboard/Decks cards, each image (including its fallback) is an
independent, keyboard-accessible gallery trigger. A pencil marker, focus outline
and label identify the action; the other card region opens the editor. The two
overlapping images retain independently reachable touch regions. No interactive
control contains another interactive control.

Each gallery option immediately submits one per-slot write with no confirmation
button. While saving, choices and closing are disabled. Confirmed success closes
the dialog, restores focus to its trigger and updates that view's deck response;
changing routes loads the other view afresh. Confirmed failure retains the old
art and shows an inline retry. An uncertain response locks selection until an
authoritative deck-list read reconciles the result; a failed read offers an
explicit status retry without resending the write. If that read confirms a deleted
deck, missing slot or replaced gameplay identity, the deck list immediately adopts
the authoritative result. The gallery explains the conflict and can be dismissed,
while stale choices stay disabled. Closing restores focus to the artwork trigger,
or to the deck-list heading if the trigger no longer exists. Selecting the already saved
printing/side or closing without choosing makes no write. Loading, empty, lookup
failure and broken-image fallback states remain local to the gallery.

## Permanent lifecycle and security

First committed game use sets `everUsed` in the same transaction as the game,
including newly assigned decks on edits. It remains true after assignments or
all games are deleted. Failed/rolled-back games do not lock a deck. All deck and
first-use writers lock the same deck row before inspecting or changing state.
After use, real changes to gameplay identity, composition/order, chosen color or
effective/deck colors return `409`. Name-only edits remain allowed, including
when archived and when Scryfall is unavailable.

Deleting an unused deck physically removes it and its Commander snapshots.
Deleting a used deck returns `409`, with no implicit archive. Archive accepts no
body, `null` or `{}`; fields return `400`. It is idempotent, sets only
`archived=true`, and never marks an unused deck used. No unarchive exists.
Archived decks remain in history; they cannot be newly assigned or selected for
games. Unchanged historical assignments can retain them.

Unsafe requests require CSRF. Missing authentication returns `401`, non-owners
and invalid CSRF return `403`, missing decks/cards return `404`, malformed data
returns `400`, lifecycle/concurrency conflicts return `409`. Scryfall failure
returns controlled `503` ProblemDetail with `code=SCRYFALL_UNAVAILABLE`; failed
validation leaves all existing data intact. Security filters retain their
status-only responses.

## Disposable local data and migration

V6 introduces `deck_commanders` and drops the free-text column. Existing
migrations are unchanged. No legacy backfill or automatic data deletion is
performed: V6 refuses a database containing legacy decks with a clear error.
For an **exclusively local, disposable development database**, explicitly stop
applications and run `docker compose down --volumes` followed by
`docker compose up -d postgres` from the repository root. This deletes all local
development accounts, decks and games. Never use this reset on shared/production
data. Testcontainers always migrates a clean PostgreSQL 18 database.

The opt-in offline demo seed uses pinned Scryfall metadata with these same
authenticated API and validation paths. See the [demo guide](../development/demo.md)
for its test-only launcher, explicit demo-only reset and retained credentials.
Existing demo data is never reset or migrated implicitly.

## Two-slot editor

Selecting any pairing-capable card reveals the second field. Ordinary Partner
starts with an empty name search; Partner with immediately offers its validated
reciprocal counterpart as a clickable suggestion, requiring explicit activation.
It can be dismissed or removed. Restoring a saved selection on edit does not
trigger that recommendation lookup; an unchanged rename remains offline. Doctor-first shows `Doctor's companion (optional)`;
other standalone-eligible choices can also remain single. A Background without
standalone eligibility requires an explicitly selected compatible second card.
The backend search unions all roles, including both Faceless One roles.

Each slot keeps query text separate from its selection reference and chosen
color. Editing a selected name immediately invalidates that entire slot. Changing
the first slot clears the second slot and retires its requests; restoring typed
text cannot restore either reference. Each qualifying slot has its own mandatory
W/U/B/R/G radio group; combined WUBRG is read-only. Saved pairs restore both
choices without lookup; first-use locks both fields, while rename omits Commanders.
Existing guarded navigation and uncertain-write recovery apply to the whole pair.

V7 adds nullable pairing metadata to existing snapshots without network access or
invented rules. Older snapshots remain readable and renameable offline; reselect
an unused Commander to discover its pairing roles. Newly created/replaced slots
store the normalized metadata for future offline editing. No existing migration
or saved gameplay identity is rewritten.
