# Architecture v1

The application direction is:

```text
Browser → React/TypeScript SPA → REST/JSON → Spring Boot modular monolith → PostgreSQL
```

The bootstrap contains only the application skeleton, a static application root,
and development/test infrastructure. REST features and authentication flows have
not been implemented.

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
update the schema. There are no business tables or migration scripts yet. Add
the first real migration under `backend/src/main/resources/db/migration` when a
feature needs a table. Do not rewrite merged migrations.
Create a new migration instead of changing production history; do not rely on
manually created local database state. Use database constraints where they provide
meaningful data-integrity protection rather than assuming application validation
alone is sufficient for invariants the database can safely enforce.

See the [testing guide](../development/testing.md) for database integration
coverage and verification infrastructure.

The authentication direction and prohibition on custom cryptography, password
hashing, and session/authentication protocols are governed by
[ADR 0002](adr/0002-use-session-based-authentication.md). Authorization is separate
from authentication: knowing the current user is insufficient. Operations on
group, game, deck, or other user-owned data must enforce relevant ownership or
membership rules on the server; frontend restrictions are not security controls.
The bootstrap retains Spring Security auto-configuration; its generated
development password and default login page are not the MVP login flow. That
bootstrap task was limited to baseline dependencies/configuration for the
skeleton, with no custom authentication or authorization flows. Future flows
require their own approved task and must follow the accepted authentication ADR.
Security-sensitive behavior requires coverage under the testing guide.

## Decisions and source of truth

Repository code and documentation are the source of truth for project knowledge.
Keep them aligned as features are added. See
[ADR 0001](adr/0001-use-modular-monolith.md) for application architecture and code
organization, and [ADR 0002](adr/0002-use-session-based-authentication.md) for the
authentication direction.
