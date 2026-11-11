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
| `/playgroups/:groupId/statistics` | Reused statistics view |
| `/playgroups/:groupId/members` | Active members |
| `/playgroups/:groupId/games/new` | Focused game creation |
| `/playgroups/:groupId/games/:gameId` | Freshly authorized game details |
| `/playgroups/:groupId/games/:gameId/edit` | Focused game edit after fresh permission check |
| `/playgroups/:groupId/statistics/reports` and `/playgroups/:groupId/statistics/reports/{players,decks,starting-seats,mana-colors}` | Guarded child hosts; #197 integration pending |
| `/playgroups/:groupId/members/:memberId/decks` and `/playgroups/:groupId/members/:memberId/decks/new` | Guarded child hosts; #198/#199/#196 integration pending |
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

### Responsive group statistics

`GameManager` owns separate player/deck sorts and the selected statistics subview
(initially Spieler) above the keyed `GroupStatistics` request instance. Refresh re-sorts fresh API arrays without discarding either choice.
Route/group/session retirement resets them; the switch adds no URL or storage state.
`GroupStatistics` uses the shared theme's `md` media query (900px): phones mount a
semantic card list and labelled native Sortieren nach selector/direction button;
wider viewports mount only the selected semantic table with header buttons and
`aria-sort`. Both offer Standardreihenfolge. Breakpoint changes make no API calls.
Inactive variants are unmounted, and outer panels use native `hidden`.

Per-row disclosure state and element IDs use group/dataset/stable UUID identity,
so sorting and responsive changes cannot associate an identifier with another row.
Only requested disclosures mount complete player/deck/owner ID text; contextual
button names distinguish namesakes without permanently announcing raw UUIDs.
The refresh button stays focusable with guarded `aria-disabled` during loading;
access recovery focuses explicit retry and its replacement refresh control.
Removing a focused responsive control returns focus to the persistent refresh.


Deck/group API functions accept optional AbortSignals without changing HTTP
contracts. Each mounted manager/detail view aborts its work on retirement;
list/detail effects also cancel on refresh. Unsafe requests carry the signal
through CSRF and check it before sending a write. Existing active/generation
guards reject late responses even when a transport ignores abort. Session epochs
still fence callbacks across logout and same-UUID or different-UUID login.
Aborting a request cannot undo a write the server has already received; returning
to the section reloads server state and never automatically retries a write.

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

Only a freshly authorized MEMBER can confirm departure. Cancel/Escape send no
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
bypass the guard; logout is reachable even in discard/destructive dialogs.

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

The five named WUBRG buttons use `aria-pressed`, check marks and theme focus/border
states; swatches are supplementary. All five controls are read-only. They are
neutral until a valid Commander (and any required chosen color) is selected; only
a complete empty identity means Farblos. `CommanderSearch` debounces name queries
for 300 ms, uses the backend's complete selectionRef, and separates typed text
from selected metadata. Typing invalidates the reference/colors/choice immediately;
only explicit suggestion selection restores them. Abort and generation guards
retire stale responses on typing, selection, navigation and unmount. Suggestions
contain only a thumbnail/neutral placeholder and English name. Loading, exact
Fblthp empty-result copy and Moon outage/retry feedback stay inline. Partner-only
options may be selected first but require an explicitly selected legal counterpart
before saving unless standalone-eligible. Pairing metadata reveals an empty second
search, scoped by the first full selectionRef. Only reciprocal Partner with has an
immediate clickable, dismissible suggestion, never a committed default. Ordinary
Partner needs typed input. Doctor-first uses the optional companion label. Changing
the first selection clears the second and retires its responses. Both slots
contribute their known effective colors. Each qualifying slot has a separate
mandatory single-choice radio group with no default. Saved selections restore from snapshots. DisplayText blank checks
match Unicode White_Space plus U+001C–U+001F; payload text is sent unchanged so the
server owns boundary trimming. Permanently used decks show locked commander and
colors/choice and omit `commanders` entirely for name/link changes, as do unchanged unused-deck selections. Overflow availability
and named confirmations follow the [deck lifecycle](../product/decks-api.md).
Archiving with any unsaved changes additionally announces that all changes will
be discarded and requires explicit discard-and-archive confirmation; cancel
retains the draft and restores focus without sending a write.

