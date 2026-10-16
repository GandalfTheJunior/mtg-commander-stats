# Post-MVP frontend redesign: mobile-first navigation and warm visual theme

**Status:** Product direction agreed; **planning only**, not an implementation approval.
**Milestone:** First intended visual/UX milestone **after the MVP is verified complete**.
**Authoritative context:** [MVP scope](mvp-scope.md) defines existing and outstanding business features; [ADR 0003](../architecture/adr/0003-defer-ui-framework-until-after-mvp.md) establishes the planned post-MVP Material UI approach.

## Goal

Make the existing Commander web application pleasant and straightforward to use on a phone at the gaming table, without expanding gameplay functionality. The most frequent actions are **accessing a play group, recording a match, and managing decks**. The look should evoke a welcoming fantasy common room in the evening, while information and especially statistics remain legible and restrained.

This redesign is **not a declaration that the MVP is finished**. At the time of this concept, the MVP documentation still lists basic player/deck statistics as planned. Confirm the outstanding MVP work separately before beginning the post-MVP migration.

## Product structure (mobile first)

- After sign-in, open a personal **Dashboard** as the landing view.
- Provide persistent bottom navigation on phones for **Dashboard**, **Play groups**, and **Decks**. Keep account/logout access easy to find, for example through a top-right account control. Do not introduce unimplemented profile management.
- On larger screens, adapt the same information architecture responsively rather than building a separate desktop application.
- Support clear navigation and back behavior. Prefer large touch targets, accessible controls and minimal steps for common actions.

### Dashboard: play groups

- Show up to **three directly tappable play-group cards**, with the group name and only useful existing metadata (such as member count if already available).
- Tapping a card opens that group's view immediately.
- If the user belongs to more than three groups, offer **“Show all play groups”**, revealing the remainder in a finger-friendly expandable list or equivalent compact mobile interaction. Do not add favorites or a complex group management UI just for this.
- The exact ordering of the first three groups can be specified during UI refinement; avoid a backend feature solely to measure recent usage.

### Dashboard: decks

- Below groups, show **all the user's decks** as a single, vertically stacked set of cards on the dashboard. The **page itself scrolls**; do not create an inner scroll region inside the deck list.
- Keep a clearly reachable **“Create deck”** action at the start of that section.
- One card per deck. Show the **deck name, commander, and color identity**; indicate archived/used status as relevant.
- Tapping a card opens the existing **edit/manage flow** directly, not a new dedicated deck-detail page.
- Prefer a simple **chronological/history-based order** rather than usage-based ranking, popularity, favorites or new filters. Verify the current API's available ordering/data before committing to a specific newest-first behavior; do not add fields solely for cosmetic sorting.
- Existing deck constraints remain unchanged: after first game use, commander/color identity are locked, the name remains editable, and a used deck may be archived but not deleted.
- The separate **Decks** destination offers direct access to deck management; a denser grid or multi-column catalog is deferred.

### Play-group view

- The most prominent action on opening a group is **“Record a game” / “New game”** (final label to be confirmed). It must launch the **existing game-recording workflow**, not imply that a real-time companion or live session exists.
- Preserve access to **members**, **game history**, and **basic group statistics when delivered as part of the MVP**. Keep these discoverable but secondary to recording a match.
- The game form retains existing participant/deck selection, winner-or-draw and group authorization behavior. The redesign does not create game invitations, live life tracking or multi-device interactions.
- More extensive member/deck statistical profiles and rankings are separate features unless explicitly brought into scope later.

## Visual direction: warm, cozy, not decorative

- Target mood: a comfortable fantasy common room on a rainy evening; warm, inviting and calm.
- Initial semantic palette: **deep burgundy** for signature surfaces/actions, **warm dark charcoal** for backgrounds, **muted gold** for restrained emphasis and **cream/parchment** for readable text.
- These are **directional colors**, not final hex codes or a complete design system. Select exact tokens and test contrast in the implementation/refinement phase.
- Follow [ADR 0003](../architecture/adr/0003-defer-ui-framework-until-after-mvp.md): introduce **Material UI** after MVP, set up a centralized theme for colors, typography, spacing and component styling, then migrate screens incrementally.
- Prefer legible forms, tables and charts over atmospheric decoration, especially in statistics. Maintain adequate contrast, touch sizes, keyboard access and visible focus.
- Under YAGNI, **no** illustrated tavern rooms, fire/rain animations, textured backgrounds, individually configurable group themes or extra animation libraries for this milestone.

## Delivery boundaries and verification

This is a **presentation and navigation** project over existing MVP functionality. Preserve session/CSRF handling, permissions, game history and deck lifecycle behavior, API contracts and testable business logic. Do not silently expand the MVP or ship product functionality that is still only planned.

Suggested future implementation slices (each needs its own refined scope and PO authorization):
1. Material UI foundation, accessible theme and responsive app shell/navigation.
2. Dashboard play-group and deck sections and direct deck editing/navigation.
3. Group overview with primary game-recording entry point and migration of current member/game views.
4. Adapt existing forms and the **basic MVP statistics screens, once those statistics exist**, to the same design system.

Check on narrow and wide phone viewports, at desktop sizes, with long group/deck names, many decks, zero groups/decks, archived decks and expired sessions; verify screen-reader labels/focus, touch affordances and legible contrast. Keep existing frontend behavioral checks green. The group action should still invoke the real recording flow and preserve authorization rules.

## Explicitly outside this redesign

- [Play-group seasons](playgroup-seasons.md), including season selectors and leaderboards: tracked separately in the DRAFT issue.
- Live [Commander Companion](post-mvp-commander-companion.md), multi-device sync and life tracking.
- PWA installation/offline behavior, native app packaging, app-store delivery.
- New statistics beyond the MVP; profile features not actually implemented.
- New sorting/filtering/favorites systems, decorative illustrations or animations.

## Decisions to confirm when refining implementation issues

- Final navigation labels, game action wording, and behavior when a user has zero or more than three groups.
- Exact color tokens, component states, typography and accessibility contrast checks.
- Whether current API responses provide an explicit creation order for decks or only an existing server order.
- Final layout for basic statistics after the outstanding MVP statistics work is complete.
