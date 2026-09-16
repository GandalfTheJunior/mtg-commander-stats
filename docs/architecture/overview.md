# Architecture v1

The application direction is:

```text
Browser → React/TypeScript SPA → REST/JSON → Spring Boot modular monolith → PostgreSQL
```

The backend implements user registration in the `user` feature, session
authentication in `security`, and authenticated deck management in the `deck`
feature, alongside development/test infrastructure.

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
array. This slice physically deletes decks because no game can reference them yet.
The documented game-dependent immutability and archival lifecycle remains deferred
until game usage exists.

Required human-readable labels use the small cross-feature `DisplayText` value
rule. It trims only the product-defined boundary-whitespace set and preserves
casing and internal whitespace. Username, deck name, and commander reuse this
rule; email canonicalization and exact password handling remain separate.

Email canonicalization is owned by the Flyway-defined `canonical_email`
function: trim the product-defined boundary whitespace, apply PostgreSQL 18
`casefold` under explicit `pg_catalog.pg_unicode_fast`, then lowercase under the same
collation (including Cherokee). Registration and authentication call this function
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
organization, and [ADR 0002](adr/0002-use-session-based-authentication.md) for the
authentication direction.
