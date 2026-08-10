#!/usr/bin/env bash
# Run on the VPS after code is updated (called by git post-receive).
# Keeps SPA on :4173; optionally (re)starts Postgres/Redis/API when Docker is present.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/talaria-log}"
PORT="${PORT:-4173}"
LOG_FILE="${LOG_FILE:-/var/log/talaria-preview.log}"
API_PROXY="${TALARIA_API_PROXY:-http://127.0.0.1:8787}"

cd "$APP_DIR"

echo "[deploy] $(date -u +%Y-%m-%dT%H:%M:%SZ) updating $APP_DIR"
git fetch origin
git checkout main
git reset --hard origin/main

# Ensure production env exists — generate secrets locally; never commit them.
if [ ! -f "$APP_DIR/.env" ]; then
  echo "[deploy] creating $APP_DIR/.env with random secrets (not logged)"
  SECRET="$(openssl rand -base64 48 | tr -d '\n')"
  ADMIN_PASS="$(openssl rand -base64 32 | tr -d '\n=/+' | head -c 32)"
  ADMIN_EMAIL="${SEED_ADMIN_EMAIL:-admin@talaria.app}"
  cat >"$APP_DIR/.env" <<EOF
SESSION_SECRET=${SECRET}
SEED_ADMIN_EMAIL=${ADMIN_EMAIL}
SEED_ADMIN_PASSWORD=${ADMIN_PASS}
TALARIA_API_PROXY=${API_PROXY}
EOF
  chmod 600 "$APP_DIR/.env"
  echo "[deploy] wrote $APP_DIR/.env (chmod 600) — read SEED_ADMIN_* there; do not commit"
fi

# Load SESSION_SECRET for compose; export proxy for preview.
set -a
# shellcheck disable=SC1091
source "$APP_DIR/.env"
set +a
export TALARIA_API_PROXY="${TALARIA_API_PROXY:-$API_PROXY}"

echo "[deploy] npm install"
npm install

echo "[deploy] npm run build"
npm run build

# --- SaaS stack (safe no-op if Docker missing) ---
if command -v docker >/dev/null 2>&1; then
  echo "[deploy] docker compose up (postgres redis api)"
  docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d --build postgres redis api
  API_OK=0
  echo "[deploy] waiting for API health…"
  for i in $(seq 1 60); do
    if curl -sf "http://127.0.0.1:8787/api/v1/health" >/dev/null; then
      echo "[deploy] API healthy"
      API_OK=1
      break
    fi
    sleep 2
  done
  if [ "$API_OK" -eq 1 ]; then
    # Catalog sync: skip datasets already in Postgres (seconds). Full rewrite:
    #   FORCE_DISK_IMPORT=1 ./scripts/vps-deploy.sh
    # or: docker compose exec api node dist/importDiskCatalog.js --force
    if [ "${FORCE_DISK_IMPORT:-0}" = "1" ]; then
      echo "[deploy] disk catalog FORCE refresh…"
      IMPORT_OK=0
      if docker compose -f docker-compose.yml -f docker-compose.vps.yml exec -T \
        -e FORCE_DISK_IMPORT=1 api node dist/importDiskCatalog.js; then
        IMPORT_OK=1
      fi
    else
      echo "[deploy] disk catalog sync (unchanged packs skipped)…"
      IMPORT_OK=0
      if docker compose -f docker-compose.yml -f docker-compose.vps.yml exec -T \
        api node dist/importDiskCatalog.js; then
        IMPORT_OK=1
      fi
    fi
    if [ "$IMPORT_OK" -eq 1 ]; then
      echo "[deploy] disk catalog synced"
    else
      echo "[deploy] WARN: disk import failed (non-fatal)" >&2
    fi
  else
    echo "[deploy] WARN: API unhealthy — falling back to disk stub for /api/v1" >&2
    unset TALARIA_API_PROXY
  fi
else
  echo "[deploy] Docker not installed — SPA uses disk stub"
  unset TALARIA_API_PROXY
fi

PREVIEW_PROXY="${TALARIA_API_PROXY:-}"
echo "[deploy] restart preview on :$PORT (api → ${PREVIEW_PROXY:-disk-stub})"
fuser -k "${PORT}/tcp" 2>/dev/null || true
sleep 1
# Export proxy into preview process env so vite.config + apiPlugin see it.
nohup env TALARIA_API_PROXY="${PREVIEW_PROXY}" \
  npx vite preview --host 0.0.0.0 --port "$PORT" >"$LOG_FILE" 2>&1 &
sleep 2

if ss -tlnp | grep -q ":${PORT}"; then
  echo "[deploy] OK → http://$(hostname -I | awk '{print $1}'):${PORT}/"
else
  echo "[deploy] FAILED — see $LOG_FILE" >&2
  tail -n 40 "$LOG_FILE" >&2 || true
  exit 1
fi
