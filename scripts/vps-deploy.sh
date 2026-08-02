#!/usr/bin/env bash
# Run on the VPS after code is updated (called by git post-receive).
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/talaria-log}"
PORT="${PORT:-4173}"
LOG_FILE="${LOG_FILE:-/var/log/talaria-preview.log}"

cd "$APP_DIR"

echo "[deploy] $(date -u +%Y-%m-%dT%H:%M:%SZ) updating $APP_DIR"
git fetch origin
git checkout main
git reset --hard origin/main

echo "[deploy] npm install"
npm install

echo "[deploy] npm run build"
npm run build

echo "[deploy] restart preview on :$PORT"
fuser -k "${PORT}/tcp" 2>/dev/null || true
sleep 1
nohup npx vite preview --host 0.0.0.0 --port "$PORT" >"$LOG_FILE" 2>&1 &
sleep 2

if ss -tlnp | grep -q ":${PORT}"; then
  echo "[deploy] OK → http://$(hostname -I | awk '{print $1}'):${PORT}/"
else
  echo "[deploy] FAILED — see $LOG_FILE" >&2
  tail -n 40 "$LOG_FILE" >&2 || true
  exit 1
fi
