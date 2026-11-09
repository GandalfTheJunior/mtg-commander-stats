# Agent cloud environments: Codex Cloud and Claude Code Cloud

This is an **operational runbook**, not an additional agent bootstrap contract.
Both providers keep environment provisioning and some settings **outside Git**.
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

**Previously verified setup:** The working installation script was reported at
`/workspace/.cloud-setup/install-consolidated.sh` and provisioned its tools
and caches under `/workspace/.cloud-setup/` (including `jdk/`, `node/`, `m2/`
and `env.sh`). The script was configured in the Codex cloud environment, **not**
tracked in this repository. The exact current provider-side script and settings
cannot be recovered from Git alone. Before recreating the environment, export
the actual script and redact/secure any sensitive configuration. Do not assume
that an older local copy is the deployed version.

The working environment previously used these **five provider environment
variable names**. Confirm the **current literal values in Codex's UI** before
restoring them; only the script-derived paths below are independently recorded:

| Variable | Recorded purpose / known path |
| --- | --- |
| `JAVA_HOME` | JDK 25; previously `/workspace/.cloud-setup/jdk` |
| `MAVEN_USER_HOME` | Maven wrapper user home; previously `/workspace/.cloud-setup/maven` |
| `MAVEN_ARGS` | Maven command defaults; exact deployed value **not captured here** |
| `MAVEN_OPTS` | Maven JVM options; previously configured local repository and Java truststore |
| `NPM_CONFIG_CACHE` | Writable npm cache; script used `/workspace/.cloud-setup/npm-cache` |

The historical setup populated `~/.m2/settings.xml` from the cloud's HTTPS
proxy when needed, placed Maven artifacts in a writable local repository,
and configured system CA/truststore handling where applicable. Proxy host,
credentials, `MAVEN_ARGS`, and the current final `MAVEN_OPTS` value must be
checked **in the active environment**; do not publish proxy credentials or
truststore secrets. The older Codex workspace had about **8 GB** of disk space
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

The successful provider-side **setup script** was entered in Claude's cloud
environment editor; it is **not committed to this repository**. The reviewed
working script installed Oracle JDK 25 and Node.js 24 beneath
`/opt/mtg-claude-cloud/`, using their published checksums, and created
`/opt/mtg-claude-cloud/env.sh` plus
`/etc/profile.d/mtg-claude-cloud.sh`. It used the latest release within
each major version, so patch versions can change on environment rebuild.
Export the current script from the provider settings before rebuilding;
the actual provider-side script is the source of truth.

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

Two setup-script revisions existed: the earlier one created
`/opt/mtg-claude-cloud/npm-cache` and exported `NPM_CONFIG_CACHE` pointing
there, while the later reviewed script removed that override and used npm's
default per-user cache. The successful Cloud smoke test observed `/root/.npm`.
The reason for the change was to avoid an unnecessary shared `/opt` cache that
could be unwritable if commands later run under a different user; ownership by
root is **not itself a problem** when the agent also runs as root. Confirm the
**actually deployed** setup script and `npm config get cache` before a rebuild;
the working observation does not prove which revision is currently deployed.

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

- **Codex Cloud, before #246:** a monitored full run using the explicit
  `-Dspring.test.context.cache.maxSize=1` workaround passed **844 tests**.
  Additional disk use peaked near **2.00 GB**, with **5.97 GB** free at
  the low point. That run was **not CI-equivalent**; it does not establish
  a canonical full-suite result after #246 in Codex Cloud.
- **Claude Code Cloud, after #246 and PR #256:** a fresh cloud session
  automatically started Docker and ran `./mvnw -B verify` without extra
  properties: **856 tests, zero failures/errors/skips**, Maven time about
  **5 min 13 s**. Free disk remained at least **28.41 GB**.
  The observer recorded up to two concurrent PostgreSQL containers; their
  individual identities were not verified. Containers and volumes were
  removed after the run.
- **Important image-pull caveat:** the Claude test first encountered Docker
  Hub **HTTP 429**, then `postgres:18` and the Ryuk image were **manually
  pulled before** the successful `verify` run. That result proves the suite
  works with images present, **not** that every unattended cold start can
  download the images when the shared egress IP is rate-limited.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `docker info` reports missing socket | In Claude Cloud confirm the checked-out revision contains the SessionStart hook; inspect `/tmp/claude-dockerd.log`. Do not assume Docker needs reinstalling. In Codex Cloud verify Docker availability in that specific VM. |
| Docker Hub `429 Too Many Requests` | Check the pull response, shared-IP rate limit and cached images. Possible **unimplemented** mitigations include authenticated pulls, an authorized registry mirror, or preparing `postgres:18` and the **Testcontainers-version-matched Ryuk image** during the provider setup phase, while `dockerd` is temporarily running, so their downloaded layers enter the setup filesystem snapshot. Validate snapshot persistence, cache rebuild behavior, pull policy, and disk costs before adopting that option (tracked in [#265](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/265)); do **not** assume snapshots guarantee later availability. Keep credentials in provider secrets, never Git. |
| Maven HTTPS/download errors | Check provider network policy, inherited `HTTPS_PROXY`, Maven's effective `~/.m2/settings.xml`, Java truststore and any `JAVA_TOOL_OPTIONS`/`MAVEN_OPTS` settings; redact sensitive values in reports. |
| Wrong Java/Node version | Compare `command -v java node npm`, `java -version`, `node --version`, `JAVA_HOME`, and `PATH`. Older runtimes may remain later on `PATH`. |
| Cache or filesystem errors | Check `df -h`, cache ownership and Maven/npm paths. Do not use broad Docker cleanup as an unexplained fix. |

## Maintenance and recovery

1. Before modifying a working provider environment, **export and securely
   archive its actual setup script, environment-variable values (excluding
   secrets), network policy and any Maven proxy/truststore settings**. Provider
   UI configurations and scripts are not currently reconstructible from Git.
   Track verified, sanitized script copies in follow-up [#263](https://github.com/GandalfTheJunior/mtg-commander-stats/issues/263) rather than assuming
   an older local copy matches the currently deployed version.
2. After Java/Node patch changes or provider base-image/network/cache resets,
   repeat the version, tool-location, dependency-download and Docker checks.
   Latest-major URLs may resolve to new patch releases.
3. After shared-container or SessionStart-hook changes, test a **fresh**
   environment and canonical `./mvnw verify`; distinguish a successful run
   with pre-pulled images from a proven unattended cold start.
4. Record the date, revision, command, test counts, free-space minimum and
   any deviations. Avoid putting secrets, private proxy endpoints or
   machine-specific authentication material in repository documentation.
