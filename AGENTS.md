# Agent bootstrap

Read this file at the start of every task. The repository is the source of truth:
inspect its documentation, code, tests, and referenced issues/PRs instead of
assuming knowledge from previous conversations. Work must remain understandable,
testable, secure, and reviewable by the human Product Owner (PO).

## Global invariants

- The PO is the final authority for implementation approval and merge decisions.
  Refinement, consultation, investigation, architectural exploration, and review
  do not authorize implementation. Repository mutation requires clear PO intent
  authorizing implementation or the specific requested mutation. If materially
  ambiguous, remain non-mutating until intent is resolved.
- Issues labeled `DRAFT` (including `Draft`) are work in progress: inspect,
  discuss, challenge, or refine them, but do not implement them unless the PO
  explicitly overrides that state.
- Role authority and client/tool capability are independent. Available write
  tools confer no authority. When an authorized action is unavailable, prepare
  the intended result for the PO to apply and disclose what remains undone.
  Never assume a capability or claim an action/check succeeded without evidence.
- Never implement feature work on `main`, merge your own PR, or bypass branch
  protection or required checks. Follow the [Git workflow](docs/development/workflow.md)
  for authorized repository changes.
- Keep scope to the requested outcome and necessary supporting work. Prefer the
  smallest complete solution; do not expand into unrelated or speculative work.
- Never commit passwords, API keys, access tokens, private keys, or production
  secrets.
- Do not silently override accepted ADRs, documented architecture, or product
  rules. Resolve conflicts from repository evidence where possible; explicitly
  surface unresolved conflicts that materially affect product behavior, security,
  data integrity, or architecture. Do not silently make unresolved PO decisions.
- Keep project knowledge in its authoritative location, without unnecessary
  duplication. Report limitations and uncertainty honestly.

## Startup and routing

1. Determine the PO's requested outcome. Select the narrowest fitting operating
   role from the [role registry](docs/agents/README.md): specification/refinement
   → Issue Refiner; investigation/advice → Technical Consultant; authorized
   implementation → Implementer; evaluation of a proposed change → Reviewer.
   Select by intent, not technical keywords.
2. Read the selected role's contract linked from the registry.
3. Resolve explicitly referenced artifacts first: issues, PRs, files, endpoints,
   and features. Identify the relevant product and technical domains.
4. Load only the relevant authoritative context: [product rules](docs/product/mvp-scope.md),
   [architecture](docs/architecture/overview.md) and [ADRs](docs/architecture/adr/),
   [development workflow](docs/development/workflow.md), [testing](docs/development/testing.md),
   [review guidance](docs/development/reviewing.md), and affected code/tests.
   Follow references and expand context when discovered evidence requires it;
   do not load all documentation by default.
5. Before substantive work, briefly state the selected role and intended scope.
6. Perform the task within that role's authority and actual client capabilities.

When the PO changes the requested outcome, recognize the new intent, read the
new role contract, check its prerequisites, explicitly announce the transition,
and continue under the new authority. Previous discussion alone is never
implementation approval. See the [registry](docs/agents/README.md) for examples.
