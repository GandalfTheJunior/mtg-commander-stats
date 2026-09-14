# MVP scope

This document records the agreed product target. Backend user registration and
session authentication are implemented; later milestone features remain planned.

## Product milestone

Four real Commander players can create accounts, log in, manage their profiles,
create their decks, join and use the same play group, record games with players
and decks, store results, and view basic player/deck statistics.

## Games

- Free-for-all Commander only, with 2–6 registered players.
- Only active members of the play group may participate.
- Each participant uses one of their own decks.
- The result is either WIN with exactly one winner or DRAW with no winner.
- Placements and rankings are out of scope.
- A group member creates the game. Its creator may modify or delete it while
  they remain an active member. The group OWNER may modify or delete games in
  that group.
- Games are hard-deleted. There is no GameEvent/event system in the MVP.

## Play groups and membership

- Users may belong to multiple groups and create multiple groups.
- Joining uses a join code.
- Roles are OWNER and MEMBER. Each group has exactly one OWNER, who is also a
  group member.
- The OWNER cannot leave the group. Ownership transfer is out of scope.
- Leaving must preserve historical membership, game, and statistics data.
- Former members lose access that requires active membership.
- Fine-grained permissions and additional roles are out of scope.

## Decks

- Decks belong to users. Data is entered manually and includes at least the deck
  name, commander, and color identity.
- No decklist, Scryfall integration, ManaBox integration, or DeckVersion.
- The deck name remains editable.
- Commander and color identity may change until the deck is first used in a
  recorded game; they become immutable after first use.
- Used decks are archived rather than physically deleted.
- Archived decks remain visible in historical games and statistics but cannot
  be selected for new games.

## Statistics

The first statistics milestone includes games, wins, and win rate per player
within a group, and games, wins, and win rate per deck within a group. Advanced
statistics are deferred.

## Authentication

Authentication is part of the learning scope. The web MVP uses Spring Security,
established password hashing/security mechanisms, and server-side sessions.
Do not implement custom cryptography. JWT, OIDC, and mobile authentication are
outside this MVP.

- Registered users log in with username/password through `POST /api/session`.
  Login uses the same database-owned username canonicalization as registration
  and verifies the password exactly as supplied. Invalid credentials receive a
  generic `401`, regardless of whether the username exists.
- The authenticated principal carries the existing `User` UUID and canonical
  username. Later business features obtain the actor from that principal.
- `GET /api/me` restores that identity from a valid session, or returns `401`.
- `GET /api/csrf` is available anonymously and while authenticated. Clients use
  its token and header name for login and other unsafe requests, including
  `DELETE /api/session`. Refresh the CSRF token after successful login.
- Logout requires authentication and CSRF protection, returns `204`, and
  invalidates the session. Protected anonymous requests receive `401`; forbidden
  operations and invalid/missing CSRF protection receive `403`.

## User identity and registration

- The registered `User`, identified by a stable UUID, is the application identity
  that later profiles, decks, memberships, games, and statistics reference.
- MVP username and encoded password credentials belong directly to that user.
  Separate `Account`, `Credentials`, and `Profile` entities are not part of
  registration. E-mail is not required or stored.
- A username is required, stripped of leading/trailing whitespace, and stored in
  lowercase. Usernames are case-insensitive and unique; no additional format
  restrictions are imposed. Case-insensitive equivalence uses Unicode Default
  Caseless Matching (full case folding), with the folded result stored in
  lowercase. Thus `Σ`, `σ`, and `ς` share `σ`, and `Straße` and `STRASSE` share
  `strasse`. This is locale-independent; accents and internal whitespace remain
  significant. No additional Unicode normalization is applied.
- For username boundaries and whitespace-only password validation, whitespace
  means Unicode `White_Space` plus the Java whitespace controls U+001C–U+001F.
  This includes NBSP (U+00A0), figure space (U+2007), narrow NBSP (U+202F), and
  next line (U+0085). Internal username whitespace is preserved. Zero-width space
  (U+200B) and BOM (U+FEFF) are not whitespace under this definition.
- Passwords require at least 12 characters (Unicode code points). Whitespace is
  allowed and counts toward that minimum. Passwords are validated and encoded
  exactly as supplied, without trimming, case conversion, or normalization.
  Whitespace-only passwords are invalid.
- Registration does not log the user in. Login is a separate, explicit request.

## Explicitly out of scope

- Android application
- GameEvent system
- Commander damage tracking and life tracker
- Voice, camera, or audio recognition
- AI rules assistant
- DeckVersion
- Scryfall and ManaBox integrations
- Fine-grained group permission system
- Placements and rankings
- Monetization
- Deployment
