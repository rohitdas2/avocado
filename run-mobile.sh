#!/usr/bin/env bash
# Runs the Avocado mobile app in the iOS Simulator with everything it needs on this Mac:
# PostgreSQL, the Flask/Gunicorn API on port 3001 (no website), and Expo.
# Usage, from the repo root:  ./run-mobile.sh      Stop with Ctrl+C (the API stops with it).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT/web"

# 1. API settings. The first run copies the example, which points at the Docker database
#    on port 5432. Edit DATABASE_URL in web/.env to use a different database.
if [ ! -f .env ]; then cp .env.example .env; echo "Created web/.env from .env.example."; fi

# 2. Python environment for the API (created once).
if [ ! -x .venv/bin/python ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
fi

# 3. Database: use DATABASE_URL if it answers. Otherwise try the local preview database this
#    project has used on port 55432 and save the first login that works into web/.env.
#    Docker (compose.yaml, port 5432) is the last resort, only if Docker is installed.
db_ready() {  # $1: optional URL to test instead of the one in .env
  DB_TEST_URL="${1:-}" .venv/bin/python - <<'PY' >/dev/null 2>&1
from pathlib import Path
from dotenv import load_dotenv
import os, psycopg
load_dotenv(Path(".env"))
psycopg.connect(os.environ.get("DB_TEST_URL") or os.environ["DATABASE_URL"], connect_timeout=3).close()
PY
}
if ! db_ready; then
  found=""
  for url in "postgresql://avocado:avocado_local@127.0.0.1:55432/avocado" \
             "postgresql://avocado_fixture:avocado_fixture_only@127.0.0.1:55432/avocado"; do
    if db_ready "$url"; then found="$url"; break; fi
  done
  if [ -n "$found" ]; then
    sed -i '' "s#^DATABASE_URL=.*#DATABASE_URL=$found#" .env
    echo "Using the PostgreSQL database on port 55432 (saved to web/.env)."
  elif command -v docker >/dev/null 2>&1; then
    echo "Starting the Docker database (needs Docker Desktop running)…"
    docker compose up -d --wait db
    db_ready || { echo "Still can't reach DATABASE_URL in web/.env. Check it, then rerun."; exit 1; }
  else
    echo "No database reachable. Set DATABASE_URL in web/.env to a running PostgreSQL, then rerun."
    exit 1
  fi
fi

# 4. Bring the schema up to date (safe to repeat; existing rows are preserved).
.venv/bin/python -m server.migrate

# 5. Start the API in the background and stop it when this script exits.
if curl -fsS http://127.0.0.1:3001/api/health >/dev/null 2>&1; then
  echo "An API is already running on port 3001; using it."
else
  .venv/bin/python -m gunicorn --reload --workers 1 --config gunicorn.conf.py server.wsgi:app &
  API_PID=$!
  trap 'kill $API_PID 2>/dev/null' EXIT
  for _ in $(seq 1 30); do curl -fsS http://127.0.0.1:3001/api/health >/dev/null 2>&1 && break; sleep 0.5; done
  curl -fsS http://127.0.0.1:3001/api/health >/dev/null || { echo "API did not start; see the errors above."; exit 1; }
  echo "API ready on http://127.0.0.1:3001"
fi

# 6. Expo. If Metro is already running (port 8081), keep it: just reload the app in the
#    Simulator (Cmd+R, or tap Try again) and leave this window open for the API.
cd "$ROOT/mobile"
[ -d node_modules ] || npm ci
if lsof -nP -iTCP:8081 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Expo/Metro is already running on 8081. Reload the app in the Simulator. Ctrl+C here stops the API."
  wait
else
  npx expo start --ios
fi
