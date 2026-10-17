# Architecture v1

The application direction is:

```text
Browser → React/TypeScript SPA → REST/JSON → Spring Boot modular monolith → PostgreSQL
```

The backend implements user registration in the `user` feature, session
authentication in `security`, authenticated deck management in the `deck`
feature, play groups plus membership in the `group` feature, and Commander game
recording in the `game` feature, alongside development/test infrastructure.

## Backend organization

Use `io.github.gandalfthejunior.mtgcommanderstats` as the base package. Organize
code primarily by business feature as real features arrive. A feature may use:

- `api`: HTTP controllers, request/response DTOs, validation, and HTTP status
  mapping. Controllers are boundaries, not business-logic containers.
- `application`: use cases, orchestration, and server-side authorization based
  on ownership or membership. Application services normally define transaction
  boundaries and coordinate domain operations, repositories, or other features.
- `domain`: business concepts, state, and invariants. Business rules must not
  exist only in controllers or frontend validation.
- `persistence`: Spring Data JPA repositories and persistence-specific behavior.
  JPA entities must not be exposed as REST request/response DTOs.

Create packages only when code needs them. Avoid speculative interfaces,
ports/adapters, events, and generic `common` or `shared` dumping grounds.
Keep feature ownership clear: code belongs to its owning feature unless it is
genuinely cross-cutting infrastructure. Prefer a clear application-level
interaction over reaching into another feature's persistence implementation.
Introduce abstractions only for concrete problems, not to simulate loose coupling.

## Data and security

PostgreSQL is the database for local development and the production direction.
Flyway owns schema changes. Hibernate validates mappings; it does not create or
update the schema. The `users` table is introduced by the first Flyway migration
under `backend/src/main/resources/db/migration`. Do not rewrite merged migrations.
Create a new migration instead of changing production history; do not rely on
manually created local database state. Use database constraints where they provide
meaningful data-integrity protection rather than assuming application validation
alone is sufficient for invariants the database can safely enforce.

The `deck` feature follows the modular-monolith feature layers: its controller
maps REST DTOs, its application service derives and enforces ownership using the
authenticated `UserPrincipal` UUID, its domain owns display-text/color rules, and
its repository persists internal JPA entities. Flyway creates `decks` with a
foreign key to `users`, database nonblank checks, and a canonical constrained
WUBRG-string representation; REST exposes color identity as a canonical symbol
array. Persisted `ever_used` and `archived` flags govern the permanent lifecycle:
committed game use permanently locks commander/color identity; names remain
editable. Only unused decks may be physically deleted, and archival is explicit.
The owning API exposes both flags. See [Deck API](../product/decks-api.md).

The `group` feature uses the same feature layers. `play_groups` owns the stable
group UUID, DisplayText name, owner UUID, and unique join code;
`group_memberships` owns the stable membership UUID, group/user pair, role, and
active state. Database foreign keys, code uniqueness, unique group/user
membership, and a partial unique index for the active OWNER protect persistence
integrity. Deferred constraint triggers also require every persisted group to
have its designated owner as that active OWNER. Application transactions create
the group and OWNER membership atomically and prohibit OWNER departure,
preserving exactly one active OWNER through all supported operations.

Join codes are 128-bit values from `SecureRandom`, encoded as 22 URL-safe Base64
characters without padding. Creation and regeneration retry unique-code
collisions in isolated transactions so failed attempts leave no partial writes.
Join and regeneration take a pessimistic lock on the same group row. This
serializes the boundary: once regeneration commits, a request using the old code
cannot add or reactivate a membership. Ordinary group and member responses never
include codes; only active OWNER-authorized, non-cacheable responses expose them.
The group application layer uses the `user` feature's public-user directory to
resolve display usernames without exposing user persistence entities through the
API.

The `game` feature owns `games` and the `game_participants` element collection.
Group, creator, user and deck foreign keys, a participant primary key per game/user,
a composite deck/owner FK, and result/winner checks protect persisted references.
A deferred winner FK requires the winning user to participate at commit, while
allowing atomic creation, assignment replacement and hard deletion. The domain
validates 2–6 distinct players and WIN/DRAW consistency; the application validates
new assignments and permissions. Game identity fields are never updated.

