# Scryfall card lookup API

The authenticated backend provides English Commander name search, authoritative
printing metadata, and alternative illustrations. React calls these application
endpoints; only Spring Boot calls `https://api.scryfall.com`. Responses use the
application DTOs below rather than forwarding Scryfall JSON.

This is the lookup foundation from [issue #100](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/100).
It introduces no database migration, frontend controls, or deck write changes.
The existing [deck API](decks-api.md) remains unchanged until #101. Pair validation
(#103) and artwork persistence/updates (#105) are separate work. Existing saved
deck, history, and statistics reads do not request Scryfall metadata.

| Method | Route | Success |
| --- | --- | --- |
| GET | `/api/scryfall/commanders?q=atraxa` | `200 CommanderChoice[]` |
| GET | `/api/scryfall/cards/{scryfallCardId}` | `200 CardDetails` |
| GET | `/api/scryfall/cards/{scryfallCardId}/artworks` | `200 Artwork[]` |

All routes require the existing authenticated session (`401` otherwise). These
read operations need no CSRF token. IDs are Scryfall printing UUIDs; they are
not application deck IDs or stable gameplay identities.

## Commander name search

`q` must contain at least two non-whitespace characters. The original input,
before normalization, must contain no more than 100 Unicode code points.
Unicode whitespace, including line breaks, is trimmed/collapsed; non-whitespace
control characters and Unicode format characters are rejected. The normalized
input is a literal English card-name fragment, not an arbitrary Scryfall query.
Generated upstream filters restrict candidates to Commander-relevant cards, and
normalized authoritative legality/type/rules metadata determines which choices
are returned. Commander format legality alone does not make an ordinary card
eligible as a Commander.

The result contains at most 20 choices, with one representative printing per
stable gameplay Oracle identity. A valid name with no matches returns `[]`.
Different printings and repeated reversible faces of the same gameplay identity
do not create duplicate suggestions. Independently eligible reversible faces
with distinct identities have their own English-name choices. An ordinary
transforming or modal back face is never a separate name-search option.

```json
[
  {
    "selectionRef": {"scryfallCardId": "<printing UUID>"},
    "scryfallCardId": "<printing UUID>",
    "canBeSoleCommander": true,
    "name": "Atraxa, Praetors' Voice",
    "colorIdentity": ["W", "U", "B", "G"],
    "requiresChosenColor": false,
    "thumbnailUrl": "https://cards.scryfall.io/small/front/...jpg"
  }
]
```

`thumbnailUrl` is nullable. `colorIdentity` is the canonical **base** WUBRG array,
including an empty array for colorless cards. It never includes a caller's
pregame chosen color. `requiresChosenColor` means that the known Commander
ability requires choosing one color before the game begins; this service does
not choose the color or derive the final deck identity.

`canBeSoleCommander` separates standalone choices from cards only usable with a
legal second Commander, such as a Background enchantment. A legendary creature
with an optional pairing ability can still be a standalone Commander. A false
value does not establish that any particular pair is legal. Until #103 provides
pair writes, #101/#102 must save only standalone-eligible selections.

The future search UI debounces typing by approximately 300 ms. The backend also
caches repeated lookups and limits aggregate upstream request traffic.

## Selection reference and stable gameplay identity

`CommanderSelectionRef` contains:

| Field | Meaning |
| --- | --- |
| `scryfallCardId` | Required printing UUID resolved by the backend |
| `gameplayFaceIndex` | Optional original zero-based `card_faces` index; required only for exceptional reversible gameplay selection |

For example, a reversible choice can carry
`{"scryfallCardId":"<printing UUID>","gameplayFaceIndex":1}`. Ordinary references
omit `gameplayFaceIndex`. The server rejects missing required, negative,
out-of-range, inapplicable, or ambiguous selectors. The reference is structured
data, with no expiry or dependency on a previous search/cache entry.

The selected printing, stable gameplay Oracle identity, and displayed artwork
side are separate concepts. The server resolves the selected printing and
verifies its authoritative Oracle identity; a printing UUID, face index, or
client-supplied name is never the stable identity. Ordinary transform/modal cards
retain their full card-level base `color_identity`, including back-side colors.

## Card details

`CardDetails` exposes only normalized lookup and future deck-management metadata:

| Field | Contract |
| --- | --- |
| `scryfallCardId`, `name`, `layout` | Printing UUID, English card name, and Scryfall layout identifier |
| `oracleId` | Stable card-level Oracle identity, nullable when the layout does not provide one |
| `commanderLegality` | Scryfall's Commander-format legality value; eligibility is represented by `commanderSelections` |
| `colorIdentity`, `requiresChosenColor` | Canonical base WUBRG and normalized pregame capability |
| `typeLine`, `keywords`, `oracleText` | Relevant type/rules metadata for later Commander validation |
| `thumbnailUrl`, `artCropUrl` | Nullable representative images |
| `illustrationId`, `artist`, `scryfallUri` | Nullable attribution/source for the default displayed illustration |
| `defaultArtwork` | The normalized initial `Artwork` snapshot, permitting a null image |
| `commanderSelections` | Eligible `CommanderChoice[]`, using exactly the search choice contract |
| `gameplayCards` | Per-gameplay-identity metadata described below |

Each `GameplayCard` exposes `gameplayFaceIndex`, `oracleId`, `name`,
`colorIdentity`, `requiresChosenColor`, `canBeSoleCommander`, `typeLine`,
`keywords`, `oracleText`, and `defaultArtwork`. For independently eligible
reversible identities, eligibility, chosen-color detection, and default artwork
use the selected gameplay face's own metadata. The backend does not invent a
missing top-level Oracle or illustration identity.

For a reversible printing without card-level `color_identity`, the top-level
`CardDetails.colorIdentity` is `[]` as printing metadata. That does not establish
that either gameplay face is colorless. Consumers must use the selected choice's
or `GameplayCard`'s authoritative base colors, rules, and chosen-color capability.

Reversible printings can omit face-local `color_identity`. When needed, the
backend resolves the face's authoritative Oracle metadata through an ordinary
printing of that same Oracle identity. The original selected printing and its
artwork remain unchanged; an absent color field is never silently interpreted as
colorless.

The targeted chosen-color predicate recognizes the currently known English
Oracle ability that instructs a player to choose a color before the game begins
when the card is their Commander and makes that Commander the chosen color.
It uses the already returned Oracle text, including relevant face text, without
an extra HTTP request. There is no card-name or ID allowlist. Unrelated effects
containing “choose a color” do not activate the capability. Novel mechanics or
different future wording may need a targeted parser update.

## Alternative illustrations

The artworks route identifies the selected gameplay card, then collects bounded
alternative printing data and returns distinct available illustrations. For
exceptional reversible selections, supply the reference's `gameplayFaceIndex`
query parameter, for example `?gameplayFaceIndex=0`. This disambiguates gameplay
identity; it does not select which artwork side is displayed. For ordinary cards
omit the gameplay selector. Artwork discovery also works for an ordinary card
with a stable Oracle identity that is not Commander-eligible; it does not require
a nonempty `commanderSelections` array.

Alternative illustrations include all printing languages and rare variants
(`include_multilingual=true&include_variations=true`). These options apply only
to printing/artwork discovery; Commander name search remains English-only.
Variants with a distinct illustration can add artwork choices; finish or frame
variants using the same displayed illustration remain deduplicated.
Every usable side from the initially selected printing is considered before
alternative printing pages, even when the page bound excludes that printing.
The selected gameplay default appears first when it has an available image.

Every `Artwork` has this presentation contract:

| Field | Contract |
| --- | --- |
| `scryfallCardId` | UUID of the printing supplying the image |
| `artworkFaceIndex` | Original zero-based face index, or `null` for top-level imagery |
| `artCropUrl` | Safe authoritative `art_crop` URL; required for a gallery option, nullable for a default/saved snapshot |
| `illustrationId` | Nullable ID of the displayed illustration |
| `artist` | Nullable artist credit of the displayed illustration/face |
| `scryfallUri` | Nullable safe source link for the selected printing |

Available front and back illustrations are separate options. Deduplication
does not discard distinct illustrated sides. Missing image fields never
invalidate a Commander; only usable image URI metadata creates gallery options.
No image bytes are fetched or probed. If only face 1 has an image, its option
retains index 1. Zero available images returns `[]`; provider unavailability
returns `503` instead of a successful empty list.

Initial Commander selection automatically prefers the selected gameplay face's
image and otherwise uses a reasonable available image. It accepts nullable
artwork without adding a create-form artwork selector. Normal double-faced
artwork sides are presentation choices and do not change gameplay identity.

For the later #105 artwork-only write, a printing with one available image may
omit the artwork selector and resolves to that image's actual original index.
Multiple available face images require an explicit available `artworkFaceIndex`;
a supplied selector must be valid even when only one image remains. Top-level
imagery has no face selector. No available image cannot be saved by artwork-only
PUT. #105 must independently validate the target printing against the slot's
persisted gameplay identity and owns the complete update endpoint/error contract.

## Availability and errors

Application failures use ProblemDetail with a stable `code` property. Responses
do not expose raw Scryfall errors, HTTP implementation details, or caller-provided
outbound URLs.

| Scenario | HTTP status | `code` |
| --- | --- | --- |
| Missing, malformed, or too-short name query; malformed card UUID or face selector | `400` | `INVALID_SCRYFALL_REQUEST` |
| Unknown Scryfall printing UUID | `404` | `CARD_NOT_FOUND` |
| Timeout, connection failure, upstream throttling, or malformed provider data | `503` | `SCRYFALL_UNAVAILABLE` |
| Valid search with no matches | `200` | Empty list, no error |

For `SCRYFALL_UNAVAILABLE`, the frontend can display:
“Scryfall is currently imprisoned in the moon… Please try again later.”
New/changed Commander persistence must perform an online authoritative lookup;
a cached search or detail result cannot authorize offline creation. There is no
manual-entry fallback for these future Scryfall-backed writes. Previously saved
decks, game history, statistics, and name-only edits remain independent of
Scryfall availability.

The application boundary `resolveCommanderOnline(selectionRef)` resolves a
fresh printing response and validates the selected eligible gameplay identity.
`resolveStandaloneCommanderOnline(selectionRef)` additionally requires
`canBeSoleCommander`, for #101 before pair writes exist. Callers use these
operations rather than trusting client metadata or reusing ordinary detail
lookups. A previous search/reference remains structurally usable, but does not
waive the online availability check. Cached derived/Oracle metadata may be
reused only after the fresh printing request succeeds.

Both methods return `ResolvedCommander(card, gameplay)`, keeping printing
`CardDetails` and the selected `GameplayCard` separate. Subsequent persistence
uses `gameplay.defaultArtwork` for the initial selected-gameplay snapshot,
alongside its stable gameplay identity and rules metadata, rather than an
ambiguous reversible printing's top-level default.

The integration uses a fixed HTTPS API host, explicit descriptive `User-Agent`
and JSON `Accept` headers, a three-second connection timeout, a five-second
whole-response timeout, and a 2 MiB response-size bound. A shared gate spaces
upstream request starts by at least 150 ms, below 10 requests/second. HTTP 429
causes a controlled unavailable response and a `Retry-After` cooldown without
automatic retry loops. Pagination URLs are restricted to the fixed provider
search route. Safe image URLs use HTTPS on `scryfall.io` or its subdomains;
source links use HTTPS on `scryfall.com`. Missing or unsafe metadata is nullable.
There is no Redis, synchronization task, bulk download, or local card database.

Lookup caches expire after five minutes and hold at most 128 searches, 256 card
details, 128 artwork collections, and 256 supplementary Oracle metadata entries.
Collection traversal uses at most three provider pages of at most 175 cards.
Commander search inspects at most 40 representative cards and returns no more
than 20 suggestions; artwork discovery returns no more than 200 options.

Reference guidance: [Scryfall API](https://scryfall.com/docs/api),
[access and rate limits](https://scryfall.com/docs/faqs/i-m-having-trouble-accessing-the-scryfall-api-or-i-m-blocked-17),
and [image usage](https://scryfall.com/docs/api/images). Automated tests stub the
provider and do not require live Scryfall access.
