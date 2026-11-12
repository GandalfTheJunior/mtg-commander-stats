# Browser routing and authenticated shell

`main.tsx` mounts `AppRouter` inside `AppThemeProvider`. `App` owns session
restoration, login/logout and epoch fencing. #190 replaces the former query-tab
and reusable invitation-code navigation. The URL is the selected tab's source of
truth; deliberate navigation pushes history, while login, access-loss recovery
and confirmed saves replace the current entry. PUSH starts at the top; POP does
not force scroll reset. The fixed collection Back link targets `/playgroups`.

## URLs and session lifecycle

| Path | Current behavior |
| --- | --- |
| `/dashboard` | Up to three Playgroups, direct group match entry, collection and creation shortcuts; no deck reads |
| `/playgroups` | Complete collection and creation dialog; `?create=1` opens the dialog and is consumed with replace |
| `/playgroups/:groupId` | Freshly authorized Overview |
| `/playgroups/:groupId/games` | Games history |
| `/playgroups/:groupId/statistics` | #197 statistics landing with three fixed teasers |
| `/playgroups/:groupId/members` | #198 Members directory and administration |
| `/playgroups/:groupId/games/new` | Focused game creation |
| `/playgroups/:groupId/games/:gameId` | Freshly authorized game details |
| `/playgroups/:groupId/games/:gameId/edit` | Focused game edit after fresh permission check |
| `/playgroups/:groupId/statistics/reports` | #197 All Statistics chooser |
| `/playgroups/:groupId/statistics/reports/{players,decks,starting-seats,mana-colors}` | #197 focused read-only reports |
| `/playgroups/:groupId/members/:memberId/decks` | Guarded child host; #199 read-only member decks pending |
| `/playgroups/:groupId/members/:memberId/decks/new` | #198 focused quick-profile deck editor (reuses the #196 `DeckForm` context) |
| `/decks`, `/decks/new`, `/decks/:deckId/edit` | Personal collection and focused editors |
| `/invite/:code`, `/claim/:code` | Public placeholders before the auth gate; #200/#247 own preview and transactions |

Protected routes confirm `/api/me` before mounting private content. Login resumes
only an allowlisted in-app pathname and then authorizes its resource. Group IDs
and details response IDs are compared case-insensitively as UUIDs; malformed or
mismatched responses remain hidden and retryable. Former query-tab values are
discarded, not migrated. The old invitation-code route and manual join form are
retired. Unknown routes use the safe Dashboard/auth fallback.

Only confirmed identity exposes the signed-in shell. Checking, login rotation,
pending logout and uncertain recovery hide protected content. Logout advances
the session epoch immediately; only HTTP 204 announces success. Ambiguous logout
rechecks identity; an unavailable check requires explicit recovery. A current 401
expires the session at the intended protected path. Group access loss uses the
exact notice **Du hast keinen Zugriff mehr auf diese Playgroup.** and replaces
the path with `/playgroups`. Network/5xx errors offer retry, not membership-loss
claims. Aborted or obsolete responses, including 401s, cannot affect a new lifetime.

Each main group route reauthorizes and remounts its private view. Tab changes
retire old requests and in-memory presentation choices. There is no cross-route
game draft cache. `GameEditorPage` is the only game editor host; its visible exit
is available while loading, denied or failed. A confirmed permission denial shows
**Dieses Spiel kann nicht bearbeitet werden.**, without suggesting another check.
The existing dirty-editor guard protects navigation. Acknowledged game saves
replace the editor with freshly loaded Games; statistics reads fresh server data
on its next visit. Failed/ambiguous writes preserve drafts and never auto-retry. No destination
pathname bypasses the game draft guard: both the visible Back link and browser
Back require a dirty-draft decision. Only a validated save acknowledgment marks
the editor completed; its guard is released before the save-return navigation.
That navigation replaces the editor entry with Games and an opaque history-state
token for the #196 success panel. `gameHandoff.ts` keeps saved/repeat handoffs in
memory only, bound to user and group, and clears them on every session change;
**Noch ein Spiel – gleiche Spieler** consumes a second one-use token for the new
editor. Each destination captures its handoff on mount and retires the token at
once, so a reload, leaving the view or a later Back/Forward traversal shows no
panel and a blank form.

The header shows username with only **Abmelden** in its menu. Global destinations
are Dashboard, Playgroups, Decks. Group main views alone show Overview, Games,
Statistics, Members. The mobile bottom bar hides on focused editors; desktop
retains the horizontal row. Public signed-in placeholders provide a Dashboard exit.
ADMIN is strictly decoded in group summaries/rosters. Cross-creator game actions
remain OWNER-only here; #195 owns any ADMIN affordance expansion.

Only personal deck return-context tokens remain: session/path-scoped opaque
values associate a trusted calling overview without conferring permission or
accepting external return URLs. All group/game authorization remains server-backed.

### Group statistics (#197)

The Statistics tab and its report routes render inside `GroupPage`, so they keep
the group heading, child tabs and fresh group authorization of every main group
route. Selecting the Statistics tab while a chooser or report is open always
navigates to the landing page; browser history is otherwise untouched.

