# Browser routing and authenticated shell

`frontend/src/main.tsx` mounts `AppRouter` (React Router's `BrowserRouter`) inside the existing
`AppThemeProvider`. `App.tsx` retains ownership of session restoration, login,
logout and epoch fencing. Routing uses Declarative Mode only: no route loaders,
new data cache, persisted navigation preferences or backend endpoint changes.

## URLs and session lifecycle

| URL | Confirmed identity | Signed out / unverified |
| --- | --- | --- |
| `/` | Replace with `/dashboard` | Existing registration/login/recovery |
| `/dashboard` | Playgroup cards and all alphabetized personal decks | Safe auth view; login resumes this URL |
| `/playgroups` | Existing GroupManager and its in-view details/games/statistics | Safe auth view; login resumes this URL |
| `/decks` | Personal deck overview, no embedded forms | Safe auth view; login resumes this URL |
| `/decks/new` | Focused create editor | Safe auth view; login resumes this URL with a fresh draft |
| `/decks/:deckId/edit` | Focused editor after fresh owned-list verification | Safe auth view; login resumes this URL after verification |
| Other paths | Replace with `/dashboard` | Replace with `/`; login opens Dashboard |

The three top-level destinations and two deck editor routes are supported. There
are no group, game, read-only deck detail or invitation-code routes. Default redirects and successful
login use history replacement; ordinary navigation adds history entries. Back and
Forward select the URL's destination. Direct page loads and reloads confirm
`/api/me` before mounting protected content. Dashboard requests the existing group
and owned-deck lists independently; see [Dashboard](#dashboard-and-one-time-manager-entry).

The shell and navigation exist only for a confirmed authenticated identity.
Checking, login rotation/identity confirmation, pending logout and unavailable
recovery hide all protected content. An explicit logout immediately advances the
session epoch and replaces the former destination with `/`. Only a 204 announces
success. Ambiguous logout rechecks identity; a confirmed account opens a fresh
Dashboard with retry feedback, an absent identity exposes auth without a success
claim, and unavailable confirmation requires an explicit session check or login.
An expired protected request (401) exposes safe auth at the current top-level URL.
Group 403/404 recovery remains local to group access; CSRF 403 is not logout.

Only one manager is mounted at a time. Moving away unmounts its drafts, selected
group, code, confirmations, statistics sort and request callbacks. Returning
fetches fresh data. Thus an acknowledged game write's permanent deck usage is
loaded when Decks next opens, and deck changes are reflected when Playgroups and
its game choices reopen. No cross-manager cache or simultaneous hidden managers
are needed. Group/game forms and their busy guards remain in their managers; deck drafts
are local to the dedicated editor.

Deck/group API functions accept optional AbortSignals without changing HTTP
contracts. Each mounted manager/detail view aborts its work on retirement;
list/detail effects also cancel on refresh. Unsafe requests carry the signal
through CSRF and check it before sending a write. Existing active/generation
guards reject late responses even when a transport ignores abort. Session epochs
still fence callbacks across logout and same-UUID or different-UUID login.
Aborting a request cannot undo a write the server has already received; returning
to the section reloads server state and never automatically retries a write.

## Dashboard and one-time manager entry

`Dashboard.tsx` loads the existing typed `listGroups` and `listDecks` APIs only
inside the confirmed session. Each section owns loading, empty/error and
refresh/retry state; one failed section leaves the other usable. Requests abort
on route retirement and ignore late results, including 401s. A current 401 uses
App's epoch-fenced session expiration callback; other errors remain local. Every
Dashboard mount refetches both lists, so acknowledged manager writes appear on
the next visit without a cache or optimistic Dashboard updates.

Playgroups retain API order: the first three appear initially, with inline
expand/collapse only above three. Role labels are Gruppenersteller/Mitglied.
No detail/member/code request decorates these cards. All owned decks, including
archived ones, appear below in a single stack on the page scroll. A fixed German
`Intl.Collator` with base sensitivity sorts names case/accent-insensitively;
lexical ID order breaks ties. Cards expose commander, canonical WUBRG with color
names (or Farblos), and archived/used/unused text. Collation-equivalent deck names
also show their IDs so duplicate names remain distinguishable. Theme tokens
supply surfaces, interaction states, text and keyboard focus; no new global CSS
or dependencies are needed.

Dashboard group cards retain the single-use in-memory entry contract in
`dashboardNavigation.ts`: App holds the group ID, session epoch and a random
token; history carries only that token. GroupManager consumes it once, clears
history state and verifies the target against a freshly authorized list before
fetching details. Missing/replayed/malformed targets leave generic feedback.
Failed lists, leaving, reload and session changes retire the intent. Successful
entry focuses the loaded group heading; create/join stays in Playgroups.

Dashboard deck cards and Deck erstellen now open stable editor URLs directly.
The former deck intent cannot reopen an inline form: DeckManager has no intent
consumer or inline form. The group contract and group/session flows are retained.

## Focused deck editor and return context

`DeckEditor.tsx` loads the existing owned deck list after authentication, matches
an exact UUID, and only then mounts the shared create/edit form. A missing,
foreign, malformed or deleted target exposes generic unavailability with a link
to `/decks`; no write is possible. No details GET endpoint is introduced.

Supported Dashboard/Decks entry actions retain only the calling overview plus a
random token, target path and session epoch in App memory. History contains the
token, not a trusted `from` URL. Only a matching pending entry may choose
`/dashboard`; otherwise return is `/decks`. Leaving, reload, logout, expiry,
identity recovery and same-UUID login discard origin and draft. Origin is neither
a preference nor persistent storage. Stable editor URLs still re-fetch their
own target on Back/Forward or reload.

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
are brought back to the editor. The bridge relies on the pinned router's history
`idx` and `UNSAFE_NavigationContext`; reverify actual Chrome history behavior when
upgrading React/Router. MemoryRouter tests use the wrapped navigator for in-app
exits; browser-history tests use the production AppRouter. No Data Router,
loaders, router-mode migration or new runtime dependency is needed.

The five named WUBRG buttons use `aria-pressed`, check marks and theme focus/border
states; swatches are supplementary. Zero means Farblos. DisplayText blank checks
match Unicode White_Space plus U+001C–U+001F; payload text is sent unchanged so the
server owns boundary trimming. Permanently used decks show locked commander and
colors and submit their server-confirmed values for rename. Overflow availability
and named confirmations follow the [deck lifecycle](../product/decks-api.md).

Writes are guarded against duplicates through CSRF and the unsafe request, abort
on retirement and ignore retired outcomes. Only exact acknowledged API statuses
navigate. 401 invokes epoch-fenced session expiration. 403/404 hides protected
fields until a fresh list confirms access. 409 automatically rechecks the owned
list but retains the draft for explicit review; newly permanent fields reconcile
only after that review. Network/5xx/unexpected/malformed successes require an
explicit server recheck before a manual retry. Creation recovery lists current
decks so a possibly committed request can be inspected. No write is auto-retried.

## Responsive presentation

`AppShell.tsx` uses the shared theme for the shell, wordmark, top-right account,
feedback and one navigation element. Each destination is a real link with an
icon, visible label and `aria-current="page"`. At the `sm` breakpoint (600px)
the same navigation changes from a fixed phone bottom bar to an in-flow top bar.
Targets are at least 48px; main content reserves bottom-bar height plus safe-area
padding. Focused deck editors hide the phone bottom bar and use ordinary page
scrolling with reduced bottom padding; the account/logout header remains available. A skip link and focus on the main region support keyboard navigation.

Where VisualViewport is available, an editable focus with a viewport reduction
over 150px temporarily hides the phone bar while the software keyboard is open;
it returns when the viewport recovers or editing ends. Desktop navigation is
unaffected. This is a viewport heuristic; device-specific keyboards still warrant
real-device checks. No virtual-keyboard dependency is added.

No global reset is introduced. Native managers keep their light panels inside
`.legacy-view`, which restores their dark text and permits narrow grid columns.
Their remaining redesigns and unsaved-change prompts are separate issues (#75–#78).

### Dashboard browser evidence

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
`/decks/:deckId/edit` directly. A future
production host must rewrite non-file SPA paths to `index.html`, while retaining
real static-file and `/api` handling. Hosting configuration is a separate deployment
concern; this issue adds no rewrites or backend routes.

`Dashboard.test.tsx` covers cards/order, independent loading/retry, fresh authorized
entry, target retirement/replay, manager-write freshness, and session/late-request
fencing. `DeckEditor.test.tsx` and `DeckLifecycle.test.tsx` cover stable routes, trusted and
fallback return, dirty/clean/POP exits, beforeunload, WUBRG subsets, all lifecycle
states, denial/conflict/ambiguous writes and session retirement.
`AppRouting.test.tsx` exercises actual BrowserRouter history, direct URLs, checking,
login confirmation, expiry, same/different-user login, logout/recovery and late
responses/CSRF retirement. Existing App, logout, game and statistics integration
tests navigate between the now separate managers; domain/security assertions
remain in place. Browser checks should include 320px, a typical phone and desktop,
long lists/names, Tab focus, bottom padding, refresh and Back/Forward.
