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

Before ending a run with outstanding required checks, leave a self-contained,
remote handoff in the PR's existing Reviewer Context and final agent response.
Include PR URL, branch, **exact current HEAD SHA**, completed scope/acceptance
criteria, exact locally executed checks and actual outcomes, unrun checks and
limitations, required CI jobs with last observed status and time if available,
and concrete PO/Reviewer next steps. Explain how a fresh Implementer can resume
on the same branch/PR after a failure. One CI status snapshot is useful when
practical; repeated polling or active waiting is not required. If status is
unreported or unavailable, say so rather than guessing.

**Implementation submitted — CI pending** is neither **CI verified** nor
**review/merge ready**. The PO/Reviewer verifies current-HEAD required CI
results later, along with independent review and existing PO authority.
Code review can begin while CI runs, but the final gates still apply. If a
required check has already failed, investigate or explicitly report **CI
failing** with evidence; never relabel known failures as pending. Green CI
does not require a new Codex run merely for acknowledgement. A later failure
requires a separately PO-authorized, targeted Implementer continuation.
Do not promise background monitoring, automatic notifications/restarts,
or guaranteed usage savings. See the authoritative
[workflow](../../development/workflow.md#verification-and-handoff).

## UI screenshot evidence

For every implementation that changes a browser-visible UI (including layout,
styling, text, controls, navigation, or loading/error/empty states), provide
visual evidence in addition to the normal tests and checks. After the **last**
relevant UI edit, open the running application in a browser and capture at least
one screenshot showing the changed UI at a representative viewport. Cover each
materially different changed screen or state; if the change affects responsive
layout, include both desktop and mobile screenshots. Use non-sensitive
development/demo data, never real credentials or private user information.
Mockups, test snapshots, and screenshots from before the final edit do not count.

In the final Codex response to the PO, **include the actual screenshot(s)** as
viewable attachments or embedded images; if the client only supports artifacts,
link to verified, accessible image artifacts. A bare filesystem path, a claim
that a screenshot was taken, or a PR link without the image is not delivery.
A clickable absolute workspace-file link or embedded image can satisfy delivery
when the client supports access to that shared workspace. When a durable image
link is available, also provide it in the PR Reviewer Context. Do not commit
temporary screenshot files merely to satisfy this handoff rule.

### Client-aware delivery and recovery

Use the current client's supported link/attachment format. In the shared-workspace
client used for PR #126, the PO confirmed that direct absolute file links and
image embeds worked, while `sandbox:` links and tool image outputs did not.
For that client, use this Markdown shape with the **actual existing file path**:

```markdown
[Open desktop screenshot](/workspace/shared/downloads/task/desktop.png)
![Desktop screenshot](/workspace/shared/downloads/task/desktop.png)
```

The example path is illustrative: verify that the delivered file exists and is
readable. Do not assume this directory, URI scheme, or rendering behavior applies
to every client, and do not require a separate upload tool when a supported
workspace link already provides access.

Keep capture, agent inspection, and PO receipt distinct. A successful image-view
tool call proves neither client rendering nor PO receipt. Report only the state
supported by evidence; record explicit PO receipt confirmation when provided.
This adds no mandatory confirmation question or approval gate to every task;
receipt also does not imply UI approval or permission to merge.

If the PO reports missing images, check the file and link format, then use another
supported delivery route instead of repeating the failed route. A failed link or
missing upload tool alone does not establish that the client cannot display
screenshots. Correct unsupported delivery claims in the response and PR. Once
receipt is confirmed, remove any stale delivery blocker from the PR while
retaining real limitations such as session-local rather than durable hosting.

If the application, browser, capture tool, or image delivery is unavailable,
state exactly what is blocked in the final response and PR, without inventing
images or describing the screenshot requirement as satisfied. The implementation
is **not fully visually verified** until the PO receives the required evidence.
Backend-only or otherwise non-visual changes do not trigger this requirement.

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
