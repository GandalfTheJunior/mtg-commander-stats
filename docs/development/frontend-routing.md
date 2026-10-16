# Browser routing and authenticated shell

`frontend/src/main.tsx` mounts React Router's `BrowserRouter` inside the existing
`AppThemeProvider`. `App.tsx` retains ownership of session restoration, login,
logout and epoch fencing. Routing uses Declarative Mode only: no route loaders,
new data cache, persisted navigation preferences or backend endpoint changes.

## URLs and session lifecycle

| URL | Confirmed identity | Signed out / unverified |
| --- | --- | --- |
| `/` | Replace with `/dashboard` | Existing registration/login/recovery |
| `/dashboard` | Themed welcome and navigation onward | Safe auth view; login resumes this URL |
| `/playgroups` | Existing GroupManager and its in-view details/games/statistics | Safe auth view; login resumes this URL |
| `/decks` | Existing DeckManager and inline editors/lifecycle actions | Safe auth view; login resumes this URL |
| Other paths | Replace with `/dashboard` | Replace with `/`; login opens Dashboard |

Only these three exact top-level destinations are supported. There are no group,
game, deck detail/editor or invitation-code routes. Default redirects and successful
login use history replacement; ordinary navigation adds history entries. Back and
Forward select the URL's destination. Direct page loads and reloads confirm
`/api/me` before mounting protected content. Dashboard does not request group/deck
lists; the actual dashboard cards belong to issue #73.

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

`AppRouting.test.tsx` exercises actual BrowserRouter history, direct URLs, checking,
login confirmation, expiry, same/different-user login, logout/recovery and late
responses/CSRF retirement. Existing App, logout, game and statistics integration
tests navigate between the now separate managers; domain/security assertions
remain in place. Browser checks should include 320px, a typical phone and desktop,
long lists/names, Tab focus, bottom padding, refresh and Back/Forward.
