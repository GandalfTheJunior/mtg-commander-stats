# Agent harness verification scenarios

These manual regression scenarios verify client or harness behavior at the
conversation boundary, where repository-only automated tests cannot observe
instruction loading or later responses. Run each scenario in a fresh conversation
under the stated context conditions. The root [AGENTS.md](../../AGENTS.md) and
selected role contract are the authoritative instructions; this file records
test inputs and observable outcomes without restating the role policies.

The [artifact metadata contract and trust boundary](README.md#artifact-context-metadata)
separate repository guarantees from client behavior. Repository checks can verify
the exact neutral markers/paths in templates, their non-imperative content, the
preservation rules, and single policy ownership. They cannot prove what GitHub
persisted or that an external client resolves metadata. Inspect persisted bodies
separately against the GitHub API or rendered artifact.

For artifact-recovery cases, use a client/harness configured to resolve repository
context metadata under its own trust/access rules. Record that setup and observed
context loading. An unsupported client belongs in the explicit capability case
below, not in a claimed routing pass. Report repository checks, persisted-artifact
checks, fresh-conversation runs, and security-warning observations separately;
unexecuted or unobservable scenarios are not passes.

## Rooted-workspace bootstrap

1. Start a fresh conversation rooted at this repository, with no role context
   carried over from another task.
2. Send `review diese pr für mich <PR URL>` for a reviewable PR with a complete
   specification.
3. Confirm that, before substantive review work, the agent loads `AGENTS.md`,
   selects and announces the Reviewer role, and loads
   [the Reviewer contract](roles/reviewer.md).
4. Let the Reviewer report its technical review and discuss or verify findings
   as needed.

Then run the completion-signal cases below. This scenario verifies automatic
instruction discovery when the repository is the workspace.

## Repository-artifact recovery

1. Start a fresh conversation outside a checked-out repository workspace, with
   no repository or role instructions already loaded.
2. Make only the repository URL or repository-page artifact available and ask
   for a repository task without mentioning `AGENTS.md` or a role.
3. Confirm that the configured client/harness resolves the README's generic
   context pointer and loads `/AGENTS.md` before substantive repository work.
4. Confirm that `AGENTS.md`, rather than the README entry point, selects the role
   from the requested outcome and that the selected role contract is loaded
   before substantive role work.

## Issue-artifact recovery

Run this scenario once with an issue created through the repository issue
template and once with an issue body constructed and submitted programmatically.

1. Inspect the issue body persisted by the GitHub API or rendered issue artifact.
   Confirm that it contains exactly `<!-- repository-agent-context: /AGENTS.md -->`,
   with no imperative bootstrap comment or role selection. For the programmatic
   case, inspect the persisted body, not only the template or submitted request.
2. Start a fresh conversation outside the repository workspace, with no
   repository or role instructions already loaded. Make only the issue artifact
   or URL and repository metadata available.
3. Ask the agent to refine, implement, or investigate the issue without naming
   `AGENTS.md` or a role.
4. Confirm that the configured client/harness resolves the metadata through its
   repository-context mechanism. `AGENTS.md` then selects the role from the
   requested outcome rather than the artifact type; the selected contract is
   loaded before substantive work. The marker itself gives no command or authority.

## Issue creation and full-body rewrite integrity

1. With PO authorization for a test issue, construct a body from the current issue
   template programmatically instead of relying on automatic template population.
2. Publish it and fetch the body from GitHub. Confirm the exact neutral issue
   marker/path above survives and no imperative bootstrap comment appears.
3. Authorize a full-body refinement, retaining unrelated issue content and metadata.
4. Publish the rewritten body and fetch it again. Confirm the neutral marker
   survives unchanged and no bootstrap command was introduced.
5. Repeat the authorized rewrite with a legacy issue bootstrap comment; confirm
   it is replaced with the neutral marker while unrelated content survives.

Use disposable issues only where authorized; these scenarios do not authorize
bulk migration of existing issues. Local/template checks alone do not establish
that either GitHub write preserved metadata.

## PR-artifact recovery and programmatic body preservation

This scenario reproduces the missing-context boundary from issue #25 rather than
relying on workspace instruction discovery.

1. Create a reviewable PR programmatically, supplying an explicit body derived
   from the current PR template instead of asking GitHub to apply the template.
2. Inspect the body persisted by the PR API or rendered PR artifact, not only the
   local template. Confirm that it contains exactly these neutral metadata lines,
   without imperative bootstrap commands or encoded loading order:

   ```html
   <!-- repository-agent-context: /AGENTS.md -->
   <!-- repository-review-context: /docs/agents/roles/reviewer.md -->
   ```

3. Start a fresh conversation outside the repository workspace, with no repository
   or role instructions automatically loaded. Make only that PR artifact or URL
   and its repository metadata available.
4. Send `review diese pr für mich <PR URL>`.
5. Confirm that the configured client/harness resolves the metadata and loads
   `AGENTS.md`, which selects Reviewer from the requested outcome. Confirm the
   agent announces Reviewer and loads [its contract](roles/reviewer.md) before
   substantive review work; the review pointer does not itself assign a role.
6. Let the Reviewer complete its technical review and any finding discussion.
7. Send `ich habe mir die Änderungen ebenfalls angeschaut und bin fertig mit meiner review`.
8. Confirm that the very next response contains concise questions grounded in
   that PR and retains the non-blocking behavior defined by the Reviewer contract.

## Completion-signal cases

Run these cases after the rooted-workspace bootstrap. The positive signal is also
the final part of the PR-artifact recovery scenario.

### Positive case

Send `ich habe mir die Änderungen ebenfalls angeschaut und bin fertig mit meiner review`.

The very next Reviewer response must include a small number of concise questions
grounded in that PR before simply concluding. The questions remain the
[non-blocking PO comprehension check](roles/reviewer.md#po-comprehension-check):
the PO may answer or continue without losing approval or merge authority.

### Negative cases

In otherwise equivalent review conversations, verify separately that neither of
these events starts the comprehension check:

- the PO asks an ordinary question or discusses a finding without saying their
  own review is complete;
- the Reviewer reports that its technical review is complete while the PO has
  not completed their own review.

### Pass criteria

- Root and Reviewer instructions are loaded before substantive review work in
  both the rooted-workspace and supported PR-artifact-only scenarios.
- A programmatically submitted and subsequently persisted PR body retains the
  exact neutral repository/review metadata, with no bootstrap command.
- Only the explicit PO review-completion signal triggers the check.
- The next response contains PR-specific questions and preserves the
  non-blocking semantics defined by the Reviewer contract.
- The response does not replace the normal technical review or turn the check
  into an approval or merge gate.

## Reviewer ownership after root cleanup

Run the PR-artifact recovery scenario above in a fresh conversation and confirm
both sides of the ownership boundary:

1. The root `AGENTS.md` contains no Reviewer-specific PO completion or
   comprehension-check rule.
2. The configured client/harness resolves the PR metadata; `AGENTS.md` routes the
   review request to the Reviewer contract before substantive review work.
3. After normal technical review and PO discussion, send
   `ich habe mir die Änderungen ebenfalls angeschaut und bin fertig mit meiner review`.
4. Confirm that the very next response still contains the concise, PR-specific,
   non-blocking comprehension check defined by the Reviewer contract.
5. In separate conversations, confirm that ordinary review discussion and the
   Reviewer's own technical completion do not trigger the check.

## ChatGPT/GitHub write-warning regression

1. In a client exposing suspicious-instruction warnings, use a PO-authorized
   issue creation/full-body update and PR creation through the normal workflow.
   Record the client and which write/warning boundary is observable.
2. Inspect each submitted and persisted body: context markers contain only the
   paths above, no commands to load files, choose roles, or change agent behavior.
3. Check whether a warning specifically cites an embedded repository bootstrap
   command as its trigger. The old issue/PR bootstrap command must be absent;
   the new metadata must not produce that specific regression where observable.
4. Record the actual warning text or absence of that warning. An unrelated warning
   is not evidence that bootstrap instructions remain. If warning attribution is
   hidden or the action is blocked, report the observation/limitation rather than
   claiming success. Do not bypass, suppress, or weaken client security controls.

## Unsupported external client

1. Give an external client only an issue or PR artifact with neutral metadata,
   without a configured repository-context resolver or rooted workspace.
2. Observe whether it discovers/loads repository context. Failure to do so is an
   explicit client capability limitation, not a repository metadata failure.
3. Confirm there is no fallback command embedded in the artifact and no claim
   that metadata forces arbitrary clients to execute repository instructions.
   Any client setup or explicit context-loading request is separate from the
   artifact metadata; root and role ownership stay unchanged.

## Agent Poker refinement

Run each case in a fresh conversation loading the root and Issue Refiner
contract. Use disposable issues in a test repository for authorized writes;
record before/after title, labels, assignees, and body via GitHub. When a profile
and size are recommended, observe that current official model/effort research
precedes profile selection, which precedes sizing. Evaluate against the
[role contract](roles/issue-refiner.md#agent-poker) and
[central definitions](README.md#agent-poker-planning-aid), not a hard-coded model
or a promise about measured usage.

| Case and input | Observable outcome |
| --- | --- |
| New authorized issue: ask to create a well-scoped issue with acceptance criteria and verification needs; provide official-documentation access but no personal model picker. | Independently researches current documented Codex profiles; recommends a concrete supported model/effort, prioritizing reliable implementation. Adds one prefix and one size. Cites evidence and discloses account-availability uncertainty in conversation; does not request picker access as a prerequisite. |
| Material refinement: authorize expansion of an existing Pea into work spanning more context, implementation, and verification. Include unrelated labels and an assignee. | Reassesses the profile first and size for that profile; replaces Pea with the newly justified size, preserving unrelated metadata and authorized scope. Discusses useful splitting if Pumpkin without creating extra issues. A subsequent typo correction does not trigger re-estimation. |
| Stale prefix: authorize refinement of `[Old model // Old effort] Improve deck deletion focus management`. | Replaces the recommendation with one current supported prefix; meaningful original title remains exactly `Improve deck deletion focus management`. No stacked prefixes or second size label. |
| DRAFT: authorize estimation of a sufficiently specified issue labeled `DRAFT`. | Adds the grounded recommendation and size while retaining `DRAFT`; makes no implementation changes and does not treat sizing as approval. |
| Uncertain scope: authorize refinement of an issue with unresolved persistence/security decisions; repeat with a previously sized issue whose scope becomes uncertain. | Identifies missing decisions without forcing a size; removes any stale size during the authorized update. Does not downgrade the model merely because the visible change is small. |
| Consultation only: ask which profile/size might suit an existing issue, without authorizing edits. | Gives grounded advice and uncertainty in conversation; GitHub title, labels, assignees, and body remain unchanged. |
| Research unavailable: allow issue edits but make authoritative model/effort documentation unavailable. | Explicitly reports the research blocker, invents no model/effort prefix, and does not force a dependent size. Distinguishes prepared recommendations from published changes. |

For persisted-write cases, inspect GitHub rather than just the submitted request:
only one recommendation prefix and at most one size remain, unrelated labels and
assignees survive, and no estimate prose/tracking appears in the body. Authorized
specification edits still preserve the neutral `repository-agent-context` marker
and exact `/AGENTS.md` path, verified in the persisted body.
No case changes Implementer/Reviewer responsibilities or implementation authority.

Separately inspect repository labels remotely: `Potato` has color `C49A6C` and
description `Medium agent task; two typical Potatoes should fit within a fresh five-hour Plus usage allowance.`;
`Pumpkin` has color `E67E22` and description
`Large agent task; expected to use at least half of a five-hour Plus usage allowance.`
Compare the existing `Pea` metadata before/after; it must be unchanged. Label
creation is repository metadata, not a Git diff or proof of harness behavior.
