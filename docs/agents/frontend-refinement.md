# Frontend issue refinement

Additional guidance for the [Issue Refiner](roles/issue-refiner.md) when an
issue changes a frontend view, its visual presentation or an interaction flow.
It adds only frontend-specific practice. PO authority, readiness and DRAFT
semantics, the language policy and honest reporting remain owned by the root
[AGENTS.md](../../AGENTS.md); publication and Agent Poker by the Issue Refiner
contract; planning fields by
[issue planning metadata](../development/workflow.md#issue-planning-metadata);
and binding visual rules by the
[visual design guidelines](../product/visual-design-guidelines.md).

## Choose the mode from evidence

Before asking design questions, inspect the issue, its discussion, recorded
decisions, the affected production components and any referenced Playground
source. Then announce the chosen mode with a one-sentence reason grounded in
that evidence. Do not ask the PO to pick a mode; ask one clarifying question
only when decisive evidence is missing.

| Mode | Applies when | Evidence used |
| --- | --- | --- |
| **Functional** | A new or substantially changed view, navigation, form or interaction flow | Low-fidelity, mobile-first, static wireframes (code-drawn PNGs preferred), only where layout or states are actually undecided |
| **Visual migration** | An existing production element is restyled or replaced by a specific Playground variant while behavior stays the same | Exact source references and authentic screenshots or before/after captures; no obligatory wireframes |

- **Combine** both modes when a change alters behavior *and* appearance.
  Obtain separate PO approval for the behavior change and for the visual
  adoption.
- **Scale down** when the issue is small and already specified: confirm the
  behavior, affected states and acceptance criteria, and skip artifacts that
  add no information.
- **Switch** modes when new facts require it. Explain why and keep decisions
  that the PO has already approved.

## Collaborate on decisions

- Resolve **one open design decision at a time**: explain the realistic
  options and trade-offs, recommend one where evidence allows, and wait for
  the PO's answer. Independent closed questions, such as multiple choice on
  unrelated details, may be batched in one round.
- Do not ask about what is already decided; cite the source of an earlier
  decision when that helps.
- Cover empty, loading, error, confirmation, destructive, permission,
  responsive and accessibility states **where relevant to the flow**, and
  distinguish existing behavior from new requirements.
- Name frontend/backend gaps explicitly and propose separate prerequisite
  issues instead of widening the issue's scope.
- Keep a running list of approved and open decisions. The final issue records
  results, not a transcript of the conversation.

## Functional mode

- Agree on the flow, the control inventory and the critical states before
  drawing.
- Present one wireframe, or one tightly related set of states, at a time.
  Treat it as accepted only after explicit PO approval.
- There is no fixed number of wireframes. The six used for #201 are an
  example, not a quota.

## Visual migration mode

- Identify both endpoints: the production element being replaced, and the
  exact Playground variant, referenced by **file path, component or variant
  name and commit SHA**, so the target cannot change silently.
- Compare baseline and target for visual properties, responsive, touch and
  keyboard behavior, motion and reduced motion, accessibility, theme tokens
  and any behavioral differences.
- Ask the PO which properties migrate and which prototype-only details must
  not. Record the exact approved variant and scope. Existing behavior is
  preserved unless the PO decides otherwise.
- Approving one element never approves other Playground materials, textures,
  animations or themes. Playground prototypes remain candidates, not approved
  production designs.

## Store and report artifacts

Agents cannot attach images to GitHub issues through the API. Therefore:

- Store wireframes and screenshots that an issue relies on **in the
  repository** under `docs/design/<issue-number>/` through a small
  documentation PR, and link them from the issue. Alternatively, the PO
  attaches them manually through the GitHub web UI.
- Creating an artifact, the PO seeing it, the PO approving it and its
  persistent storage are **four separate facts**. Report only those with
  evidence.
- A refinement whose required artifacts are not persistently stored stays
  DRAFT.
