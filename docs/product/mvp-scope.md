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
- Placements and rankings are out of scope.
- An active group member creates the game and need not participate. Its creator may modify or delete it while
  they remain an active member. The group OWNER may modify or delete games in
  that group.
- Games are hard-deleted. There is no GameEvent/event system in the MVP.

Backend contracts and history/display rules are documented in the
[Commander games API](games-api.md). Game identity, creator, group, and recording
time remain fixed on edits. Active members can read history. The selected group's
browser game area supports recording, editing with explicit historical assignment
preservation, and confirmed deletion. Actions appear only for the active creator
or OWNER; server authorization remains authoritative.

## Play groups and membership

- Users may belong to multiple groups and create multiple groups.
- Joining uses a join code.
- Join codes remain valid until the OWNER regenerates them. Only the OWNER may
  retrieve or regenerate the current code, and regeneration immediately
  invalidates the previous code.
- Roles are OWNER and MEMBER. Each group has exactly one OWNER, who is also a
  group member.
- The OWNER cannot leave the group. Ownership transfer is out of scope.
- Leaving must preserve historical membership, game, and statistics data.
- A former member may rejoin with the current code. Rejoining reactivates the
  existing stable membership as MEMBER rather than creating a duplicate.
- Former members lose access that requires active membership.
- Fine-grained permissions and additional roles are out of scope.

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
- Deck names use the shared `DisplayText` rule and need not be unique. Commander
  identities, names and base colors are authoritatively resolved online through
  [Scryfall](scryfall-api.md); saved snapshots need no provider access.
- Color identity is the backend-derived WUBRG union of the selected Commanders'
  base colors and each required single pregame chosen color. Empty means colorless.
  There is no manual color override. The editor retains read-only WUBRG controls
  and supplies a separate required W/U/B/R/G picker when appropriate.
- No decklist, ManaBox integration, or DeckVersion. See [Deck API](decks-api.md)
  for snapshot fields, strict write contracts and disposable local data migration.
- Browser deletion requires a confirmation naming the selected unused deck.
  Canceling does not change the deck; confirmed deletion updates the UI only
  after the server acknowledges success.
- The deck name remains editable.
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
and group/session access recovery keep retired rows hidden. Advanced statistics
remain deferred.

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
- A username is required as a display/profile name and uses the shared
  `DisplayText` rule. Usernames are not login identifiers and are not unique.
- Passwords require at least 12 characters (Unicode code points). Whitespace is
  allowed and counts toward that minimum. Passwords are validated and encoded
  exactly as supplied, without trimming, case conversion, or normalization.
  Whitespace-only passwords are invalid.
- Registration does not log the user in. Login is a separate, explicit request.

## Display text

Required user-entered labels such as display usernames and deck names share the
`DisplayText` rule. Commander names are authoritative Scryfall snapshots. Leading and trailing product
boundary whitespace is removed before persistence; casing and all internal
whitespace are preserved. Null, missing, or blank-after-trimming values are
invalid.

Product boundary whitespace means Unicode `White_Space` plus Java whitespace
controls U+001C–U+001F. It includes NBSP (U+00A0), figure space (U+2007), narrow
NBSP (U+202F), and next line (U+0085). Zero-width space (U+200B) and BOM (U+FEFF)
are not whitespace under this rule. Email keeps its separate database-owned
canonicalization, and passwords remain validated and encoded exactly as supplied
without applying `DisplayText` trimming.

## Explicitly out of scope

- Android application
- GameEvent system
- Commander damage tracking and life tracker
- Voice, camera, or audio recognition
- AI rules assistant
- DeckVersion
- ManaBox integration; Scryfall-backed deck writes and UI remain deferred to
  the follow-up issues after the #100 lookup foundation
- Fine-grained group permission system
- Placements and rankings
- Monetization
- Deployment
