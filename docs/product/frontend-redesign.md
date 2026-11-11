# Post-MVP frontend redesign: mobile-first Commander companion

**Status:** Product/UX direction approved by the Product Owner; planning specification only. **No feature implementation is authorized by this document.**
The later [#172 functional UI initiative](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/172) and its [#190 routing specification](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/190) supersede this document's earlier navigation, group landing, and invitation-code directions. Each child issue owns its screen implementation and final approved behavior.
**Milestone:** First intended visual and navigation redesign after the existing MVP is independently verified complete.
**References:** [MVP scope](mvp-scope.md), [deck API](decks-api.md), [play groups API](groups-api.md), [games API](games-api.md), [group statistics API](statistics-api.md), [ADR 0003](../architecture/adr/0003-defer-ui-framework-until-after-mvp.md), and [redesign tracker #59](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/59).

## Product goal and limits

Make the existing React/TypeScript and Spring Boot Commander application comfortable to use at the table on a phone, with deck management, game recording and statistics receiving comparable care. Deliver an app-like **responsive web interface** first; native mobile packaging, offline/PWA support and hosting are separate milestones.

This is a navigation and presentation redesign **over existing business features**, not a new game system. Keep existing authentication, session and CSRF behavior; ownership and active membership checks; the 2–6-player game contract; permanent deck usage/archival rules; history; and existing player/deck statistics. The backend remains authoritative. The basic statistics API and current browser statistics tables are implemented, according to [MVP scope](mvp-scope.md); their existence does not by itself establish formal completion of the whole MVP.

## Navigation and app shell

- After sign-in, land on **Dashboard**. On phones show the global bottom navigation **Dashboard | Playgroups | Decks**, with account/logout reachable from the top right. Do not imply profile editing exists.
- **Playgroups** is the destination for browsing groups and the existing create-group and join-by-code flows. Tapping a group opens it directly. **Decks** opens the full personal deck-management area.
- Give screens and details clear back navigation and sensible browser history behavior. Adapt the same hierarchy for larger viewports; no separate desktop application.
- Keep the phone layout vertically scrollable without nested dashboard/deck-list scrolling. Full-screen focused forms (game capture and deck create/edit) may temporarily hide the global bottom navigation, but must preserve clear back/cancel behavior.
- Retire old protected state and stale requests on session/identity changes and loss of group membership; do not show stale invitation codes, game or deck information during access recovery.

## Dashboard

### Playgroups entry and match recording (#191)

- Show **Meine Playgroups** directly below the Dashboard heading at ordinary
  spacing. There is no visible reserved design area or decorative content.
- Render the first three groups in the existing API order (alphabetical name,
  deterministic ID tie-break). Each compact card shows only the group name,
  its Overview action and a separate **Spiel erfassen** action. The latter opens
  the existing group-scoped editor directly, without a group picker or personal
  deck requirement. Interactive targets are siblings.
- Show the small right-aligned **Alle Playgroups anzeigen** shortcut on the
  section heading row only for four or more groups. It opens `/playgroups`, the
  same complete collection as global navigation, without expanding Dashboard.
- A compact, left-aligned accessible **+** below the cards opens the existing
  Playgroup creation dialog via `/playgroups?create=1`. The collection consumes
  this entry flag with history replacement; reload does not reopen the dialog.
- Only a successful empty list shows **Du bist noch keiner Playgroup beigetreten.
  Erstelle eine eigene Playgroup oder öffne einen Einladungslink.** with the +
  immediately below. Loading and failure have distinct feedback and retry.
- Dashboard has no personal decks, deck requests, join button, invitation-code
  input, group roles or artwork. Personal deck browsing and creation remain in
  the global Decks destination. Link-only invitation acceptance belongs to #200.
- Future atmosphere or statistics above Meine Playgroups require a separate
  approved design issue; no placeholder or extra spacer reserves that space.

## Opened playgroup

Opening a playgroup lands directly in **Spiele**. Inside the group, use three subviews/tabs: **Spiele | Statistiken | Mitglieder**. Keep the group name, a back affordance and a top-right overflow menu for group administration. Avoid a separate group-overview landing screen.

### Spiele: recording entry and history

- Put **Spiel erfassen** prominently before the recorded-game history. It launches the existing stored-game workflow, **not a live session or Commander Companion**.
- Render history in vertically stacked, tappable cards. Each card presents **winner and winning deck** for a win, or **Unentschieden** without a winner, the server recording timestamp labeled **Erfasst am**, and participant count.
- Preserve the games API's newest-recorded-first order; **recordedAt** is an audit/recording timestamp, not a separately entered date of play. The current API provides no separate played-at date.
- Each history card opens a dedicated **Spieldetails** screen. Show the complete participant and deck assignments, commander and color identity, archived-deck indication where applicable, result, recording timestamp and original creator. Current public display names, not historical snapshots, are what the API provides.
- Place **Bearbeiten** and **Löschen** in the details overflow menu **only** for the active original game creator or active group OWNER. Hide these actions for other readers; the server still enforces rights. Deletion requires explicit confirmation and permanently deletes that game.
- Editing opens the same game-editor screen, prefilled with **exactly the saved participants** (not four new rows). Preserve unchanged former-member/archived-deck historical assignments according to the games API. The game's ID, group, creator and recorded timestamp do not change.

### Spiel erfassen: phone form

> The PO-approved #196 specification and [wireframes](wireframes/196/README.md)
> refine this baseline (date row, outcome switch, compact cards with a separate
> result row, pickers, winner-only saving and the post-save panel). The
> [browser game editor](games-api.md#browser-game-editor) describes the result.

- Use a single, vertically scrolling, focused screen rather than a multi-step wizard. A new game displays **four empty player cards by default**, while the game contract remains **2–6 distinct participants**. The recorder need not participate and is not inserted automatically.
- Each player card selects a group member first, then one of that active member's eligible **owned, unarchived** decks. A participant cannot be selected twice. Show loading, unavailable-deck and retry states without permitting invalid selections.
- A fully filled player/deck card collapses automatically into a compact summary (player, deck, WUBRG identity) and can be reopened. Auto-collapse must not strand keyboard/screen-reader focus.
- Completely **empty** default cards do **not** count as participants and are discarded from the submitted payload. A **partially completed** card is an error and must be completed or emptied/removed before submission. Require at least two and at most six complete, distinct participant/deck assignments.
- Allow adding/removing cards within the 2–6 participant range; do not force a two- or three-player game to explicitly remove untouched fourth/third initial slots.
- In a separate **Spielergebnis** section offer **Sieg** or **Unentschieden**. For a win, require an **explicitly chosen** winner from the actual complete participants; never preselect one. For a draw, send no winner. Removing or changing the selected winning player clears the invalid winner selection.
- Use a direct **Spiel speichern** action, with understandable field-level validation, no additional review/confirmation screen, and duplicate-submit protection. A successful acknowledged write returns to refreshed game history with feedback and reloads dependent deck/statistics state.
- Warn before abandoning a changed unsaved form. Failed or ambiguous writes must **not** be announced as successful; confirm current authorization and let the user review refreshed history before retrying in case the server committed the first request.

### Statistiken: existing group data, mobile cards

- The group **Statistiken** tab switches between **Spieler** and **Decks**. Present one readable statistics card per row on phones; desktop may use a table.
- Player cards: display name, games, wins, win rate. Deck cards: deck name, commander, owner, games, wins, win rate, and archived status when applicable.
- Support **all existing client-side sorting**: players by name/games/wins/win rate; decks by deck name/owner/games/wins/win rate. Support ascending and descending order, with independent state for the two views. Before sorting, preserve the API name-based order; numeric sort starts descending and textual sort ascending.
- Values, including win rate (up to two fractional digits), come from the **existing statistics API**. Only players/decks appearing in persisted group games are included. Former members and archived decks with surviving game references remain in results; draws count as games without wins.
- Provide loading/error/empty states and refresh. No new profiles, drilldown pages, rankings, leaderboards, totals, charts or derived statistics in this milestone.

### Mitglieder and group administration

**Invitation supersession (#187 / #200, PO decision 2026-11-03):** The previous
reusable code and OWNER-only rotation plan is replaced by independent 24-hour,
single-use invitations created by any active member. Ship the link-first share,
public name-only preview, registration/login return and explicit join UI in #200
with the backend cutover. No revocation or manual-entry UI is approved. The
[group API](groups-api.md) and [cutover runbook](../development/invitation-cutover.md)
own the contract and sequencing.

- Show **active members only**, in compact rows with display name, role **Gruppenersteller/Mitglied**, a subtle OWNER marker and indication of the signed-in account. Stable IDs must distinguish duplicate display names where necessary, without dominating the normal visual presentation.
- Do not add member profiles, member removal, additional roles or ownership transfer.
- Move administrative actions into the **group** overflow menu, while respecting the existing server rules:
  - **Any active member:** create a fresh invitation and open the native share sheet, with Copy link fallback. Each link admits one person within 24 hours. Preserve session/access guards; never auto-join.
  - **MEMBER only:** **Gruppe verlassen** opens a confirmation explaining loss of active access, retention of historical results and need for a different valid invitation to rejoin. Successful departure returns to the group list and clears group-specific protected state.
  - An OWNER cannot leave. Neither role can remove another member through the current API.
- Keep group creation and joining in the global **Playgroups** area, not the members tab.

## Personal Decks collection and deck editor (#201)

[Issue #201](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/201) and its
[PO-approved wireframes](wireframes/201/README.md) own this area; they supersede the earlier
manual-text, WUBRG-selector draft of this section. In summary:

- **Meine Decks** shows active decks first and archived decks in a collapsed **Archivierte Decks**
  section (omitted when empty), each sorted A–Z by name with the deck UUID as tie-breaker. A
  top-right **+** creates a deck; there is no manual refresh. Search by deck or Commander name
  appears only when the complete collection overflows the viewport. Compact cards show
  Commander names prominently, the deck name quieter, an adjacent ManaBox link when valid,
  WUBRG symbols and independent artwork (gallery), **Karte anzeigen** and editor targets.
- One scrolling create/edit form: Deckname → Deckformat (Commander / Pauper Commander) →
  artwork preview (after the first Commander) → Commander(s) with per-Commander chosen color →
  optional genuine Companion → optional ManaBox link → Abbrechen / Save. Inline autocomplete
  (two characters, up to five name-and-color rows, Fblthp/Moon copy) commits only explicit
  selections. Invalid dependent selections are removed with an inline **Rückgängig**.
- All edits, including artwork chosen in the editor, are a local draft saved atomically with
  one explicit action. After first use, format, Commanders, chosen colors and Companion stay
  visibly locked; activating them shows a short notice. The header menu offers only valid
  actions: active unused **Archivieren** + **Löschen**, active used **Archivieren**, archived
  unused **Löschen**, archived used no menu. No unarchive exists.

## Shared visual system

**Mood:** A warm, welcoming, subtly magical **shared living room** with a sense of belonging and comfort. The Gryffindor common room is an inspiration **for atmosphere only**, not a design to reproduce. This is expressly **not** a tavern, pub or inn aesthetic. Keep the interface modern, legible and mobile-first; do not copy recognizable settings, house insignia, artwork or branding from the Harry Potter world. The [visual design guidelines](visual-design-guidelines.md) define the approved product direction.

### Proposed starting theme tokens (subject to accessibility verification)

| Semantic purpose | Starting value |
| --- | --- |
| App background | #19171B |
| Card surface | #29242A |
| Raised surface | #342A31 |
| Primary burgundy | #854358 |
| Muted gold accent | #DBB977 |
| Primary cream text | #F4EBDF |
| Secondary warm text | #CDBFB3 |
| Subtle decorative divider | #5B4B54 |

- Use a modest **serif typeface for the app wordmark/branding only**, with modern system sans-serif for navigation, forms, card labels and statistics. Keep typical body/form text around 16 px and supporting text readable; use tabular figures for statistics.
- Prefer an **8 px spacing system**, gently rounded cards (roughly 12–16 px), understated borders, and touch targets at least approximately **44–48 px** high.
- Reserve gold for selected navigation, key accents and restrained winner cues; it must not be the sole way of conveying state. Strong text/surface and primary-button contrast is mandatory. Validate all interactive, focus, disabled, error and WUBRG states against applicable accessibility contrast requirements before accepting final values. Decorative dividers alone are not focus or control outlines.
- Use the centralized **Material UI** theme and product-specific components when truly shared (e.g. DeckCard, PlaygroupCard, StatisticsCard, ManaColorPicker). Follow [ADR 0003](../architecture/adr/0003-defer-ui-framework-until-after-mvp.md): introduce Material UI **after verified MVP completion**, and migrate incrementally. Do not wrap every MUI primitive without need.
- Prefer native-feeling transitions only when functional and motion-safe. This redesign milestone does not include animated rain/fire, individualized room themes, background illustrations or gratuitous animation libraries. The [long-term playgroup personalization idea](#future-exploration-playgroup-identity-and-personalization) does not change that current scope.

## Acceptance and regression scenarios

For each independently authorized implementation slice, exercise relevant cases and keep existing checks green:

- 320 px and wider phone layouts, keyboard-only and screen-reader navigation, visible focus, legible WUBRG colors, responsive desktop, long/duplicate names, many decks and games, and no unwanted horizontal/nested dashboard scrolling.
- Zero/one/three/more-than-three groups; Overview and match actions select the correct group; the collection shortcut is visible only above three; contextual creation and link-only invitations remain accessible.
- Dashboard shows only up to three Playgroups. The Decks destination owns personal browsing and creation, including archived decks and its zero-deck state.
- Deck creation and editing: WUBRG and colorless, saved/unsaved forms, never-used vs ever-used locks, rename on archived deck, valid deletion/archival confirmations and correct handling of conflicts.
- Game capture: untouched initial four slots, 2/3/4/6 participants, partial slot invalid, duplicate member ineligible, missing/deck-loading states, win with participating winner, draw without winner, unsaved changes, and no duplicate write.
- Game history/details: server newest-first, recorded-vs-played timestamp labeling, historical former members/archived decks, owner/creator vs read-only member authorization, and confirmed destructive operations.
- Statistics: independent player/deck sorting with complete existing columns and directions, correct API values and empty/history/draw/archived/former-member cases; no leaderboard semantics.
- Group administration: active-member invitation creation, native sharing/copy fallback, one-use/expiry feedback, member-only confirmed leave, access loss, expired sessions, and CSRF/authorization recovery.
- Navigation/state: back/forward and switching group/deck areas after writes, stale-request retirement on identity/session change, safe handling of uncertain network writes.

Relevant test levels and exact commands follow [testing guidance](../development/testing.md) and the [README verification instructions](../../README.md#verification). Do not claim unrun checks passed.

## Proposed implementation slices (each requires separate PO authorization)

1. **Material UI foundation and semantic theme**: dependencies, token definitions, typography, shared interaction states.
2. **Responsive app shell/navigation**: session-aware state, bottom nav, account control, back/history behavior.
3. **Dashboard (#191)**: up to three group cards, distinct Overview/match entry, conditional collection shortcut and contextual creation.
4. **Deck create/edit**: full-screen editor, ManaColorPicker, lifecycle menus/confirmation.
5. **Playgroup navigation and members**: Spiele/Statistiken/Mitglieder and single-use invitation sharing.
6. **Game history and details**: history cards, dedicated details and authorized overflow actions.
7. **Game capture editor**: four initial cards, blank-slot handling, compact cards, results, persistence/error recovery.
8. **Basic statistics presentation**: player/deck card toggle with full existing sort behavior.

These are planning work packages, **not preauthorized implementation issues**. Validate the MVP milestone and prepare separate acceptance criteria, test scope, issue sizing and reviewable branches before starting each one.

## Future exploration: playgroup identity and personalization

**Status: Early Product Owner idea (2026-10-29), not an approved feature specification or implementation task.**

Long term, individual playgroups could build their own recognizable identity by
customizing the appearance of **their own playgroup area** in the application.
The Product Owner wants to explore this direction incrementally, rather than
treating every playgroup as visually identical forever.

The extent of customization, visual options, who may configure them, defaults,
accessibility safeguards, ownership/permissions, storage, asset rights and
moderation are **undecided**. A later dedicated concept, PO decisions and
approved acceptance criteria are required before designing APIs, persistence or
product UI for it. Playground trials are welcome but do not approve a feature.

For the current redesign, the shared visual system and the explicit exclusion of
individualized room themes remain in force. See the
[visual design guidelines](visual-design-guidelines.md) for the distinction
between approved identity and future experiments.

## Non-goals and remaining implementation-time refinements

**Not in scope:** seasons or season leaderboards, live Commander Companion, life tracking, multi-device sync, online invitations beyond the existing join code, favorites, new sorting/filter systems beyond the agreed dashboard alphabetical view, advanced analytics, player profiles, external card databases, new backend fields solely for presentation, PWA/offline or native app packaging, deployment/hosting, and ornamental animation.

**Still to refine in implementation issues:** exact accessible semantic colors for all states, exact typography/font availability, empty/error microcopy, group-card order based on current API behavior, responsive breakpoints, browser-history details and small component interactions. None of these permits silently changing an existing domain rule or expanding the approved scope.
