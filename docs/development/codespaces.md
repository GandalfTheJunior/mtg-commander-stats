# iPhone preview with GitHub Codespaces

This is an **opt-in**, temporary development preview, not a public deployment.
It runs React/Vite, Spring Boot and PostgreSQL 18 inside one GitHub Codespace.
The preview database is independent and initially empty on creation; an explicit Codespaces-only first-run bootstrap now populates the existing demo fixture in a fresh database. Existing databases and restarts retain their data.

## Create a preview

1. Once the setup PR has been reviewed and merged to `main`, open the repository
   on GitHub in Safari and choose **Code → Codespaces → New with options**.
   Select the **branch belonging to the PR you want to test**. Before merging
   the setup PR, select its branch for the first setup test. Other PR branches
   do not yet contain the Codespaces configuration.
2. A four-core machine may be needed for Java, Docker and Node; a smaller
   Codespace may work but must be verified. Creation installs Node 24 and Java
   25 and configures Docker-in-Docker.
3. On startup, the status page starts first, frontend dependencies are installed
   if missing or the lockfile changed, and Vite starts on port 5173 **before**
   Docker/PostgreSQL (5432) and Spring Boot (8080). The first Maven run may
   take time to download dependencies. `postStartCommand` runs automatically on
   creation and each restart; no terminal command is needed for normal use.
4. Open the **private** forwarded HTTPS URL for port **5174 – Status** in the
   Codespaces **Ports** panel. On an iPhone, the URL can also be formed from the
   Codespace name (shown in the editor URL):
   `https://<codespace-name>-5174.app.github.dev/`. The page refreshes every ten
   seconds, shows the latest startup step and whether frontend/backend answer,
   and links to the app on port **5173** when ready. The app address is
   `https://<codespace-name>-5173.app.github.dev/`.
5. When both services report **Bereit**, tap **Anwendung jetzt öffnen**.
   The first fresh Codespace populates the existing isolated demo fixture once: 7 fictional accounts, 21 decks, 2 groups and 32 games. Sign in as `ada@commander.example` using `accountPassword` from the Codespace-local, ignored `.demo/credentials.json` file. Never share the password or that file.
6. When finished, visit <https://github.com/codespaces>, select the three-dot
   menu for the Codespace and choose **Stop codespace**. Closing Safari does
   **not** stop compute billing. Stopped Codespaces can still consume storage.

### Testing later changes

Codex Cloud and Codespaces do not share a live workspace. Codex must push the PR
branch to GitHub; the Codespace must then pull changes to that branch. A Codespace
**created before the setup PR was updated will not automatically get the new
status page or changed devcontainer**. After these setup changes, **recreate** a
Codespace from the updated setup branch (or pull changes and rebuild the
container). Recreating uses a fresh preview database; stop/delete old Codespaces
separately. After the setup PR is merged, new Codespaces created from new PR
branches can use the configuration on `main` when their branch contains it.

## One-time demo initialization

