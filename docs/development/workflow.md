# Development workflow

```text
Product Owner
→ Consultant / Architect
→ Codex task specification
→ dedicated branch
→ implementation
→ deterministic checks
→ Pull Request
→ independent Senior Reviewer + Product Owner review
→ accepted findings returned to Codex if necessary
→ Product Owner decides whether to merge
```

`main` is protected. Start each cohesive task from current `main` on a dedicated
branch; do not perform feature work directly on `main`. Keep one cohesive task
per branch/PR and follow the repository-root `AGENTS.md`.

Run the [README verification commands](../../README.md#verification) before
handoff. Complete every section of the PR template with factual Reviewer
Context, including exact commands, actual outcomes, limitations, and uncertainty.
If a required check cannot run, disclose the blocker; an unexecuted check is not
a pass and does not satisfy the bootstrap's completion criteria.

Codex does not merge its own PR or bypass protection. The Product Owner is the
final merge authority. Squash merge is the normal merge method and is required
by the current `protect-main` ruleset.

The current `protect-main` ruleset requires Pull Requests, resolution of review
conversations, squash merging, and successful `backend` and `frontend` status
checks. It does not currently require an approving review count. Independent
Senior Reviewer and Product Owner review remains part of the documented human
process.
