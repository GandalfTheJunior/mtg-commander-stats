#!/usr/bin/env bash
set -Eeuo pipefail
# Keep async children from becoming process-group leaders before setsid.
set +m

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
trap 'printf "[%s] startup finished: exit=%s phase=%s\n" "$(date -Is)" "$?" "$phase"' EXIT
command -v node npm nohup setsid
node --version

# nohup ignores HUP, but does not leave the lifecycle process group/session.
# setsid also isolates the servers from signals sent to that group. With job
# control off, $! stays the service PID. All standard streams and the lock close.
start_service() {
  local name="$1" pid
  shift
  pid="$(cat "$state_dir/$name.pid" 2>/dev/null || true)"
  if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null &&
     [[ "$(ps -o stat= -p "$pid")" != *Z* ]]; then
    echo "$name: reusing running pid=$pid"
    return
  fi
  printf '[%s] launching %s\n' "$(date -Is)" "$name" >> "$state_dir/$name.log"
  nohup setsid "$@" >> "$state_dir/$name.log" 2>&1 < /dev/null 9>&- &
  pid=$!
  printf '%s\n' "$pid" > "$state_dir/$name.pid"
  echo "$name: launched pid=$pid"
}

wait_service() {
  local name="$1" url="$2" attempts="$3" pid code
  pid="$(cat "$state_dir/$name.pid" 2>/dev/null || true)"
  for ((attempt=0; attempt<attempts; attempt++)); do
    if curl --silent --fail --max-time 2 "$url" >/dev/null; then
      return 0
    fi
    if [[ "$pid" =~ ^[0-9]+$ ]] && ! kill -0 "$pid" 2>/dev/null; then
      code=0
      wait "$pid" || code=$?
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
cd "$repo_root"
docker compose up -d --wait --wait-timeout 120 postgres

report "Spring Boot wird gestartet (Maven lädt beim ersten Mal Abhängigkeiten)"
if ! curl --silent --fail --max-time 2 http://127.0.0.1:8080/api/csrf >/dev/null; then
  start_service backend bash -c 'cd "$1/backend"; exec ./mvnw spring-boot:run' bash "$repo_root"
fi
wait_service backend http://127.0.0.1:8080/api/csrf 120
report "Vorschau bereit"
