#!/usr/bin/env bash
set -Eeuo pipefail
# Keep async children from becoming process-group leaders before setsid.
set +m

# Keep the optional password out of every service/npm/Docker/seed child.
codespace_test_password="${MTG_CODESPACE_TEST_PASSWORD:-}"
unset MTG_CODESPACE_TEST_PASSWORD

if [[ -z "${CODESPACE_NAME:-}" ]]; then
  echo "This automatic preview startup is intended for GitHub Codespaces only." >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
state_dir="$HOME/.local/state/mtg-commander-stats"
secret_dir="$HOME/.config/mtg-commander-stats"
umask 077
mkdir -p "$state_dir" "$secret_dir"

# Capture lifecycle output too; do not use xtrace (DB credentials are exported below).
exec > >(tee -a "$state_dir/startup.log") 2>&1
# Serialize automatic/manual invocations. Services must not inherit this lock.
exec 9> "$state_dir/startup.lock"
flock 9
printf '\n[%s] startup pid=%s uid=%s cwd=%s stdin_tty=%s\n' \
  "$(date -Is)" "$$" "$(id -u)" "$PWD" "$([[ -t 0 ]] && echo yes || echo no)"
phase="Initialisierung"
report() {
  phase="$1"
  printf '%s\n' "$phase" > "$state_dir/startup-status.txt"
  echo "$phase"
}
on_error() {
  local code=$?
  trap - ERR
  printf '[%s] startup failed: exit=%s line=%s phase=%s\n' "$(date -Is)" "$code" "$1" "$phase"
  report "Start fehlgeschlagen: $phase. Die Vorschau-Logs enthalten weitere Details."
  exit "$code"
}
trap 'on_error $LINENO' ERR
trap 'startup_exit=$?; printf "[%s] startup finished: exit=%s phase=%s\n" "$(date -Is)" "$startup_exit" "$phase"' EXIT
command -v node npm nohup setsid
node --version
cd "$repo_root"

# Kernel-backed ownership, scoped to this user, repository and service. The log
# descriptor also identifies still-running services from before service locks.
service_process_matches() {
  local name="$1" pid="$2" cwd="$repo_root"
  [[ "$pid" =~ ^[1-9][0-9]*$ ]] && [[ "$pid" -gt 1 ]] || return 1
  [[ "$pid" != "$$" ]] || return 1
  [[ -O "/proc/$pid" ]] || return 1
  [[ "/proc/$pid/fd/8" -ef "$state_dir/$name.lock" ||
     "/proc/$pid/fd/1" -ef "$state_dir/$name.log" ]] || return 1
  case "$name" in
    frontend|backend) cwd="$repo_root/$name" ;;
  esac
  # The launch shell starts in repo_root before exec/cd into a service directory.
  [[ "/proc/$pid/cwd" -ef "$repo_root" || "/proc/$pid/cwd" -ef "$cwd" ]]
}

service_pid_is_valid() {
  local name="$1" pid="$2" status status_pattern='^[RSDI][<NLsl+]*$'
  service_process_matches "$name" "$pid" || return 1
  status="$(ps -o stat= -p "$pid" 2>/dev/null)" || return 1
  status="${status//[[:space:]]/}"
  [[ "$status" =~ $status_pattern ]]
}

launched_name=""
launched_pid=""

# nohup ignores HUP, but does not leave the lifecycle process group/session.
# setsid also isolates the servers from signals sent to that group. With job
# control off, $! stays the service PID. FD 9 (startup lock) closes in children;
# FD 8 (service lock) stays open for their lifetime. Never unlink lock files.
start_service() {
  local name="$1" pid candidate proc
  shift
  pid="$(cat "$state_dir/$name.pid" 2>/dev/null || true)"
  if service_pid_is_valid "$name" "$pid"; then
    echo "$name: reusing running pid=$pid"
    return
  fi
  exec 8> "$state_dir/$name.lock"
  if ! flock -n 8; then
    exec 8>&-
    echo "$name: service lock held; waiting for HTTP without trusting saved pid=$pid"
    return
  fi
  # A legacy launch may lack the lifetime lock or its PID record. Its open files
  # still prevent a duplicate launch. Do not guess which process is its leader.
  for proc in /proc/[0-9]*; do
    candidate="${proc##*/}"
    if service_process_matches "$name" "$candidate"; then
      echo "$name: matching service process found; saved PID is unverifiable; waiting for HTTP only"
      exec 8>&-
      return
    fi
  done
  if [[ -s "$state_dir/$name.pid" ]]; then
    echo "$name: ignoring unverifiable/stale pid=$pid; no signal sent"
    mv "$state_dir/$name.pid" "$state_dir/$name.pid.stale"
  fi
  printf '[%s] launching %s\n' "$(date -Is)" "$name" >> "$state_dir/$name.log"
  nohup setsid "$@" >> "$state_dir/$name.log" 2>&1 < /dev/null 9>&- &
  pid=$!
  printf '%s\n' "$pid" > "$state_dir/$name.pid"
  launched_name="$name"
  launched_pid="$pid"
  exec 8>&-
  echo "$name: launched pid=$pid"
}

