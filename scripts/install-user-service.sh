#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${WMUX_HOST:-}"
PORT="${WMUX_PORT:-3478}"

if [[ -z "${HOST}" ]] && command -v tailscale >/dev/null 2>&1; then
  HOST="$(tailscale ip -4 2>/dev/null | head -n 1 || true)"
fi

if [[ -z "${HOST}" ]]; then
  HOST="127.0.0.1"
fi

mkdir -p "${HOME}/.config/systemd/user"

sed \
  -e "s#WorkingDirectory=.*#WorkingDirectory=${ROOT_DIR}#" \
  -e "s#Environment=WMUX_HOST=.*#Environment=WMUX_HOST=${HOST}#" \
  -e "s#Environment=WMUX_PORT=.*#Environment=WMUX_PORT=${PORT}#" \
  "${ROOT_DIR}/deploy/wmux.service.example" > "${HOME}/.config/systemd/user/wmux.service"

systemctl --user daemon-reload
systemctl --user enable --now wmux.service

echo "wmux.service installed and started on http://${HOST}:${PORT}"
