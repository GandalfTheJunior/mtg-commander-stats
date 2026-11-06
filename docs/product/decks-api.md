# Deck API and permanent lifecycle

Deck operations use the authenticated principal's user UUID. Only the owner may
create, change, delete, or archive their decks. The only delegation is for
[quick-profile decks](#quick-profile-decks), which any active member of the
profile's group manages. Group deck selection is a
separate [read-only game API](games-api.md#read-only-member-deck-selection).

| Method | Route | Success |
| --- | --- | --- |
| GET | `/api/decks` | `200 DeckResponse[]`, including archived decks |
| POST | `/api/decks` | `201 DeckResponse` |
| PUT | `/api/decks/{deckId}` | `200 DeckResponse` |
| PUT | `/api/decks/{deckId}/commanders/{position}/artwork` | `200 DeckResponse` |
| PUT | `/api/decks/{deckId}/companion/artwork` | `200 DeckResponse` |
| DELETE | `/api/decks/{deckId}` | `204`, only when never used |
| POST | `/api/decks/{deckId}/archive` | `200 DeckResponse` |

## Authoritative Commander selection

POST requires one standalone-eligible Commander or two distinct compatible
Commanders in ordered slots. PUT requires a name and optionally replaces that
configuration before first use. The backend validates both identities and
pairing roles from fresh authoritative Scryfall metadata. Zero, more than two,
duplicate identities and incompatible pairs return `400`. No free-text/manual or offline creation
is supported. Deck names follow the [naming conventions](mvp-scope.md#naming-conventions), with a maximum of 30 grapheme clusters. Name validation returns a 400 ProblemDetail with one `errors` entry (`field=name`, stable name error code, and `maxLength=30` for length errors). Commander names come from Scryfall.

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

## Deck formats and Pauper Commander

`format` is the persisted enum `COMMANDER` or `PAUPER_COMMANDER`. POST omission
and all pre-V15 decks default to `COMMANDER`. PUT omission preserves the saved
format; an explicitly unchanged format is idempotent. Explicit null, unknown,
non-string and incorrectly cased values return `400`. V15 adds a nonnull,
checked column without rewriting existing snapshots, users or history.

On creation, replacement of Commanders, and every actual format change, the
backend freshly validates the selected printing and full ordered configuration
against the destination format. A format-only PUT revalidates saved references,
including any gameplay-face selectors. An invalid Commander/pair blocks the
entire write; no card is cleared or replaced implicitly. A format change is
permitted only before the first committed game use. The same pessimistic deck
row lock serializes format changes, other owner writes and first use. Committed
use permanently locks format even after editing/deleting games; failed or
rolled-back games do not lock it. A used-deck format change returns `409` before
requesting provider validation.

```json
{"name":"Pauper Deck","format":"PAUPER_COMMANDER","commanders":[{"selectionRef":{"scryfallCardId":"<printing UUID>"}}]}
```

PDH allows eligible uncommon creatures, Vehicles and Spacecraft without a
legendary requirement. Uncommon Backgrounds require genuine compatible pairing;
each member of any pair must independently be eligible. Nonlegendary status
alone grants no pairing permission. The server uses Scryfall's
`is:PauperCommander` semantics for stable Oracle identities, rather than the
chosen illustration's rarity or ordinary main-deck legality. It delegates
qualifying paper/MTGO rarity history, excluded Arena/promo/Secret Lair/local
release shifts and provider-supported bans to that authoritative mechanism.
A non-Uncommon illustration of an eligible identity is valid. See
[PDH lookup](scryfall-api.md#pauper-commander-search-and-validation).

A PDH deck cannot carry a genuine MTG Companion. Switching an unused deck with a
saved Companion requires explicit removal, optionally in the same PUT with
`"companion":null`. Implicit removal and adding a Companion to PDH are rejected
with `400` and `INVALID_DECK_FORMAT`. Doctor's companion pairing remains distinct.

Reads and unchanged-format/name/link updates use saved snapshots offline.
Artwork-only routes preserve format and all gameplay fields and do not recheck
current eligibility. Required online validation returns `503` with
`SCRYFALL_UNAVAILABLE` on provider failure. Future bans do not rewrite existing
decks, lock them out of safe edits, or invalidate historical assignments.

The service has no full decklists: it does not certify Commons in the other
99/98 cards, singleton rules, or complete PDH deck legality. Mixed Commander/PDH
games are unrestricted. No game-format write field, matching restriction,
format-specific result calculation or PDH statistics filter is introduced.

## Saved snapshots and updates

Every owner-authorized deck response contains `id`, `name`, `commanders`, `colorIdentity`,
`format`, `everUsed`, `archived`, nullable `manaBoxUrl` and nullable `companion`. Each ordered `commanders` item contains:

| Fields | Meaning |
| --- | --- |
| `position` | 1 or 2; list ordered by slot |
| `oracleId`, `name` | Stable printing-independent gameplay identity and snapshotted English name |
| `selectionRef`, `scryfallCardId` | Current printing and its gameplay-face selector when applicable |
| `pairing` | Snapshotted sets of pairing roles, reciprocal counterpart names and normalized variant labels |
| `canBeSoleCommander`, `requiresChosenColor` | Saved normalized selection capabilities |
| `colorIdentity`, `chosenColor`, `effectiveColorIdentity` | Base WUBRG, nullable per-card choice, derived effective WUBRG |
| `artworkFaceIndex`, `artCropUrl`, `illustrationId`, `artist`, `scryfallUri` | Nullable displayed-illustration/printing snapshots |
| `cardFaces` | Nullable [full-card display snapshot](#full-card-display-snapshots) |

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

## Full-card display snapshots

Commander and Companion read DTOs include nullable `cardFaces`, an ordered array
of `{faceIndex, name, typeLine, oracleText, imageUrl}` for the saved printing.
`faceIndex` is the original zero-based `card_faces` index, or null for a single
card with top-level metadata. Names are required; type/rules/image fields may be
null. An empty rules string means the face has no rules text, unlike null, which
means no text was supplied. Every face is retained, including non-Commander back
faces and faces without imagery. `imageUrl` is the safe Scryfall **normal** image,
never the small thumbnail or an artwork crop. Split/adventure faces can share
one complete physical-card image.

V21 adds nullable `card_faces TEXT` JSON snapshots to `deck_commanders` and
`deck_companions`, without defaults, network access or backfill. Create and actual
Commander/Companion replacement populate them from the already resolved printing;
artwork writes replace all faces atomically with the selected printing. Existing
owner, group-member deck and game-detail reads return the same saved data without
per-card lookups. Gameplay identity, permissions and first-use locks are unchanged.
Name/link-only and idempotent unchanged-selection saves remain offline and do not
refresh legacy snapshots; an artwork save (including the same printing) or actual
selection replacement refreshes them. Old snapshots expose null and retain their
saved card name, with honest missing-type/rules/image messages.

The reusable frontend `FullCardView` takes this snapshot, never fetches card
metadata, and works for both Commanders and Companions. It provides a labelled
trigger, a MUI dialog with focus trapping, Escape dismissal and focus restoration,
all faces as explicit buttons, and real text alongside the unmodified complete
image. The initial face is the exceptional `selectionRef.gameplayFaceIndex` when
present, otherwise `artworkFaceIndex`, otherwise the first face. Missing/failed
images do not hide the text; images have no cropping, overlays, distortion or
color effects.

The own deck collection has a separate **Karte anzeigen** control beside its
artwork. Artwork activation continues to open the editing gallery. Its preloader
observes the artwork with zero viewport margin and starts all faces only when
visible; it adds further cards as the user scrolls. The short game-details view
preloads all participant cards and makes each Commander artwork a read-only
trigger. Companion controls use the same component. Preloading is asynchronous,
deduplicates URLs within a card and releases unfinished image requests when the
view retires. Text opens immediately even if an image is not yet cached or the
connection is slow. Only image-file requests to Scryfall's image hosts are used;
opening never calls an application or Scryfall API.

The shared contract is ready for the redesigned game details (#195), read-only
member decks (#199) and own collection (#201). Dashboard, game-history (#194)
and record-match rows (#196) do not preload or open full cards.

## Optional MTG Companion

A regular Commander deck may save zero or one genuine **Companion** as a separate
permanent gameplay identity. This is unrelated to the Doctor's companion pairing
role and never adds a Commander slot, colors, game participant or statistics
appearance. Companion deckbuilding conditions (for example Lurrus/Jegantha/Keruga)
are the player's responsibility: the application has no complete decklist and
makes no full-deck legality claim.

POST accepts optional `companion` (omission/null means none). PUT requires `name`
and distinguishes omission (preserve), explicit null (remove) and a selection
(add/replace). `commanders` may be omitted on a Companion-only update:

```json
{"name":"My deck","companion":{"selectionRef":{"scryfallCardId":"<printing UUID>"}}}
```

Only `selectionRef` is writable, with the same exceptional gameplay-face selector
rules as Commander references. Names, colors, Oracle identities, pairing/chosen
colors and image URLs are never client inputs. New/replaced selections are freshly
resolved online regardless of prior search results. They require the genuine
Companion keyword/Oracle ability, current Commander legality and the separate
regular-Commander restriction policy. Lutri is banned **as Companion**; Yorion's
20-extra-card requirement cannot fit Commander's fixed deck size. Search and writes
share this policy; `legalities.commander` alone is insufficient.

The authoritative base/full Companion WUBRG must be a subset of the prospective
effective Commander union, including both slots and any pregame chosen colors.
An otherwise eligible zero-color Companion can fit a colorless deck. Commander
and Companion changes are checked together atomically; an incompatible saved
Companion produces actionable `400`, never implicit removal. An unused deck may
explicitly remove/replace its Companion together with its Commanders.

Before first committed use, the owner may add, swap or remove the Companion.
After `everUsed=true`, real identity/add/remove changes permanently return `409`,
including after all game assignments or games are removed. An unchanged full
selection preserves the authoritative snapshot offline, without revalidating
later bans or querying the provider. Commander changes check an unchanged
Companion against its saved colors. Reads, rename/link-only updates and historical
game assignments never retroactively apply bans or alter results/statistics.
Same-Oracle printing changes through deck PUT return `400` with guidance to use
the artwork endpoint. An idempotent update cannot revert newer artwork.

The owner deck response, member deck selection and game list/detail/write display
DTOs include `companion: null` or this saved snapshot:

| Fields | Meaning |
| --- | --- |
| `oracleId`, `name` | Stable Oracle gameplay identity and authoritative English name |
| `selectionRef`, `scryfallCardId` | Saved printing and its gameplay-face selector when applicable |
| `colorIdentity` | Canonical full/base WUBRG, never added to deck colors |
| `artworkFaceIndex`, `artCropUrl`, `illustrationId`, `artist`, `scryfallUri` | Nullable artwork/attribution/source snapshots |
| `cardFaces` | Nullable [full-card display snapshot](#full-card-display-snapshots) |

Missing initial art/attribution is valid. All these reads use stored snapshots
without Scryfall calls and retain existing owner/group access scopes. Games keep
only existing deck IDs; first-use locking makes redundant game-level Companion
snapshots unnecessary. Game write requests gain no Companion fields; statistics
calculations and statistics response fields are unchanged.

`PUT /api/decks/{deckId}/companion/artwork` uses the Commander `ArtworkRequest`
shape and face/image rules from [artwork updates](#artwork-only-updates-and-gallery).
No saved Companion returns `404`. The owner may update used/archived decks. The
backend freshly verifies the same saved Oracle identity, requires usable `art_crop`,
and atomically stores the printing-local reference, image and attribution while
preserving all gameplay snapshots and locks, even if the card was later banned.
Use the existing Scryfall artworks route for discovery. Failure changes nothing.
`400` Companion policy/color/printing errors use `code=INVALID_COMPANION` and an
actionable detail, including a Companion artwork request missing `scryfallCardId`.
Other malformed requests/artwork selectors retain existing controlled
errors. Session, CSRF, ownership, `404/409` and `503 SCRYFALL_UNAVAILABLE` behavior
matches other deck operations.

V14 adds only `deck_companions`, keyed by `deck_id` with an owning-deck FK and
cascade on physical deck deletion. No row means no Companion. Existing decks,
Commander snapshots, flags, games and links are untouched; no backfill or provider
calls run during migration. The domain exposes a single nullable snapshot; its
internal collection mapping batches reads with the existing Hibernate subselect
pattern. All mutations use the existing pessimistic deck-row lock shared with
first game use, archive, name/link and Commander artwork changes.

The explicit restriction policy is in `scryfall.domain.CompanionRules`, keyed by
stable Oracle IDs independently of display names and printings. Reviewed
on 2026-11-04 against the [Wizards announcement effective February 9, 2026](https://magic.wizards.com/en/news/announcements/commander-banned-and-restricted-february-9-2026)
and [Commander deck-size rules](https://magic.wizards.com/en/formats/commander).
Before future policy changes, review authoritative rules and Companion-only bans;
Scryfall's general format legality cannot automatically detect them. No proactive
ban monitoring or historical legality flags are implemented.

This backend delivery adds no editor/gallery/game-details UI. #201/#195 own that
integration. No format discriminator is introduced: #111 must reject a saved
regular Companion when transitioning to Pauper Commander, without silently
removing it.

## Optional ManaBox share link

Owners may supply `manaBoxUrl` on POST or PUT. POST without it (or with explicit
null) stores null. PUT omission preserves the existing link; explicit null clears
it; a valid string replaces it. PUT still requires `name`. To change only the
link, send the current name and omit `commanders`, for example:

```json
{"name":"Goblins","manaBoxUrl":"https://manabox.app/decks/Synthetic-Mixed_123"}
```

The verified v1 format is HTTPS host `manabox.app` with exactly
`/decks/<opaque-share-id>`. The case-sensitive ID contains one or more ASCII
letters, digits, `_` or `-`, without a fixed length. One final slash is removed.
Scheme/host are case-insensitive and stored as `https://manabox.app`; explicit
default port `443` is accepted and removed. Other ports, hosts (including `www`),
userinfo, extra path segments, query/fragment (even empty), backslashes, percent
encodings and malformed/ambiguous URLs are rejected with `400`. Non-string JSON
values other than null are invalid. URLs are parsed strictly with `java.net.URI`;
the backend never retrieves, pings or follows redirects to them.

Link changes work for unused, used and archived decks, without altering gameplay,
chosen colors, artwork, ownership, usage/archival flags, game assignments or
statistics. Omitting Commanders needs no Scryfall access. All deck changes are
atomic; validation or provider failures leave the existing link and deck intact.
The same owner, session and CSRF checks apply. No public deck endpoint is added.

Other players receive a link only through the authorized
[game detail GET](games-api.md#manabox-links-in-game-details), and only while the
deck owner is currently an active member of that group. Game lists, game write
responses, selection and statistics do not expose it. The owner editor supports
the optional link on unused, used and archived decks, with explicit clearing,
dirty-state guards and authoritative reconciliation after uncertain writes.
Meine Decks exposes an independent safe external action; Dashboard does not.
See [frontend behavior](../development/frontend-routing.md#manabox-links).
This is external linking, not ManaBox API, account linking, import or synchronization.

V10 adds nullable `decks.mana_box_url TEXT`, without a default or backfill.
Existing decks read as null; existing migrations and snapshots are unchanged.

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
After use, real changes to Commander/Companion gameplay identity, composition/order, chosen color or
effective/deck colors return `409`. Name-only edits remain allowed, including
when archived and when Scryfall is unavailable.

Deleting an unused deck physically removes it and its Commander/Companion snapshots.
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

## Quick-profile decks

[Quick profiles](groups-api.md#quick-profiles) own decks like accounts. Any active
OWNER, ADMIN or MEMBER of the profile's home group manages them through
group-scoped routes under `/api/groups/{groupId}/quick-profiles/{userId}/decks`:

| Method | Route suffix | Success |
| --- | --- | --- |
| GET | `/decks` | `200 DeckResponse[]`, including archived decks |
| POST | `/decks` | `201 DeckResponse` |
| PUT | `/decks/{deckId}` | `200 DeckResponse` |
| PUT | `/decks/{deckId}/commanders/{position}/artwork` | `200 DeckResponse` |
| PUT | `/decks/{deckId}/companion/artwork` | `200 DeckResponse` |
| DELETE | `/decks/{deckId}` | `204`, only when never used |
| POST | `/decks/{deckId}/archive` | `200 DeckResponse` |

Requests, responses, validation, the [permanent lifecycle](#permanent-lifecycle-and-security),
Scryfall behavior and error codes are exactly those of `/api/decks`, with the
profile as owner. Each write first locks the group row and checks the actor's
active membership and the profile, then locks the deck row as usual. Outsiders,
former members and invalid CSRF return `403`; a missing group, or an unknown,
anonymized or other-group profile returns `404`; a deck owned by someone else
returns `403`. Anonymized profiles' decks are archived and cannot be managed.

Accepting a [profile invitation](groups-api.md#profile-invitations-and-claiming)
moves every profile deck to the account with its UUID, name, format, Commanders,
Companion, `everUsed` lock and archived state intact. The deck owner/participant
foreign key is deferred during the atomic reassignment.

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
