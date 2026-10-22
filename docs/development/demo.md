# Local Commander demo

> The complete offline seed refresh is deferred to #106. Since the joint #101/#102
> deck API replacement, this guide's legacy free-text seed requests do not work
> against the current API. Isolated tooling tests still run; they do not establish
> compatibility of the real seed/verification workflow. See the
> [deck migration/API contract](../product/decks-api.md).

This opt-in developer tool uses the existing registration, session, deck, group
and game APIs, plus the read-only group statistics API. It does not seed on startup. Requires
the [normal prerequisites](../../README.md#stack-and-prerequisites), including
Node 24, Java 25 and a running **local** Docker engine. Run all `node tools/demo/…`
commands from the **repository root**. No npm packages are needed for the tool.

## First run (PowerShell 7)

Build the existing backend once (repeat after backend changes):

```powershell
Push-Location backend
./mvnw.cmd -DskipTests package
Pop-Location
node tools/demo/demo.mjs up
node tools/demo/demo.mjs seed --allow-demo-seed
node tools/demo/demo.mjs backend
```

On macOS/Linux, build with `(cd backend && ./mvnw -DskipTests package)`; all the
Node commands are identical. `up` generates random local passwords in ignored
`.demo/credentials.json` and starts PostgreSQL 18 on **127.0.0.1:5433**. Keep this
file for subsequent runs; initialized volumes retain their original password.
Do not copy it into a PR, terminal transcript, CI log or shared document. Unix
permissions are owner-only; on Windows keep the checkout in your private user
folder and restrict its inherited ACL if it is shared with other OS users.

`seed --allow-demo-seed` launches a temporary instance of the **existing built
backend** on a random loopback port and random context path, supplies the demo
connection explicitly, waits for startup, seeds, verifies the API results and
stops it. It does not connect to an independently running backend. It may take
about a minute on first startup. Success reports 6 accounts, 2 groups, 12 decks,
36 games and the login/file locations, without printing any password.

`backend` then starts the same jar for interactive use on **127.0.0.1:8080**.
Stop any other backend on 8080 first. The wrapper sets these variables in the
**child backend process only** (your PowerShell environment is unchanged):

| Variable | Demo value |
| --- | --- |
| `POSTGRES_PORT` | `5433` |
| `POSTGRES_DB` | `mtg_commander_demo` |
| `POSTGRES_USER` | `mtg_commander_demo` |
| `POSTGRES_PASSWORD` | Generated `databasePassword` from the local credentials file |

It also explicitly pins the JDBC URL to
`jdbc:postgresql://127.0.0.1:5433/mtg_commander_demo`, the username and loopback
server address, and loads only the jar's `application.yaml`. Ambient Spring,
Java option, regular PostgreSQL, Compose and remote Docker overrides are not
inherited. Compose's `.env` is never used by this tool or implicitly read by the
backend. There is no need to export credentials into your regular backend shell.

In a second terminal, from the repository root:

```powershell
Push-Location frontend
npm.cmd ci
npm.cmd run dev
```

On macOS/Linux use `npm ci` and `npm run dev`. On Windows, the `.cmd` commands
also work when PowerShell blocks `npm.ps1` under its execution policy; no global
execution-policy change is needed.

Open Vite's printed URL (normally http://localhost:5173). Its existing `/api`
proxy reaches port 8080. Sign in as **ada@commander.example** with the value of
**accountPassword** in `.demo/credentials.json`. Open that file privately in a
text editor (for example `notepad .demo/credentials.json` from the root on
Windows). All six fictional accounts share this randomly generated local-only
password; each is 32 ASCII/Unicode code points, exceeding the 12-code-point rule.
Other emails are bruno, cleo, dara, emil and faye at `commander.example` (a reserved
example domain). This is local demo convenience, not a deployed account scheme.

## Opt-in iPhone verification over local WLAN HTTP

Start the isolated demo backend as above; it stays on **127.0.0.1:8080**, with
PostgreSQL on **127.0.0.1:5433**. In a second terminal, opt in to exposing only
Vite to a **trusted private WLAN**:

```powershell
Push-Location frontend
npm.cmd ci
npm.cmd run dev -- --host 0.0.0.0 --port 5173 --strictPort
```

On macOS/Linux use `npm ci` and
`npm run dev -- --host 0.0.0.0 --port 5173 --strictPort` in `frontend/`.
Find the PC's WLAN IPv4 address with Windows `ipconfig` (the active Wi-Fi
adapter), or the host's network settings. On a trusted iPhone in the **same WLAN**,
open **`http://<PC-LAN-IP>:5173`** in Safari. Keep the existing `/api` Vite proxy;
do not expose the backend or database. If Windows asks for firewall access, allow
Vite's TCP 5173 only on the trusted private network. Do not configure port
forwarding, public tunnels, public deployment, or globally disable the firewall.
If unreachable, check the actual adapter/IP, private firewall rule and WLAN
client isolation first. Stop Vite with Ctrl+C when done; ordinary `npm run dev`
returns to loopback-only startup.

