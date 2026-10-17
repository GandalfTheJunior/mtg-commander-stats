# Browser routing and authenticated shell

`frontend/src/main.tsx` mounts React Router's `BrowserRouter` inside the existing
`AppThemeProvider`. `App.tsx` retains ownership of session restoration, login,
logout and epoch fencing. Routing uses Declarative Mode only: no route loaders,
new data cache, persisted navigation preferences or backend endpoint changes.

## URLs and session lifecycle

| URL | Confirmed identity | Signed out / unverified |
| --- | --- | --- |
| `/` | Replace with `/dashboard` | Existing registration/login/recovery |
| `/dashboard` | Playgroup cards and all alphabetized personal decks | Safe auth view; login resumes this URL |
| `/playgroups` | Existing GroupManager and its in-view details/games/statistics | Safe auth view; login resumes this URL |
| `/decks` | Existing DeckManager and inline editors/lifecycle actions | Safe auth view; login resumes this URL |
| Other paths | Replace with `/dashboard` | Replace with `/`; login opens Dashboard |

Only these three exact top-level destinations are supported. There are no group,
game, deck detail/editor or invitation-code routes. Default redirects and successful
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
are needed. Native forms and their busy guards remain in their managers.

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

The Dashboard's group/deck cards and Deck erstellen action send a one-time
intent to the existing manager. `dashboardNavigation.ts` defines the narrow
payload contract. App holds the target ID/action **in memory only**, with its
session epoch and a random token. Router history state carries only that token,
never a target ID/code. On destination mount, the manager takes the payload and
App immediately replaces history state with null. The manager retains it only
for that mount and verifies a target against its **newly fetched authorized
list**, before selecting a group or opening an inline deck editor. Group details
and invitation codes are never requested from an unverified target. Archived
decks can open their current rename-capable editor; lifecycle restrictions stay
in DeckManager and the server.

Missing targets and malformed, mismatched or replayed state leave the authorized
list visible with generic feedback. A failed destination list discards the
intent; retry opens the ordinary list. Leaving before loading finishes discards
the pending local payload too. Back/Forward, reload, direct top-level navigation,
expiry, logout/recovery and same-UUID login cannot reopen an old target. Session
transitions explicitly clear App's pending intent. No persistent target, new URL,
query parameter, global data cache or shared business state is added.

Successful targeted entry focuses/scrolls the loaded group heading or inline
edit heading; deck creation focuses the existing Add a deck form's first input.
Ordinary navigation and subsequent refreshes do not repeat that focus transfer.
The empty-group link opens the existing create/join options without adding a
Dashboard invitation field. Managers otherwise retain their existing flows.

## Responsive presentation

`AppShell.tsx` uses the shared theme for the shell, wordmark, top-right account,
feedback and one navigation element. Each destination is a real link with an
icon, visible label and `aria-current="page"`. At the `sm` breakpoint (600px)
the same navigation changes from a fixed phone bottom bar to an in-flow top bar.
Targets are at least 48px; main content reserves bottom-bar height plus safe-area
padding. A skip link and focus on the main region support keyboard navigation.

Where VisualViewport is available, an editable focus with a viewport reduction
over 150px temporarily hides the phone bar while the software keyboard is open;
it returns when the viewport recovers or editing ends. Desktop navigation is
unaffected. This is a viewport heuristic; device-specific keyboards still warrant
real-device checks. No virtual-keyboard dependency is added.

No global reset is introduced. Native managers keep their light panels inside
`.legacy-view`, which restores their dark text and permits narrow grid columns.
Their redesigns and unsaved-change prompts are separate issues (#74–#78).

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

## Dependencies and serving

The runtime dependency `react-router` 8.4.0 supplies browser history, declarative
routes and accessible links instead of a custom router. Installed peer metadata
requires React/React DOM >=19.2.7 and Node >=22.22.0, satisfied by this repository's
React 19.2.8 and Node 24. Its two added transitive packages are
`@remix-run/route-pattern` and `cookie-es`. The lockfile pins the reproducible tree.
See the official [Declarative Mode installation](https://reactrouter.com/start/declarative/installation).

Vite's current default SPA behavior serves entry HTML for direct non-root routes
in both `npm run dev` and `npm run preview` (after `npm run build`). Verify by
opening/reloading `/dashboard`, `/playgroups` and `/decks` directly. A future
production host must rewrite non-file SPA paths to `index.html`, while retaining
real static-file and `/api` handling. Hosting configuration is a separate deployment
concern; this issue adds no rewrites or backend routes.

`Dashboard.test.tsx` covers cards/order, independent loading/retry, fresh authorized
entry, target retirement/replay, manager-write freshness, and session/late-request
fencing. `AppRouting.test.tsx` exercises actual BrowserRouter history, direct URLs, checking,
login confirmation, expiry, same/different-user login, logout/recovery and late
responses/CSRF retirement. Existing App, logout, game and statistics integration
tests navigate between the now separate managers; domain/security assertions
remain in place. Browser checks should include 320px, a typical phone and desktop,
long lists/names, Tab focus, bottom padding, refresh and Back/Forward.
