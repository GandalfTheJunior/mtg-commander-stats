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

## Frontend Vitest execution

The normal `npm run test` command uses Vitest's default isolated `forks`
pool and `maxWorkers: '100%'` in [`frontend/vite.config.ts`](../../frontend/vite.config.ts).
On runners where `availableParallelism()` reports at most two CPUs, Vitest
runs most files in a parallel project, then executes `GroupPage`,
`GroupStatistics`, `GameEditor` and `GameSession` test files in a separate
non-file-parallel project. This avoids CPU contention for the larger React/jsdom
flows without skipping tests or increasing timeouts. On larger runners, the
special project split is omitted. Preserve the complete App/router integration
and accessible role/name/visibility assertions when extending UI coverage;
prefer queries scoped to the relevant region or dialog over repeated document-wide
positive queries. Keep document-wide checks where absence across the whole page
is the behavior under test.

Runner load affects elapsed time. Compare complete successful runs with the same
suite, dependencies and comparable runner resources before attributing a timing
change to code; a single run or different CI hardware is not a stable baseline.

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


The development-only motion playground also has real Chromium/WebKit landing
regressions. See [browser setup and evidence](motion-playground.md#repeatable-browser-verification)
for commands and physical Safari acceptance checks; component mocks alone cannot
verify animation continuity across React commits.
