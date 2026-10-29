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
- The state file `~/.local/state/mtg-commander-stats/demo-seed-once.json` now separates **preparing** from **started**. A new version-2 `preparing` marker records the Codespace, repository, Compose project and target volume before build/start preparation. A later invocation may continue only if this ownership still matches, every target application table is empty, no source seed marker exists, and the source tool independently proves every source application table empty under its existing operation lock and Docker/credential checks. An absent source marker alone is never proof of safety. A source startup may have applied Flyway schema migrations; those are retained. Build/start failure is not retried in a loop.
- Immediately before the actual transactional import, the target marker is durably changed to `started`. Failed/ambiguous imports continue to **refuse automatic retry**. Old `started` markers also remain blocked, including the incident with a missing `.demo/seed-status.json`; no ownership or safe phase is inferred retroactively. Partial/unknown source markers, stale source operation locks, unreadable state or interrupted `.tmp` marker transitions fail closed and are preserved.
- Explicit recovery uses `node .devcontainer/seed-demo.mjs --resume-existing-demo`, **only** if the source seed is marked `complete`, the target marker is `started` or `preparing`, the target contains no application records, and matching Flyway checksums plus container/volume identity checks pass. This includes interruption after a verified source seed but before import. The import locks and rechecks target tables, applies records transactionally and restores `public` before deferred constraints. Direct/manual seed invocations share a kernel lock. Investigate first and prevent concurrent app writes. Never delete either marker, credentials or volumes to force retry. No automatic destructive reset occurs.
- To opt out for future *new* Codespaces, change/remove `MTG_CODESPACE_DEMO_DATA` in `.devcontainer/devcontainer.json` before creation; existing Codespace data is never deleted by turning this off. The first seed may extend cold startup due to an additional Maven package build and separate demo backend.
- Each Codespace retains its own PostgreSQL volume. A different feature-branch Codespace starts with independent baseline data and cannot see manual edits made in other Codespaces. Creating a fresh Codespace discards none of the old one until explicitly deleted.

## Build and resource availability

Codespaces starts the ordinary backend with a completed Maven `package` followed
by a private application-JAR copy, rather than `spring-boot:run` against mutable
`target/classes`. The isolated source seed likewise copies the completed plain
application and test archives; its remaining classpath entries are immutable
Maven dependency jars. A later build (including demo preparation) cannot rewrite
resources underneath either running backend. Existing services still reuse their
lifetime locks and PID/provenance checks; no failed service is restarted blindly.
The normal production jar, Flyway migrations, Hibernate validation and interactive
local `spring-boot:run` workflow are unchanged.

Before launch, `CheckRuntimeResources.java` opens every SQL stream from the actual
private archive, compares its bytes to source, and emits only the readable count
and SHA-256 fingerprint (`runtime-resources`). Each private runtime directory also
retains its effective archive/classpath entries in `classpath.json` without
publishing paths or environment values in logs. A missing/unreadable/mismatched
archive fails before Spring or demo writes. Private runtime copies are retained
for inspection in the state directory and `.demo/runtime-*`; startup does not
remove old evidence or database state. Ordinary backend diagnostics remain in
`backend.log`; the source records sanitized cause types, migration counts and
fixed startup error categories in `.demo/startup-diagnostics.log`. The outer
bootstrap accepts only this bounded vocabulary, fingerprints and stage/exit
codes. Exception messages, stack arguments, URLs, SQL and credentials are omitted.

### Evidence and limits for issue #146

The Maven lifecycle processes resources before compilation and packages before
launch. Both old paths used the shared build output; a later demo `package`
processes that output again while the ordinary backend is alive. This establishes
a mutable runtime boundary, **not proof that it caused the reported incidents**.
A Java 25 / Flyway 12.4 / PostgreSQL 18 fault-injection regression distinguishes:

- An empty classpath location produces zero discovered/validated migrations.
- V2 removed after validation leaves eight discovered descriptors, but opening
  its stream fails with `Unable to obtain inputstream for resource`.
- A completed archive still finds, opens and migrates all eight SQL resources
  when the exploded build resources disappear.

These controlled faults demonstrate mechanisms and the archive mitigation; they
do not reproduce a spontaneous Codespaces race. The historical isolated source
exit was not recorded with sufficient causes to attribute it to either Flyway
symptom. Its state-machine defect is independently established: the old target
marker was written before Maven/source startup and therefore blocked even pure
preparation failure. This repair preserves legacy evidence and prevents that
failure mode for newly recorded, verifiably safe preparation.

Actual new private Codespace creation, repeated startup and GitHub stop/start
with retained app/source data still require PO acceptance. A local real-stack
smoke or fixture-only Docker test cannot establish Codespaces lifecycle, private
forwarding, tester-secret access or physical Safari results.

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

## Optional stable test login (personal secret)

In GitHub **Settings → Codespaces → Codespaces secrets → New secret**, create
`MTG_CODESPACE_TEST_PASSWORD` and grant access to **GandalfTheJunior/mtg-commander-stats
only**. Choose a strong, unique test passphrase of at least 12 Unicode code
points. Never paste it into an issue, conversation, command line or committed file.
This optional runtime secret is not needed at image build time. Without it,
startup reports “optional test login not configured” and the original demo works.

Create private Codespaces from trusted branches. For an existing Codespace,
**stop and restart** it after adding/changing repository access or the secret.
Post-start automatically provisions `tester@commander.example` / `Codespace Tester`
after the demo import. A non-secret `test-login: created and verified test login`
(or `verified existing test login`) message in the private startup log confirms
success. No recurring terminal command or password-file edit is needed.

