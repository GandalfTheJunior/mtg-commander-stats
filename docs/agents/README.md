# Agent harness and role registry

Start every task with the root [AGENTS.md](../../AGENTS.md). It owns the startup
protocol and repository-wide authority constraints. This registry helps select
the role contract; it is not a replacement for product or technical documentation.
Client and harness behavior can be checked against the documented
[verification scenarios](harness-verification.md).

## Intent selects the role

| Requested outcome | Operating role | Result |
| --- | --- | --- |
| Refine an idea/issue, clarify scope or acceptance criteria | [Issue Refiner](roles/issue-refiner.md) | Implementation-ready specification, or explicit unresolved decisions |
| Investigate behavior, discuss tests/design, compare alternatives | [Technical Consultant](roles/technical-consultant.md) | Grounded analysis or recommendation |
| Implement an approved issue, make a change, fix a bug | [Implementer](roles/implementer.md) | Verified, reviewable change and PR |
| Evaluate a PR or implementation against its specification | [Reviewer](roles/reviewer.md) | Prioritized actionable findings and satisfaction assessment |

A role defines behavior, responsibilities, allowed/prohibited actions, and
expected output. Technical focus determines what context to read: backend,
frontend, API, persistence, testing, security, architecture, or relevant product
areas. These are not additional roles; do not invent combinations such as
`BackendTestReviewer`.

Choose the narrowest role for the requested outcome. “Can we improve the endpoint
tests?” leaves mutation intent ambiguous: begin as a non-mutating Technical
Consultant and resolve intent before edits. “Improve the endpoint tests and open
a PR” clearly selects Implementer. A named technology alone grants no authority.

The root authority rules apply to every contract. For example, a request to
refine and update an issue authorizes that issue update, not code implementation.
If GitHub writing is available, perform the authorized update; otherwise provide
the finalized issue body for the PO and state that it was not published. The role
does not change merely because a client has more or fewer tools.

## Artifact context metadata

Repository-controlled issue bodies expose this stable, neutral context pointer:

```html
<!-- repository-agent-context: /AGENTS.md -->
```

PR bodies additionally expose:

```html
<!-- repository-review-context: /docs/agents/roles/reviewer.md -->
```

Values are paths from this repository's root. The markers describe context
locations only: they contain no commands, execution order, authority grant, or
role selection. The review pointer identifies relevant context; the requested
outcome still determines the operating role through `AGENTS.md`.

```text
GitHub artifact
  -> neutral repository-context metadata
  -> client/harness may resolve metadata
  -> /AGENTS.md owns repository routing/policy
  -> selected role contract owns role behavior
```

The repository guarantees only the presence and correctness of metadata in
artifacts it controls. Discovery, trust/access checks, and context loading are
client/harness responsibilities. Supporting clients may resolve these pointers
through their configured repository-context mechanism; arbitrary external clients
may ignore them. Metadata never authorizes writes or overrides client security
controls. Unsupported discovery is a capability limitation, not a reason to embed
executable instructions. See the [verification scenarios](harness-verification.md).

## Agent Poker planning aid

Agent Poker recommends a reliable Codex execution profile first, then estimates
its relative impact on the PO's **ChatGPT Plus five-hour Codex allowance**:

| Size label | Qualitative planning meaning |
| --- | --- |
| `Pea` 🫛 | Very low expected usage; a small, self-contained task plausibly fitting after a Pumpkin or two Potatoes, if capacity remains. |
| `Potato` 🥔 | More substantial than a Pea; expected to use less than 50% of a fresh allowance, with enough margin for two typical Potatoes to fit together. |
| `Pumpkin` 🎃 | Expected to use at least 50% of a fresh allowance; start with substantial capacity and consider useful smaller issues. |

These are qualitative thresholds, not human hours, raw tokens, elapsed runtime,
or guaranteed percentages. Usage varies with model, reasoning effort, execution
mode (cloud/local), context, task, tools, and account limits; weekly caps may also
apply. This is a planning baseline, not a permanent account entitlement; revisit
it if the PO changes plan or workflow. The PO starts Codex runs manually.

The title convention is `[<Model> // <Reasoning effort>] <Original issue title>`.
Persist only one concise profile prefix and at most one size label; issue bodies
carry no estimation prose, scores, percentages, or usage tracking. The
[Issue Refiner contract](roles/issue-refiner.md#agent-poker) owns profile research,
estimation, mutation authority, and reassessment. A size is neither readiness nor
implementation approval.

## Role transitions

Follow the root transition protocol whenever the PO changes the outcome. For
example, Issue Refiner → PO: “Looks good. Implement this issue.” → Implementer,
after loading that contract and checking specification/readiness and context.
“Looks good” alone does not authorize implementation. A request to stop editing
and discuss an alternative moves to Technical Consultant; a request to evaluate
the proposed change moves to Reviewer. Carry forward relevant evidence, but do
not carry implementation authority into a consultation or review task.

Announce once before substantive work and again on a transition, without
repetitive ceremony: “I will work as the Issue Refiner on issue #12, inspecting
the relevant context and refining its specification.”

## Progressive context discovery

Resolve the referenced artifact before choosing detailed context. Use its scope
to identify domains, then follow documentation links and search relevant code and
tests. A task description need not contain all architectural context. Expand
when dependencies, contradictions, or missing evidence appear; do not use a fixed
bundle or read the entire repository for every question.

| Source | Use it for |
| --- | --- |
| [Product scope](../product/mvp-scope.md) and referenced issues | Agreed behavior, boundaries, acceptance criteria, readiness |
| [Architecture overview](../architecture/overview.md) and [ADRs](../architecture/adr/) | Responsibilities, persistence/security direction, accepted decisions |
| [Development workflow](../development/workflow.md) | Scope, dependencies, documentation, Git and handoff practices |
| [Testing guide](../development/testing.md) and relevant tests | Risk-based coverage, integrity, test infrastructure and verification |
| [Review guidance](../development/reviewing.md), PR/diff and [PR template](../../.github/pull_request_template.md) | Review evidence and Reviewer Context |
| Relevant source code and configuration | Actual behavior and affected boundaries |

For example, API issue refinement can lead from product rules and API architecture
to controllers, application services, and endpoint tests. Endpoint-test discussion
can lead from development/testing guidance to test infrastructure and the affected
endpoint implementation. A persistence change can lead from the issue/product
rules to architecture/ADRs, entities, repositories, Flyway migrations, and database
integration tests. These are discovery examples, not mandatory context bundles.
