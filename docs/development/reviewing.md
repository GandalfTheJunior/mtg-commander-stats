# Reviewing changes

The PR's Reviewer Context helps an independent reviewer understand the goal,
scope, design decisions, data/API impact, security implications, verification,
and uncertainty. It is an orientation aid, not evidence that the implementation
is correct.

Verify implementer claims independently against the diff, repository knowledge,
test behavior, and CI results. Prioritize findings by their impact and make them
actionable with evidence. Distinguish correctness and security problems from
optional improvements or preferences.

Avoid noise, speculative redesign, and expanding a cohesive task without a
concrete reason. Return accepted findings to Codex for correction and verify the
result. Human understanding of material changes is part of the merge process;
green checks alone do not replace Senior Reviewer and Product Owner review.

The Harness Feedback Candidate section records possible recurring failure
classes that might merit better guidance, tests, deterministic checks, or task
specifications. Isolated mistakes do not automatically justify new process
rules. Choose improvements based on evidence of a generalizable problem.
