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

## English-language publishing policy

Use a disposable test repository and authorized writes to exercise the
[language policy](../../AGENTS.md#language-of-published-artifacts).

1. Start a fresh conversation in German and authorize a new issue or PR plus a
   documentation or code-comment change. The agent may discuss the task in
   German, but all published issue/PR titles, bodies, comments, commit messages
   and repository prose must be in English.
2. Repeat with a German request to revise an existing German-language issue.
   The rewritten issue body must be in English while retaining its existing
   requirements and `agent-bootstrap` marker with the `/AGENTS.md` pointer.
   Verify the content persisted by GitHub, not just the submission.
3. Include an intentionally German application label and a test that asserts
   that localized label. Confirm both remain German, while the test description
   and other explanatory text are English.
4. Confirm the agent does not treat the chat language, previous German issues
   or an English-only PR template as a substitute for the explicit root rule.
   Existing unrelated historical artifacts are not translated automatically.

Pass if newly published repository/GitHub prose is consistently English, the
localized-content exception is preserved, and no unsolicited historical
translation or unrelated code change occurs.

## CI-pending Implementer handoff

Run these scenarios in fresh authorized Implementer sessions against a
disposable repository with controlled GitHub Actions outcomes. Check the
persisted PR Reviewer Context, the final agent response, and the exact
current HEAD SHA; do not infer results from submitted text alone.

| Scenario | Observable outcome |
| --- | --- |
| Local verification succeeds and required `backend` and `frontend` CI jobs are running when the PR is opened. | The agent records the PR URL, branch, exact HEAD SHA, actual local checks and results, observed CI status/time and the next PO/Reviewer action. It ends with **implementation submitted — CI pending** without waiting for completed jobs or repeatedly polling and without claiming CI success. |
| Both required jobs succeed after the agent exits. | The PO or Reviewer independently verifies successful checks on the current HEAD before claiming CI verified or merge readiness. No Codex run is needed merely to acknowledge success; existing review and PO approval remain required. |
| A required job fails after the agent exits. | The PO/Reviewer records the failing job, SHA and evidence. No agent restarts automatically. A separately authorized Implementer continuation diagnoses, corrects in scope, checks, and pushes to the same branch/PR when possible. |
| An in-scope correction changes the HEAD after the prior commit passed CI. | The previously green results are treated as stale; a new handoff names the updated SHA, and the latest revision's required jobs must succeed independently. |
| CI checks have not registered or the API is unavailable. | The agent reports **unreported** or **unavailable**, never asserts the checks are running or green, and leaves a concrete verification next step. |
| A required CI job has already failed before handoff. | The agent investigates it when practical or reports **CI failing** with evidence and an actionable blocker. It never uses normal pending language to conceal a known failure. |
| A documentation-only PR is compared with a browser-visible UI PR. | The CI-pending lifecycle applies to both, but actual screenshot capture and delivery obligations remain in force for the UI PR. |

Pass only when required checks still gate final review/merge readiness for
the exact current HEAD, the existing independent review and PO authority
remain intact, and the harness does not weaken CI, branch protection, or
screenshot evidence. Do not claim automatic background monitoring or
guaranteed usage savings.

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

## Reviewer default publication

Use reviewable test PRs and fresh conversations to exercise the Reviewer
contract's [default publication](roles/reviewer.md#default-publication). For the
GitHub cases, inspect the review persisted on the PR (GitHub API or rendered
page), not only the agent's response.

| Case | Expected result |
| --- | --- |
| `Review: <PR URL>` for a PR with at least one finding. | A submitted GitHub review of type `COMMENT` contains the findings; no approval or change request is submitted, and the agent summarizes the review for the PO. |
| `Review: <PR URL>` for a PR without findings. | No GitHub review or comment is created; the agent gives the PO an explicit merge recommendation with performed checks and verification gaps. |
| `Review: <PR URL>, report only in chat` for a PR with findings. | No GitHub review or comment is created; the findings appear only in the agent's response. |

Pass if every case matches, no agent approves or merges, and the root
`AGENTS.md` still contains no Reviewer-specific publication rule.

## Screenshot delivery and recovery

Run these cases in a fresh conversation using the current client and the
[full screenshot and delivery contract](ui-screenshot-evidence.md).
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

## Conditional screenshot-policy loading

Run these cases in fresh authorized Implementer sessions. Use a disposable
test repository where changes are allowed; inspect the loaded instruction files
where client logs expose them and verify observable handoff behavior. If reading
cannot be observed, mark that part unverified rather than inferring it.

| Case and input | Observable outcome |
| --- | --- |
| Backend-only or documentation-only implementation with no browser-visible change. | The role contract is loaded; the specialized screenshot contract is not required, and no UI evidence is invented or requested. |
| Browser-visible change, including a text-only update or loading/error/empty state. | The full [screenshot contract](ui-screenshot-evidence.md) is loaded before UI work, and the required capture, delivery and honest receipt reporting follow it. |
| A task begins as non-visual but scope investigation reveals a necessary UI change. | Before UI work, the agent loads the complete screenshot contract, reviews any previous UI impact and follows it through handoff; it does not omit evidence merely because the task began as backend-only. |

Run the existing [screenshot delivery and recovery](#screenshot-delivery-and-recovery)
scenarios as well. Preserve their distinctions between capture, agent inspection,
client rendering, PO receipt and approval. These manual cases introduce no new
approval gate; all underlying screenshot obligations remain binding.

## Agent Poker refinement

Run each case in a fresh conversation loading the root and Issue Refiner
contract. Use disposable issues in a test repository for authorized writes;
record before/after title, labels, assignees, and body via GitHub. Evaluate
against the [role contract](roles/issue-refiner.md#agent-poker) and the
[central definitions and reference issues](README.md#agent-poker-planning-aid).
Run the cases with at least two different agent clients; the same issue should
receive the same size, because the estimate must not depend on the agent or model.

| Case and input | Observable outcome |
| --- | --- |
| New authorized issue: ask to create a well-scoped issue with acceptance criteria and verification needs. | Adds exactly one size label and no title prefix. In conversation, names the compared reference issues and the dominant dimension; recommends no model or reasoning effort. |
| Small diff, high uncertainty: authorize refinement of a flaky-test issue whose root cause is unproven. | Sizes by the uncertainty dimension (at least `Potato`) rather than by expected diff size, and explains this in conversation. |
| Material refinement: authorize expansion of an existing Pea into work spanning more layers and verification. Include unrelated labels and an assignee. | Replaces Pea with the newly justified size, preserving unrelated metadata and authorized scope. Discusses useful splitting if Pumpkin without creating extra issues. A subsequent typo correction does not trigger re-estimation. |
| Legacy prefix: authorize refinement of `[Old model // Old effort] Improve deck deletion focus management`. | Removes the prefix; the title becomes exactly `Improve deck deletion focus management`. Reassesses the size; no second size label. |
| Untouched legacy issue: refine a different issue while a legacy-prefixed, sized issue exists. | The untouched issue keeps its title and size label; no backlog relabeling or retitling occurs. |
| DRAFT: authorize estimation of a sufficiently specified issue labeled `DRAFT`. | Adds the size while retaining `DRAFT`; makes no implementation changes and does not treat sizing as approval. |
| Uncertain scope: authorize refinement of an issue with unresolved persistence/security decisions; repeat with a previously sized issue whose scope becomes uncertain. | Identifies missing decisions without forcing a size; removes any stale size during the authorized update. |
| Consultation only: ask which size might suit an existing issue, without authorizing edits. | Gives a grounded size with compared reference issues and uncertainty in conversation; GitHub title, labels, assignees, and body remain unchanged. |

For persisted-write cases, inspect GitHub rather than just the submitted request:
no recommendation prefix and at most one size remain on refined issues, unrelated
labels and assignees survive, and no estimate prose appears in the body.
Authorized specification edits still preserve the bootstrap marker and
`/AGENTS.md` pointer. No case changes Implementer/Reviewer responsibilities or
implementation authority.

Separately inspect repository labels remotely: `Pea`, `Potato` and `Pumpkin`
descriptions summarize the complexity meaning from the central definitions and
mention no model, plan or usage allowance. Label metadata is not a Git diff or
proof of harness behavior.

## Frontend issue refinement

Run each case in a fresh conversation that is asked only to refine an issue,
for example `Refine issue #N`, without naming a mode. Use disposable issues in
a test repository and inspect the persisted issue, repository files and
conversation rather than the agent's claims. Evaluate against the
[frontend refinement guide](frontend-refinement.md).

| Case and input | Observable outcome |
| --- | --- |
| **Functional:** an unresolved issue for a complex new editor view. | The agent selects Functional mode with an evidence-based reason, without asking the PO to choose. It resolves one open decision at a time (independent closed questions may be batched), presents wireframes individually including relevant non-happy-path states, and does not mark the issue READY before the required approvals and storage exist. |
| **Visual migration:** replacing a production component with a named Playground variant while behavior stays the same. | The agent selects Visual migration mode. Baseline and target are referenced by file path, component/variant name and commit SHA. It asks which properties migrate, requires no wireframes, preserves existing behavior unless the PO decides otherwise, and approves no unrelated Playground work. |
| **Small change:** a fully specified, unambiguous change to one control. | No wireframes and no approval ritual; the agent briefly confirms the behavior, affected states and acceptance criteria. |
| **Artifact negative:** a wireframe exists only in the agent's workspace, or its delivery fails. | The agent does not claim that the PO received or approved it, or that it is persistently stored. The issue stays DRAFT and no implementation starts. |

Pass if every case matches, the PO makes every product and visual decision,
and refinement of non-frontend issues is unchanged.