- `StatisticsLanding` reads unfiltered statistics once and shows three fixed
  teaser cards: top three players by games (`spotlightPlayers`, shared with #193),
  top three decks by exact win ratio then games, and the most observed starting-seat
  table size (ties prefer the larger size; sizes are never pooled). Each whole
  card links to its own report; namesakes in a teaser keep a short UUID suffix
  because no button may nest inside the card link.
- `StatisticsChooser` makes no request. Its expanded categories live only in the
  chooser's history-entry state: a fresh entry starts collapsed, and both the
  visible Back of a chooser-opened report and browser Back restore them.
- `StatisticsReportPage` renders one report with the shared native-radio
  **Spielerzahl** control (3 × 2 at 360px or less). Player/deck reports use cards
  with an explicit sort selector and direction on phones, and sortable semantic
  tables with `aria-sort` from the theme's `md` breakpoint. Seat sections and the
  compact Mana list never offer sorting. **Kennung anzeigen** appears only for
  visible rows whose displayed identity collides, keyed by stable UUIDs.

Filter and player/deck sorts are in-memory presentation (`statisticsState.ts`),
scoped by `App` to the session epoch and one group, and cleared when the
pathname leaves that group. They are never in the URL or browser storage, so a
reload or shared link starts at **Alle** with default sorts. Teaser and Overview
entries reset only the filter. The report's visible Back targets the validated
history-state origin: landing (default and fresh links), chooser with its
expanded categories, or Overview.

`useGroupStatistics` issues one read per group, filter and explicit retry; a
changed key shows loading immediately and aborts the old request, so retired
responses cannot replace the current screen. There is no manual refresh: each
route entry, including the return after an acknowledged game write, reads fresh
data. Failures show **Erneut versuchen**; 401/403/404 go to `GroupPage`, which
retires private content, expires the session or returns to `/playgroups`.
Loading uses report-shaped skeletons without animation under reduced motion and
a polite status announcement.

Browser fixtures in `frontend/e2e/statistics.pw.ts` cover the landing, chooser
and four reports at 320/375/390/1280px, horizontal overflow, the radio focus
ring and keyboard arrows, touch-target height, the 390 × 844 Mana fit and retry.
They use intercepted non-sensitive data, not a live backend or physical device.

Deck/group API functions accept optional AbortSignals without changing HTTP
contracts. Each mounted manager/detail view aborts its work on retirement;
list/detail effects also cancel on refresh. Unsafe requests carry the signal
through CSRF and check it before sending a write. Existing active/generation
guards reject late responses even when a transport ignores abort. Session epochs
still fence callbacks across logout and same-UUID or different-UUID login.
Aborting a request cannot undo a write the server has already received; returning
to the section reloads server state and never automatically retries a write.

## Members directory and administration (#198)

`GroupPage` owns group details, the pending ownership transfer and short toasts;
`MembersDirectory` renders the Members tab. Only `GET /api/groups/{groupId}`
supplies the roster in server order (role, name, UUID); no separate list read.
`membersModel.ts` holds the actor/target action matrix, which only decides the
offered affordances. A row without an authorized action has no three-dot
trigger. The server stays authoritative: every confirmed write is followed by
an authoritative re-read of details and transfer status, and failed or
ambiguous writes (403/404/409, network, 5xx) are reconciled by that read and
never reported as success. 401 expires the session; a re-read that is denied
retires the group with the standard access-loss notice.

- Filter **Alle | Nur registrierte Nutzer | Nur Schnellprofile** and the name
  search are presentation only. The search appears when the unfiltered roster
  would exceed the bounded list area (measured row height × roster size against
  the list's max height; eight rows when layout cannot be measured) or a term
  is entered. Duplicate names use the #192 `displaySuffixes` UUID prefixes.
- Whole-row activation opens `/members/:memberId/decks`. Before pushing, the
  directory stores its filter, search and list/page scroll in memory
  (`membersModel.ts`), bound to the current user and group, and writes only an
  opaque `membersDirectory` token into its own history entry. Back restores it;
  `GroupPage` then focuses the heading without scrolling. Like the game
  handoffs, every session change (logout, login rotation, expiry, session
  check) forgets all memories, so a reload, another tab or another account on
  the same tab starts at the defaults. Creating a quick profile resets to
  Alle, clears search and reveals the new row; ordinary renames do not.
- **Deck erstellen** opens the focused editor at `/members/:memberId/decks/new`
  for active quick profiles only. A confirmed save replaces the editor entry
  with the member-decks route; cancel returns through history.
- Ownership transfer: GET status is read only for OWNER/ADMIN viewers (404 means
  none visible). The OWNER requester sees a compact pending status in Members and
  withdraws with the request ID, without a second dialog. The target ADMIN sees a
  banner above the tabs on every group tab; decline is immediate, accept needs
  the final confirmation. Every response uses the held request ID.
  All reads and confirmed writes that set transfer state share one ordering
  counter, so an earlier response never replaces a later confirmed state. Only
  an authoritative 404 (or a MEMBER role) clears it; a failed status read keeps
  the last confirmed transfer, blocks new offers and offers **Erneut versuchen**.
  A 403 on the status or notices read is authoritative (demoted or inactive):
  the group is re-read at once, which downgrades the role or retires the group.
  A second 403 within one refresh marks the status unverified instead of looping.
- An ambiguous rename (network, 5xx, malformed response) keeps the typed name and
  awaits an authoritative read before any retry. If the read shows the new name,
  the rename counts as confirmed (compared in the server's canonical form: NFC,
  boundary whitespace stripped); if it fails, saving stays blocked behind
  **Stand erneut prüfen**. If the server reports the profile as gone, no rename or
  creation dialog stays open.
- Durable outcome notices are read on each group route mount, shown once each
  as a toast, acknowledged only after presentation, and re-read until drained.
  A failed read or acknowledgement stops draining and stays retryable.
- **Spieler einladen** is shown for every role but only announces that
  invitations are not yet available until #200 provides the sharing flow.

`frontend/e2e/members.pw.ts` covers 320/375/390/1280px layouts, touch targets,
horizontal overflow, sticky search and Back restoration with synthetic API data.

## Game history and Spieldetails

Game history links to full-ID detail paths. Details verify session, group and
game before exposing fields or actions. Its fixed **Zur Spielehistorie** link
returns to the current group's Games. A game 404 rechecks group access and retains
the detail path with **Spiel nicht mehr verfügbar** when membership is intact.
A group denial returns to the collection; transient failures remain retryable.

Delete uses a named confirmation, CSRF and duplicate guards. Cancel, Escape and
backdrop send no write. Only 204 announces deletion and replaces the detail entry
with Games. Unacknowledged writes re-read group/game without repeating DELETE;
statistics and deck lifecycle reload on their next visit. Route/session retirement
aborts reads and writes and ignores late results even if transport ignores abort.

## Focused Commander game editor

`GameEditorPage` mounts the shared `GameEditor` at the focused create/edit URLs;
the [games API browser editor section](../product/games-api.md#browser-game-editor)
owns the #196 behavior. New games start with four blank cards; edits use exactly
the saved ordered assignments, result and `playedOn`. Stable card keys keep card
state and focus through insertion, removal and reordering. Picker dialogs are
mounted only while open and do not restore focus themselves: the editor focuses
the empty card, the member/deck action or the collapsed card's chevron explicitly.
Validation focuses the first incomplete card's action or the error summary.
Live pointer reordering moves the dragged card to the hovered card's rendered
seat position, not to that player's current index: browsers can deliver several
pointermoves before React renders the previous move, and the stale player's
updated index would move the card back.

Each selected active member has an independent abortable deck-selection lifetime
and loading/error/retry state. A failed or malformed list is never an empty list.
Only that member's eligible response decks, decks created in this editor and the
exact recorded pair of the edited game can form an assignment; former members
never gain another deck choice. Backend validation remains final.

Nested quick-profile/own deck creation renders the shared `DeckForm` with a
`DeckFormContext` inside the still-mounted editor, so match state is never
serialized. Its dirty/pending guard registers through a nested `EditorGuard`
provider and is combined with the match guard for route exits. Its contextual
Back/Cancel changes no URL and asks through a nested `EditorLeave` provider about
the deck draft only: staying keeps it, discarding returns to the member's deck
picker. Quick-profile creation is a single unrepeated POST. While it is pending the
member picker cannot be dismissed or used, navigation is guarded like a pending
save, and an operation token plus a snapshot of the target card's member and deck
bind the response to that card, whether it started empty or via **Mitglied
ändern** (a saved profile always joins the roster). An unacknowledged attempt asks the user to check
the members.

Focused game routes show no group tabs. The header back arrow, global navigation
and supported browser exits use `EditorNavigation`/`useEditorGuard`. Dirty drafts
stay intact when the user cancels navigation. The guard compares participants,
results of every mode, seat order, mode and date; untouched blank slots and
expansion alone do not make a draft dirty.
Logout/session/access retirement discards protected drafts and aborts requests.

One pending guard covers CSRF and POST/PUT. Validated 201/200 responses replace
the editor history entry with Games. HTTP 400 retains editable input; 401 expires
the session. A write 403 hides the draft and safely rechecks membership. Other
unacknowledged writes retain the draft and warn about possible server commitment,
requiring server-state inspection before another attempt. No write auto-retries.
Statistics refetches on its next route mount, including after confirmed saves or
deletes; cancelling a form/dialog sends no write and cannot fabricate statistics.

Editor, routing, group and session regression suites cover validation, eligibility,
exact acknowledgments, dirty exits, denial/retry and late request retirement.
`e2e/record-game.pw.ts` records a game at 320, 390 and 1280px with intercepted
synthetic API responses, including a real pointer drag on the grip, the partial
ranking dialog, the success panel and the repeat handoff, and checks for
horizontal overflow. It does not establish live-backend, physical-device or
screen-reader acceptance.

### Historical game editor browser evidence

The following predates #190 and #196; same-group hidden-tab behavior and the
select-based editor were retired.

Headless Chrome with intercepted API fixtures checked 320, 390 and 1280px with
long/unbroken and duplicate names, all five colors and Farblos. No horizontal
page overflow, nested editor scrolling or page errors were observed. Actual
Tab/Enter, automatic summary focus, reopen focus, validation focus, hidden-panel
keyboard exclusion, same-group Back/Forward, dirty global Forward with stay and
discard, and acknowledged save returning to fresh history passed. A real Chrome
beforeunload dialog was dismissed at 320px and retained the full draft. Screenshots
of initial and validation states were visually inspected. These checks use
frontend fixtures, not a live backend, physical phone/software keyboard or actual
screen-reader acceptance.

Computed active select text was #F4EBDF on #29242A (12.89:1); disabled select text
was #AA96A1 on #342A31 (4.99:1). The focused field's 2px gold outline (#DBB977)
measures 8.13:1 against the card. The editor scopes native-select disabled/focus
styles so legacy pale backgrounds do not override the themed fields.

## Dashboard and group entry

`Dashboard.tsx` reads only `listGroups` within the confirmed session. Loading,
empty and failure are distinct; failures offer retry. Requests abort on route
retirement and ignore late results, including 401s. Current 401s use App's
session-expiration callback. Every mount fetches the groups afresh.

The first three API entries retain backend order. A small right-aligned collection
link appears only for four or more groups. Cards show group name, Overview and a
separate sibling link to `/playgroups/:groupId/games/new`. The contextual + below
cards or the approved empty message opens `/playgroups?create=1`; GroupManager
opens its existing creation dialog and consumes the flag with history replacement.
Dashboard has no deck reads, role metadata, invitation controls or Playground link.
Personal decks and artwork remain in Meine Decks. The shared theme supplies
surfaces, interaction states and focus; no new dependencies are needed.

Dashboard and Playgroups group buttons navigate directly to
`/playgroups/:groupId`. The former single-use Dashboard group-entry handshake is
removed; neither a stale summary role nor history state can authorize a group.
Every group route mount first calls `GET /api/groups/{groupId}`. The list URL never
contains an opened group's details. Creation uses the existing collection dialog and
opens the acknowledged group Overview; opening or reopening a group always loads fresh
details, with no membership/code cache. Explicit **Zurück zu
Playgroups** always targets `/playgroups`, including on direct visits.

The Playgroups collection retains API order, themed cards and the existing create
form. Duplicate names have distinguishing UUID suffixes. Pending create/CSRF work
disables conflicting actions and duplicate writes; failed writes retain the name
and offer list refresh. Leaving the route aborts work and ignores late outcomes.
The manual join form and reusable-code management screen are retired by #190.

### Departure lifetime

Only a freshly authorized MEMBER or ADMIN can confirm departure, from the quiet
**Playgroup verlassen** action below the Members directory. Starting the write
also retires every pending authoritative re-read, so a late response can neither
re-show the roster nor turn a confirmed departure into an access-loss notice. Cancel/Escape send no
DELETE. Starting the write hides private details. Exact HTTP 204 announces success
and returns to the collection. Every other outcome rechecks membership without
repeating DELETE or claiming success; 401 expires the session, lost access retires
the group, and unavailable verification offers retry. Active member names/roles
come only from the current details response, never statistics or history.

## Focused deck editor and return context

`DeckEditor.tsx` mounts the empty create form immediately after authentication;
creation does not depend on a deck-list request. Editing loads the existing owned
deck list after authentication, matches an exact UUID, and only then mounts the
shared form. A missing, foreign, malformed or deleted target exposes generic
unavailability with a link to `/decks`; no write is possible. No details GET endpoint is introduced.

Decks entry actions retain a random token, target path and session epoch in App
memory. History contains the token, not a trusted `from` URL. Deck editors return
to `/decks`. Leaving, reload, logout, expiry, identity recovery and same-UUID login
discard origin and draft. Stable edit URLs re-fetch their own target on
Back/Forward or reload.

Acknowledged save/delete/archive replaces the editor's history entry with the
validated calling overview and announces the result in its shell. That overview
mounts with fresh server data, as do subsequent game deck choices. Explicit
Back/Cancel uses the same validated overview; dirty drafts first offer stay or
discard. Browser history traversals preserve their actual destination after
confirmation. No extra read-only details screen or cross-view cache is added.

`EditorNavigation.tsx` wraps the Declarative router navigator for push/replace/go,
intercepts native document links, and registers a native `beforeunload` warning
while dirty or pending. Actual field values are compared with the initial/last
reviewed values; changing a value back is clean. Native warning presentation is
browser-controlled. App's session-retirement and confirmed-write navigation
bypass the guard. The game editor's discard dialog keeps a logout escape; the personal deck editor's discard, archive and delete dialogs show only their two approved actions (#201), so logout there uses the account menu after closing the dialog.

`AppRouter.tsx` installs a POP dispatcher before BrowserRouter's history listener,
using the insertion phase before layout effects. This ordering is required:
Chrome can flush the router transition and unmount a draft within its first
window POP listener before a later listener runs, even when that later listener
requests capture. The dispatcher delegates only to the mounted session's guard.
On blocked POP, the guard suppresses router notification and restores the current
indexed entry; stay keeps fields/focus, discard replays the original delta only
after restoration. It inserts no sentinel entries. Repeated POPs during restoration
are brought back to the editor. Closing the discard dialog disables its decision
buttons immediately; MUI keeps the dialog mounted through its exit transition.
Discard requires a pending navigation, so a stale or duplicate click cannot retire
a draft on its own. Tests must await dialog removal **and** restored URL/index,
visible editor and draft values before the next independent traversal: focus
restoration alone does not establish that either the dialog or native POP settled.
The bridge relies on the pinned router's history
`idx` and `UNSAFE_NavigationContext`; reverify actual Chrome history behavior when
upgrading React/Router. MemoryRouter tests use the wrapped navigator for in-app
exits; browser-history tests use the production AppRouter. No Data Router,
loaders, router-mode migration or new runtime dependency is needed.

The #201 editor (`DeckEditor.tsx`) is one scrolling form in the order Deckname → Deckformat
→ artwork preview → Commander(s) → Companion → ManaBox-Link → actions, following the
[approved wireframes](../product/wireframes/201/README.md). Opening it focuses only the heading,
never a text field. `CardSearch` is the shared inline autocomplete for Commander, partner and
Companion choices: 300 ms debounce from two non-whitespace characters (Unicode White_Space
plus U+001C–U+001F normalized like the backend), an internally scrolling `listbox` of up to
five visible name-and-WUBRG rows without thumbnails, `aria-activedescendant` keyboard
navigation, and inline exact Fblthp/Moon copy with retry. Typed text never changes the draft;
only an explicitly activated option is committed. Escape or an outside tap closes the list but
keeps the typed text, and leaving a reopened search keeps the previous card. Abort and
generation guards retire stale responses on typing, context change, navigation and unmount.
Commander searches carry the selected `format`; partner searches carry the first full
`selectionRef`; Companion suggestions are filtered by the complete effective identity.

The draft holds format, ordered Commander slots (choice, chosen color, artwork) and the
optional Companion. Field values are compared with the initial/last authoritative draft, so
reverting is clean; edit Save is enabled only for a valid, changed draft and create Save only
for a valid draft. Name and ManaBox messages appear after the field is left. Replacing the
first Commander, changing a chosen color or switching to Pauper Commander removes only
dependent selections that the saved pairing metadata/WUBRG subset marks as incompatible
(Pauper always removes the Companion) and offers one inline Undo of the previous draft.
Locked (used) controls stay in place with `aria-disabled`/`aria-readonly` and show a top
notice when activated. The artwork preview appears only after the first Commander, reserves
its height and keeps the Commander section at its viewport position through explicit scroll
adjustment. A new selection's preview uses the selected printing's artwork from the read-only
artworks route; editor gallery choices only change the draft.

Create sends one POST with an `Idempotency-Key` generated from `getRandomValues` (LAN HTTP
compatible), including `format`, Commanders, an optional Companion and any explicit `artwork`.
Update sends only changed parts: `manaBoxUrl` (`null` to clear), `format`, the full
`commanders` array when any identity, chosen color or artwork changed, and `companion`
(`null` for an explicit removal). Overflow availability and confirmations follow the
[deck lifecycle](../product/decks-api.md); the editor menu offers only valid actions. Archiving
or deleting with a dirty draft states that unsaved changes are discarded; cancel retains the
draft and restores focus without a write. The shared discard dialog uses the deck-specific
**Weiter bearbeiten** / **Änderungen verwerfen** wording through `EditorGuardOptions.copy`.

Writes are guarded against duplicates through CSRF and the unsafe request, abort
on retirement and ignore retired outcomes. Only exact acknowledged API statuses
navigate. 401 invokes epoch-fenced session expiration. 403/404 hides protected
fields. 409 rechecks the owned list, adopts newly permanent fields while keeping the
draft name/link, and explains the conflict. Confirmed 4xx/503 failures keep the full draft
and artwork (503 offers **Erneut versuchen**). Network/other 5xx/unexpected/malformed
successes show **Speicherstatus unklar** and block Save until **Gespeicherten Stand prüfen**:
create repeats the identical keyed POST, which the backend answers with the already
committed deck instead of a duplicate; edit compares a fresh owned list with the attempted
draft. No unkeyed write is automatically repeated. Edits made while the outcome is unknown are
newer than the attempted write: if the check confirms that write, the editor adopts the saved deck
as its baseline, keeps the newer draft and asks for an explicit further save (a contextual create
from the match editor instead freezes the draft until the check). While any request is pending, every
draft mutation (fields, searches, preview/gallery, Undo) is disabled and ignored. A 409 that newly
locks gameplay adopts the server's gameplay fields but keeps the draft name, link and artwork of
unchanged identities; if its refresh fails, **Gespeicherten Stand prüfen** retries only that read.

### ManaBox links

The optional localized ManaBox-Link field is the last form field before the actions. It remains editable on used and archived decks without unlocking gameplay
fields. Null starts empty. Link text participates in baseline/dirty comparison,
navigation/cancel protection and pending-write guards. POST without a link omits
it; PUT omits an unchanged link, sends null for a deliberately cleared saved
link, and otherwise sends the replacement verbatim. Nonempty whitespace is an
invalid value, never a removal. Client validation (shown after leaving the field) and server
400 feedback remain associated with the field and preserve the draft. Helper text explains that
changes inside ManaBox may require refreshing the shared version there; no
freshness check or changed share URL is promised.

Conflict/uncertain-write recovery displays draft and fresh server link text for
explicit inspection before manual retry. Reconciliation preserves the draft link
and name even if gameplay fields have become permanently locked. No ambiguous
write is automatically repeated.

`SavedDeckCard` shows an independent compact `ManaBoxLink` icon beside the deck name in
Meine Decks, including used/archived decks; Dashboard has no deck cards. The anchor is a
positioned sibling above the stretched editor target, never inside it or the artwork/gallery
triggers. The dedicated
game details view uses only each participant's freshly authorized optional link,
without consulting owner APIs or inferring permissions from the member list.
Omitted links replace old availability; route/session retirement, denial and
obsolete-response fencing follow the existing protected view lifetimes.

Both surfaces share strict raw-spelling and standards-based URL checks against
the [backend v1 shape](../product/decks-api.md#optional-manabox-share-link).
Missing, malformed or unsafe values render no control. Accepted hrefs remain
exactly as returned, with `_blank`, `noopener noreferrer`, a destination/new-tab
accessible name, visible focus and a 48px touch target. Browser/OS universal-link
handling may open ManaBox or its website; app launch is not guaranteed. No
provider calls, polling, imports, previews or new dependencies are introduced.
Game history, recording/editing, selection and statistics do not gain actions.

With Vite running, `python tools/ui/verify-manabox.py` checks the owner actions,
Dashboard omission, keyboard/new-tab isolation, editor guards and mixed-link
game details at 1280, 390 and 320px using intercepted synthetic API responses.
It saves screenshots under `/tmp/mtg-manabox-screenshots` by default;
`MTG_UI_URL`, `CHROMIUM_PATH` and `MTG_SCREENSHOTS` override the server,
Chromium executable and output directory. This supplements component/API tests;
it does not establish live-backend, physical-device or screen-reader acceptance.

## Responsive presentation

### Saved deck artwork and Meine Decks (#201)

`DeckManager.tsx` renders Meine Decks with compact `SavedDeckCard`s; Dashboard has no deck
cards (#191). A card reserves a fixed artwork cluster on the left: one Commander image, two
equal side-by-side images, and a smaller offset Companion image. Each image is its own gallery
trigger with a pencil marker, each card has its own **Karte anzeigen** eye control for the
shared read-only `FullCardView`, and the remaining text column is one stretched editor
target. Commander names are prominent, the deck name and optional Companion line quieter, and
WUBRG comes from the persisted deck `colorIdentity` as read-only mana symbols. Archived cards
look like active ones; the section heading is the only status. Names wrap without truncation.
The browser loads only the saved image URL; failures fall back without changing the choice.
Artist credit is the image `title`, and one Wizards of the Coast/Scryfall notice closes the list.

Active decks precede the collapsed **Archivierte Decks** section, both sorted by name
(`localeCompare('de')`, base sensitivity) and full UUID. Loading shows card skeletons; a failed
first load shows an inline error with **Erneut versuchen** rather than an empty state; a failed
reload keeps already valid content. `collectionLayout.ts` decides once per visit whether the
complete unfiltered collection (collapsed archived cards estimated by a measured card height)
exceeds the viewport minus the fixed phone navigation; only then the search appears and then
stays. Search is case-insensitive over deck and Commander names in both sections, temporarily
expands an archive with matches and restores the prior state when cleared. Opening the editor
stores query, archive state, search visibility and scroll position in App memory; the next
collection mount after the editor consumes it (cleared on leaving `/decks*` and on any
session change), re-filters fresh data and restores scroll. Archiving never forces the archive
open.

With Vite running, `python tools/ui/verify-personal-decks.py` checks the collection, search,
archive, card geometry/target isolation, editor preview, locks, dialogs and create flow at
1280, 390 and 320px using intercepted synthetic API and SVG image fixtures (`CHROMIUM_PATH`,
`MTG_UI_URL`, `MTG_SCREENSHOTS` override defaults; requires Python Playwright). It does not
establish live-backend, physical-device or screen-reader acceptance.

`AppShell.tsx` uses the shared theme for the shell, wordmark, top-right account,
feedback and one navigation element. Each destination is a real link with an
icon, visible label and `aria-current="page"`. At the `sm` breakpoint (600px)
the same navigation changes from a fixed phone bottom bar to an in-flow top bar.
Targets are at least 48px; main content reserves bottom-bar height plus safe-area
padding. Focused game, personal deck and quick-profile deck routes hide the phone bottom bar and use ordinary page
scrolling with reduced bottom padding; the account/logout header remains available. A skip link and focus on the main region support keyboard navigation.

Where VisualViewport is available, an editable focus with a viewport reduction
over 150px temporarily hides the phone bar while the software keyboard is open;
it returns when the viewport recovers or editing ends. Desktop navigation is
unaffected. This is a viewport heuristic; device-specific keyboards still warrant
real-device checks. No virtual-keyboard dependency is added.

No global reset is introduced. Native managers keep their light panels inside
`.legacy-view`, which restores their dark text and permits narrow grid columns.
Their remaining redesigns and unsaved-change prompts are separate issues (#76–#78).

### Historical Dashboard browser evidence (before #191)

Chrome checks at 320, 390 and 1280px used intercepted API test responses with
five groups, 24 decks, long/unbroken labels, all five colors and archived decks.
The page had no horizontal overflow or nested Dashboard scrolling. Expand/collapse,
Tab/Enter group entry, Space deck entry, create-form focus and browser Back/Forward
worked. Screenshots were visually inspected. This is frontend fixture evidence,
not a live-backend acceptance test or a screen-reader/real-device keyboard claim.

New card states were measured from Chrome computed text/background styles after
transitions, compositing MUI's focus-highlight overlay onto the effective surface:

| Card state | Primary text | Secondary text |
| --- | ---: | ---: |
| Normal | 12.89:1 | 8.48:1 |
| Hover | 9.33:1 | 6.14:1 |
| Pressed | 8.96:1 | 5.89:1 |
| Keyboard focus | 9.15:1 | 6.02:1 |

The inset 3px gold focus indicator measures 5.77:1 against the focused card fill.
All sampled ordinary text clears AA 4.5:1 and focus clears 3:1. Cards communicate
role, lifecycle and colors through text, not color alone. Existing CTA/refresh
button and disabled-state contrast follows the [theme verification](frontend-theme.md#rendered-contrast-verification).

### Deck editor browser evidence (before #201)

Historical evidence for the previous editor layout; see `verify-personal-decks.py` for #201.
Headless Chrome with intercepted API fixtures checked 320, 390 and 1280px.
Create/edit direct loads, fresh values after reload, Dashboard-origin return,
clean cancellation, dirty stay, native Back interception, history cleanup after
save, keyboard Space on WUBRG, validation errors and named deletion cancellation
passed. Long/unbroken names wrap in the dialog without horizontal page overflow;
the body-scroll dialog keeps actions reachable. Screenshots of active, focused,
locked, error, discard and destructive states were inspected. The phone editor
hides global bottom navigation; desktop navigation and logout remain available.
No page errors were observed. These are frontend fixture checks, not live-backend,
physical phone/software-keyboard or screen-reader acceptance claims.

Computed locked input colors were #F4EBDF on #29242A (12.89:1). Disabled WUBRG
labels/borders were #AA96A1 on #342A31 at full opacity (4.99:1); ordinary labels use
the normal theme foreground. The gold focus indicator against the editor's card
surface measures 8.13:1. Decorative swatches never replace names, check marks or
pressed/disabled semantics. Dialogs and editor focus use centralized theme tokens.

## Dependencies and serving

The runtime dependency `react-router` 8.4.0 supplies browser history, declarative
routes and accessible links instead of a custom router. Installed peer metadata
requires React/React DOM >=19.2.7 and Node >=22.22.0, satisfied by this repository's
React 19.2.8 and Node 24. Its two added transitive packages are
`@remix-run/route-pattern` and `cookie-es`. The lockfile pins the reproducible tree.
See the official [Declarative Mode installation](https://reactrouter.com/start/declarative/installation).

Vite's current default SPA behavior serves entry HTML for direct non-root routes
in both `npm run dev` and `npm run preview` (after `npm run build`). Verify by
opening/reloading `/dashboard`, `/playgroups`, `/decks`, `/decks/new` and
`/decks/:deckId/edit` and each canonical group/game route in the table above directly. A future
production host must rewrite non-file SPA paths to `index.html`, while retaining
real static-file and `/api` handling. Hosting configuration is a separate deployment
concern; this issue adds no rewrites or backend routes.

`Dashboard.test.tsx` covers cards/order, independent loading/retry, fresh authorized
entry, stable group authorization, manager-write freshness, and session/late-request
fencing. `DeckEditor.test.tsx` and `DeckLifecycle.test.tsx` cover stable routes, trusted and
fallback return, dirty/clean/POP exits, beforeunload, WUBRG subsets, all lifecycle
states, denial/conflict/ambiguous writes and session retirement.
`AppRouting.test.tsx` exercises actual BrowserRouter history, direct URLs, checking,
login confirmation, expiry, same/different-user login, logout/recovery and late
responses/CSRF retirement. Existing App, logout, game and statistics integration
tests navigate between the now separate managers; domain/security assertions
remain in place. Browser checks should include 320px, a typical phone and desktop,
long lists/names, Tab focus, bottom padding, refresh and Back/Forward.

`GroupPage.test.tsx` covers authorization, strict response identities, route
retirement, retry and confirmed/unconfirmed departure. `GroupManager.test.tsx`
covers strict role parsing, create/CSRF guards and retired mutations. Routing,
logout, game and statistics suites cover the corresponding session and API flows.
Legacy query-tab, manual join, invitation-code and inline editor tests were
retired because those interfaces no longer exist; retained behavior must remain
covered through canonical routes.

Historical browser evidence below describes the stated implementation revision;
it is not evidence for removed query-tab/code-screen behavior in #190.

### Statistics browser evidence (before #197)

Historical evidence for the replaced mixed player/deck Statistics tab.

Chrome against the production build with intercepted API fixtures checked 320,
390, 900 and 1280px. Both datasets, long/unbroken names, duplicate names, full
identifier/owner disclosures, archived decks, sorting, refresh, outer-tab
Back/Forward and safe 403 access recovery passed. Inactive variants and hidden
panels exposed no active controls; no horizontal page overflow or page errors
were observed. Screenshots were visually inspected. The initial 640px viewport
check covered the reflow equivalent of 200% zoom on a 1280px window. The native
zoom follow-up below closes that original zoom-verification limitation.

Computed cream/secondary text on cards (#29242A) measured 12.89:1 / 8.48:1;
the desktop table inherits #19171B and measured 15.08:1 / 9.92:1. The keyboard
focus outline was the shared #DBB977 (8.13:1 on cards, 9.51:1 on page).
These fixture measurements supplement the controlled-media-query RTL coverage;
jsdom alone does not establish responsive CSS behavior.

#### PR #88 review follow-up

The independent review of implementation commit `d89e58f` reported no confirmed
blocking code findings. The requested native zoom and breakpoint checks were
completed against the same production assets in a native Brave window on macOS, using a local read-only
fixture server with generated group/statistics data. Test-only instrumentation
reported viewport width, document scroll width, pixel ratio and mounted statistics
variants; it did not change the application bundle or its responsive behavior.

| Browser state | Viewport / document width (CSS px) | Device pixel ratio | Mounted statistics variant |
| --- | --- | --- | --- |
| Native browser 100% zoom | 1728 / 1728 | 2 | One deck table, no statistics card list |
| Native browser 200% zoom | 864 / 864 | 4 | One deck card list, no table |
| Responsive mode immediately below `md` | 899 / 899 | 2 | One deck card list, no table |
| Responsive mode at `md` | 900 / 900 | 2 | One deck table, no statistics card list |

The browser's own zoom control explicitly showed **200%** during the native zoom
check; this was separate from responsive viewport emulation. The selected Decks
view survived the change. An unbroken archived-deck name, its commander, owner,
Archiviert marker and requested full deck/owner UUIDs were visually inspected in
both cards and the table. Text and identifiers wrapped without truncation or
horizontal page overflow. The open disclosure remained associated with the same
deck when crossing 899 to 900px. The native browser was restored to 100% afterward.

The PO initially deferred the nonblocking VoiceOver step, then explicitly
requested a real macOS VoiceOver verification attempt on 2026-10-18. Safari loaded
the unchanged production build through a loopback-only read-only fixture server
using synthetic data. Safari's accessibility tree showed the initial Spieler
selection, but this is not evidence of actual VoiceOver announcements. VoiceOver's
Quickstart/training could be opened; afterward the main VoiceOver process was not
running, and no reliable speech or caption output could be observed even after a
controlled restart. VoiceOver was confirmed off afterward; no macOS security
settings were changed.

**VoiceOver result: NOT TESTED**, not PASS or an application FAIL. The intended
checks for Spieler/Decks switching, all sort controls, UUID disclosures, keyboard
focus/recovery and spoken statistics/states remain unverified in both desktop and
narrow-viewport Safari. No application defect was established by the attempt.
Repeat the manual test with functioning VoiceOver before merge if possible; see
[PR #88's VoiceOver verification attempt](https://github.com/GandalfTheJunior/mtg-commander-stats/pull/88)
for the reproduction, test steps and limitations. Physical-phone/software
keyboard and live-backend acceptance remain untested; the local fixture checks
do not substitute for those environments.

## Playgroup Overview (#193)

The authorized default group route renders one fixed **Gesamtsiegquote pro Spieler**
spotlight above **Letzte Spiele**, with a single prominent **Spiel erfassen**
link to the existing group-scoped recorder. Its acknowledged-save return remains
that group's Games history. The four child tabs fit at 320px; the signed-in shell
continues to own global navigation.

Overview reads unfiltered statistics and the first bounded `/games/history` page
independently. It displays at most three games in the server's date-first order,
without loading further pages. The preview reader validates only the fields the
compact card consumes, allowing historical games without seats/ranks. `playedOn`
is a validated calendar date or null; `recordedAt` never supplies a missing play
date. The reusable `CompactGameCard` shows winner, deck, saved Commander artwork
(including two Commanders), or a neutral draw/missing-art placeholder. The entire
card links to the game's details; other record metadata stays out of previews.
The full Games view and its pagination remain owned by #194.

`spotlightPlayers` implements #197's approved shared selection: most games first,
then alphabetical display name and stable UUID, capped at three. It introduces no
minimum sample threshold and uses only API percentages. The compact spotlight
shows name and rate and opens the #197 player report directly. That entry resets
the report filter to all sizes, and the report's Back returns to Overview.

Successful empty responses show #193's exact Archive/Tamiyo copy. Loading and
failed requests have separate feedback, and an explicit retry clears both prior
results. A current 401/403/404 retires both reads and all protected group content;
route/session cleanup ignores late responses. Browser fixtures cover populated,
empty, loading and error states at 320/390/1280px, keyboard focus, overflow,
long names, dual/missing/broken artwork and canonical destinations. These checks
use intercepted non-sensitive data, not a live backend or physical-device test.
