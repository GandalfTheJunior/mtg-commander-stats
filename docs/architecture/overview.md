# Architecture v1

The application direction is:

```text
Browser → React/TypeScript SPA → REST/JSON → Spring Boot modular monolith → PostgreSQL
```

The backend implements user registration in the `user` feature, session
authentication in `security`, authenticated deck management in the `deck`
feature, play groups plus membership in the `group` feature, and Commander game
recording in the `game` feature, alongside development/test infrastructure.

The backend `scryfall` feature provides authenticated Commander name lookup,
printing resolution, and artwork discovery through the fixed HTTPS Scryfall API.
Its application service owns bounded lookup caching and the fresh online
resolution boundary for later deck writes; its domain normalizes gameplay
identity, chosen-color capability, and artwork metadata. Existing saved deck,
history, and statistics reads remain independent of the external service. See
the [Scryfall API contract](../product/scryfall-api.md) for the staged integration.

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
An optional genuine MTG Companion snapshot lives in `deck_companions`, keyed by
`deck_id`; a constrained zero-or-one internal collection uses the same batched
subselect read pattern as Commanders. New Companion selections use fresh Scryfall
mechanics/current-legality validation plus a separately maintained Companion-only
restriction policy, and must fit the prospective effective Commander colors.
The same deck lock and permanent first-use flag protect Companion identity;
artwork remains independently editable, including after subsequent bans. Saved
reads and unchanged selections never revalidate provider rules. No game-level
Companion snapshot or statistics change is needed. See [Companion API](../product/decks-api.md#optional-mtg-companion).
Commander snapshots live in ordered `deck_commanders` slots keyed by deck/position,
with distinct Oracle gameplay identities and separately stored printing, gameplay
face selector and display artwork/attribution. The application resolves changed
selections online through `scryfall`, validates per-card pregame chosen colors and
derives canonical effective/deck WUBRG. A narrow metadata classifier validates standalone choices or two distinct
Commanders across all applicable pairing roles. Partner search uses the same
validator before deduplication/result limiting; reads use snapshotted pairing
metadata without provider calls. Reads require no provider calls;
name-only updates retain snapshots and lock the existing deck row. The owning API exposes both flags. See [Deck API](../product/decks-api.md).

The deck also stores an optional strictly validated ManaBox share URL. Updates
use the same owner-authorized deck lock and transaction; the server never accesses
the external link. Game detail GET and the authorized member-deck GET may display
valid saved links after checking requester and deck-owner current active membership
under the group lock. Other game DTO uses omit the link. Historical names and
saved links survive
membership loss, while former members' links are withheld from group reads.

The `group` feature uses the same feature layers. `play_groups` owns the stable
group UUID, PlaygroupName name, owner UUID;
`group_memberships` owns the stable membership UUID, group/user pair, role, and
active state. Database foreign keys, code uniqueness, unique group/user
membership, and a partial unique index for the active OWNER protect persistence
integrity. Deferred constraint triggers also require every persisted group to
have its designated owner as that active OWNER. Application transactions create
the group and OWNER membership atomically and prohibit OWNER departure,
preserving exactly one active OWNER through all supported operations.
Ownership transfer stores a stable request and original-requester outcome
acknowledgement in `ownership_transfers` (V12). The group lock serializes initiation, response and
withdrawal with membership/game operations. Acceptance flushes the prior OWNER's
demotion before promotion to respect the immediate unique index, then commits
the designated owner, roles and accepted outcome atomically under the existing
deferred triggers. A partial unique index permits only one pending transfer per
group. Unacknowledged accepted/declined outcomes are available only to the original
requester while active in the group. They survive session changes; GET never
acknowledges them. See the [group API](../product/groups-api.md#ownership-transfer)
for state, errors and future UI handoff.

Invitations use 128-bit `SecureRandom` tokens encoded as 22 URL-safe Base64
characters. Only SHA-256 verifiers are stored in `group_invitations`, with group,
issuer, creation/expiry timestamps and atomic consumption/consumer metadata.
V13 drops the legacy group code; deployment requires the coordinated
[cutover](../development/invitation-cutover.md). Group creation no longer generates
an admission token. Invitation creation and redemption take the same group-row
lock as membership, ownership and game operations. Redemption loads only the
bound group ID before locking, then checks fresh invitation state and current
membership. After flushing membership writes it conditionally consumes against
PostgreSQL wall-clock time; rollback retains the invitation and prior membership.
No invitation lock is acquired before the group lock. Hash collisions during
creation retry `ON CONFLICT DO NOTHING` without aborting the transaction.
Public preview is a single query exposing only the live invitation's group name.
No background expiry job or revocation mechanism is introduced for group invitations.

Profile invitations (V22) reuse the token generator and SHA-256 verifier but
expire after one hour. A partial unique index allows one open invitation per
profile; replacement and revocation serialize through the group lock. Acceptance
locks that group and then the profile's and account's decks in UUID order. A
deferrable deck-owner foreign key is deferred only by the claim transaction.
The deck and game application operations reassign their own data after a
same-game conflict check. The profile and membership
are removed; consumed invitation audit rows retain their hash and consumer but
lose the deleted profile reference.
The group application layer uses the `user` feature's public-user directory to
resolve display usernames without exposing user persistence entities through the
API.

The `game` feature owns `games` and the `game_participants` element collection.
Group, creator, user and deck foreign keys, a participant primary key per game/user,
a composite deck/owner FK, unique start seats and deferred complete-game checks
protect persisted references and mode-specific canonical facts. The domain
validates seats, 2–6 distinct players/decks and competition ranks for normal WIN,
alternate WIN and DRAW. Winner UUID and effective ranks/survival are derived as
documented in the [Games API](../product/games-api.md); only manual ranks and
mode-specific winner/survivor facts are persisted. The application validates new
assignments and permissions. Game identity fields are never updated. V8 refuses
any pre-upgrade game rows without modifying them; no historical facts are inferred.

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

`ReadGroupStatistics` in the game application layer derives group-scoped player,
deck, table-size-separated seat and saved Mana-color appearance counts from the
same repository's participant-fetching history query.
It authorizes through `GameGroupAccess`, batches current public users and deck
display through the existing feature boundaries, and returns sorted statistics
DTOs with decimal HALF_UP percentages and null for zero observations. The optional
`playerCount` filter applies to all four datasets. There are no new tables, counters or
production dependencies. Empty history skips display lookups; nonempty history
uses seven queries regardless of game count (including the batched optional Companion snapshots). See [Statistics API](../product/statistics-api.md).

Game operations (including statistics reads and deck selection) lock the group row before
checking current membership. Join, leave, role changes, member removal, and
single-use invitation creation and redemption use that same lock.
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
casing and internal whitespace. Field-specific `Username`, `DeckName` and
`PlaygroupName` records apply the [naming conventions](../product/mvp-scope.md#naming-conventions)
on top: NFC, character validation and bounded extended grapheme clusters. Java 25
provides Unicode categories, pictographic properties and regex `\X` segmentation; no extra
Unicode dependency is needed. V16 is a Java Flyway migration under
`src/main/java/db/migration`, sharing those validation rules and refusing
noncanonical or invalid existing rows. Only generous code-point bounds are added
as database CHECK constraints. Email canonicalization and exact password handling
remain separate.

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
Login then starts the authenticated session lifetime (see below).
`GET /api/me` reads that principal. Logout runs behind authorization and CSRF
filters and delegates to `CsrfLogoutHandler` and `SecurityContextLogoutHandler`
to remove the token, clear the context, and invalidate the session.

CSRF uses `HttpSessionCsrfTokenRepository` and Spring's default masked token
handler. `GET /api/csrf` resolves the deferred token and returns `{headerName,
token}`, creating an anonymous session if needed. Clients retain the session
cookie, submit the returned token in the named header, and bootstrap again after
login or logout. Security responses are not cacheable.

**Persistent browser sessions (#303).** Servlet sessions are stored durably in the application's PostgreSQL database
through Spring Boot's Spring Session JDBC integration, replacing the earlier
in-memory, process-local Tomcat sessions. The authenticated security context,
the CSRF token and session metadata therefore survive browser closes and backend
restarts while the database and site origin are preserved. Flyway migration V27
creates the official Spring Session tables in the dedicated `session_store`
schema, separate from application data in `public` (demo seeding and data-only
exports ignore it); Spring Session's own schema initializer is disabled.
Attributes use Spring Session's Java serialization; an unreadable attribute
(corruption or an incompatible class after an upgrade) reads as absent, and no
principal-name index is stored.

`AuthenticatedSessionLifetime` owns the server-side policy. A successful password
login records the server time of that login in the session and sets a 7-day
max-inactive interval. A filter in the Spring Security chain, after CSRF
validation and before the deferred security context is resolved, runs on every
request with a session: it invalidates the session at or after 30 days since that
login, and caps the idle interval by the remaining absolute lifetime so stored
expiry times never exceed it. Authenticated state with a missing or unreadable
login timestamp or security context is invalidated (fail closed). Spring Session
enforces the sliding idle limit on every read, independently of its periodic
cleanup job (default: every minute, deleting rows by the indexed `expiry_time`).
Ordinary requests and CSRF bootstrap renew only the idle deadline; only another
password login starts a new 30-day lifetime, for that browser session alone.
Anonymous CSRF-bootstrap sessions keep a 30-minute idle timeout. An invalid
session yields an anonymous request (`401` for protected APIs); a session-store
failure propagates as a server error rather than a `401`/`403` or a confirmed logout.

The `SESSION` cookie holds only the opaque session ID. It is persistent
(`Max-Age` 30 days, set when the session ID changes at login), host-only,
`Path=/`, `HttpOnly` and `SameSite=Lax`. `Secure` follows `request.isSecure()`;
forwarded headers are not trusted, so HTTPS-fronted deployments set
`server.servlet.session.cookie.secure=true` (Codespaces does so via its
devcontainer environment). Other deployment settings remain configurable through
Spring Boot's `server.servlet.session.*` and `spring.session.*` properties. The
session store is the same database; no additional infrastructure is introduced.

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
emails plus a nonblank username. The application maps the named email uniqueness
constraint to a conflict even under concurrent registration. The V2 Flyway
migration removes obsolete username canonicalization/uniqueness and deliberately
fails on pre-email user rows; local development databases containing those rows
must be reset rather than assigned invented identities.

V18 makes usernames case-insensitively unique while keeping the stored display
spelling. Like `canonical_email`, the PostgreSQL function `canonical_username`
owns the canonical form (`casefold` under `pg_unicode_fast`, then `lower` and
NFC), and the unique expression index `users_username_canonical_key` enforces it.
Registration asks the database for the canonical form to check reserved names,
so Java and PostgreSQL cannot disagree, and maps a violation of that index to a
field-specific `409`. V18 refuses to run on case-insensitively duplicate
development data without renaming or exposing it. V20 (#223) subsequently
recreates `users_username_canonical_key` with `WHERE kind = 'ACCOUNT'`, so
case-insensitive account username uniqueness is global but does not constrain
quick-profile names. The V20 `users_quick_profile_name_key` instead uses
`canonical_username` to enforce per-group uniqueness among non-deleted quick
profiles. Security-sensitive behavior requires coverage under the testing guide.

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
mount `GroupManager` at `/playgroups`, a route-keyed `GroupPage` for
Overview, Games, Statistics and Members, and `DeckManager` at `/decks`.
Opening `/playgroups/:groupId` starts at Overview; every group route
reverifies membership. The Overview reads its fixed win-rate spotlight and
three recent compact game previews. Games uses the shared compact cards for
cursor-paginated history. Dedicated Spieldetails routes freshly verify group
and game; focused `GameEditorPage` routes at
`/playgroups/:groupId/games/new` and
`/playgroups/:groupId/games/:gameId/edit` host the guarded editor. Dirty
drafts remain intact when a navigation exit is rejected, but are not cached
across completed route changes. Confirmed saves replace the editor URL with
Games. A 400 validation error or non-403 unacknowledged write retains the draft;
a write 403 hides it and requires a fresh permission check. The #196
success handoff returns to Games with a one-use repeat-match option. See the routing
guide for detailed editor guards, detail recovery and deletion lifetimes. Deck
creation and lifecycle actions use the dedicated MUI editor at `/decks/new`
or `/decks/:deckId/edit`, with scoped drafts, origin-aware return and
navigation protection described in the routing guide. GroupManager uses typed
operations in `frontend/src/api.ts` against the
[play groups API](../product/groups-api.md); unsafe operations reuse the existing
same-origin cookies and fresh CSRF bootstrap. Group responses are validated
before updating the UI. Failed CSRF preparation retains HTTP status information,
so a 401 follows the same session-expiration path as a business-request 401.
A 403 remains an access/CSRF error rather than asserting session expiration.

The #190 route foundation retired the legacy OWNER code-management screen,
manual join form and reusable-code navigation. The merged #200 invitation UI
(PR #302) now provides single-use creation/sharing, public name-only preview
at `/invite/:code`, explicit authenticated join, and login/registration
return to that invitation. The supported `joinGroup()` client calls
`POST /api/groups/join`; only the legacy `getJoinCode()` helper and
reusable-code controls were removed. Implementation alone does not verify
production release readiness: the coordinated
[invitation cutover](../development/invitation-cutover.md) still requires
joint deployment and operational checks.

Protected browser state is scoped to each confirmed session lifetime, including
when the same user signs in again. A successful login invalidates callbacks from
the previous session before refreshing CSRF and confirming identity. Deck and
group routes remount for the new session; late results from their previous
lifetime cannot update protected state or expire the new session. Each group
tab, Overview and detail route loads fresh authorization-bound details. Request
cleanup aborts work and ignores late results after route, group or identity
changes. An unavailable group read leaves protected content hidden and offers
retry; confirmed group 403/404 loss clears private details and returns to
`/playgroups` with an explicit access-loss notice. A MEMBER's leave action
requires confirmation; exact `204` acknowledges departure, while ambiguous
outcomes recheck membership without repeating DELETE or claiming success.
Backend authorization remains authoritative. Identity changes and session
expiration unmount protected content. Browser logout advances the session
version and unmounts protected views before CSRF preparation and DELETE;
only `204` confirms logout. Other statuses or network failures recheck
`/api/me`. A valid identity remounts Dashboard and fresh destination views;
an absent identity exposes signed-out controls, while an unavailable check
keeps protected content hidden until explicit recovery. Session epochs fence
old callbacks during recovery. The shell uses React Router Declarative Mode;
no real-time infrastructure is added.

## Browser game recording and deck lifecycle

`GameManager` mounts only for the authorized Games group route and consumes
validated compact history previews in server-owned date-first order
from the bounded history endpoint. Games appends cursor pages of at most 20
entries when its bottom sentinel enters view, preserves loaded cards on
recoverable page errors, and retires requests with the route/group/session
lifetime. The Overview independently reads its three recent games using the
same preview parser and `CompactGameCard`, plus `getGroupStatistics` for its
win-rate spotlight without mounting `GroupStatistics`. Previews display
public saved winner/participant/deck information; dedicated details fetch the
full game. Focused `GameEditorPage` separately checks group access and, on
edits, the saved game and edit permission before mounting `GameEditor`.
The editor submits participant/deck assignments with contiguous `startPosition`
values, mode-specific `placement`, `winner` or `stillInGame` fields,
`result`, `alternateWinCon` and `playedOn`. Server-owned game identity, group, creator,
recording time, and membership roles are not writable payload fields.
The [#196 focused browser editor](../product/games-api.md#browser-game-editor)
supports winner-only WIN, explicit partial-placement confirmation, and the
saved `playedOn` date (including an unknown date on older games); it does not
infer unknown opponent ranks.
The complete game-detail and editor records preserve historical assignments,
including archived decks and former members. Existing pairs may be retained
explicitly as recorded; new choices come from the group's active-member list
and read-only member deck-selection API, with independent loading/empty/error
feedback. Backend validation and authorization remain final.

The Games route and its paginated history are scoped to a confirmed
group/session lifetime. Changing even to another tab of the same group remounts
`GroupPage` and retires `GameManager` and its pending history pages; the
focused editor has its own guarded route lifetime. Statistics filter and
report-sorting preferences belong to a separate in-memory group/session scope
rather than `GameManager`; they survive navigation within that group but
are discarded on leaving its routes, session change or reload.
AbortControllers, generation checks and session epochs ignore late responses,
including obsolete 401s; unsafe game requests pass an abort signal through
CSRF bootstrap and check it before a write. Explicit Games refresh rechecks
group access and retires previous history requests without storing cross-route
editor drafts. Statistics routes load their own data independently. A 400 validation error retains the editor's input, and
non-403 unacknowledged writes retain the draft with a warning to inspect the
server history before retrying. **A write 403 hides the editor and its draft**
while safely rechecking group permission. Even when membership is confirmed,
the editor remains in an error state and Retry loads a fresh form rather than
restoring the old draft. Confirmed group 403/404 loss retires protected content;
a 401 expires the session, and unavailable verification keeps private data
hidden. Neither recovery nor navigation repeats writes automatically.

Game writes use a pending guard and exact success statuses, with no optimistic
persisted history. Edits and detail-screen deletion can be canceled without
requests; destructive confirmations identify the game and manage keyboard focus.
Acknowledged saves and deletes replace the focused editor/detail route with
Games, which reloads its initial compact history page; a successful save may
show a one-use in-memory success/repeat panel above the history (#196).
Statistics refetches server data on its next route visit. Navigating to Decks reloads permanent
usage from the server; returning to Playgroups reloads group details, recent
games and eligible choices after own-deck changes. My decks requires boolean lifecycle flags, shows archived state, preserves
Commander snapshots in read DTOs and omits unchanged Commanders from name-only write payloads, and offers explicit
confirmed archive for used decks. Failure/conflict states provide refresh without
asserting a mutation succeeded. The controls consume the [Deck API](../product/decks-api.md);
game assignments continue referencing stable deck IDs.

## Browser group statistics
The route-keyed Statistics tab now hosts the [#197 statistics
experience](../development/frontend-routing.md#group-statistics-197),
independently of `GameManager` and Games history reads. `StatisticsLanding`
fetches unfiltered group statistics for three fixed linked teasers: players by
games played, decks by exact win rate, and starting seats for the most-observed
table size. The separate playgroup Overview also fetches player win-rate
spotlight data directly, without mounting the Statistics screens.
`StatisticsChooser` shows report categories without an API request, while
`StatisticsReportPage` hosts focused player, deck, starting-seat and Mana-color
reports at `/playgroups/:groupId/statistics/reports/{players,decks,starting-seats,mana-colors}`.

The abortable `useGroupStatistics` reader validates the [statistics API](../product/statistics-api.md)
response using `api.ts`; only server-supplied public rows, counts and rates
are displayed, without deriving statistics from raw game history.
Each focused report offers a shared Spielerzahl filter (Alle, 2–6);
player and deck reports show sortable semantic tables with header-cell
`aria-sort` on desktop or responsive cards with labeled sorting controls on
phones. Starting-seat and compact Mana-color reports do not offer sorting.
Full identifier disclosure is limited to ambiguous visible names. Teaser and
report ordering use deterministic count/rate/name/UUID tie-breaks; exact rate
comparisons use integer arithmetic rather than rounded display percentages.

Filter and player/deck sorting preferences live in `statisticsState.ts`,
not `GameManager` or URL/storage. They survive route navigation **within the
same group** during the current session, but reset when leaving the group's
routes, changing identity or reloading the app. Teaser/Overview entry resets
the player-count filter without discarding the separate sort choices; the
chooser's expanded sections use validated per-history-entry state. Entering a
report fetches fresh server statistics for its group and filter; changed
filters and retries retire stale requests. There is no manual statistics refresh
and no cross-route `GroupStatistics` cache. Access-denial responses are delegated
to the group's authorization boundary (401 expires the session, 403/404
retires protected content). Other failures show a local retry without losing
the group's authorization. Acknowledged game changes return to Games; a later
Statistics visit fetches current server data. All report displays keep the
API's distinction between unobserved/null rates and measured zero percent.
