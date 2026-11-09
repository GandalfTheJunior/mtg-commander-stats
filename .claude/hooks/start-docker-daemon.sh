#!/bin/bash
# SessionStart hook: start the Docker daemon in Claude Code cloud sessions.
#
# Testcontainers-based backend tests need a running Docker daemon. Claude Code
# cloud containers ship Docker but do not start dockerd. This hook starts it
# with the default configuration and waits until `docker info` succeeds.
# Outside Claude Code cloud sessions it does nothing.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

log_file="${CLAUDE_DOCKERD_LOG:-/tmp/claude-dockerd.log}"
lock_file="${CLAUDE_DOCKERD_LOCK:-/tmp/claude-dockerd.lock}"
timeout_seconds="${CLAUDE_DOCKERD_TIMEOUT:-60}"

fail() {
  echo "Docker daemon start failed: $*" >&2
  if [ -s "$log_file" ]; then
    echo "Last lines of $log_file:" >&2
    tail -n 20 "$log_file" >&2
  fi
  exit 1
}

docker_ready() {
  docker info >/dev/null 2>&1
}

# True if a live (non-zombie) dockerd process exists. When this hook started
# the daemon itself, check that PID: right after the fork the process may not
# yet carry the name dockerd.
started_pid=""
dockerd_running() {
  if [ -n "$started_pid" ]; then
    ps -o stat= -p "$started_pid" 2>/dev/null | grep -qv '^Z'
  else
    ps -C dockerd -o stat= 2>/dev/null | grep -qv '^Z'
  fi
}

command -v docker >/dev/null || fail "docker CLI not found on PATH."
command -v dockerd >/dev/null || fail "dockerd not found on PATH."

if docker_ready; then
  exit 0
fi

# Serialize concurrent hook runs so that only one dockerd is ever started.
exec 9>"$lock_file"
flock -w "$timeout_seconds" 9 || fail "timed out waiting for lock $lock_file."

if ! docker_ready && ! dockerd_running; then
  [ "$(id -u)" -eq 0 ] || fail "dockerd must be started as root."
  echo "Starting Docker daemon (log: $log_file)..." >&2
  # setsid detaches dockerd from the hook's process group so it outlives the
  # hook; fd 9 is closed so the daemon does not keep holding the lock.
  setsid dockerd >>"$log_file" 2>&1 </dev/null 9>&- &
  started_pid=$!
fi

for ((i = 0; i < timeout_seconds; i++)); do
  if docker_ready; then
    echo "Docker daemon is ready." >&2
    exit 0
  fi
  dockerd_running || fail "dockerd exited before becoming ready."
  sleep 1
done

fail "docker info did not succeed within ${timeout_seconds}s."