`ManageGames` coordinates the group's `GameGroupAccess`, the deck's `GameDecks`,
and the public-user directory rather than other features' repositories. Game
writes and first-use updates share one transaction; usage is never derived from
remaining game references or reset. History resolves stored public display data,
including former users and archived decks. History listing fetches games and
participants together through a repository entity graph, then resolves all distinct
user and deck IDs in one call each to the existing application boundaries. It
maps every game using those shared public display maps, avoiding per-game queries
while retaining the existing ordering and group lock. Fresh deck display entities
are loaded with a read-only query hint so converted color identities do not cause
incidental dirty-checking writes; the locking deck mutation/usage queries remain
writable. See [Games API](../product/games-api.md).

`ReadGroupStatistics` in the game application layer derives group-scoped player
and deck counts from the same repository's participant-fetching history query.
It authorizes through `GameGroupAccess`, batches current public users and deck
display through the existing feature boundaries, and returns sorted statistics
DTOs with decimal HALF_UP percentages. There are no new tables, counters or
production dependencies. Empty history skips display lookups; nonempty history
uses five queries regardless of game count. See [Statistics API](../product/statistics-api.md).

Game operations (including statistics reads and deck selection) lock the group row before
checking current membership. Join, leave and code rotation use that same lock.
This deliberately serializes operations within a group, so committed departure
cannot be bypassed by an in-flight authorization check. Deck operations acquire
pessimistic write locks before checking lifecycle state; games acquire newly
assigned decks in stable UUID order after the group lock. Validation and usage
updates occur while holding those locks until commit. Concurrent commander
changes/deletion/archival therefore happen before validation or after permanent
usage, without stale writes clearing usage or bypassing immutability. Historical
unchanged assignments need no renewed eligibility check. Constraint/concurrency
conflicts are returned as controlled `409` problems. This coarse locking is a
conscious MVP tradeoff; no distributed locks or event infrastructure are added.

Required human-readable labels use the small cross-feature `DisplayText` value
rule. It trims only the product-defined boundary-whitespace set and preserves
casing and internal whitespace. Username, deck name, and commander reuse this
rule; email canonicalization and exact password handling remain separate.

