# Agent cloud environments: Codex Cloud and Claude Code Cloud

This is an **operational runbook**, not an additional agent bootstrap contract.
The reviewed setup script sources are versioned in [scripts/cloud](../../scripts/cloud/),
while provider environment selections, variable values and deployed script copies
remain **outside Git**.
Use this guide when creating, rebuilding, or debugging a cloud workspace; do
not load it for unrelated agent tasks. `CLAUDE.md` already includes the
common `AGENTS.md` guidance; no separate agent policy is needed. Provider
interfaces and base images may change. Verify the active environment rather
than treating old observations as guarantees.

## Shared project requirements

- **Java 25** and **Node.js 24**; confirm their runtime versions, not just
  installed binaries. npm ships with the selected Node installation.
- **Maven 3.9.11** via the backend's [Maven wrapper](../../backend/.mvn/wrapper/maven-wrapper.properties);
  use `./mvnw` from `backend/`, not a system-wide `mvn`.
- A reachable **Docker daemon** for PostgreSQL 18 and Testcontainers. Docker
  Compose and a developer-managed PostgreSQL database are not required for tests.
- The canonical commands live in [README verification](../../README.md#verification).
  [Testing guidance](testing.md#shared-postgresql-integration-test-infrastructure)
  explains the single shared PostgreSQL container per test JVM and separate
  databases for individual Spring test contexts (implemented in [#246](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/246)).

## Codex Cloud

Create or select a cloud environment for this GitHub repository in Codex's
provider UI; attach `GandalfTheJunior/mtg-commander-stats` and publish/select
the prepared environment for a **new** task. See the
[Codex Cloud guide](https://help.openai.com/en/articles/20001545-using-codex-cloud)
for the current UI. Codex environment settings are not read from `AGENTS.md`.

**Versioned source:** [`scripts/cloud/codex-setup.sh`](../../scripts/cloud/codex-setup.sh)
reproduces the setup script supplied by the Product Owner from the working
Codex Cloud environment for #263. It previously ran as
`/workspace/.cloud-setup/install-consolidated.sh` and provisions tools and
caches beneath `/workspace/.cloud-setup/` (`jdk/`, `node/`, `m2/`,
`maven/`, `npm-cache/`, and `env.sh`). Copy the versioned script into the
provider's setup-script editor or run it using the provider-supported setup
mechanism, without adding it to mandatory agent bootstrap. When rebuilding,
verify that the provider's active script matches the versioned source; updating
Git alone does **not** update the external environment.

The working Codex environment used these **five provider environment
variables**. Set them in the Codex environment UI with the values below (or
use another explicitly verified mechanism that exposes them to **later agent
shells**, not only the setup process). The setup script exports them during
provisioning and writes them to `/workspace/.cloud-setup/env.sh` for optional
reuse, but those setup-process exports alone do **not** persist into new tasks.
In particular, `MAVEN_ARGS=-s /workspace/.cloud-setup/maven-settings.xml` must
reach agent shells: otherwise `./mvnw` will not select the generated Maven
proxy settings and local repository. Verify the effective values in a fresh
session:

| Variable | Recorded purpose / known path |
| --- | --- |
| `JAVA_HOME` | `/workspace/.cloud-setup/jdk` |
| `MAVEN_USER_HOME` | `/workspace/.cloud-setup/maven` |
| `MAVEN_ARGS` | `-s /workspace/.cloud-setup/maven-settings.xml` |
| `MAVEN_OPTS` | `-Djavax.net.ssl.trustStore=/etc/ssl/certs/java/cacerts` |
| `NPM_CONFIG_CACHE` | `/workspace/.cloud-setup/npm-cache` |

The versioned script generates `/workspace/.cloud-setup/maven-settings.xml`
(mode 600), using the runtime's `HTTP_PROXY` and `HTTPS_PROXY` values where
present, and points Maven at the writable `/workspace/.cloud-setup/m2` local
repository. It accepts only unauthenticated HTTP CONNECT proxies. It sets the
Java truststore via `MAVEN_OPTS` and npm's CA file in user-level npm settings.
The script does **not** populate `~/.m2/settings.xml`. Keep proxy addresses,
credentials and truststore secrets out of Git; inspect effective settings in
the actual cloud task. The script also runs a backend package build and
frontend `npm ci` / build during provisioning, but not integration tests.

The older Codex workspace had about **8 GB** of disk space
and Docker used the `vfs` storage driver. Those were observations, not
requirements for all Codex environments. Docker worked without a
repository-specific SessionStart hook in that workspace.

## Claude Code Cloud

Create/select a [Claude Code cloud environment](https://code.claude.com/docs/en/cloud-environments)
and attach this repository to a cloud session. Set the environment's network
access to allow the actual JDK/Node downloads and Maven/npm dependencies; the
previously working environment used the provider's **Trusted** access level.
The observed Trusted allowlist included `download.oracle.com` and
`nodejs.org` for the JDK and Node downloads. Confirm these hosts and Maven/npm
registries remain permitted in the current provider configuration.

**Versioned source:** [`scripts/cloud/claude-setup.sh`](../../scripts/cloud/claude-setup.sh)
reproduces the setup script supplied by the Product Owner from the working
Claude Code Cloud environment for #263. Copy its contents into the cloud
**Setup script** editor (do not confuse this with the in-repository Docker
SessionStart hook), set the [environment variables below](#claude-code-cloud),
and save the provider environment. The script installs checksum-verified Oracle
JDK 25 and Node.js 24 beneath `/opt/mtg-claude-cloud/`, creates
`/opt/mtg-claude-cloud/env.sh` and
`/etc/profile.d/mtg-claude-cloud.sh`, and intentionally **does not** install
application dependencies or pre-pull Docker images during provisioning. Both
scripts resolve the latest patch releases within their major versions, so
versions can change when the provider rebuilds an environment. Updating Git
alone does **not** update the provider's saved setup script.

The recorded **Claude environment variables** were:

| Variable | Value |
| --- | --- |
| `JAVA_HOME` | `/opt/mtg-claude-cloud/jdk` |
| `CLAUDE_ENV_FILE` | `/opt/mtg-claude-cloud/env.sh` |

`env.sh` prepends the installed JDK and Node binary directories to `PATH`.
`CLAUDE_ENV_FILE` is the mechanism intended to expose these values to Claude's
Bash commands; `/etc/profile.d/mtg-claude-cloud.sh` additionally exposes them
in **login shells**, not necessarily in every non-login agent shell. Beware that
SessionStart hooks which append with `>> "$CLAUDE_ENV_FILE"` will modify the
**same** `env.sh` file used by the setup. Keep such hook writes separate, or
first redesign the ownership of that environment file; the existing Docker
hook does **not** append to it.

An earlier Claude script revision created `/opt/mtg-claude-cloud/npm-cache`
and exported `NPM_CONFIG_CACHE`. The **versioned and PO-supplied deployed
script** omits that override, leaving npm's default per-user cache (observed
as `/root/.npm`). This avoids an unnecessary shared `/opt` cache that could
be unwritable under another user. Root ownership alone is not a problem when
commands also run as root. Do not restore the old npm-cache override when
copying this script into the provider environment.

An observed `JAVA_TOOL_OPTIONS` proxy/truststore setting came from the
runtime environment, **not** from the reviewed setup script. Inspect the
actual environment before assuming a specific proxy configuration.

**Docker lifecycle:** Claude's cloud VM had Docker installed but initially
did not start `dockerd`. The committed [SessionStart settings](../../.claude/settings.json)
invoke [the Docker startup hook](../../.claude/hooks/start-docker-daemon.sh).
It runs only when `CLAUDE_CODE_REMOTE=true`, starts the daemon if needed,
waits for `docker info`, and writes logs to `/tmp/claude-dockerd.log`.
The hook is intentionally a no-op on local machines. Setup-script filesystem
caching must not be mistaken for persistence of running daemon processes.
See [PR #256](https://github.com/GandalfTheJunior/mtg-commander-stats/pull/256).

## Verify a fresh session

Run these checks in a **new cloud task** against the intended repository
revision. Do not manually start Docker before the first `docker info` in Claude
Cloud: that first call is the automatic-hook smoke test. `hello-world` is
optional because its image pull can hit Docker Hub rate limits.

```bash
git status --short
java -version
node --version
npm --version
command -v java node npm
(cd backend && ./mvnw -version)
# Codex Cloud: verify the provider setting reaches this agent shell.
printf 'MAVEN_ARGS=%s\n' "${MAVEN_ARGS:-<unset>}"
docker info
# Optional: docker run --rm hello-world
df -h
(cd backend && ./mvnw -B -DskipTests package)
(cd frontend && npm ci && npm run build)
```

When those checks pass, run the **unchanged canonical backend verification**:

```bash
cd backend
./mvnw verify
```

Do not add `-Dspring.test.context.cache.maxSize=1`, test filters, or skipped
tests to claim a canonical pass. Record deviations explicitly as **not
CI-equivalent**, per [testing policy](testing.md#required-checks). For long
integration runs on constrained disks, monitor `df -h`, Docker containers,
and volume growth without deleting unrelated resources.

## Observed results and limits (9 November 2026)

These observations come from cloud-task reports supplied by the Product Owner;
they were not independently rerun when recorded.

- **Earlier Codex Cloud run (before #246):** a monitored full run using the
  explicit `-Dspring.test.context.cache.maxSize=1` workaround passed **844
  tests**. Additional disk use peaked near **2.00 GB**, with **5.97 GB** free
  at the low point. This was **not CI-equivalent** and is superseded as current
  environment evidence by the canonical run below.
- **Earlier Claude Code Cloud run (after #246 and PR #256):** a fresh session
  automatically started Docker and passed `./mvnw -B verify` with **856 tests,
  zero failures/errors/skips**, in about **5 min 13 s**. Free disk remained
  at least **28.41 GB**. The first image pull encountered Docker Hub
  **HTTP 429**, so `postgres:18` and the Ryuk image were manually pulled
  before this successful run. It did not prove an unattended cold start.
- **Fresh Codex Cloud task:** the then-current remote `main` commit
  [`42bc851ea2846d49238473448094a0d2499c8e9f`](https://github.com/GandalfTheJunior/mtg-commander-stats/commit/42bc851ea2846d49238473448094a0d2499c8e9f)
  was verified in a clean temporary checkout (the task's original checkout
  remained on an earlier commit). Java **25.0.4.1**, Node **24.22.2** and
  Maven wrapper **3.9.11** were active; the documented Codex environment
  paths and `MAVEN_ARGS=-s /workspace/.cloud-setup/maven-settings.xml`
  reached the task shell. Docker worked without manual startup using the
  **`vfs`** driver. The unchanged canonical `cd backend && ./mvnw verify`
  passed **856 tests, zero failures/errors/skips**, without a context-cache
  override. `npm ci && npm run build` also passed. Root filesystem free
  space was **7.5 GB** initially and at least **6.4 GB** at the observed
  checkpoints; no setup intervention, manual image pull or cleanup was needed.
- **Fresh Claude Code Cloud task:** the then-current `main` commit
  [`42bc851ea2846d49238473448094a0d2499c8e9f`](https://github.com/GandalfTheJunior/mtg-commander-stats/commit/42bc851ea2846d49238473448094a0d2499c8e9f)
  was checked with a clean checkout. Java **25.0.5.0.3**, Node **24.22.2**,
  Maven wrapper **3.9.11**, `JAVA_HOME` and `CLAUDE_ENV_FILE` matched the
  Claude-specific setup; Codex-only Maven/cache variables were correctly
  unset. The repository's SessionStart hook started Docker automatically
  (**29.9.2**, **`overlayfs`**). At the first `docker info`, there were
  **zero cached images**. The unchanged `cd backend && ./mvnw verify`
  pulled `testcontainers/ryuk:0.14.0` and `postgres:18` without manual
  intervention or HTTP 429, then passed **856 tests, zero
  failures/errors/skips**, in about **4 min 47 s**. Frontend `npm ci` and
  `npm run build` passed. Free root disk space was about **29.4 GiB** before
  the run and **28.4 GiB** at the sampled minimum. No containers
  remained after the test run.
- **Limits:** these are successful fresh **task/session** checks, not proof
  that the provider setup scripts were reinstalled from scratch or that every
  future Docker Hub pull will succeed. The earlier 429 is a real intermittent
  risk; pre-pulling images into a cached provider setup remains **unimplemented**
  and is tracked separately in [#265](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/265).
  Recheck active provider-side scripts and variables against their Git copies
  before any environment rebuild.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `docker info` reports missing socket | In Claude Cloud confirm the checked-out revision contains the SessionStart hook; inspect `/tmp/claude-dockerd.log`. Do not assume Docker needs reinstalling. In Codex Cloud verify Docker availability in that specific VM. |
| Docker Hub `429 Too Many Requests` | Check the pull response, shared-IP rate limit and cached images. Possible **unimplemented** mitigations include authenticated pulls, an authorized registry mirror, or preparing `postgres:18` and the **Testcontainers-version-matched Ryuk image** during the provider setup phase, while `dockerd` is temporarily running, so their downloaded layers enter the setup filesystem snapshot. Validate snapshot persistence, cache rebuild behavior, pull policy, and disk costs before adopting that option (tracked in [#265](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/265)); do **not** assume snapshots guarantee later availability. Keep credentials in provider secrets, never Git. |
| Maven HTTPS/download errors | Check provider network policy and inherited `HTTPS_PROXY`; verify the effective Maven settings (`MAVEN_ARGS=-s /workspace/.cloud-setup/maven-settings.xml` in Codex Cloud, `~/.m2/settings.xml` where applicable otherwise), Java truststore, and `JAVA_TOOL_OPTIONS`/`MAVEN_OPTS`. Redact sensitive values in reports. |
| Wrong Java/Node version | Compare `command -v java node npm`, `java -version`, `node --version`, `JAVA_HOME`, and `PATH`. Older runtimes may remain later on `PATH`. |
| Cache or filesystem errors | Check `df -h`, cache ownership and Maven/npm paths. Do not use broad Docker cleanup as an unexplained fix. |

## Maintenance and recovery

1. Before modifying a working provider environment, compare its active setup
   script with the versioned [Codex](../../scripts/cloud/codex-setup.sh) or
   [Claude](../../scripts/cloud/claude-setup.sh) source. Securely record the
   provider-side variable values (excluding secrets), network policy and
   proxy/truststore settings; those settings remain outside Git. If either
   script differs from the deployed copy, reconcile it through review before
   changing the live environment.
2. After Java/Node patch changes or provider base-image/network/cache resets,
   repeat the version, tool-location, dependency-download and Docker checks.
   Latest-major URLs may resolve to new patch releases.
3. After shared-container or SessionStart-hook changes, test a **fresh**
   environment and canonical `./mvnw verify`; distinguish a successful run
   with pre-pulled images from a proven unattended cold start.
4. Record the date, revision, command, test counts, free-space minimum and
   any deviations. Avoid putting secrets, private proxy endpoints or
   machine-specific authentication material in repository documentation.