- A fresh Codespace sets `MTG_CODESPACE_DEMO_DATA=1` via its devcontainer configuration. After PostgreSQL and the ordinary backend (including Flyway migrations) become healthy, `.devcontainer/seed-demo.mjs` checks every existing public application table for rows. **Only an entirely empty application database** is eligible. If any table contains data, it skips without changing it. Restarts never reset or re-seed accounts, groups, decks or games.
- Initialization reuses the existing isolated offline demo tool and its pinning/verification logic. It starts its own localhost PostgreSQL on port 5433 and seeds that **separate** demo volume. After verification it imports application-table **data only**, transactionally, into the fresh Codespaces PostgreSQL volume. Source and target Flyway migration checksums must match; no Flyway history or schema DDL is copied. The isolated demo DB is stopped but its volume is retained.
- Demo accounts use the same generated `accountPassword` in the private, ignored `.demo/credentials.json` file. No demo password is checked in; do not share the file or enable public port forwarding. This initialization is for private development, never for production or any arbitrary database.
- If the operation is interrupted or fails after beginning, the state file `~/.local/state/mtg-commander-stats/demo-seed-once.json` remains `started`, and automatic retry **refuses** rather than risking duplicates or overwriting partial data. An explicitly requested recovery is possible using `node .devcontainer/seed-demo.mjs --resume-existing-demo`, **only** if the original demo seed is marked `complete`, the target contains no application records, and matching Flyway checksums plus container/volume identity checks pass. The import locks and rechecks the tables, applies records transactionally and restores `public` as the search path before deferred PostgreSQL checks. Run recovery only after investigating the cause, while the app is not accepting writes. Do not delete volumes or status files casually. No automatic destructive reset occurs.
- To opt out for future *new* Codespaces, change/remove `MTG_CODESPACE_DEMO_DATA` in `.devcontainer/devcontainer.json` before creation; existing Codespace data is never deleted by turning this off. The first seed may extend cold startup due to an additional Maven package build and separate demo backend.
- Each Codespace retains its own PostgreSQL volume. A different feature-branch Codespace starts with independent baseline data and cannot see manual edits made in other Codespaces. Creating a fresh Codespace discards none of the old one until explicitly deleted.

## Security and troubleshooting

- Ports **5173** (app) and **5174** (read-only status) must remain **Private**.
  Both services listen on **HTTP** inside the Codespace (`portsAttributes.protocol` is `http`).
  GitHub's authenticated port forwarding still gives Safari **HTTPS** addresses;
  do not replace `https://` with `http://` in the browser.
  GitHub requires authentication for private forwarded ports. Do not make them
  public or share private Codespace URLs. Ports 8080 and 5432 are not intentionally
  forwarded. Vite proxies `/api` locally to Spring Boot; PostgreSQL binds to
  `127.0.0.1` only. The status page shows no passwords or log contents.
- PostgreSQL credentials are generated locally in
  `~/.config/mtg-commander-stats/postgres-password`, never committed, and reused
  when the same Codespace resumes. Never share this file, other credentials,
  access tokens or test invitations.
- The status page continues to run if Docker, PostgreSQL or Spring Boot startup
  fails, provided Node and the devcontainer start command itself work. If it
  shows **Noch nicht erreichbar**, inspect the displayed startup step first.
  Status is based on HTTP responses and is not a full end-to-end login test.
- If a development terminal is available, the detailed logs remain in:

  ```bash
  tail -n 80 ~/.local/state/mtg-commander-stats/startup.log
  tail -n 80 ~/.local/state/mtg-commander-stats/status-server.log
  tail -n 80 ~/.local/state/mtg-commander-stats/frontend.log
  tail -n 80 ~/.local/state/mtg-commander-stats/backend.log
  ```

- For an optional diagnostic retry in an existing Codespace, run
  `bash .devcontainer/start.sh`. This is not a routine startup step.
  Starts are serialized and reuse running services, including a backend that is
  still warming up. Each server runs in its own session/process group using
  `nohup setsid`, with redirected standard streams and no inherited startup lock.
  Each new service inherits its own lifetime lock on FD 8; FD 9 is the separate
  startup lock and is closed in services. Never delete the lock files while
  services are running: the locks belong to their kernel file objects.
  A saved PID is reused only after a successful `ps` with a nonempty live status,
  matching user/repository working directory, and an open service-specific lock
  or log descriptor in `/proc`. `kill -0` and “not a zombie” alone are insufficient.
  Unverifiable/stale/foreign records are archived as `*.pid.stale` before a new
  launch; no tracked PID is terminated by startup. If a lifetime lock is held,
  or matching service file descriptors identify an older launch whose PID record
  is missing/unverifiable, startup waits for HTTP only instead of launching a
  duplicate or guessing a leader PID. It does not restart a service on readiness
  timeout. Readiness attempts remain bounded; restricted `/proc`/process visibility
  can therefore leave a diagnostic failure rather than trigger duplicate servers.
  `nohup` alone ignores hangup signals but does not detach the process group.
  `startup.log` appends invocation context (user, working directory, terminal
  availability, executable paths and Node version), service PIDs, startup phase,
  failure line and exit status. Service logs append across restarts; the status
  server records when it begins listening. These logs remain local and are not
  served by the status page. Do not enable shell tracing or share raw logs
  without checking for sensitive data.
  Do not run `docker compose down -v` unless the preview database should be
  deleted. A Codespace can stop automatically, and GitHub may eventually delete
  it according to account retention settings.