The GitHub CLI must be authenticated with permission to inspect this Codespace
and its forwarded ports. Both 5173 and 5174 must already be **Private**, and
8080/5432 must not be forwarded. Inability to prove privacy causes refusal, never
an automatic visibility change. The provisioner checks GitHub identity, local
Docker socket, Compose/container/volume identity and completed import, then proves
the loopback backend matches the database with a normal Ada login and its stored
per-Codespace password. Keep `.demo/credentials.json` protected and unchanged.

On iPhone Safari, sign in with the fixed test email and chosen passphrase.
Apple Passwords may offer saved credentials; explicitly selecting the saved
password is acceptable. Automatic autofill across different
`<codespace>-5173.app.github.dev` hostnames is **not guaranteed**.

The extra account starts without decks or group membership. Group history and
statistics require legitimately joining with an owner's join code. Ada still
provides the complete seeded history. The seven original accounts, their generated
passwords, 21 decks, two groups, 32 games and canonical fixture remain unchanged.

### Trust and secret lifecycle

Code running in a Codespace can read its personal Codespaces secrets. Only run
trusted, reviewed branches with this secret; never reuse a real-user/production
password. Edit or delete/revoke the secret and repository access in GitHub Settings.
Stop/restart existing Codespaces to refresh the runtime environment. Changing the
GitHub secret **does not rotate** a previously registered application's password.
Removing the secret disables automatic verification, not the existing account.
Long-lived frontend/backend/status processes started by this script do not inherit
the optional password. Previously running services are reused; stop/restart the
Codespace when adopting this tooling if older services inherited broad environments.

### Test login recovery

Configured provisioning failures leave overall startup failed even when servers
are reachable. Diagnostics contain no passwords, HTTP bodies, cookies or tokens.
Fix transient GitHub/backend readiness or private-port problems and restart.
A completed marker requires the real account ID and successful current login on
every run. A changed secret, missing/stale/partial marker, conflicting email, or
uncertain registration response is never repaired automatically. In particular,
a `started` marker is written before registration and blocks every subsequent
attempt, even if registration succeeded but verification or shutdown failed.
Concurrent invocations share a kernel lock; do not delete lock files.

Preserve `~/.local/state/mtg-commander-stats/test-login.json` and any `.tmp` file
for independent inspection. Do not delete markers to force another attempt,
reset the database, edit demo credentials, or update SQL password hashes.
The safe default is a **new trusted private Codespace**, retaining the old one
for its data, or restore the previous GitHub secret to verify a completed account.
Any recovery of an interrupted/conflicting existing account needs separate,
explicitly authorized inspection and a guarded recovery procedure; this tool
provides no reset/adoption switch. Never share raw credentials or raw logs.

Verification before merge still includes two actual independent private
Codespaces on trusted branches, adding the secret to an older Codespace followed
by stop/start, and physical iPhone Safari sign-in. Simulated tests cannot establish
these platform/device results.

For deterministic provisioner checks, run
`node --test .devcontainer/*.test.mjs tools/demo/*.test.mjs` from the repository
root, then `python3 .devcontainer/test-start.py` separately. The full CLI simulation
uses local port 8080; lifecycle tests use 5173/5174/8080. Keep these ports unused
and do not run the two suites concurrently. The simulation exercises GitHub and
Docker provenance fixtures plus real loopback HTTP, cookies, CSRF, session login,
`/api/me`, concurrent CLI invocation and unchanged demo credentials. It does not
replace the actual private Codespaces and iPhone acceptance described above.

### Diagnosing an interrupted source seed

The outer bootstrap accepts only a closed diagnostic vocabulary from its child
process. A source failure now names `backend-startup`, `source-empty-check`,
`accounts-and-decks`, `playgroups`, `games`, `fixture-verification` or
`backend-shutdown`. HTTP failures include only method, resource category and
numeric actual/expected status; transport/timeout/assertion failures have fixed
categories. Java exit code/signal is reported separately. Arbitrary exception
text, API bodies, SQL output, URLs, account data, cookies and secrets remain hidden.
The first failure is retained even if cooperative shutdown also fails.

For example, `Demo initialization failed during isolated demo seed` followed by
`demo-failure: accounts-and-decks method=POST resource=users status=403 expected=201`
identifies a rejected registration without revealing the request or response.
A `kind=timeout` or a JVM exit signal is evidence to investigate, not permission
to repeat a possibly completed write. These messages never reset a database,
remove a marker or authorize recovery.

The first real PR #141 Codespace failed before the optional tester step, with
both seed markers `started` and zero target users. The exact underlying cause
was not recorded by the old wrapper. A fresh local PostgreSQL 18 source seed
using the unchanged launcher, random loopback port/context and ordinary generated
demo password completed successfully. This does **not** reproduce or explain the
reported Codespace failure. The correction preserves the missing diagnostics;
real platform acceptance and the downstream GitHub CLI/privacy gate remain open.

After this correction, test a **new private Codespace** on the updated PR branch:

1. Keep ports 5173/5174 Private and 8080/5432 unforwarded. Use only the existing
   personal test secret, granted to this repository; no broad extra token.
2. Look for the completed 7-account/21-deck/2-group/32-game import message, then
   `test-login: created and verified test login` and final preview readiness.
3. Sign in as the separate tester on iPhone. It starts without decks or groups;
   Ada's existing generated credentials still provide the seeded history.
4. Stop/restart and confirm `verified existing test login`, unchanged data and
   the same tester password. Repeat in a second trusted-branch Codespace.
5. If initialization fails again, preserve both markers and volumes. Record only
   the sanitized `Demo initialization failed ... [demo-failure: ...; demo-exit: ...]`
   line and marker statuses, not credentials or raw HTTP/process logs.

The already interrupted Codespace stays untouched and non-retryable. Updating
its branch cannot turn either `started` marker into proof of completion. Do not
delete its markers, credentials or volumes to force it through initialization.