Email canonicalization is owned by the Flyway-defined `canonical_email`
function: trim the product-defined boundary whitespace, apply PostgreSQL 18
`casefold` under explicit `pg_catalog.pg_unicode_fast`, then lowercase under the same
collation (including Cherokee). Registration and authentication reject null and
NUL-containing input before any database text operation, then call this function
through the user repository; the database CHECK uses that exact function too.
The email column uses deterministic `C` collation for exact canonical-key
uniqueness. This avoids divergent Java/database case mappings and needs no new
library. Jakarta Validation checks email syntax at the application boundary;
passwords and display usernames never use the email canonicalization function.
See [PostgreSQL's casefold documentation](https://www.postgresql.org/docs/18/functions-string.html).
Changes to Unicode mappings on database upgrades require reviewing existing
canonical keys and potential collisions before rewriting data.

See the [testing guide](../development/testing.md) for database integration
coverage and verification infrastructure.

The authentication direction and prohibition on custom cryptography, password
hashing, and session/authentication protocols are governed by
[ADR 0002](adr/0002-use-session-based-authentication.md). Authorization is separate
from authentication: knowing the current user is insufficient. Operations on
group, game, deck, or other user-owned data must enforce relevant ownership or
membership rules on the server; frontend restrictions are not security controls.
The security configuration permits anonymous `POST /api/users`, `GET /api/csrf`,
and `POST /api/session`; other requests require authentication. Only that exact
registration method/path is exempt from CSRF. Registration does not authenticate
or create a session. API failures use `401` for missing authentication and `403`
for access denial/CSRF failures, without form login, Basic auth, or redirects.

`UserAuthenticationDetails` loads the existing User through the repository's
canonicalization function and canonical-email lookup. `DaoAuthenticationProvider`
verifies the exact password with the configured encoder. `UserPrincipal` adapts
Spring's credential-erasing UserDetails to authenticate by canonical email while
carrying the existing User UUID and display username; it is not a new domain
entity. API DTOs expose only UUID and display username.

The JSON login controller invokes Spring's `AuthenticationManager`, then
`ChangeSessionIdAuthenticationStrategy` and `CsrfAuthenticationStrategy` before
explicitly saving the security context in `HttpSessionSecurityContextRepository`.
This preserves session-fixation protection and clears the pre-login CSRF token.
`GET /api/me` reads that principal. Logout runs behind authorization and CSRF
filters and delegates to `CsrfLogoutHandler` and `SecurityContextLogoutHandler`
to remove the token, clear the context, and invalidate the session.

CSRF uses `HttpSessionCsrfTokenRepository` and Spring's default masked token
handler. `GET /api/csrf` resolves the deferred token and returns `{headerName,
token}`, creating an anonymous session if needed. Clients retain the session
cookie, submit the returned token in the named header, and bootstrap again after
login or logout. Security responses are not cacheable. Session cookies retain
framework defaults (including HttpOnly); deployment-specific settings remain
externally configurable through Spring Boot's `server.servlet.session.*`
properties. No shared session store or additional persistence is introduced.

Unexpected registration and authentication service failures produce ERROR
application diagnostics with exception types and root-cause stack frames.
Exception messages, throwable rendering, and request values are excluded because
these may contain credentials, cookies, or CSRF tokens. Client 500 details remain
generic; expected validation, credential, and duplicate failures do not use these
application ERROR paths.

Passwords use Spring Security's versioned PBKDF2 encoder through a delegating
encoder, supporting long passphrases without bcrypt's 72-byte limit. The User
owns its UUID, canonical email, display username, and encoded password; API DTOs
expose only UUID and username. PostgreSQL enforces unique, nonempty canonical
emails plus a nonblank username, while allowing duplicate display usernames. The
application maps the named email uniqueness constraint to a conflict even under
concurrent registration. The V2 Flyway migration removes obsolete username
canonicalization/uniqueness and deliberately fails on pre-email user rows; local
development databases containing those rows must be reset rather than assigned
invented identities. Security-sensitive behavior requires coverage under the
testing guide.

## Decisions and source of truth

Repository code and documentation are the source of truth for project knowledge.
Keep them aligned as features are added. See
[ADR 0001](adr/0001-use-modular-monolith.md) for application architecture and code
organization, [ADR 0002](adr/0002-use-session-based-authentication.md) for the
authentication direction, and
[ADR 0003](adr/0003-defer-ui-framework-until-after-mvp.md) for the post-MVP
frontend UI strategy.
A separate, nonbinding post-MVP concept is captured in
[proposed ADR 0004](adr/0004-post-mvp-live-companion-direction.md), with its
[companion product sketch](../product/post-mvp-commander-companion.md).

## Browser group management

The authenticated [browser shell and routing](../development/frontend-routing.md)
mount `GroupManager` at `/playgroups` and `DeckManager` at `/decks`, one at a time.
Group/game management retains native in-view state and forms. Deck creation and
lifecycle actions use the dedicated MUI editor at `/decks/new` or
`/decks/:deckId/edit`, with scoped drafts, origin-aware return and navigation
protection described in the routing guide. GroupManager uses typed
operations in `frontend/src/api.ts` against the
[play groups API](../product/groups-api.md); unsafe operations reuse the existing
same-origin cookies and fresh CSRF bootstrap. Group responses are validated
before updating the UI. Failed CSRF preparation retains HTTP status information,
so a 401 follows the same session-expiration path as a business-request 401.
A 403 remains an access/CSRF error rather than asserting session expiration.

Protected browser state is scoped to each confirmed session lifetime, including
when the same user signs in again. A successful login invalidates callbacks from
the previous session before refreshing CSRF and confirming identity. Deck and
group components remount for the new session; late results from their previous
lifetime cannot update protected state or expire the new session. Group
details/code state is also scoped to the selected group's component lifetime.
Request cleanup aborts work and ignores late results after a route, group or
identity change. Closing/reopening or explicitly refreshing details fetches
active members again and discards any displayed invitation code. A 403 from a
group action triggers a safe details GET to distinguish active membership from
CSRF/authorization denial. Protected details/code are hidden during this check;
a successful check restores details and, for an OWNER, the previous code.
A details GET returning 403/404 confirms lost access, clears details/code and
reloads the active group list. A failed check leaves protected data hidden and
allows an explicit refresh without asserting membership loss. Only a
confirmed OWNER gets code controls and code requests; the server remains the
authorization boundary. MEMBER departure and code regeneration require visible
confirmation. Identity changes and session expiration unmount protected group
content. Browser logout advances the session version and unmounts both deck and
group content before CSRF preparation and DELETE. Only `204` confirms completion;
other statuses or network failures recheck `/api/me`. A valid identity remounts
Dashboard and fresh destination views, an absent identity exposes signed-out controls without a success
claim, and an unavailable check keeps protected content hidden until an explicit
session check or login. Recovery and initial identity checks also respect the
session version, so old results cannot restore retired state or invitation codes.
The shell uses React Router Declarative Mode; no real-time infrastructure is added.

## Browser game recording and deck lifecycle

`GameManager` is mounted inside confirmed group details for the current session
identity. It loads validated history DTOs in backend order. `GameEditor` constructs
only participants, result and winner; server identity fields and roles are never
submitted. The winner label and historical participant/deck displays come from
history responses, including archived decks and former members. Existing pairs
are offered explicitly as recorded assignments. New choices come from the group's
active-member list and read-only member deck-selection API, with independent
loading/empty/error feedback. Backend validation and authorization remain final.

The game area is scoped to the selected group within the route/session
lifetime. Refreshing/closing details, membership loss, route or identity changes unmount
it. AbortControllers and generation checks ignore late results and late 401s;
unsafe game requests pass the abort signal through CSRF bootstrap and check it
before sending the write. Refresh or recovery removes history, drafts and pending
confirmations before any replacement data is accepted. A denied/failed game
operation rechecks group access with the existing safe details GET. Protected
members/code are hidden during that check. Returning from Decks mounts fresh group
details and game choices; a retired check cannot restore its prior details/code.
A successful recovery
check restores confirmed group details, with an explicit game refresh to inspect
actual server state;
403/404 from the details check establishes lost access, 401 expires the session,
and an unavailable check keeps protected data hidden. Recovery does not retry
writes or loop on authorization failure.

Game writes use a pending guard and exact success statuses, with no optimistic
persisted history. Edits and deletion can be canceled without requests; destructive
confirmations identify the game and manage keyboard focus. Successful game changes
refresh history/statistics. Navigating to Decks reloads permanent usage from the
server; returning to Playgroups reloads details, history and eligible choices
after own-deck changes. My decks requires boolean lifecycle flags, shows archived state, preserves
immutable commander/color fields in full-update payloads, and offers explicit
confirmed archive for used decks. Failure/conflict states provide refresh without
asserting a mutation succeeded. No backend contract or schema is changed by
these browser controls.

## Browser group statistics

`GroupStatistics` is mounted within the selected group's ready `GameManager`
area, under confirmed group details and the current session lifetime. It calls
`getGroupStatistics` in `api.ts`, which validates status, public row fields, UUIDs,
unique IDs, positive safe-integer game counts, wins within games, and finite
percentages within 0–100. Only documented fields are retained. The component
renders two semantic HTML tables initially in backend order; it formats the
returned percentages without computing statistics from history or membership.
Each table has its own optional column/direction, held in `GameManager` above
its remounted ready content. Statistics refreshes and acknowledged game writes
therefore sort fresh arrays using the chosen settings. The existing keyed
selected-group/session lifecycle discards previous choices when the view retires.
Sorting copies arrays, compares raw numeric fields or English case-insensitive
text (`Intl.Collator` with accent sensitivity), and keeps backend order for ties
in both directions. Native heading buttons expose `aria-sort` on the active
column header and a visible arrow. No sort preference is stored or sent to the API.

Game refresh/recovery unmounts statistics, aborting its request. Successful game
writes refresh that same area; detail refresh/reopen, selected-group/session
changes and own-deck changes also remount it. Explicit statistics refresh clears
old tables and uses abort/generation guards to reject retired successes and
errors. Network, server and malformed-response failures show a local retry.
Statistics 401/403/404 responses delegate to the existing game/group recovery:
401 expires the current session; 403/404 hides protected details while a safe
group GET determines access. Confirmed membership permits explicit Refresh games
to reload both areas; failed checks keep them hidden. There are no client-side
statistics counters or new backend contracts.
