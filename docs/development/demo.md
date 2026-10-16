# Local Commander demo

This opt-in developer tool uses the existing registration, session, deck, group
and game APIs. It does not add statistics endpoints or seed on startup. Requires
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
are fixture expectations for future statistics verification, not live statistics
API responses. The seed verifies these expectations against real game-history
responses, plus fresh sign-in, own decks, membership/role and visibility scopes,
archived history/selection, and rejection of an archived deck in a new game.
It submits no placements, seasons or timestamp overrides.

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
