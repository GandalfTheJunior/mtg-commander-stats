# Agent harness verification scenarios

These manual regression scenarios verify client or harness behavior at the
conversation boundary, where repository-only automated tests cannot observe
instruction loading or later responses. Run each scenario in a fresh conversation
under the stated context conditions. The root [AGENTS.md](../../AGENTS.md) and
selected role contract are the authoritative instructions; this file records
test inputs and observable outcomes without restating the role policies.

Repository checks can deterministically verify that repository-controlled
templates and guidance contain or require the bootstrap markers and pointers,
and that policy has one authoritative owner. They cannot prove what GitHub
persisted for a submitted issue or PR, or force an external client to fetch or
follow repository content. Persisted-body preservation must be verified
separately against the GitHub API or rendered artifact; the fresh-conversation
scenarios below verify client or harness behavior.

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
3. Confirm that the client discovers the README's generic agent entry point and
   loads `/AGENTS.md` before substantive repository work.
4. Confirm that `AGENTS.md`, rather than the README entry point, selects the role
   from the requested outcome and that the selected role contract is loaded
   before substantive role work.

## Issue-artifact recovery

Run this scenario once with an issue created through the repository issue
template and once with an issue body constructed and submitted programmatically.

1. Inspect the issue body persisted by the GitHub API or rendered issue artifact.
   Confirm that it contains the hidden `agent-bootstrap` marker and its
   `/AGENTS.md` pointer. For the programmatic case, inspect the persisted body,
   not only the local template or submitted request.
2. Start a fresh conversation outside the repository workspace, with no
   repository or role instructions already loaded. Make only the issue artifact
   or URL and repository metadata available.
3. Ask the agent to refine, implement, or investigate the issue without naming
   `AGENTS.md` or a role.
4. Confirm that the client discovers the marker, loads `/AGENTS.md`, selects the
   role from the requested outcome rather than from the artifact type, and loads
   that role contract before substantive work.

## PR-artifact recovery and programmatic body preservation

This scenario reproduces the missing-context boundary from issue #25 rather than
relying on workspace instruction discovery.

1. Create a reviewable PR programmatically, supplying an explicit body derived
   from the current PR template instead of asking GitHub to apply the template.
2. Inspect the body persisted by the PR API or rendered PR artifact, not only the
   local template. Confirm that it contains the `agent-review-bootstrap` marker
   and its pointers to `/AGENTS.md` and the Reviewer contract.
3. Start a fresh conversation outside the repository workspace, with no repository
   or role instructions automatically loaded. Make only that PR artifact or URL
   and its repository metadata available.
4. Send `review diese pr für mich <PR URL>`.
5. Confirm that the agent discovers the bootstrap marker at the PR boundary,
   loads `AGENTS.md`, selects and announces Reviewer, and loads
   [the Reviewer contract](roles/reviewer.md) before substantive review work.
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
  both the rooted-workspace and PR-artifact-only scenarios.
- A programmatically submitted and subsequently persisted PR body retains the
  `agent-review-bootstrap` marker and both instruction-file pointers.
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
2. The PR marker leads the client through `AGENTS.md` to the Reviewer contract
   before substantive review work.
3. After normal technical review and PO discussion, send
   `ich habe mir die Änderungen ebenfalls angeschaut und bin fertig mit meiner review`.
4. Confirm that the very next response still contains the concise, PR-specific,
   non-blocking comprehension check defined by the Reviewer contract.
5. In separate conversations, confirm that ordinary review discussion and the
   Reviewer's own technical completion do not trigger the check.

## Screenshot delivery and recovery

Run these cases in a fresh conversation using the current client and the
[Implementer screenshot contract](roles/implementer.md#ui-screenshot-evidence).
Use non-sensitive desktop/mobile captures of a running development UI after its
final edit, stored outside Git. These cases test delivery behavior, not UI approval.

| Case and input | Observable outcome |
| --- | --- |
| Shared-workspace client supports direct absolute file links. Ask for the captured desktop/mobile images. | Final response uses existing readable image files through clickable workspace links or embeds in the supported format. The PO can open/view both images. The agent does not require an upload tool or substitute a bare path/PR URL. |
| File exists and the agent's image-view tool succeeds, but client rendering/receipt has not been observed. | The agent distinguishes capture and its own inspection from PO receipt; it does not treat tool success alone as proof of delivery. No mandatory receipt-confirmation question or new approval gate is introduced. |
| A submitted link is inaccessible. Send `Ich habe noch keine Bilder bekommen`. | The agent checks the file and client link format, uses an available supported alternative, and corrects unsupported delivery claims. It does not simply resend the same failed route or infer that all screenshot delivery is impossible. |
| After receiving corrected direct links, send `Das funktioniert`. | The agent recognizes receipt without treating it as UI approval or merge authority. When asked to update the PR, it records receipt, removes any stale delivery blocker, preserves real hosting/verification limitations and verifies the persisted body. |
| No supported delivery route is actually available. | The agent states the specific blocker honestly in the final response and PR, preserves the images, and does not claim receipt or commit temporary screenshots to work around delivery. |

Repository checks may verify file existence/readability and link syntax, but
cannot prove that a separate client renders an image or that the PO received it.
Exercise the delivery cases through the actual client; inspect any authorized
PR-body correction through GitHub rather than only the submitted request.

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
specification edits still preserve the bootstrap marker and `/AGENTS.md` pointer.
No case changes Implementer/Reviewer responsibilities or implementation authority.

Separately inspect repository labels remotely: `Potato` has color `C49A6C` and
description `Medium agent task; two typical Potatoes should fit within a fresh five-hour Plus usage allowance.`;
`Pumpkin` has color `E67E22` and description
`Large agent task; expected to use at least half of a five-hour Plus usage allowance.`
Compare the existing `Pea` metadata before/after; it must be unchanged. Label
creation is repository metadata, not a Git diff or proof of harness behavior.
