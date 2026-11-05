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
→ Pull Request and implementation-submitted handoff (CI pending if necessary)
→ required CI checks complete successfully on the current PR revision
→ independent Senior Reviewer + Product Owner review
→ accepted findings returned to the implementer if necessary
→ Product Owner decides whether to merge
```

Senior Reviewer describes the human review process, not an additional agent role.
The workflow is independent of the agent client used.

After the Product Owner explicitly signals completion of their own PR review,
the Reviewer asks the [non-blocking comprehension questions](../agents/roles/reviewer.md#po-comprehension-check).
This follow-up supports understanding; it is not a prerequisite for approval or
merge and does not change the Product Owner's final authority.

## Issue planning metadata

Issue order, grouping and release scope live in native GitHub issue fields, so
the PO can see the plan in issue lists, the milestone and the project board:

- **Dependencies:** an issue that cannot start before another is finished is
  marked **blocked by** that issue. Only real prerequisites qualify; mere
  priority or a loose reference stays prose.
- **Sub-issues:** an initiative or tracker issue lists its parts as sub-issues
  instead of a manual checklist.
- **Milestones:** release scope, such as *First testers*, is a milestone.

These fields are authoritative. Issue bodies may explain why a dependency
exists but do not restate order or child lists that the fields already express;
when older prose conflicts with the fields, the fields win and the prose is
corrected during the next authorized refinement. Closed prerequisites need no
link. The [Issue Refiner](../agents/roles/issue-refiner.md) proposes and, when
authorized, maintains these fields; changing them follows the same PO authority
as any other issue update.

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

**Implementation submitted**, **CI verified**, and **review/merge ready** are
distinct milestones. After opening or updating a PR, the Implementer may end the
active run when authorized changes are pushed, applicable local verification and
required UI evidence are completed or honestly disclosed, and the PR contains
full Reviewer Context. GitHub Actions continues independently. The Implementer
is **not required to wait for CI completion, keep a polling session alive, or
repeatedly query job status**. If practical, capture one current-HEAD CI status
snapshot; if checks are not registered or statuses cannot be retrieved, say so.
Do not imply ongoing monitoring, notification, or automatic agent resumption.

While required checks are queued, running, unreported or unavailable, label the
handoff **implementation submitted — CI pending**, not CI verified. Record in
both the PR and final agent response: PR URL, branch, exact current HEAD SHA,
implemented scope and acceptance-criteria status, exact local checks and their
actual outcomes, unrun verification and limitations, required CI jobs and their
last **observed** states (with observation time when available), and concrete
next steps for the PO/Reviewer. Distinguish observed running jobs from missing
or unavailable status. Explain how a fresh Implementer could resume the same
branch/PR after CI failure. A snapshot applies only to the observed SHA/time.

If a required check has **already failed**, investigate it and correct
authorized in-scope defects when practical; otherwise explicitly report
**CI failing**, the evidence and unresolved action. Never disguise known
failures as ordinary pending checks. After each corrective push, repeat the
handoff for the **new HEAD**; earlier green results are stale.

After the active run ends, the PO or independent Reviewer checks the latest
PR HEAD and actual GitHub status results. Required `backend`, `frontend`,
and any other branch-protection checks must be **terminal and successful on
that exact revision** before calling the PR **CI verified** or **review/merge
ready**. Queued, pending, in-progress, missing, skipped, cancelled, timed-out,
failed or stale checks are **not passes**. Reviewers may inspect code while
CI runs, but final verification/review handoff and the PO merge decision must
account for current-HEAD CI success, independent review, and PO authority.
Branch protection is not a substitute for truthful reporting or human review.
Successful CI needs no new Codex run solely to acknowledge the result.

If CI later fails or required results remain missing, the PO/Reviewer records
the affected jobs, current SHA and relevant evidence. The PO may then start a
**separately authorized targeted Implementer continuation** to diagnose logs,
make necessary in-scope corrections without weakening tests, rerun applicable
local checks and push to the same branch/PR where possible. Escalate out-of-scope
failures or tool limitations; no automatic follow-up agent is implied.

Before handing off, check acceptance criteria, local verification/evidence,
scope, documentation, security and complete Reviewer Context. Disclose what
remains unverified. Implementation submission does not complete the separate
CI verification, independent review or merge decision.

For agent clients unable to perform an authorized workflow step, the root harness
requires preparing the intended result for the PO and truthfully reporting the
remaining action; lack of capability does not change the workflow or bypass checks.