wait_service() {
  local name="$1" url="$2" attempts="$3" pid code
  pid="$(cat "$state_dir/$name.pid" 2>/dev/null || true)"
  if [[ "$launched_name" == "$name" ]]; then
    pid="$launched_pid"
  elif ! service_pid_is_valid "$name" "$pid"; then
    pid=""
  fi
  for ((attempt=0; attempt<attempts; attempt++)); do
    if curl --silent --fail --max-time 2 "$url" >/dev/null; then
      return 0
    fi
    if [[ -n "$pid" ]] && ! service_pid_is_valid "$name" "$pid"; then
      code=0
      if [[ "$launched_name" == "$name" ]] && ! kill -0 "$pid" 2>/dev/null; then
        wait "$pid" || code=$?
      else
        echo "$name: process identity/status is no longer verifiable; no signal or restart attempted"
        return 1
      fi
      # 127 means a previous invocation owned the PID; no exit status available.
      echo "$name: pid=$pid exited before readiness; wait_exit=$code (127=not our child); log=$state_dir/$name.log"
      return 1
    fi
    sleep 2
  done
  echo "$name: readiness timed out; pid=$pid url=$url log=$state_dir/$name.log"
  if [[ "$pid" =~ ^[0-9]+$ ]]; then
    ps -o pid,ppid,pgid,sid,stat,comm -p "$pid" || true
  fi
  return 1
}

# The status page must be available even if npm, Docker or PostgreSQL fails.
report "Statusseite wird gestartet"
if ! curl --silent --fail --max-time 2 http://127.0.0.1:5174/healthz >/dev/null; then
  start_service status-server node "$repo_root/.devcontainer/status-server.mjs"
fi
wait_service status-server http://127.0.0.1:5174/healthz 15

# Install dependencies when first created or when the lockfile changes.
report "Frontend-Abhängigkeiten werden geprüft"
lock_hash="$(sha256sum "$repo_root/frontend/package-lock.json" | cut -d ' ' -f 1)"
if [[ ! -f "$repo_root/frontend/node_modules/.bin/vite" ]] || \
   [[ "$(cat "$state_dir/frontend-lock.sha256" 2>/dev/null || true)" != "$lock_hash" ]]; then
  npm ci --prefix "$repo_root/frontend"
  printf '%s\n' "$lock_hash" > "$state_dir/frontend-lock.sha256"
fi

# Make the UI available without waiting for Docker or the backend.
report "Frontend wird gestartet"
if ! curl --silent --fail --max-time 2 http://127.0.0.1:5173/ >/dev/null; then
  export __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS="${CODESPACE_NAME}-5173.app.github.dev"
  start_service frontend bash -c 'cd "$1/frontend"; exec npm run dev -- --host 0.0.0.0 --port 5173 --strictPort' \
    bash "$repo_root"
fi
wait_service frontend http://127.0.0.1:5173/ 30

# Keep one stable local password for the lifetime of this Codespace's DB volume.
report "Docker und PostgreSQL werden gestartet"
password_file="$secret_dir/postgres-password"
if [[ ! -s "$password_file" ]]; then
  openssl rand -hex 24 > "$password_file"
fi
export POSTGRES_PASSWORD="$(cat "$password_file")"
export POSTGRES_DB=mtg_commander_stats
export POSTGRES_USER=mtg_commander_stats
export POSTGRES_PORT=5432
for attempt in {1..30}; do
  if docker info >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
if ! docker info >/dev/null 2>&1; then
  report "Docker nicht bereit. Frontend und Statusseite bleiben erreichbar."
  exit 1
fi
start_postgres() {
  local code
  if docker compose up -d --wait --wait-timeout 120 postgres; then
    return 0
  else
    code=$?
  fi
  # Only the inspected, stopped OCI-ID-collision container may be removed.
  # Refusal preserves the first failure; a failed retry is final (no loop).
  if ! node "$repo_root/.devcontainer/recover-postgres.mjs"; then
    return "$code"
  fi
  docker compose up -d --wait --wait-timeout 120 postgres
}
start_postgres

report "Spring Boot wird gestartet (Maven lädt beim ersten Mal Abhängigkeiten)"
if ! curl --silent --fail --max-time 2 http://127.0.0.1:8080/api/csrf >/dev/null; then
  start_service backend bash -c 'cd "$1/backend"; exec node "$1/.devcontainer/run-backend.mjs"' bash "$repo_root"
fi
wait_service backend http://127.0.0.1:8080/api/csrf 120

# Spring Boot must finish Flyway migrations before inspecting/importing demo
# fixture data. The existing application database is never reset.
# Optional one-time demo data in a genuinely empty Codespace DB. A failure does
# not erase data or auto-retry; private status remains available for diagnostics.
if [[ "${MTG_CODESPACE_DEMO_DATA:-}" == "1" ]]; then
  report "Demo-Testdaten werden geprüft"
  node "$repo_root/.devcontainer/seed-demo.mjs"
fi

if [[ -n "$codespace_test_password" ]]; then
  report "Optionaler Testzugang wird geprüft"
  MTG_CODESPACE_TEST_PASSWORD="$codespace_test_password" node "$repo_root/.devcontainer/provision-test-login.mjs"
else
  echo "test-login: optional test login not configured."
fi
unset codespace_test_password

report "Vorschau bereit"
