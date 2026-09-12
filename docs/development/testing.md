# Testing and verification

Every behavioral change should have appropriate automated coverage. Choose the
test level based on the risk being tested; security-sensitive behavior must be
tested.

## Test levels

- **Unit:** isolated business logic that can be tested meaningfully without
  Spring or external infrastructure. Do not build large mock-heavy tests merely
  to call them unit tests. If most setup mocks repositories or framework behavior,
  consider whether integration coverage would provide more value.
- **Integration:** collaboration involving Spring configuration, Spring Security,
  JPA mappings, transactions, repositories, Flyway migrations, or PostgreSQL
  behavior. Database integration tests must use PostgreSQL through Testcontainers,
  not H2. Match Compose's PostgreSQL major version (currently 18).
- **API integration:** prefer the application boundary for important application
  flows and authorization rules when that provides meaningful additional confidence.
- **Frontend:** verify observable user behavior rather than internal component
  implementation details.

The current backend context test exercises the actual datasource, JPA, and Flyway
infrastructure. Consult relevant existing tests and configuration when extending
coverage rather than assuming a feature or test infrastructure already exists.

## Test integrity

A failing test is a signal to investigate, not an obstacle to remove. Do not make
checks pass by deleting relevant tests, disabling tests, weakening assertions
without justification, suppressing lint/type/security rules without justification,
adding arbitrary retries for flaky tests, or changing expected behavior merely
to match the implementation.

If requirements changed and an existing expectation is now incorrect, update it
and explain why the previous expectation is no longer valid. Investigate the
underlying cause of flaky tests.

## Required checks

Run checks relevant to the changed code before declaring completion. The
[README verification section](../../README.md#verification) owns the exact
commands: canonical backend verification and the frontend install, lint,
typecheck, test, and build sequence. The frontend test script must remain CI-safe
and terminate without interactive watch mode.

Disclose required checks that could not run and their blockers in the PR. Never
claim an unexecuted or unsuccessful check passed. Follow the
[workflow handoff standard](workflow.md#verification-and-handoff); required CI
checks remain required even when local verification is limited.