Writes are guarded against duplicates through CSRF and the unsafe request, abort
on retirement and ignore retired outcomes. Only exact acknowledged API statuses
navigate. 401 invokes epoch-fenced session expiration. 403/404 hides protected
fields until a fresh list confirms access. 409 automatically rechecks the owned
list but retains the draft for explicit review; newly permanent fields reconcile
only after that review. Network/5xx/unexpected/malformed successes require an
explicit server recheck before a manual retry. Creation recovery lists current
decks so a possibly committed request can be inspected. No write is auto-retried.

### ManaBox links

The optional localized ManaBox-Link field sits beside the deck name in both
editors. It remains editable on used and archived decks without unlocking gameplay
fields. Null starts empty. Link text participates in baseline/dirty comparison,
navigation/cancel protection and pending-write guards. POST without a link omits
it; PUT omits an unchanged link, sends null for a deliberately cleared saved
link, and otherwise sends the replacement verbatim. Nonempty whitespace is an
invalid value, never a removal. Client validation and server 400 feedback remain
associated with the field and preserve the draft. Helper text explains that
changes inside ManaBox may require refreshing the shared version there; no
freshness check or changed share URL is promised.

Conflict/uncertain-write recovery displays draft and fresh server link text for
explicit inspection before manual retry. Reconciliation preserves the draft link
and name even if gameplay fields have become permanently locked. No ambiguous
write is automatically repeated.

`SavedDeckCard` opts into an independent `ManaBoxLink` only in Meine Decks,
including used/archived decks; Dashboard retains the default with no action.
The anchor is outside the edit action and artwork/gallery triggers. The dedicated
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

### Saved deck artwork

Meine Decks uses `SavedDeckCard`; Dashboard has no deck cards (#191). Each card renders the saved
`artCropUrl` snapshots in a separate area beside the text. Two Commanders use
approximately 80% of the single-image size, with slot 1 upper-left/in front and
20% horizontal overlap. A container query stacks the entire image/credit area
above the text on cards at most 560px wide; both images retain the same relative
overlap and shrink together. Names wrap without truncation. WUBRG comes from the
persisted deck `colorIdentity`, including pregame choices, and the existing
Unbenutzt / Bereits gespielt / Archiviert lifecycle remains visible.

Images and accessible missing/broken-image fallbacks are noninteractive. The
text area opens the existing editor; saved artist credits and safe Scryfall
source links are independent siblings, never nested inside its action. Credits
use the displayed illustration's snapshot, including back-side art. The browser
loads only the saved image URL, without transforming it or requesting Scryfall
metadata. Browser failures do not change the saved choice or remove its credit;
refetched artwork replaces the previous image/failure state. Gallery activation
and artwork-only writes remain owned by #105.

The repeatable layout check uses Python Playwright with an installed Chromium
and a running frontend (`npm run dev -- --host 127.0.0.1`):

```bash
python tools/ui/verify-saved-deck-art.py
```

Install Playwright in your Python environment if needed (`pip install playwright`).
`CHROMIUM_PATH`, `MTG_UI_URL`, and `MTG_SCREENSHOTS` override the executable,
running app URL, and screenshot output directory. It intercepts API/image reads
with non-sensitive saved DTOs and clearly marked synthetic image fixtures,
without a live account/provider dependency. It checks both routes at 1280, 600,
375 and 320px, plus a 300px card in a desktop viewport: overlap geometry/paint
order, separate text, long names, single/missing/failed images, source keyboard
activation and absence of metadata reads. Screenshots cover desktop/mobile for
both routes. Live provider imagery and physical-device Safari remain outside
this deterministic browser check.

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

### Deck editor browser evidence

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

### Statistics browser evidence

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
shows name and rate and opens `/statistics/reports/players` directly, with all
sizes; the guarded report host is still pending #197. It does not fall back to
the mixed Statistics tab or implement #197's report UI.

Successful empty responses show #193's exact Archive/Tamiyo copy. Loading and
failed requests have separate feedback, and an explicit retry clears both prior
results. A current 401/403/404 retires both reads and all protected group content;
route/session cleanup ignores late responses. Browser fixtures cover populated,
empty, loading and error states at 320/390/1280px, keyboard focus, overflow,
long names, dual/missing/broken artwork and canonical destinations. These checks
use intercepted non-sensitive data, not a live backend or physical-device test.
