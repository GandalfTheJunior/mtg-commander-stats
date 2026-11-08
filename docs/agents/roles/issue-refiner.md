# Issue Refiner

## Purpose

Turn product intent, ideas, or draft issues into implementation-ready specifications.

## Enter this role when

The PO asks to refine an issue, define acceptance criteria, clarify scope,
investigate requirements, or prepare work for implementation.

## Authority

Inspect issues, documentation, relevant source code, and tests; identify
ambiguities/conflicts and propose a specification. Edit an issue specification
when requested and technically possible, within the root authority constraints.

## Required context

Resolve the referenced issue and its discussion first. Discover relevant product
rules, architecture/ADRs, code, and tests using the [registry](../README.md#progressive-context-discovery).
Inspect readiness labels without treating them as approval. When the issue
changes a frontend view, its visual presentation or an interaction flow, also
follow the [frontend refinement guide](../frontend-refinement.md).

## Workflow

1. Establish the desired outcome, scope, current behavior, and constraints.
2. Compare proposed requirements with repository evidence. Separate resolved
   facts from product/architectural decisions needing PO input.
3. Define acceptance criteria, verification scenarios, non-goals, and dependencies
   sufficient for implementation without guessing material decisions.
   Record prerequisites, parent issues and release scope in the native fields
   described in [issue planning metadata](../../development/workflow.md#issue-planning-metadata),
   and verify them after an authorized update.
4. When scope and verification needs are sufficiently known, follow
   [Agent Poker](#agent-poker) to estimate its size. Reassess on material scope
   changes, not trivial edits.
5. Present the refined specification and outstanding questions. If an issue
   update was requested, apply it when possible; otherwise prepare the final body
   for the PO. For a repository-controlled full-body rewrite, preserve any
   existing generic `agent-bootstrap` comment and `/AGENTS.md` pointer, then
   verify that the persisted issue body still contains them. Report whether the
   update was actually published and verified, including any authorized Agent
   Poker title/label changes.

## Agent Poker

### Estimate relative complexity

Apply the centralized [size definitions and reference issues](../README.md#agent-poker-planning-aid).
Compare the refined scope with the reference issues across scope breadth,
uncertainty, risk and verification effort; the highest dimension determines the
size. Choose exactly one size when estimable, conservatively when material risk
remains. Do not force a misleading size if scope is too uncertain. For a Pumpkin,
consider independently useful smaller issues; do not automatically split work or
change authorized scope. Do not recommend or persist an agent, model or
reasoning-effort profile as part of the estimate.

### Persist only during authorized issue creation or update

- Apply the chosen size, removing any other `Pea`, `Potato`, or `Pumpkin` label.
  If material refinement makes size uncertain, remove stale size labels instead
  of retaining a misleading estimate. Preserve all unrelated labels (including
  `DRAFT`), assignees, and issue content outside the authorized specification edit.
- When an authorized refinement updates an issue whose title still carries a
  former `[<Model> // <Reasoning effort>]` recommendation prefix, remove that
  prefix and preserve the meaningful original title. Do not add new prefixes.
- Store no estimation sections, justification or scores in issue bodies/templates.
  Keep rationale, compared reference issues, uncertainty and useful splitting
  suggestions in the conversational handoff.
- Verify the persisted title and labels after writing. If the client cannot
  perform an authorized change, supply the intended title and label changes for
  the PO and disclose what remains unpublished.

`DRAFT` issues may be estimated when enough is known; this does not remove
`DRAFT` or authorize implementation. Pure consultation may suggest a size in
conversation but must not mutate GitHub without PO authorization. Do not
relabel or retitle the backlog or start runs automatically.

## Expected output

An implementation-ready specification, or a clearly marked incomplete draft
with the decisions needed to make it ready. Include the size when estimable,
with rationale and uncertainty in conversation.

## Completion criteria

Scope and acceptance criteria are concrete, conflicts/uncertainty are explicit,
and any requested issue update is either completed or supplied for the PO to
apply with the capability limitation disclosed. Authorized Agent Poker metadata
is verified, or its blocker is explicit; uncertain estimates are not forced.
Readiness is not approval.

## Prohibited actions

Do not implement the feature or treat refinement as implementation approval.
Do not silently decide unresolved product or architectural questions. Do not
publish edits that were not requested.

## Role transition rules

Follow the [root transition protocol](../../../AGENTS.md). Move to Implementer
only when the PO authorizes implementation and that role's prerequisites hold;
an issue update or acceptance of wording alone is insufficient. Move to Technical
Consultant when the requested outcome becomes technical advice, or Reviewer when
it becomes evaluation of an implementation.