- After a failed PostgreSQL Compose start, a **single** automatic recovery is
  allowed for `OCI runtime create failed: runc create failed: ... container with
  given ID already exists`. The helper inspects the current Compose service ID,
  requires `exited`, exit 128 and that exact error signature in Docker's state,
  verifies repository/project/service labels, the PostgreSQL 18 image, and the
  existing configured `postgres-data` named volume at `/var/lib/postgresql`.
  It removes only that stopped container **by ID**, without force or volume
  removal, then retries the original Compose start once. The named data volume
  and local password are reused. Running/unhealthy/foreign containers, other
  errors, ambiguous IDs or missing/mismatched volumes cause refusal. Failed
  removal or a failed retry ends startup; status and frontend remain available.
  No daemon restart, runtime-directory cleanup, prune, or blanket recreation is
  performed. See `startup.log` for the recovery/refusal and actual final exit
  code; the exit status is captured before timestamp formatting.
- A successful status page is not proof of actual Safari compatibility or
  frontend/backend integration. An end-to-end test on an iPhone plus required CI
  checks are still needed before merging.

## Startup regression checks (Linux)

Run `python3 .devcontainer/test-start.py` with Node, Bash, curl, `setsid` and
`flock` available and local ports 5173, 5174 and 8080 unused. The checks run the
actual startup script and status server without a terminal, using temporary home
and repository directories (including spaces). npm, Docker and Maven are replaced
by fixtures; frontend/backend responses come from real Node HTTP processes.
They cover first-install flow, repeated/concurrent starts, stale PID files after
stopping services, lifecycle-group signals, DB failure isolation and early child
exit diagnostics. PID tests cover positive `kill -0` with empty/failed `ps`, live
foreign/cross-service PIDs, a foreign repository with the same log descriptor,
verified reuse before readiness, corrupt/missing PID records while a service is
warming, lifetime-lock inheritance, and a bounded failure without duplicate
launches. Recovery tests cover one successful retry, final retry failure,
removal failure, refusal without mutation for unrelated/unsafe Docker metadata,
and correct final exit logging. Docker metadata/errors are fixtures; these tests
alone do not prove PostgreSQL data preservation or reproduce stale runc state.
They do not verify an actual Codespaces stop/start, private forwarded-port
authentication, real Vite/Spring Boot/PostgreSQL or iPhone Safari.

### Why this recovery is narrow

In [runc's container creation code](https://github.com/opencontainers/runc/blob/v1.2.0/libcontainer/factory_linux.go#L47-L54),
an already-existing runtime state directory for a container ID produces
[`ErrExist`](https://github.com/opencontainers/runc/blob/v1.2.0/libcontainer/error.go#L6).
That is an OCI-runtime creation failure before PostgreSQL starts, rather than a
PostgreSQL schema/migration error. A stale runtime state after Docker-in-Docker
resumes is consistent with the reported error and successful manual container
removal, but the underlying Codespaces/runtime cause is not established here.
Recreating a verified stopped container gives it a new ID while mounting the
same named data volume. Repeated starts of the same ID may hit the same runtime
state; unconditional `--force-recreate` would also disrupt healthy databases.
The helper is a bounded workaround, not a repair of Docker/runc itself.

A real Codespaces stop/start with existing test data must still be checked:
create a throwaway account or game, stop/restart the Codespace through GitHub,
open private port 5174 and then the application, and confirm both readiness and
the previously saved data without a terminal startup command. A local test with
an injected OCI failure cannot replace this check.
