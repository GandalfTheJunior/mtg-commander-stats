# MVP scope

This document records the agreed product target. User registration, session
authentication, authenticated deck management, browser play-group management,
and browser game recording/history with permanent deck usage/archival are
implemented, along with the group-specific basic statistics API and browser
responsive player/deck statistics views.

## Product milestone

Four real Commander players can create accounts, log in, create and manage
their decks, join and use the same play group, record games with players and
decks, store results, and view basic player/deck statistics.

Editing account/profile details after registration (for example, changing the
username or email address) is deferred until after the MVP.

## Games

- Free-for-all Commander only, with 2–6 registered players.
- New participant/deck assignments require active membership and an owned,
  unarchived deck. Edits may retain unchanged historical assignments after a
  member leaves or a deck is archived.
- Each participant uses one of their own decks.
- The result is either WIN with exactly one winner or DRAW with no winner.
- The original MVP deferred placements; the approved #116 backend extension now
  records explicit start seats, competition ranks, alternate victories and DRAW
  survival under the [Games API](games-api.md). Editor rollout remains #117.
- An active group member creates the game and need not participate. Its creator
  may modify or delete it while they remain active. An active group OWNER or
  ADMIN may modify or delete games in that group.
- Games are hard-deleted. There is no GameEvent/event system in the MVP.

Backend contracts and history/display rules are documented in the
[Commander games API](games-api.md). Game identity, creator, group, and recording
time remain fixed on edits. Active members can read history. The selected group's
browser game area supports recording, editing with explicit historical assignment
preservation, and confirmed deletion. Actions appear only for the active creator
or OWNER; server authorization remains authoritative.

## Play groups and membership

- Users may belong to multiple groups and create multiple groups.
- Any active OWNER/ADMIN/MEMBER may issue independent single-use invitations.
  Each expires after exactly 24 hours and admits one person only on explicit
  authenticated join. Public preview exposes only the group name. Links and
  codes represent the same token; no rotation or revocation exists.
- This backend cutover may ship only with invitation UI #200; see the
  [deployment runbook](../development/invitation-cutover.md).
- Backend roles are OWNER, ADMIN and MEMBER. Each group has exactly one active
  OWNER. Only OWNER can promote/demote active MEMBER/ADMIN memberships.
- Active OWNER/ADMIN can remove ordinary MEMBERs, preserving history and revoking
  protected access immediately. An OWNER must demote an ADMIN before removal.
