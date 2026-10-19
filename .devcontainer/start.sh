#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${CODESPACE_NAME:-}" ]]; then
  echo "This automatic preview startup is intended for GitHub Codespaces only." >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
state_dir="$HOME/.local/state/mtg-commander-stats"
secret_dir="$HOME/.config/mtg-commander-stats"
mkdir -p "$state_dir" "$secret_dir"
umask 077

# Keep one stable local password for the lifetime of this codespace's database volume.
password_file="$secret_dir/postgres-password"
if [[ ! -s "$password_file" ]]; then
  openssl rand -hex 24 > "$password_file"
fi
export POSTGRES_PASSWORD="$(cat "$password_file")"
export POSTGRES_DB=mtg_commander_stats
export POSTGRES_USER=mtg_commander_stats
export POSTGRES_PORT=5432

# The Docker-in-Docker daemon may not be ready immediately after a codespace starts.
for attempt in {1..30}; do
  if docker info >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
if ! docker info >/dev/null 2>&1; then
  echo "Docker is not ready; see Codespaces creation/startup logs." >&2
  exit 1
fi

cd "$repo_root"
docker compose up -d --wait postgres

is_running() {
  local pid_file="$1" pid
  [[ -s "$pid_file" ]] || return 1
  pid="$(cat "$pid_file")"
  [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null
}

if ! is_running "$state_dir/backend.pid" && ! curl --silent --fail \
  http://127.0.0.1:8080/api/csrf >/dev/null; then
  nohup bash -c 'cd "$1/backend"; exec ./mvnw spring-boot:run' bash "$repo_root" \
    > "$state_dir/backend.log" 2>&1 < /dev/null &
  echo "$!" > "$state_dir/backend.pid"
fi

if ! is_running "$state_dir/frontend.pid" && ! curl --silent --fail \
  http://127.0.0.1:5173/ >/dev/null; then
  # Trust only the hostname of this codespace, not arbitrary Host headers.
  export __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS="${CODESPACE_NAME}-5173.app.github.dev"
  nohup bash -c 'cd "$1/frontend"; exec npm run dev -- --host 0.0.0.0 --port 5173 --strictPort' \
    bash "$repo_root" > "$state_dir/frontend.log" 2>&1 < /dev/null &
  echo "$!" > "$state_dir/frontend.pid"
fi

echo "Preview starting; open the private HTTPS URL for port 5173 in Codespaces > Ports."
echo "Service logs: $state_dir/backend.log and $state_dir/frontend.log"
