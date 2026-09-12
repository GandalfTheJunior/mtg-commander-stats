# AGENTS.md

## Purpose

This file defines the working rules for AI coding agents operating in this repository.

The repository is the source of truth for project knowledge. Before making changes, inspect the relevant code and documentation instead of relying on assumptions from previous conversations.

The goal is not only to produce working code, but to maintain a codebase that is understandable, testable, secure, and reviewable by the human Product Owner.

---

## 1. Before Starting Work

Issues labeled Draft are work in progress. They may be used for context or refinement, but must not be treated as implementation-ready or implemented unless explicitly requested.

Before implementing a task:

1. Read this `AGENTS.md`.
2. Read the task specification completely.
3. Inspect the relevant existing code.
4. Read documentation relevant to the task, especially:

   * `docs/product/`
   * `docs/architecture/`
   * relevant ADRs in `docs/architecture/adr/`
5. Inspect existing tests related to the affected behavior.

Do not assume the task description contains all architectural context.

If an implementation would contradict an accepted ADR, documented architecture rule, or product rule, do not silently override it.

If the conflict cannot be resolved from the repository and materially affects product behavior, security, data integrity, or architecture, surface the conflict explicitly.

---

## 2. Git Workflow

Never implement feature work directly on `main`.

For every task:

1. Start from the current `main`.
2. Create a dedicated branch.
3. Implement only the requested task and necessary supporting changes.
4. Run the required checks.
5. Push the branch.
6. Prepare a Pull Request.

Suggested branch prefixes:

* `feat/`
* `fix/`
* `chore/`
* `docs/`
* `refactor/`
* `test/`

Examples:

* `feat/create-play-group`
* `fix/game-winner-validation`
* `chore/setup-ci`

Do not merge your own Pull Request.

Do not bypass branch protection or required checks.

---

## 3. Scope Discipline

Prefer the smallest solution that fully satisfies the task and acceptance criteria.

Do not introduce unrelated:

* refactoring
* dependencies
* frameworks
* abstractions
* infrastructure
* features
* architectural patterns

Avoid speculative abstractions for hypothetical future requirements.

Follow:

> Design for extension, not speculation.

and:

> YAGNI unless there is a concrete current requirement.

If nearby code is imperfect but unrelated to the task, mention it if relevant rather than expanding the task automatically.

---

## 4. Architecture

The application is a modular monolith.

Backend code is organized primarily by business feature rather than by global technical layer.

Typical feature structure may contain:

```text

feature/
  api/
  application/
  domain/
  persistence/

```

Create subpackages only when they improve clarity. Do not create empty architectural ceremony.

Responsibilities:

### API

Responsible for the HTTP boundary.

Examples:

* request/response DTOs
* request validation
* controllers
* HTTP status mapping

Controllers must not contain business logic.

### Application

Responsible for application use cases.

Typical responsibilities:

* orchestrating domain operations
* transaction boundaries
* authorization based on domain data
* coordinating repositories or other features

Application services normally define transactional use-case boundaries.

### Domain

Responsible for business concepts, state, and invariants.

Business rules should not exist only in controllers or frontend validation.

### Persistence

Responsible for database access and persistence-specific behavior.

Spring Data JPA is the default persistence mechanism for the MVP.

JPA entities must not be exposed directly as REST request or response models.

---

## 5. Module Boundaries

Keep feature ownership clear.

Avoid reaching directly into another feature's persistence implementation when a clearer application-level interaction exists.

Do not introduce interfaces, ports, events, or abstractions merely to simulate loose coupling.

Introduce an abstraction when a concrete problem requires it.

Avoid creating a generic `common` or `shared` dumping ground.

Code should live with the feature that owns its responsibility unless it is genuinely cross-cutting infrastructure.

---

## 6. Database and Migrations

PostgreSQL is the application database.

Database schema changes must be represented through Flyway migrations.

Do not rely on manually created local database state.

Previously merged migrations must not be rewritten to change production history. Create a new migration instead.

Use database constraints where they provide meaningful protection for data integrity.

Do not assume application validation is sufficient for invariants that can also be safely enforced by the database.

---

## 7. Security

Authentication uses Spring Security and server-side sessions for the MVP.

Do not implement custom cryptography, password hashing algorithms, session mechanisms, or authentication protocols.

Do not implement custom authentication or authorization flows in this
bootstrap task. Add only the baseline dependencies/configuration necessary
for the application skeleton to work.

Never commit:

* passwords
* API keys
* access tokens
* private keys
* production secrets

Authentication and authorization are separate concerns.

Knowing the current user is not sufficient authorization.

