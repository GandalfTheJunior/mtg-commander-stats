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

- Free-for-all Commander only, with 2–6 distinct players. Participants may be
  registered accounts or credential-less quick profiles belonging to the group;
  only authenticated account members may create or manage games.
- New participant/deck assignments require active membership and an owned,
  unarchived deck. Edits may retain unchanged historical assignments after a
  member leaves or a deck is archived.
- Each participant uses one of their own decks.
- The result is either WIN with exactly one winner or DRAW with no winner.
- The original MVP deferred placements; the approved #116 backend extension now
  records explicit start seats, competition ranks, alternate victories and DRAW
  survival under the [Games API](games-api.md). The implemented #196 focused
  browser editor supports winner-only and complete WIN outcomes, partial-result
  confirmation, drawn-game survival and `playedOn` dates; #195 details display
  unknown historical ranks without inferring missing positions (see the
  [Games API browser handoff](games-api.md#browser-integration-handoff-196-195)).
- An active group member creates the game and need not participate. Its creator
  may modify or delete it while they remain active. An active group OWNER or
  ADMIN may modify or delete games in that group.
- Games are hard-deleted. There is no GameEvent/event system in the MVP.

Backend contracts and history/display rules are documented in the
[Commander games API](games-api.md). Game identity, creator, group, and recording
time remain fixed on edits. Active members can read history. The selected group's
browser game area supports recording, editing with explicit historical assignment
preservation, and confirmed deletion. Actions are available to the active creator, OWNER or ADMIN; server
authorization remains authoritative.

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

### Quick profiles

Quick profiles (#223) let a group track games with friends who have no account.
The backend contract is documented in the [group API](groups-api.md#quick-profiles);
UI work is separate (#196, #198, #199, #201).

- A quick profile is a credential-less placeholder member: a `users` row of kind
  `QUICK_PROFILE` without email or password. It can never log in, act, hold an
  elevated role, receive an ownership transfer, leave, issue invitations or
  create games. The database enforces these rules.
- It belongs to exactly one playgroup (its home group) as an active `MEMBER` and
  never appears outside that group. Profiles in several groups are not supported.
- Any active member of the group may create a profile, rename it and manage its
  decks under the unchanged deck lifecycle. Only OWNER/ADMINs may delete it.
- The server generates the initial name as `<adjective> <creature type>`, for
  example `Hairy Zombie`, from curated word lists in
  `backend/src/main/resources/quick-profile-names/`. Generated names have at most
  17 graphemes; after repeated collisions the smallest free numeric suffix is
  appended (`Hairy Zombie 2`). Stored names never change when the lists change.
- Renaming accepts free text under the [naming conventions](#naming-conventions).
  Names must only be real names with the person's consent (a UI hint, not a
  server rule). Names are unique case-insensitively among the group's
  non-deleted profiles (`409 QUICK_PROFILE_NAME_TAKEN`); account usernames and
  quick-profile names do not conflict in either direction.
- Quick profiles are full participants in games and statistics.
- Deleting a profile without games removes it and its decks. Deleting a profile
  with games anonymizes it: the name is replaced by a fixed placeholder and not
  retained, the membership is deactivated, the decks are archived, and history
  and other players' statistics stay intact. Clients show a localized label
  (German: "Gelöschtes Profil") with a stable per-group `deletedNumber` suffix.
- An active OWNER/ADMIN can issue a one-hour, single-use profile invitation.
  After authenticating and explicitly accepting it, an account receives the
  profile's decks, game participations and group membership atomically. A shared
  game between account and profile blocks the claim until corrected. See the
  [profile invitation API](groups-api.md#profile-invitations-and-claiming).
  The accept UI, QR rendering, audit retention periods and legal basis for data
  about people without accounts are separate follow-up topics.

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
  There is no manual color override. The editor shows the identity as read-only
  mana symbols and supplies a separate required W/U/B/R/G picker per Commander when
  appropriate.
- Optional public ManaBox deck share links can be stored by owners. Active group
  readers see them in game details, including archived decks, or in the authorized
  unarchived member-deck list while the deck owner is currently active in that
  group. This is external linking only; no
  ManaBox API, import, sync, hosted decklist or DeckVersion. See [Deck API](decks-api.md)
  for snapshot fields, strict write contracts and disposable local data migration.
  Owners edit links in the existing deck editor and open them from Meine Decks;
  Dashboard intentionally has no ManaBox action. Authorized game details show
  each available participant link as a separate external action in a new tab.
- Browser deletion and archival each require their own confirmation. Canceling
  does not change the deck; the UI updates only after the server acknowledges
  success. See [#201](frontend-redesign.md#personal-decks-collection-and-deck-editor-201)
  for which actions the editor menu offers.
- The deck name, ManaBox link and selected artwork remain editable, including after use or
  archival. On Meine Decks each saved Commander/Companion image opens its own
  immediate-save gallery; in the editor, artwork choices are part of the draft and
  saved atomically with the deck. Selecting front/back artwork never changes the
  gameplay Commander.
- Commander and color identity may change until the deck is first used in a
  recorded game; they become immutable after first use, including any pregame chosen color.
- Decks remain used forever after their first committed game, even if all games
  referencing them are edited or deleted. Failed writes leave usage unchanged.
- Used-deck DELETE returns a conflict; owners explicitly archive them instead.
  The browser offers an Archive action with confirmation, visibly locks used-deck
  format, Commanders, colors and Companion, and supports renaming archived decks
  without unarchiving. Unused decks can be archived or deleted; unused archived
  decks can still be deleted.
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
The [#197 browser statistics experience](../development/frontend-routing.md#group-statistics-197)
opens with three fixed, unfiltered, linked teaser cards for player win rates,
deck win rates and starting-seat performance. **Alle Statistiken anzeigen**
opens a request-free category chooser. Four focused reports cover players,
decks, starting seats and Mana colors. A shared Spielerzahl control
(Alle, 2–6) filters each report. Player and deck reports show responsive
row cards on phones and sortable semantic tables on desktop, with separate
per-report column/direction choices; starting-seat and Mana-color reports
show fixed-order lists without sorting. The statistics landing, chooser and
reports retain the group heading, tabs and independently verified membership.

Report sorts and the shared table-size filter are temporary in-memory
presentation choices. They survive navigating between views of the **same
group**, but not leaving the group, switching sessions or reloading. Teaser
and Overview navigation reset only the filter. Neither the filter nor sort
choices are transmitted as persistent preferences; only the selected
`playerCount` filter changes the statistics API query. Each route entry
fetches fresh server aggregates where required, with local loading/error/retry
feedback and private-data retirement on access denial. Full identifiers are
disclosed only for visible ambiguous names. Exact ratio comparisons,
deterministic ties and server-provided game/win/rate numbers are retained;
unobserved rates remain distinct from measured 0%. No raw-game aggregation
or date filter is added. Broader placement analytics and configurable
dashboards remain deferred.

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
- Registered users stay signed in by default (no "Remember me" option) across
  page reloads, normal browser closes/reopens and backend restarts, as long as the
  browser keeps the cookie and the site origin and database are unchanged (#303).
  An authenticated session expires after 7 days without activity, and in any case
  30 days after the password login that created it. Activity renews only the
  7-day window; only another password login starts a new 30-day lifetime, and
  only for that browser. Both limits are enforced by the server.
- Logout requires authentication and CSRF protection, returns `204`, and
  invalidates the session, including its stored record; other separately signed-in
  devices stay signed in. Protected anonymous requests receive `401`; forbidden
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
- Equal account usernames can no longer occur. Quick profiles (#223) are
  excluded from this global uniqueness, so an account and a quick profile can
  share a display name. Existing UI disambiguation by shortened user IDs for
  identical names therefore remains relevant; responses mark quick profiles with
  `quickProfile: true`, and identical names are ordered by user UUID.
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
