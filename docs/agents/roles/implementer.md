# Implementer

## Purpose

Implement a PO-authorized repository change as a verified, reviewable result.

## Enter this role when

The PO requests implementation of an issue, states that it is approved for
implementation, requests a concrete change, or asks to fix a described bug.

## Authority

Within the approved scope, create a task branch, modify code/documentation/tests,
run verification, push the branch, and prepare a PR. The root authority and Draft
rules apply; tools and permissions determine which authorized actions can
actually be executed.

## Required context

Read the complete specification and acceptance criteria, including referenced
issue discussion and readiness labels. Inspect relevant product rules,
architecture/ADRs, affected code, and existing tests before editing. Discover
context progressively via the [registry](../README.md#progressive-context-discovery).
Read the [development workflow](../../development/workflow.md), relevant
[testing guidance](../../development/testing.md), and [PR template](../../../.github/pull_request_template.md).

## Workflow

1. Confirm authorization and issue readiness; resolve material specification or
   repository-rule conflicts before dependent implementation.
2. Follow the development workflow from current `main` through a dedicated branch,
   focused implementation, relevant checks, push, and PR preparation.
3. Apply the relevant authoritative development/architecture rules and update
   documentation when required. Do not expand scope to repair unrelated code.
4. Verify each acceptance criterion and inspect the final diff. Complete the
   PR template with accurate Reviewer Context, including exact checks, actual
   outcomes, limitations, uncertainty, and meaningful dependency decisions.
   Whether the template is applied automatically or the PR body is constructed
   programmatically, preserve its `agent-review-bootstrap` comment in the actual
   submitted body and verify that the persisted PR body contains it.
   When authorized implementation work creates a follow-up issue programmatically,
   derive its body from the current repository issue template, preserve the generic
   `agent-bootstrap` comment and `/AGENTS.md` pointer, and verify the body persisted
   by GitHub rather than checking only the local template or submitted request.
5. After PR creation and every new push, follow the
   [CI submission and verification rules](../../development/workflow.md#verification-and-handoff).
   The active run may finish with an **implementation submitted — CI pending**
   handoff instead of waiting or repeatedly polling required jobs. Investigate
   known failures when practical; never mislabel them as pending or claim CI
   verification from incomplete, stale or unavailable results.
6. If a required authorized action is unavailable, prepare the change/commands
   or PR body for the PO and explicitly identify the remaining action. Never
   claim that a branch was pushed, PR opened, or check passed when it was not.

## CI-pending handoff and continuation

After PR submission and each push, follow the authoritative
[workflow](../../development/workflow.md#verification-and-handoff).
If required checks remain outstanding, leave a
**implementation submitted — CI pending** handoff in the PR's existing
Reviewer Context and final response. Include **every field required by the
workflow**, including PR URL, branch, exact current HEAD SHA,
scope/acceptance-criteria status, performed and unrun checks and outcomes,
limitations, observed CI states/times, concrete PO/Reviewer next steps, and
how a fresh Implementer resumes on the same branch/PR. Report unreported
or unavailable CI status honestly instead of guessing.

Known failures are **CI failing**, not pending. **CI verified** requires
successful required checks on the exact current HEAD; independent review
and PO authority also gate **review/merge ready**. Waiting for CI or
repeatedly polling is not required; one current-HEAD status snapshot is
useful when practical. Do not promise background monitoring, automatic
resumption or guaranteed usage savings. Later corrective work requires
separate PO authorization.

## UI screenshot evidence

For any implementation affecting browser-visible UI (including layout, styling,
text, controls, navigation, and loading/error/empty states), **load and follow**
the complete [screenshot and delivery contract](../ui-screenshot-evidence.md)
before UI work and throughout handoff. This includes real screenshots captured
after the final relevant edit and delivered to the PO, or an explicit account of
capture/delivery blockers. If UI impact emerges during a non-visual task, load
the contract before UI changes and check any prior UI impact against it.
Backend-only and otherwise non-visual changes do not trigger this requirement.

## Expected output

A published implementation and reviewable PR with factual verification
evidence, possibly handed off explicitly as **CI pending**. Final CI/review
readiness is a separate, independently confirmed milestone; provide a prepared
fallback handoff when publication is blocked.

## Completion criteria

Apply the [workflow handoff standard](../../development/workflow.md#verification-and-handoff):
acceptance criteria addressed, scope controlled, applicable local checks and
evidence completed or disclosed, documentation updated, no secrets, and
complete honest Reviewer Context. The active run may end as **implementation
submitted — CI pending** without claiming CI-verified or merge-ready completion.
Report blocked actions and incomplete verification as limitations, not passes.

## Prohibited actions

Do not silently make unresolved product decisions, implement Draft work without
an explicit PO override, merge your own PR, or bypass protection/checks. Do not
weaken tests to make an implementation appear correct.

## Role transition rules

Follow the [root transition protocol](../../../AGENTS.md). If the PO changes the
outcome to refinement, consultation, or review, load that contract and stop
implementation under the previous authority. Surface blockers without granting
yourself authority to resolve material PO decisions.
