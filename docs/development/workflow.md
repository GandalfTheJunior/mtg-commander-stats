# Development workflow

The Product Owner (PO) states the desired outcome. Agents select their operating
role through [AGENTS.md](../../AGENTS.md) and the [role registry](../agents/README.md).
Consultation and refinement can prepare a specification; they are not mandatory
personas or implementation approval. Once the PO authorizes a repository change:

```text
approved task specification
→ dedicated branch
→ implementation
→ deterministic checks
→ Pull Request
→ independent Senior Reviewer + Product Owner review
→ accepted findings returned to the implementer if necessary
→ Product Owner decides whether to merge
```

Senior Reviewer describes the human review process, not an additional agent role.
The workflow is independent of the agent client used.

## Git workflow

1. Start each cohesive implementation task from current `main`.
2. Create a dedicated branch; do not perform feature work directly on `main`.
3. Implement only the requested task and necessary supporting changes.
4. Run the required checks.
5. Push the branch.
6. Prepare a PR with complete Reviewer Context.

Keep one cohesive task per branch/PR. Suggested branch prefixes are `feat/`,
`fix/`, `chore/`, `docs/`, `refactor/`, and `test/`.

Do not merge your own PR or bypass branch protection or required checks. The PO
is the final merge authority. Squash merge is the normal merge method and is
required by the current `protect-main` ruleset.

The current `protect-main` ruleset requires PRs, resolution of review conversations,
squash merging, and successful `backend` and `frontend` status checks. It does
not currently require an approving review count. Independent Senior Reviewer
and PO review remains part of the documented human process.

## Scope and dependencies

Choose the smallest solution fully satisfying the task and acceptance criteria.
Do not introduce unrelated refactoring, dependencies, frameworks, abstractions,
infrastructure, features, or architectural patterns. Design for extension, not
speculation: YAGNI unless there is a concrete current requirement. Mention nearby
unrelated imperfections when relevant instead of automatically expanding scope.

Before adding a production dependency, establish a concrete need, check whether
the existing stack already solves the problem, prefer established maintained
libraries, and consider security and maintenance impact. Mention meaningful new
dependencies in the PR. Do not add frameworks merely for possible future use.

## Documentation

Update documentation when a change materially affects product behavior,
architecture, development workflow, setup, or important operational assumptions.
Keep detailed knowledge in its authoritative location: product behavior under
`docs/product/`, architecture and decisions under `docs/architecture/`, development
practices here, and agent behavior under `docs/agents/`. Link instead of duplicating.

ADRs are reserved for significant, long-lived architectural decisions. Do not
create or change an ADR to introduce a new architectural direction unless the
task or an existing project decision explicitly calls for it.

## Verification and handoff

Apply the [testing guide](testing.md) and run relevant
[README verification commands](../../README.md#verification) before handoff.
Complete every section of the [PR template](../../.github/pull_request_template.md)
with factual Reviewer Context, following [reviewing guidance](reviewing.md).
If a required check cannot run, disclose the blocker; an unexecuted check is not
a pass and does not satisfy the completion standard.

Before handing the work to review, verify that acceptance criteria are satisfied,
scope has not expanded unnecessarily, relevant tests exist and local checks pass,
documentation is updated where required, no secrets were introduced, and the PR
contains complete and honest Reviewer Context. State limitations and uncertainty.
A task is not complete merely because code was written: make the change easy to
verify and understand. Required CI and human review still govern merge readiness.

For agent clients unable to perform an authorized workflow step, the root harness
requires preparing the intended result for the PO and truthfully reporting the
remaining action; lack of capability does not change the workflow or bypass checks.
