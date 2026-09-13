# MVP scope

This document records the agreed product target. Backend user registration is
implemented; later milestone features remain planned.

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

## User identity and registration

- The registered `User`, identified by a stable UUID, is the application identity
  that later profiles, decks, memberships, games, and statistics reference.
- MVP username and encoded password credentials belong directly to that user.
  Separate `Account`, `Credentials`, and `Profile` entities are not part of
  registration. E-mail is not required or stored.
- A username is required, stripped of leading/trailing whitespace, and stored in
  lowercase. Usernames are case-insensitive and unique; no additional format
  restrictions are imposed.
- Passwords require at least 12 characters (Unicode code points). Whitespace is
  allowed and counts toward that minimum. Passwords are validated and encoded
  exactly as supplied, without trimming, case conversion, or normalization.
  Whitespace-only passwords are invalid.
- Registration does not log the user in. Login and other authentication flows
  remain separate work.

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
