# Architecture v1

The application direction is:

```text
Browser → React/TypeScript SPA → REST/JSON → Spring Boot modular monolith → PostgreSQL
```

The backend implements user registration in the `user` feature, alongside the
application skeleton and development/test infrastructure. Login and other
authentication flows remain unimplemented.

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

Username canonicalization is owned by the Flyway-defined `canonical_username`
function: trim the product-defined boundary whitespace, apply PostgreSQL 18
`casefold` under explicit `pg_catalog.pg_unicode_fast`, then lowercase under the same
collation (including Cherokee). The registration service calls this function
through the user repository; the database CHECK uses that exact function too.
The username column uses deterministic `C` collation for exact canonical-key
uniqueness. This avoids divergent Java/database case mappings and needs no new
library. The domain retains input validation; passwords never use this function.
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
The security configuration permits anonymous `POST /api/users` and requires
authentication for other requests. Only that exact registration method/path is
exempt from CSRF; all other unsafe requests retain CSRF protection. Registration
does not authenticate or create a session. No login/logout flow is configured.
Passwords use Spring Security's versioned PBKDF2 encoder through a delegating
encoder, supporting long passphrases without bcrypt's 72-byte limit. The User
owns its UUID, canonical username, and encoded password; API DTOs expose only
UUID and username. PostgreSQL enforces unique, nonempty canonical usernames,
and the application maps the named uniqueness constraint to a conflict even
under concurrent registration. Security-sensitive behavior requires coverage
under the testing guide.

## Decisions and source of truth

Repository code and documentation are the source of truth for project knowledge.
Keep them aligned as features are added. See
[ADR 0001](adr/0001-use-modular-monolith.md) for application architecture and code
organization, and [ADR 0002](adr/0002-use-session-based-authentication.md) for the
authentication direction.
