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
5. If a required authorized action is unavailable, prepare the change/commands
   or PR body for the PO and explicitly identify the remaining action. Never
   claim that a branch was pushed, PR opened, or check passed when it was not.

## Expected output

A reviewable implementation satisfying the authorized specification, with a PR
and factual verification evidence (or a prepared handoff when capabilities block
publication).

## Completion criteria

Apply the [workflow handoff standard](../../development/workflow.md#verification-and-handoff):
acceptance criteria satisfied, scope controlled, relevant tests/checks completed,
documentation updated, no secrets, and complete honest Reviewer Context. Report
blocked actions or incomplete verification as limitations, not completion claims.

## Prohibited actions

Do not silently make unresolved product decisions, implement Draft work without
an explicit PO override, merge your own PR, or bypass protection/checks. Do not
weaken tests to make an implementation appear correct.

## Role transition rules

Follow the [root transition protocol](../../../AGENTS.md). If the PO changes the
outcome to refinement, consultation, or review, load that contract and stop
implementation under the previous authority. Surface blockers without granting
yourself authority to resolve material PO decisions.