Operations involving group, game, deck, or other user-owned data must enforce the relevant ownership or membership rules on the server.

Do not rely on frontend restrictions for security.

Security-sensitive behavior must be tested.

---

## 8. Testing Principles

Every behavioral change should have appropriate automated test coverage.

Choose the test level based on the risk being tested.

### Unit tests

Use unit tests for isolated business logic that can be tested meaningfully without Spring or external infrastructure.

Do not create large mock-heavy tests merely to classify a test as a unit test.

If most of a test consists of configuring mocks for repositories or framework behavior, consider whether an integration test would provide more value.

### Integration tests

Use integration tests when correctness depends on collaboration between components such as:

* Spring configuration
* Spring Security
* JPA mappings
* transactions
* repositories
* Flyway migrations
* PostgreSQL behavior

Database integration tests must use PostgreSQL through Testcontainers.

Do not introduce H2 as a substitute for PostgreSQL.

### API integration tests

Important application flows and authorization rules should preferably be tested through the application boundary when this provides meaningful additional confidence.

### Frontend tests

Use frontend tests to verify observable user behavior rather than internal component implementation details.

---

## 9. Test Integrity

A failing test is a signal to investigate, not an obstacle to remove.

Do not make checks pass by:

* deleting relevant tests
* disabling tests
* weakening assertions without justification
* suppressing lint/type/security rules without justification
* adding arbitrary retries for flaky tests
* changing expected behavior merely to match the implementation

If an existing test is incorrect because requirements changed, update it and explain why the previous expectation is no longer valid.

If a test is flaky, investigate the underlying cause.

---

## 10. Required Local Checks

Run the checks relevant to the changed code before declaring the task complete.

### Backend

From `backend/`:

```bash

./mvnw verify

```

This is the canonical backend verification command.

### Frontend

From `frontend/`:

```bash

npm ci

npm run lint

npm run typecheck

npm run test

npm run build

```

The frontend test script must be CI-safe and terminate without interactive watch mode.

If a required check cannot be run, report this explicitly in the Pull Request.

Never claim a check passed if it was not executed successfully.

---

## 11. Dependencies

Do not add a new production dependency without a concrete need.

Before introducing one:

1. Check whether the existing stack already solves the problem.
2. Prefer established, maintained libraries.
3. Consider security and maintenance impact.
4. Mention meaningful new dependencies in the Pull Request.

Do not add frameworks purely because they may be useful later.

---

## 12. Documentation

Update repository documentation when a change materially changes:

* product behavior
* architecture
* development workflow
* setup instructions
* important operational assumptions

Do not duplicate detailed project knowledge across multiple documents unnecessarily.

Architecture Decision Records are reserved for significant, long-lived architectural decisions.

Do not create or change an ADR to introduce a new architectural direction unless the task or existing project decision explicitly calls for it.

---

## 13. Pull Request Requirements

Every relevant Pull Request must complete the repository Pull Request template.

The Reviewer Context must accurately describe the implementation.

Include:

### Goal

What should this Pull Request accomplish?

### Scope

What was changed?

What was deliberately not changed?

### Key Changes

What are the most important implementation changes?

### Key Files

Which files deserve particular reviewer attention?

### Design Decisions

Which meaningful implementation decisions were made and why?

Mention relevant alternatives when appropriate.

### Data / API Impact

Describe changes to:

* database schema
* persistence
* REST API
* externally observable behavior

### Security / Permissions

Describe relevant authentication, authorization, ownership, or user-data implications.

### Tests & Checks

List:

* tests added or changed
* exact verification commands executed
* whether each command passed

Do not report expected results as actual results.

### Known Limitations

State deliberately unsupported or incomplete cases.

### Reviewer Attention

Identify areas that deserve particularly careful review.

### Open Questions / Uncertainty

Report assumptions, uncertainty, unresolved questions, or areas where the implementation may deserve additional scrutiny.

Do not hide uncertainty to make the Pull Request appear more complete.

### Harness Feedback Candidate

Report implementation problems that may indicate a recurring class of failure that could potentially be prevented through:

* repository guidance
* deterministic checks
* automated tests
* CI
* improved task specifications

Do not propose new process rules for every isolated mistake. Focus on potentially generalizable problems.

---

## 14. Completion Standard

A task is not complete merely because code was written.

Before handing the work to review, verify:

* acceptance criteria are satisfied
* scope has not expanded unnecessarily
* relevant tests exist
* relevant local checks pass
* documentation is updated where required
* no secrets were introduced
* the Pull Request contains complete and honest Reviewer Context

The human Product Owner is the final merge authority.

The purpose of implementation is to make the change easy to verify and understand, not merely to make it appear complete.

