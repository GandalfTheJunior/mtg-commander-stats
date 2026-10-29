# Visual design guidelines

**Status:** Living, PO-approved visual direction; initial baseline documented
2026-10-29. Only the **Approved** sections below are binding for production UI.
**Exploration** and future ideas are not feature specifications or implementation
authorization.

**Scope:** Visual identity and interaction character of the production frontend.
The [frontend redesign](frontend-redesign.md) owns feature behavior and navigation;
[frontend-theme.md](../development/frontend-theme.md) documents technical use of
the shared [MUI theme](../../frontend/src/theme/theme.ts); the
[motion playground](../development/motion-playground.md) records experiments.
Do not duplicate token values or API/product rules here.

## Approved: visual north star

The app should feel like a **welcoming, lived-in, quietly magical common room**
where a close-knit group gathers to play: warm, comfortable, personal, and
inviting, without losing the clarity of a modern mobile application.

The Product Owner named the **Gryffindor common room** as a reference for the
*feeling*, **not** as a set, art direction or brand to replicate. The product is
**not** a tavern, pub, inn, bar or medieval drinking-hall aesthetic. In
particular, do not introduce bar or hospitality motifs to express this mood.

### Original work, not franchise imitation

Translate the emotional qualities into an independent visual language.
Do not recreate recognizable layouts, emblems, crests, school branding, props,
artwork, character references or distinctive graphic compositions from the
Harry Potter/Hogwarts world. Do not introduce franchise names or marks into
product UI or assets. Prefer original designs and properly cleared materials;
review any proposed external artwork for rights before adoption.

Ideas such as soft warm light, familiar furnishings, textiles, wood and
subtle magical details may be **explored** in the playground. This sentence
does not approve any particular decoration, illustration, animation, asset,
texture or new component for production.

## Approved: existing UI foundations

Preserve the already agreed and implemented [shared visual system](frontend-redesign.md#shared-visual-system):
the warm dark palette with burgundy and muted gold; readable cream text;
modern system sans-serif for controls with restrained serif wordmark;
8px spacing, modest rounding, touch-friendly controls, visible focus and
semantically distinguishable states. Use semantic tokens from
`frontend/src/theme/theme.ts` instead of hard-coded new colors. Follow the
[theme guidance](../development/frontend-theme.md) for component states and
contrast checks.

Keep the UI mobile-first and usable at the table. Motion should communicate
interaction, respect reduced-motion preferences and not compromise readability
or performance. The [current redesign scope](frontend-redesign.md#shared-visual-system)
still excludes decorative animated rain/fire, individualized room themes and
background illustrations. A playground example does not override these limits.

## Exploration: not yet binding

The playground can compare styles, materials, frames, motion, lighting and
other ideas without changing the approved product direction. Neither merging
an experiment nor passing its automated tests constitutes visual approval.
Only explicit PO decisions promote a particular result into a production
design rule. Do not import playground modules into production merely because
they offer a working prototype.

A separate [long-term idea](frontend-redesign.md#future-exploration-playgroup-identity-and-personalization)
is to let each playgroup develop its own identity by customizing its playgroup
area. **This is not approved for implementation.** The type and extent of
customization and all product, security and persistence decisions are open.
It must not be treated as an exception to the current redesign scope.

## Promoting an experiment to an approved rule

1. **Experiment:** Iterate in the playground; record references and observable
   behavior in its own development documentation.
2. **PO decision:** Capture exactly what the PO accepts, and **where** it
   applies (global principle, specific screen, or individual component).
   Distinguish approved details from ideas still being tested.
3. **Document:** Update this guide via a reviewable documentation change with
   its status, rationale, scope and links to the accepted example. If an
   existing product rule conflicts, surface the conflict for an explicit PO
   decision rather than silently replacing it.
4. **Adopt:** Implement the accepted behavior in the owning production feature
   through a separate authorized issue/PR. Update the theme only if a genuinely
   shared token or pattern is approved; test accessibility, motion and relevant
   viewports. Do not move demo data or one-off CSS into shared production code.
5. **Maintain:** Review future UI PRs against approved rules and update the
   authoritative guideline when the PO changes a design decision.

**Agent rule:** For production UI work, read this guide and the relevant
product and technical docs before proposing or implementing visuals. Respect
only explicitly approved decisions as constraints; identify unapproved
playground ideas, conflicting specifications and material design exceptions
for the PO. Documentation does not grant permission to implement deferred
features.
