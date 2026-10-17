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
| `/playgroups` | Group list, create and join/rejoin forms | Safe auth view; login resumes this URL |
| `/playgroups/:groupId` | Freshly authorized group, Spiele tab | Safe auth view; login resumes this URL |
| `/playgroups/:groupId/games/:gameId` | Dedicated Spieldetails after fresh group and game verification | Safe auth view; login resumes this URL |
| `/playgroups/:groupId?tab=statistics` | Same group, Statistiken tab | Safe auth view; login resumes query too |
| `/playgroups/:groupId?tab=members` | Same group, active Mitglieder tab | Safe auth view; login resumes query too |
| `/playgroups/:groupId/invitation-code` | Dedicated screen after fresh OWNER verification; no eager code GET | Safe auth view; fresh authorization after login |
| `/decks` | Personal deck overview, no embedded forms | Safe auth view; login resumes this URL |
| `/decks/new` | Focused create editor | Safe auth view; login resumes this URL with a fresh draft |
| `/decks/:deckId/edit` | Focused editor after fresh owned-list verification | Safe auth view; login resumes this URL after verification |
| Other paths | Replace with `/dashboard` | Replace with `/`; login opens Dashboard |

Group IDs are UUIDs, never invitation codes. Details-response IDs compare UUID
letter case insensitively; malformed or genuinely different IDs remain rejected.
Invalid **group** IDs and group-details GET 400/403/404 replace the destination
with `/playgroups` and generic group-unavailable feedback. Invalid **game** IDs
return to the canonical group Spiele URL. Game-details GET 403/404 first rechecks
group access; the resulting recovery paths are specified in
[Game history and Spieldetails](#game-history-and-spieldetails).
Unsupported/repeated `tab` values normalize with replace to a supported canonical
URL (unknown values select Spiele). Ordinary tab changes push history entries;
Back/Forward select the URL's tab without remounting the group's game draft.
No overview tab, public game-edit route or invitation links are introduced.
Default redirects and successful login use history replacement. Direct page loads
and reloads confirm `/api/me` before mounting protected content. Dashboard requests
the existing group and owned-deck lists independently; see [Dashboard](#dashboard-and-group-entry).

The shell and navigation exist only for a confirmed authenticated identity.
Checking, login rotation/identity confirmation, pending logout and unavailable
recovery hide all protected content. An explicit logout immediately advances the
session epoch and replaces the former destination with `/`. Only a 204 announces
success. Ambiguous logout rechecks identity; a confirmed account opens a fresh
Dashboard with retry feedback, an absent identity exposes auth without a success
claim, and unavailable confirmation requires an explicit session check or login.
An expired protected request (401) exposes safe auth at the current supported URL.
Group 403/404 recovery remains local to group access; CSRF 403 is not logout.

Only one top-level destination is mounted at a time. Leaving a group, changing
group UUID, opening/closing the invitation screen, or retiring the authenticated
session unmounts its private state and aborts outstanding requests. Returning
fetches fresh details. Successful game writes refresh history and any visited
statistics view; Decks reloads permanent usage on its next visit. Deck drafts
remain local to their dedicated editor.

Within a group, `GroupPage` owns fresh membership/role and URL-driven MUI tabs;
`GameManager` stays mounted across tab changes. Its Spiele panel is hidden with
native `hidden`, preserving the inline draft and requests without creating a second
instance. Statistics mounts lazily on its first selection and remains in its hidden
panel thereafter, retaining sorting and refreshing after acknowledged writes.
Statistics depends on confirmed group access, not a successful game-history GET:
pending, network, server or malformed history responses cannot block it. History
loading/error/retry stays in Spiele. Explicit game refresh still revalidates access
and retires both request lifetimes; statistics resumes after successful verification
even if replacement history is pending. Access failures and failed writes hide
both views for safe revalidation. After confirmed access they offer explicit retries
for the respective tab; statistics denial never automatically retries in a loop.
Only the selected panel is exposed to keyboard/accessibility navigation. Explicit
tab changes and history traversals focus the selected tab; initial authorization
focuses the group heading. Refreshing members intentionally reauthorizes details
and retires the game/statistics area. These are navigation foundations for #76–#78;
the existing inline game form and statistics tables retain their contracts.

Deck/group API functions accept optional AbortSignals without changing HTTP
contracts. Each mounted manager/detail view aborts its work on retirement;
list/detail effects also cancel on refresh. Unsafe requests carry the signal
through CSRF and check it before sending a write. Existing active/generation
guards reject late responses even when a transport ignores abort. Session epochs
still fence callbacks across logout and same-UUID or different-UUID login.
Aborting a request cannot undo a write the server has already received; returning
to the section reloads server state and never automatically retries a write.

## Game history and Spieldetails

History cards keep the exact API order and expose current winner plus winning
deck (or Unentschieden), participant count and **Erfasst am**. The timestamp is
`recordedAt`, never a played-at date; its original precision remains in the time
element. One full-card link pushes `/playgroups/:groupId/games/:gameId`. While
an inline editor/write is active, cards cannot navigate and explain how to return
to history. The existing editor still accepts 2–6 participants and preserves its
draft across same-group tabs; #77 owns broader navigation protection.

`GameDetailsPage` is a separate, session/path-keyed lifetime. App confirms `/api/me`
before it mounts; it validates both hyphenated UUIDs, gets fresh group membership,
then calls the typed `getGame` reader using the existing game DTO validator.
Both returned route IDs must match case-insensitively before private data renders.
No list object or history state authorizes details. Ordered historical assignments
show current response names, commander, canonical WUBRG/text or Farblos, archive
and former-member indications. Colliding public names get stable IDs. Creator
names come only from that fresh group/game response; otherwise Ersteller shows
the creator ID. No user endpoint or email is used.

Invalid/inaccessible groups return generically to Playgroups. Invalid game IDs
return generically to Spiele, which freshly authorizes the group. Game 403/404
first rechecks membership: lost group access returns to Playgroups, a missing game
in a confirmed group returns to fresh Spiele, and other denial keeps details
hidden with an explicit read-only retry. Network/5xx/malformed data similarly
hide details without claiming membership loss; 401 expires the session.

Only the freshly confirmed OWNER or original creator sees **Spielaktionen** with
Bearbeiten and Löschen. Bearbeiten navigates to the canonical Spiele URL with an
opaque token. App holds only its session/path-scoped game-ID intent in memory;
GroupPage snapshots it on entry and GameManager consumes it against freshly loaded
history plus current group rights before prefilling the existing GameEditor.
History/reload/forged tokens cannot replay it; leaving, logout, new sessions or
another group retire it. Missing targets or changed rights show feedback without
an editor. Cancel returns to history. Acknowledged saves retain the existing
history/visited-statistics refresh and immutable payload rules.

Löschen uses a named MUI confirmation identifying result, timestamp and game ID,
explaining permanent deletion and retained deck usage. Cancel/Escape/backdrop
send no write and restore focus. One pending guard covers CSRF plus DELETE.
Details/actions retire as the confirmed write starts; only exact HTTP 204 shows
success and replaces the detail entry with canonical Spiele. That mount loads
fresh history; statistics and deck lifecycle reload on their next mount. Every
unacknowledged outcome safely reads group and game again without repeating DELETE.
A still-present game restores only fresh data/permissions with uncertainty feedback;
a gone game returns generically without announcing successful deletion. An
unavailable check leaves private data hidden for deliberate inspection/retry.

All reads/recovery/write preparation abort on retirement and reject late results,
including 401s from transports ignoring abort. Native Back/Forward retain browser
semantics and newly entered details always reauthorize. Explicit **Zurück zu
Spiele** always targets the canonical group URL, even for a direct/reloaded visit.
Leaving details retires its data; there is no shared game cache. Sorting remains
local to the current group manager lifetime and is retained across its tabs and
acknowledged inline writes, but a new route lifetime starts with API sorting.

## Dashboard and group entry

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

Dashboard and Playgroups group buttons navigate directly to
`/playgroups/:groupId`. The former single-use Dashboard group-entry handshake is
removed; neither a stale summary role nor history state can authorize a group.
Every group route mount first calls `GET /api/groups/{groupId}`. The list URL never
contains an opened group's details. Create/join retain their existing list forms
and acknowledged summary updates; opening/reopening/rejoining a group always
loads fresh details, with no membership/code cache. Explicit **Zurück zu
Playgroups** always targets `/playgroups`, including on direct visits.

### Invitation code and departure lifetimes

The overflow offers only **Einladungscode verwalten** to a freshly confirmed OWNER
or **Gruppe verlassen** to a freshly confirmed MEMBER. The OWNER code route mounts
a separate lifetime, rechecks group details, and never fetches the code on entry
or reload. Only **Einladungscode anzeigen** sends the non-cacheable code GET.
Codes live in that screen's component memory only, never URL, history, storage or
logs. Leaving, changing groups/identity/session (even same-UUID login), recovery,
or losing OWNER/access aborts and discards the code and pending confirmations.
Late results are ignored even when a transport disregards abort.

App holds an opaque random token, session epoch, exact code path and originating
supported tab in memory when the menu opens the code screen. History contains only
the token. **Zurück zur Gruppe** uses that matching in-memory tab; direct/reloaded,
retired or forged history contexts fall back to the canonical Spiele URL. No
arbitrary `returnTo` URL is accepted. Actual browser Back retains normal history.

Regeneration and departure use named MUI confirmation dialogs with cancellation,
Escape, focus return and duplicate guards. Only a valid acknowledged new-code
response is displayed after regeneration; starting a confirmed POST clears any
previous code immediately. Any failed/malformed/aborted/ambiguous result leaves
it cleared, explains uncertainty, safely rechecks membership and offers a manual
GET to inspect current code. Regeneration is never automatically retried.
Clipboard success is announced only after a fulfilled write; unavailable/failed
clipboard keeps the read-only field selectable with manual-copy guidance.

A code GET 403 can mean an active MEMBER, while POST 403 can also mean CSRF denial.
Both hide protected state before a safe details GET: fresh OWNER can manually
request the current code again, fresh MEMBER returns to the authorized group,
and details GET 403/404 returns to Playgroups. A 401 expires the session. An
unavailable check keeps private data hidden and offers an explicit retry. No
previously displayed code is restored by a successful membership recheck.

Confirmed MEMBER departure immediately retires games/statistics while the DELETE
is pending. Only exact 204 announces departure and replaces the current history
entry with `/playgroups`. Older entries may still contain obsolete group URLs;
revisiting them always reauthorizes and cannot reveal retired content. Failed or
ambiguous DELETE never claims success or automatically repeats: a fresh safe
details GET determines whether authorized actions may be offered again. Rejoin
uses the existing current-code flow and subsequently loads fresh MEMBER details.
The backend remains authoritative for every permission.

Active members come only from the details GET, never history/statistics. German
roles and **Du** use server role and exact current-user ID. Only colliding usernames
show an ID suffix, extended until it distinguishes the namesakes; ordinary rows
show neither full UUIDs nor emails.

## Focused deck editor and return context

`DeckEditor.tsx` mounts the empty create form immediately after authentication;
creation does not depend on a deck-list request. Editing loads the existing owned
deck list after authentication, matches an exact UUID, and only then mounts the
shared form. A missing, foreign, malformed or deleted target exposes generic
unavailability with a link to `/decks`; no write is possible. No details GET endpoint is introduced.

Supported Dashboard/Decks entry actions retain only the calling overview plus a
random token, target path and session epoch in App memory. History contains the
token, not a trusted `from` URL. Only a matching pending entry may choose
`/dashboard`; otherwise return is `/decks`. Leaving, reload, logout, expiry,
identity recovery and same-UUID login discard origin and draft. Origin is neither
a preference nor persistent storage. Stable edit URLs still re-fetch their
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
Archiving with an unsaved rename additionally announces that the name change will
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
Their remaining redesigns and unsaved-change prompts are separate issues (#76–#78).

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
`/decks/:deckId/edit`, `/playgroups/:groupId` with each supported tab and
`/playgroups/:groupId/invitation-code` directly. A future
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

`GroupPage.test.tsx` covers direct URLs, auth restoration, canonical tab replacement,
real BrowserRouter Back/Forward/reload, draft retention, member disambiguation,
role changes, safe code returns, no eager GET, copy fallback, confirmation and
exact write acknowledgment, rejoin, denial/CSRF recovery and late/aborted work.
Older group list tests remain focused on create/join/list behavior; game,
statistics, Dashboard, routing and logout regression tests use the dedicated
views and tabs while retaining their security and domain assertions.

### Group navigation browser evidence

Headless Chrome with intercepted API fixtures checked 320, 390 and 1280px:
long/unbroken group/member names, duplicate-name suffixes, real tab keyboard
navigation, Back/Forward, an intact inline game draft, direct OWNER/MEMBER code
URLs, no eager code GET, copy failure, code regeneration cancellation/confirmation,
reload/fallback return, member departure and focus return. No page errors or
horizontal page overflow were observed. Existing statistics tables keep their
scroll regions with a minimum readable table width; mobile cards remain #78.
Screenshots of games, statistics, members, code and both dialogs were visually
inspected. The read-only code field uses cream on the theme paper surface
(12.89:1); tabs/indicators and explicit focus use the theme gold (9.51:1 on the
app background, 8.13:1 on paper). These are frontend fixture checks, not a live
backend, physical phone/software-keyboard or screen-reader acceptance claim.
