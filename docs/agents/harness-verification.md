# Agent harness verification scenarios

These manual regression scenarios verify client or harness behavior at the
conversation boundary, where repository-only automated tests cannot observe
instruction loading or later responses. Run each scenario in a fresh conversation
under the stated context conditions. The root [AGENTS.md](../../AGENTS.md) and
selected role contract are the authoritative instructions; this file records
test inputs and observable outcomes without restating the role policies.

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