Sign in as Ada with the private demo password described above. Localhost on the
PC is a trustworthy origin; plain IPv4 LAN HTTP on iPhone is an insecure context.
Navigation tokens use 128 random bits from Web Crypto `getRandomValues`, which
[the Web Crypto interface](https://w3c.github.io/webcrypto/#crypto-interface)
exposes without the `SecureContext` restriction on `randomUUID`. These tokens
associate in-memory navigation only; they never authorize an API request.
The only other restricted API in these flows is Clipboard `writeText`. If absent
or rejected, **Kopieren** retains the read-only code and explains manual copying:
long-press inside **Aktueller Einladungscode**, choose **Select All / Alles
auswählen**, then **Copy / Kopieren**. Do not paste the secret into logs or a PR.

### Real-device checklist and evidence record for #89

**Implementer status: NOT EXECUTED on a physical iPhone. Pending PO verification
before final acceptance.** Automated restricted-API tests and desktop browser
checks do not satisfy this physical-device criterion. The PO performs or arranges
the following checks on the PR revision and records actual observations in the PR:

| Evidence | Actual value / result |
| --- | --- |
| PR commit SHA, date and tester | Pending PO verification |
| iPhone model | Not available to implementer; not executed |
| iOS version and Safari version/build | Pending PO verification |
| Actual LAN URL (`http://<actual-PC-IP>:5173`) | Pending PO verification; placeholder is not evidence |
| Desktop browser/version at `http://localhost:5173` | Record the comparison run |
| Each step below, observed URL/result and any console exception | Not executed on physical iPhone |

1. At **Dashboard** and again at **Decks**, tap **Deck erstellen**. Confirm
   `/decks/new`, enter a name and commander, save, and confirm return to the
   originating overview with the saved deck. Open an existing deck from each
   overview (Dashboard card; Decks **Bearbeiten**), edit/save, and check the URL
   `/decks/<id>/edit` and correct return. Repeat with cancel.
2. Change a deck draft, try Back/global navigation, choose **Im Editor bleiben**
   and verify intact input; repeat with **Verwerfen und verlassen**. Back/Forward
   and reload must load fresh authorized data without restoring discarded input
   or a stale Dashboard origin. Logout/login (same account and another account)
   must retire drafts and private data.
3. As Ada, open **Demo Friday Table → Gruppenaktionen → Einladungscode verwalten**.
   Confirm `/playgroups/<id>/invitation-code`, with no code until
   **Einladungscode anzeigen**. Retrieve the code; try **Kopieren**. If unavailable
   or rejected, confirm manual guidance, selectable read-only text and no
   **Einladungscode kopiert.** success claim. Actually select/copy using Safari's
   text menu. If programmatic copying works, verify its content privately.
4. Open **Code regenerieren**, cancel once, then reopen and confirm explicitly.
   Only acknowledged regeneration shows a new code and invalidates the old one;
   existing memberships remain. Return to the originating group tab. Leave the
   screen and traverse Back/Forward or reload: no prior code should reappear
   without a new explicit fetch. Do not record either secret in the evidence.
5. Sign in as Bruno (MEMBER): the overflow offers **Gruppe verlassen**, not OWNER
   code actions. Try a direct invitation-code URL: no code/control access. Cancel
   departure once, then confirm in the demo if desired; verify loss of active
   access and retained history. Ada cannot leave her owned group.
6. On a game created by the signed-in account, and on another player's game as
   Ada/OWNER, open **Spieldetails → Spielaktionen → Bearbeiten**. Confirm canonical
   group Spiele URL and prefilled editor. Change result, switch group tabs and
   Back/Forward between them: preserve the draft. Cancel/discard once, then edit
   again and save; confirm refreshed history. Back/Forward/reload cannot replay
   an already consumed edit intent. An unrelated MEMBER has no edit actions.
7. Repeat deck create/edit, code retrieval/copy/regeneration confirmation and
   authorized game editing on desktop `http://localhost:5173`; record results.

Where a Mac with Safari Web Inspector is available, enable the iPhone's Safari
Web Inspector (Settings → Apps → Safari → Advanced, depending on iOS), trust the
connection and inspect the LAN tab from the Mac's Develop menu. Before each
scenario, observe the console and record exceptions without secrets. This
capability-only console expression is safe to record:

```javascript
({ secureContext: window.isSecureContext,
   randomUUID: typeof window.crypto?.randomUUID,
   getRandomValues: typeof window.crypto?.getRandomValues,
   clipboardWrite: typeof navigator.clipboard?.writeText })
```

Expected on LAN HTTP: insecure context, no `randomUUID`, available
`getRandomValues`; clipboard may be unavailable. If Web Inspector is unavailable,
record that limitation alongside actual visible device outcomes. The automated
reproduction confirms the pre-fix exception `crypto.randomUUID is not a function`
before deck navigation; it is **not** a captured trace from the PO's iPhone and
cannot rule out additional device-specific defects before the checklist is run.

## Fixed scenario and expected results

[fixture.mjs](../../tools/demo/fixture.mjs) defines stable logical identities,
commanders, colors, seating and outcomes. Server UUIDs and recording timestamps
are deliberately variable. All 36 games have four players; 4 are DRAWs.

| Group | Owner | Members | Games | Draws |
| --- | --- | --- | --- | --- |
| Demo Friday Table | Ada | Ada, Bruno, Cleo, Dara, Emil | 20 | 2 |
| Demo Sunday Table | Faye | Cleo, Dara, Emil, Faye | 16 | 2 |

Each player owns two decks. Ada plays 12 Friday games: Dragon Engine wins 6/6
(100%), Patient Constructs wins 0/6 (0%), and Ada's overall rate is 6/12 (50%).
Friday seating varies participation counts. Dara's Old Artifacts is used and
then archived, stays visible in history, and is unavailable for new assignments.
Sign in as Dara to inspect its locked commander/colors and archive status.
Ada/Bruno cannot see Sunday; Faye cannot see Friday. Cleo, Dara and Emil can see
both. Group creation and code-based joining establish real OWNER/MEMBER roles.

[expected-results.json](../../tools/demo/expected-results.json) lists **every
member and each of their decks per group**, with games, wins and win-rate percent.
A DRAW adds one game to every participating player/deck and zero wins. The rate
is `100 * wins / games`, rounded to two decimals (zero appearances => 0%). These
are fixture expectations, not stored statistics. The seed verifies every nonzero
row against the live statistics API as well as real game-history responses, plus
fresh sign-in, own decks, membership/role and visibility scopes,
archived history/selection, and rejection of an archived deck in a new game.
It submits no placements, seasons or timestamp overrides.

## Check browser statistics with existing demo data

Start the existing demo backend and Vite as above, sign in as Ada, then open
**Demo Friday Table** in My groups. Under game history, **Statistics** displays
**Player statistics** and **Deck statistics**. Check Ada **12 / 6 / 50%**,
Dragon Engine **6 / 6 / 100%**, Patient Constructs **6 / 0 / 0%**, and Emil
**12 / 1 / 8.33%**. Dara's Old Artifacts remains visible and labelled **Archived**.
Only recorded players/decks appear. Use **Refresh statistics** to reload figures.

Click **Win rate** in each table: the first activation sorts percentages from
highest to lowest, the next from lowest to highest. Friday deck results include
**100%**, **30%**, **25%**, **20%**, **16.67%** and **0%**; Friday players include
**50%**, **25%**, **20%**, **15%** and **8.33%**. Try **Games**, **Wins**, and the
text headings too. Keyboard users can focus a heading button and activate it
with Enter or Space; the arrow shows its direction. Refresh statistics and verify
the chosen order remains; closing/reopening details returns to backend order.

Sign out and sign in as Cleo, Dara or Emil to open both Friday and Sunday; compare
Sunday with the independent figures in
[expected-results.json](../../tools/demo/expected-results.json). Switching or
closing details hides the previous group's tables. An acknowledged game edit
refreshes figures from the backend; canceling sends no change. Existing manual
edits will naturally differ from the fixed manifest. Reuse seeded data; no reset
or reseeding is required for this check.

## Read the statistics API with existing demo data

Rebuild the backend jar after this change and start the existing seeded demo with
`node tools/demo/demo.mjs up` and `node tools/demo/demo.mjs backend`, then start
Vite and sign in as Ada as above. Reuse the existing data; no reset or reseeding
is needed. In the browser developer console on the Vite page, run:

```javascript
const memberships = await fetch('/api/groups').then(response => response.json());
const friday = memberships.find(group => group.name === 'Demo Friday Table');
const response = await fetch(`/api/groups/${friday.id}/statistics`);
if (!response.ok) throw new Error(`Statistics returned ${response.status}`);
const statistics = await response.json();
console.table(statistics.players);
console.table(statistics.decks);
```

On the unchanged fixture, compare Ada **12/6/50%**, Dragon Engine **6/6/100%**,
Patient Constructs **6/0/0%** and Emil **12/1/8.33%** to
[expected-results.json](../../tools/demo/expected-results.json). Sign in as Cleo,
Dara or Emil and select `Demo Sunday Table` in the snippet to inspect independent
Sunday figures. Ada cannot read Sunday. Results reflect any manual game edits
already made to the demo. GET sends the existing session cookie and needs no
CSRF token. The same figures are also visible in the opened group's browser
**Statistics** section, below game history.

## Stop, reuse, recover, reset and return to regular development

1. Stop Vite and the interactive demo backend with Ctrl+C. Wait for the backend
   command to finish before another demo command (commands use an exclusive lock).
2. From the root, `node tools/demo/demo.mjs stop` stops only demo PostgreSQL;
   its named volume and credentials remain. Next time run `up`, then `backend`
   and Vite. **Do not seed again** to reuse the data.
3. A second seed fails clearly with a nonzero exit before API writes. A failed
   first seed leaves `.demo/seed-status.json` marked `started`; no automatic
   rollback, cleanup, registration retry or duplication is attempted. A missing
   status file is also guarded by a read-only empty-users database check.
4. For an intentional fresh fixture, stop the applications first. **WARNING:
   the following permanently deletes all demo data, including manual edits.**

   ```powershell
   node tools/demo/demo.mjs reset --destroy-demo-data
   node tools/demo/demo.mjs up
   node tools/demo/demo.mjs seed --allow-demo-seed
   node tools/demo/demo.mjs backend
   ```

   Reset validates the demo volume's identity/Compose labels, stops/removes only
   the fixed demo project, and removes exactly `mtg-commander-demo-data`. It keeps
   local passwords and removes seed status only after volume deletion succeeds.
   It never invokes `down -v` against the default Compose project.
5. After a forcibly killed tool, `.demo/operation.lock` may remain. Confirm no
   demo command/Java child is still running before manually deleting **only that
   lock file**. A partial seed still requires the explicit reset above. If the
   credentials file is lost or changed, do not change normal PostgreSQL passwords;
   recover the file locally or deliberately discard the demo volume using Docker
   after checking its exact name/labels. The tool refuses unknown/mismatched data.
6. To return to normal development, stop demo backend/Vite, optionally stop demo
   PostgreSQL, and follow [Local development](../../README.md#local-development)
   in your regular shell with its original database environment/credentials
   (normally port 5432). No shell variables were changed by the demo tool.

The normal root Compose file, default project, regular `postgres-data` volume and
credentials are untouched. The demo has a separate Compose config, fixed
`mtg-commander-demo` project and `mtg-commander-demo-data` volume. Both databases
can coexist. No target URL/port/project overrides are accepted. Seeding/reset
require their exact opt-in flags; remote/TCP Docker contexts, non-demo container
identity, volume, port binding, database name/user/password or existing accounts
are rejected. Local tooling assumes your Docker daemon and repository are trusted.

## Verification

Run the following commands from the **repository root**.

```powershell
node --test tools/demo/*.test.mjs
```

These dependency-free tests cover fixture invariants/manifest, fail-closed
arguments and environment, target identity checks, and the HTTP cookie/CSRF
rotation lifecycle, Windows-style `Path` command lookup, and cooperative IPC
shutdown. The Windows allowlist also retains `ProgramFiles` (canonical
`PROGRAMFILES`) for Docker Compose plugin discovery while excluding
`DOCKER_CONFIG`, remote Docker settings and application overrides. CI runs the
tests with Node 24 on Linux and Windows. The normal
[backend/frontend verification](../../README.md#verification) remains required.

To check Docker Compose plugin discovery with the same sanitized child environment,
without starting Docker containers, contacting a database or requiring a running
Docker daemon:

```powershell
node tools/demo/compose-smoke.mjs
```

Windows CI also runs this smoke check. It reports an explicit **SKIP** if Docker
or its Compose plugin is not installed/discoverable in the ordinary shell. If the
ordinary `docker compose version` works but the sanitized invocation fails, the
check fails. A skipped check is not proof of successful plugin discovery.

For a repeatable real API/isolation check with Docker, a freshly built jar, and
port 8080 free (stop any interactive backend first):

```powershell
node tools/demo/verify.mjs --destroy-demo-data
```

**This explicitly resets the demo before and after the check.** It exercises
up/seed and interactive-backend sign-in/logout, confirms second-seed and
missing/partial-status refusal without data changes, rejects target/opt-in
overrides, checks all other Docker volumes retain their identities, and checks
reset removes only the demo volume. It preserves credentials; run `up`, `seed`,
then `backend` afterwards if you want to explore the demo. If interrupted, inspect
the status and use the documented demo-only recovery; nothing cleans up implicitly.

### Native Windows verification status

A full Windows PowerShell + Docker Desktop run is still **unverified**. Windows
CI exercises the dependency-free tooling tests, including native executable lookup
and cooperative IPC shutdown, plus the conditional daemon-free Compose plugin
discovery smoke check; it does not run the PostgreSQL/Java/browser demo.
The verifier requests backend shutdown over Node IPC, waits for the wrapper to
stop/await its Java child and release the operation lock, and still requires a
zero exit status. It does not send `child.kill('SIGINT')` to the Node wrapper
([Node documents forceful Windows signal termination](https://nodejs.org/docs/latest-v24.x/api/child_process.html#subprocesskillsignal)).
Manual Ctrl+C remains handled by the interactive wrapper; its native Windows
console behavior is part of the outstanding check.

Before declaring the Windows end-to-end path verified, run the first-run steps
in PowerShell, log in as Ada in Vite, then check Ctrl+C, stop/up reuse, refused
reseeding and the explicit demo-only verification/reset command. Confirm the
normal PostgreSQL on 5432 and its data are unchanged, with the demo on its own
5433 port/volume. Record actual results in the PR; successful unit/IPC tests are
not evidence that this complete manual path passed.
