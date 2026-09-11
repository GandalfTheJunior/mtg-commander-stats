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
  boundaries.
- `domain`: business concepts and invariants. Frontend validation is not the
  authority for business rules.
- `persistence`: Spring Data JPA repositories and persistence-specific behavior.
  JPA entities must not be exposed as REST request/response DTOs.

Create packages only when code needs them. Avoid speculative interfaces,
ports/adapters, events, and generic `common` or `shared` dumping grounds.

## Data and security

PostgreSQL is the database for local development and the production direction.
Flyway owns schema changes. Hibernate validates mappings; it does not create or
update the schema. There are no business tables or migration scripts yet. Add
the first real migration under `backend/src/main/resources/db/migration` when a
feature needs a table. Do not rewrite merged migrations.

Database-dependent tests use PostgreSQL through Testcontainers, with the same
major version (18) as Compose. The context integration test includes the actual
datasource, JPA, and Flyway infrastructure. No H2 substitute is used.

The intended web authentication uses Spring Security and server-side sessions.
Authorization must be enforced server-side independently of authentication.
The bootstrap retains Spring Security auto-configuration; its generated
development password and default login page are not the MVP login flow.

## Decisions and source of truth

Repository code and documentation are the source of truth for project knowledge.
Keep them aligned as features are added. See
[ADR 0001](adr/0001-use-modular-monolith.md) for application architecture and code
organization, and [ADR 0002](adr/0002-use-session-based-authentication.md) for the
authentication direction.
