#!/usr/bin/env bash
set -Eeuo pipefail

if [[ -z "${CODESPACE_NAME:-}" ]]; then
  echo "This automatic preview startup is intended for GitHub Codespaces only." >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
state_dir="$HOME/.local/state/mtg-commander-stats"
secret_dir="$HOME/.config/mtg-commander-stats"
mkdir -p "$state_dir" "$secret_dir"
umask 077

phase="Initialisierung"
report() {
  phase="$1"
  printf '%s\n' "$phase" > "$state_dir/startup-status.txt"
  echo "$phase"
}
on_error() {
  local code=$?
  trap - ERR
  report "Start fehlgeschlagen: $phase. Die Vorschau-Logs enthalten weitere Details."
  exit "$code"
}
trap on_error ERR

# The status page must be available even if npm, Docker or PostgreSQL fails.
report "Statusseite wird gestartet"
if ! curl --silent --fail --max-time 2 http://127.0.0.1:5174/healthz >/dev/null; then
  nohup node "$repo_root/.devcontainer/status-server.mjs" \
    > "$state_dir/status-server.log" 2>&1 < /dev/null &
  echo "$!" > "$state_dir/status-server.pid"
fi
for attempt in {1..15}; do
  if curl --silent --fail --max-time 2 http://127.0.0.1:5174/healthz >/dev/null; then
    break
  fi
  sleep 1
done
if ! curl --silent --fail --max-time 2 http://127.0.0.1:5174/healthz >/dev/null; then
  report "Statusseite konnte nicht gestartet werden; siehe Codespaces-Startprotokoll."
  exit 1
fi

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
  nohup bash -c 'cd "$1/frontend"; exec npm run dev -- --host 0.0.0.0 --port 5173 --strictPort' \
    bash "$repo_root" > "$state_dir/frontend.log" 2>&1 < /dev/null &
  echo "$!" > "$state_dir/frontend.pid"
fi
for attempt in {1..30}; do
  if curl --silent --fail --max-time 2 http://127.0.0.1:5173/ >/dev/null; then
    break
  fi
  sleep 2
done
if ! curl --silent --fail --max-time 2 http://127.0.0.1:5173/ >/dev/null; then
  report "Frontend nicht erreichbar; siehe frontend.log."
  exit 1
fi

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
  nohup bash -c 'cd "$1/backend"; exec ./mvnw spring-boot:run' bash "$repo_root" \
    > "$state_dir/backend.log" 2>&1 < /dev/null &
  echo "$!" > "$state_dir/backend.pid"
fi
for attempt in {1..120}; do
  if curl --silent --fail --max-time 2 http://127.0.0.1:8080/api/csrf >/dev/null; then
    report "Vorschau bereit"
    exit 0
  fi
  sleep 2
done
report "Backend antwortet noch nicht; siehe backend.log. Frontend und Statusseite sind erreichbar."
exit 1