- The OWNER cannot leave while owning the group. The backend supports explicit
  ownership transfer to an active ADMIN: only that target can accept/decline,
  and the initiating OWNER can withdraw before acceptance. Acceptance atomically
  makes the target OWNER and the prior OWNER MEMBER. One pending request per
  group is allowed. Accepted/declined outcomes remain available to the original
  OWNER until explicitly acknowledged; see the [group API](groups-api.md#ownership-transfer).
- Leaving must preserve historical membership, game, and statistics data.
- A former member may rejoin with a different valid unused invitation. Rejoining reactivates the
  existing stable membership as MEMBER rather than creating a duplicate.
- Former members lose access that requires active membership.
- Further fine-grained permissions and additional roles are out of scope.
  Members administration, ownership-transfer and invitation UI remain
  follow-on work. The invitation backend is blocked from standalone deployment.

The backend API for these rules is implemented and documented in
[Play groups API](groups-api.md). The browser My groups area supports these
operations; see the [usage guide](../../README.md#local-development).

## Decks

- Decks belong to users. Owners enter a deck name and explicitly select one
  standalone-eligible Commander or two compatible Commanders from backend Scryfall
  search. The backend validates distinct gameplay identities and all supported
  pairing roles; the editor reveals the second field from normalized metadata.
  See [pairing and filtered search](scryfall-api.md#partner-filtered-search).
- Authenticated users can list, create, edit, and delete their own currently unused
  decks. Ownership comes from the authenticated user's stable UUID and is enforced
  by the backend; clients do not choose an owner.
- Deck names use the [naming conventions](#naming-conventions) and need not be unique. Commander
  identities, names and base colors are authoritatively resolved online through
  [Scryfall](scryfall-api.md); saved snapshots need no provider access.
- Color identity is the backend-derived WUBRG union of the selected Commanders'
  base colors and each required single pregame chosen color. Empty means colorless.
  There is no manual color override. The editor retains read-only WUBRG controls
  and supplies a separate required W/U/B/R/G picker when appropriate.
- Optional public ManaBox deck share links can be stored by owners. Active group
  readers see them only in game details while the deck owner is currently active
  in that group, including archived decks. This is external linking only; no
  ManaBox API, import, sync, hosted decklist or DeckVersion. See [Deck API](decks-api.md)
  for snapshot fields, strict write contracts and disposable local data migration.
  Owners edit links in the existing deck editor and open them from Meine Decks;
  Dashboard intentionally has no ManaBox action. Authorized game details show
  each available participant link as a separate external action in a new tab.
- Browser deletion requires a confirmation naming the selected unused deck.
  Canceling does not change the deck; confirmed deletion updates the UI only
  after the server acknowledges success.
- The deck name, ManaBox link and selected artwork remain editable, including after use or
  archival. Each saved Commander image opens its own immediate-save gallery;
  selecting front/back artwork never changes the gameplay Commander.
- Commander and color identity may change until the deck is first used in a
  recorded game; they become immutable after first use, including any pregame chosen color.
- Decks remain used forever after their first committed game, even if all games
  referencing them are edited or deleted. Failed writes leave usage unchanged.
- Used-deck DELETE returns a conflict; owners explicitly archive them instead.
  The browser offers an Archive action with confirmation, visibly locks used-deck
  commander/colors, and supports renaming archived decks without unarchiving.
- Archived decks remain visible in historical games and statistics but cannot
  be selected for new games.

Owners can see unused/used/archived state in the [Deck API](decks-api.md). Active
group members can select all unarchived decks of other active group members,
including unused decks, through the read-only group game API. This grants no
deck modification rights and introduces no configurable sharing settings.

## Statistics

The backend [group statistics API](statistics-api.md) provides games, wins, and
win rate per player and deck within a group. Only entities appearing in current
games are included; draws add games without wins. Former members and archived
decks retain recorded results. Active membership is required to read statistics.
Opened browser groups start on Spieler and offer a Spieler/Decks switch: one
card per returned row on phones and one sortable table for the selected dataset
on desktop. All existing player/deck sort fields and both directions are available;
numeric fields start descending and text fields ascending. Standardreihenfolge
restores received API order, with independent temporary sort choices and stable
ties. Full stable player/deck/owner IDs are disclosed only on request. The subview
and sorts survive same-group navigation, refresh and acknowledged writes, then
reset with the group/session lifetime. These are presentation choices, not
rankings or changes to API counts. Successful game changes and explicit refresh
reload server statistics. Loading, local error/retry, subview-specific empty states
and group/session access recovery keep retired rows hidden.
One shared Spielerzahl filter (Alle, 2–6) reloads all four API datasets. Below the
selected table, start-seat and Mana-color bar charts remain visible for both
subviews, side by side on wide screens and stacked on phones. Start seats stay
separated by table size; All hides unobserved sizes. Empty observations display
“Keine Daten vorhanden”, whereas measured no-win rates display 0%. Color bars
rank by exact rate, games, then WUBRG/C. Every bar exposes games, wins and the
server percentage as text. Colors count full overlapping deck appearances;
colorless is a separate gray category. No raw-game aggregation or date filter is
added. Broader placement analytics and custom dashboards remain deferred.

Play-group seasons and season-specific win-rate leaderboards are documented as a
[post-MVP product concept](playgroup-seasons.md). This is a future feature and
does not extend the current MVP statistics or ranking scope.

## Authentication

Authentication is part of the learning scope. The web MVP uses Spring Security,
established password hashing/security mechanisms, and server-side sessions.
Do not implement custom cryptography. JWT, OIDC, and mobile authentication are
outside this MVP.

- Registered users log in with email/password through `POST /api/session`.
  Login uses the same database-owned email canonicalization as registration and
  verifies the password exactly as supplied. Invalid credentials receive a
  generic `401`, regardless of whether the email exists or is syntactically usable.
- The authenticated principal carries the existing `User` UUID, canonical login
  email, and display username. Later business features obtain the actor from the
  stable UUID rather than a client-supplied identifier.
- `GET /api/me` restores that identity from a valid session, or returns `401`.
- `GET /api/csrf` is available anonymously and while authenticated. Clients use
  its token and header name for login and other unsafe requests, including
  `DELETE /api/session`. Refresh the CSRF token after successful login.
- Logout requires authentication and CSRF protection, returns `204`, and
  invalidates the session. Protected anonymous requests receive `401`; forbidden
  operations and invalid/missing CSRF protection receive `403`.
- Confirmed browser sessions show Log out and hide login/registration forms.
  Logout hides protected deck/group content, including invitation codes, while
  awaiting the server's `204`. Failed or ambiguous attempts recheck `/api/me`:
  a valid identity restores fresh protected views, an absent identity shows the
  signed-out controls, and an unavailable check leaves protected data hidden
  with an explicit retry. Only a confirmed `204` is reported as successful logout.

## User identity and registration

- The registered `User`, identified by a stable UUID, is the application identity
  that later profiles, decks, memberships, games, and statistics reference.
- MVP email, username, and encoded password fields belong directly to that user.
  Separate `Account`, `Credentials`, and `Profile` entities are not part of
  registration.
- Email is required, syntactically validated, and used as the only login
  identifier. Registration strips the defined boundary whitespace and stores a
  case-insensitive canonical value. Canonical emails are unique. Provider-specific
  transformations such as dot removal or `+tag` stripping are not applied.
- A username is required as a display/profile name and follows the
  [naming conventions](#naming-conventions). Usernames are not login identifiers.
- Usernames are unique across accounts, case-insensitively (#214). Two names
  conflict when they are equal after the naming normalization (NFC, trimming)
  plus Unicode default case folding, so `Gandalf`, `gandalf` and `GANDALF` are
  the same name, as are `Straße` and `STRASSE`. The stored username keeps the
  registrant's chosen spelling for display; uniqueness applies to the canonical
  form only. Visually confusable names across scripts (for example Latin `a`
  and Cyrillic `а`) are not treated as equal. A taken name returns `409` with
  `errors: [{"field":"username","code":"USERNAME_TAKEN"}]`; revealing that a
  public display name is taken is acceptable, unlike emails. A PostgreSQL unique
  index enforces this atomically under concurrent registrations.
- A small fixed list of reserved usernames is rejected in canonical form with
  `400` and `USERNAME_RESERVED`: `admin`, `administrator`, `moderator`,
  `support`, `system` and the app name (`MTG Commander Stats`,
  `mtg-commander-stats`, `mtgcommanderstats`). Only the whole name is reserved;
  `Admin Gandalf` remains available. The list lives in `ReservedUsernames`.
- Usernames cannot be changed after registration; profile editing remains
  post-MVP. A future rename feature must reuse the same uniqueness and reserved
  name rules.
- Equal account usernames can no longer occur. Existing UI disambiguation by
  shortened user IDs for identical names is therefore dormant for accounts; it
  is kept until quick profiles (#223) define how group-local names relate to
  account names, and removing it is a decision for the UI issues.
- Passwords require at least 12 characters (Unicode code points). Whitespace is
  allowed and counts toward that minimum. Passwords are validated and encoded
  exactly as supplied, without trimming, case conversion, or normalization.
  Whitespace-only passwords are invalid.
- Registration does not log the user in. Login is a separate, explicit request.

## Display text

The base `DisplayText` rule is shared by required human-readable labels.
[User-entered names](#naming-conventions) add stricter rules below. Commander
names are authoritative Scryfall snapshots. Leading and trailing product
boundary whitespace is removed before persistence; casing and all internal
whitespace are preserved. Null, missing, or blank-after-trimming values are
invalid.

Product boundary whitespace means Unicode `White_Space` plus Java whitespace
controls U+001C–U+001F. It includes NBSP (U+00A0), figure space (U+2007), narrow
NBSP (U+202F), and next line (U+0085). Zero-width space (U+200B) and BOM (U+FEFF)
are not whitespace under this rule. Email keeps its separate database-owned
canonicalization, and passwords remain validated and encoded exactly as supplied
without applying `DisplayText` trimming.

## Naming conventions

Usernames, deck names and playgroup names build on `DisplayText` with additional
server-enforced rules. Normalize to Unicode NFC, then trim the boundary whitespace
defined above; reject empty results. Preserve case and punctuation, including
markup-like `<` and `>` (output encoding remains responsible for XSS protection).
Characters use the PO-approved allowlist from #203:

- Letters (`L*`) and combining marks (`M*`) of all scripts.
- ASCII digits `0`–`9`.
- Punctuation (`P*`), including apostrophes, en/em dashes and typographic quotes.
- Currency symbols (`Sc`), such as `$` and `€`.
- Exactly the math characters `+ = < >`.
- Single U+0020 spaces between words.

Everything outside that allowlist is rejected. This includes other symbols
(`So`: `© ® ™ ♥ ♠ ★ ✓`), modifier symbols (`Sk`: circumflex and backtick),
other math symbols (`Sm`: `→ | ~ × ÷`), non-ASCII digits, letter numbers (`Nl`)
and other numbers (`No`: `² ½ Ⅻ ①`). Controls, format/private-use/unassigned
and surrogate code points, line/paragraph separators, other internal whitespace
and repeated spaces remain invalid. The existing emoji ban also remains in
force: reject `Extended_Pictographic` code points, emoji presentation selectors
U+FE0E/U+FE0F and regional indicators, even if their category is allowlisted.

After normalization, trimming and character validation, count extended grapheme
clusters: usernames allow at most **20**, deck and playgroup names at most **30**.
Also reject more than four times that maximum in code points (80/120) to bound
stacked combining marks. Store the canonical value without truncation.
`DisplayText` itself remains limit-free; Commander/Companion snapshots, emails,
passwords and invitation tokens keep their existing rules.

Registration and deck/group name validation return `400` ProblemDetail with a
human-readable `detail` plus an `errors` array of `field` and stable `code`.
Name errors use `NAME_BLANK`, `NAME_INVALID_CHARACTERS` or `NAME_TOO_LONG`;
length-limit errors include `maxLength`. Registration retains `USERNAME_BLANK`
for blank usernames and adds `INVALID_EMAIL`, `USERNAME_RESERVED`,
`PASSWORD_BLANK` and `PASSWORD_TOO_SHORT` for its existing reasons. It returns all failing fields
in email → username → password order and preserves the existing detail texts.
Deck/group name errors contain one entry with `field=name`. Malformed JSON keeps
its safe generic error; request parsing failures are distinct from field validation.
Rejected requests perform no partial writes.

V16 validates all existing names, including NFC and boundary trimming, using the
same Java Unicode rules and refuses nonconforming rows without rewriting data.
Reset nonconforming development/demo databases before retrying. PostgreSQL CHECK
constraints enforce only the generous 80/120 code-point bounds; full grapheme
and character validation belongs to the application. Prohibited-content
filtering remains a separate follow-up; username uniqueness is described under
[user identity and registration](#user-identity-and-registration).

## Explicitly out of scope

- Android application
- GameEvent system
- Commander damage tracking and life tracker
- Voice, camera, or audio recognition
- AI rules assistant
- DeckVersion
- ManaBox API integration, import and sync; optional external share links are
  supported in the owner deck editor, Meine Decks and authorized game details
- Fine-grained group permission system
- Broader placement statistics and ranking UI (follow-on Commander Chronicles issues)
- Monetization
- Deployment
