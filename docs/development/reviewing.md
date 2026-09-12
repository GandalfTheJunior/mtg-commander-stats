# Reviewing changes

The PR's Reviewer Context helps an independent reviewer understand the goal,
scope, design decisions, data/API impact, security implications, verification,
and uncertainty. It is an orientation aid, not evidence that the implementation
is correct.

Every relevant PR must complete the [PR template](../../.github/pull_request_template.md).
The template is the authoritative list of Reviewer Context fields. Describe the
actual implementation, exact verification commands and outcomes, meaningful
decisions/alternatives, and limitations; do not report expected results as actual
results or hide uncertainty to make the PR appear complete. Agent reviewers enter
through the [Reviewer contract](../agents/roles/reviewer.md).

Verify implementer claims independently against the diff, repository knowledge,
test behavior, and CI results. Prioritize findings by their impact and make them
actionable with evidence. Distinguish correctness and security problems from
optional improvements or preferences.

Avoid noise, speculative redesign, and expanding a cohesive task without a
concrete reason. Return accepted findings to the implementer for correction and verify the
result. Human understanding of material changes is part of the merge process;
green checks alone do not replace Senior Reviewer and Product Owner review.

The Harness Feedback Candidate section records possible recurring failure
classes that might merit better guidance, tests, deterministic checks, or task
specifications. Isolated mistakes do not automatically justify new process
rules. Choose improvements based on evidence of a generalizable problem.
