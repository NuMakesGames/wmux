#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${WMUX_STATE_DIR:-${HOME}/.wmux}"
UNIT_DIR="${HOME}/.config/systemd/user"
DOMAIN="${WMUX_CERT_DOMAIN:-}"

for command_name in node tailscale openssl systemctl; do
  if ! command -v "${command_name}" >/dev/null 2>&1; then
    echo "${command_name} is required" >&2
    exit 1
  fi
done

if [[ -z "${DOMAIN}" ]]; then
  DOMAIN="$(tailscale status --json | node -e '
let input = "";
process.stdin.on("data", (chunk) => input += chunk);
process.stdin.on("end", () => {
  const dnsName = JSON.parse(input).Self?.DNSName;
  if (typeof dnsName === "string") process.stdout.write(dnsName.replace(/\.$/, ""));
});
')"
fi
if [[ ! "${DOMAIN}" =~ ^[A-Za-z0-9.-]+$ ]]; then
  echo "could not determine a valid Tailscale certificate domain; set WMUX_CERT_DOMAIN" >&2
  exit 1
fi

CERT_FILE="${WMUX_CERT_FILE:-${STATE_DIR}/certs/${DOMAIN}.crt}"
KEY_FILE="${WMUX_KEY_FILE:-${STATE_DIR}/certs/${DOMAIN}.key}"
PUBLIC_URL="${WMUX_PUBLIC_URL:-https://${DOMAIN}:${WMUX_PORT:-3478}}"
OPERATOR_USER="${USER:-$(id -un)}"

mkdir -p \
  "${STATE_DIR}/certs" \
  "$(dirname "${CERT_FILE}")" \
  "$(dirname "${KEY_FILE}")" \
  "${UNIT_DIR}" \
  "${HOME}/.local/bin"
chmod 700 "${STATE_DIR}/certs"
if ! tailscale cert --cert-file "${CERT_FILE}" --key-file "${KEY_FILE}" "${DOMAIN}"; then
  echo "certificate access failed; grant this account operator access once with:" >&2
  echo "  sudo tailscale set --operator=\"${OPERATOR_USER}\"" >&2
  exit 1
fi
chmod 644 "${CERT_FILE}"
chmod 600 "${KEY_FILE}"
ln -sf "${ROOT_DIR}/scripts/wmux-cert-renew" "${HOME}/.local/bin/wmux-cert-renew"

cat > "${UNIT_DIR}/wmux-cert-renew.service" <<EOF
[Unit]
Description=Renew the wmux Tailscale TLS certificate when needed
After=tailscaled.service

[Service]
Type=oneshot
Environment="WMUX_CERT_DOMAIN=${DOMAIN}"
Environment="WMUX_CERT_FILE=${CERT_FILE}"
Environment="WMUX_KEY_FILE=${KEY_FILE}"
ExecStart=${HOME}/.local/bin/wmux-cert-renew
EOF

cat > "${UNIT_DIR}/wmux-cert-renew.timer" <<'EOF'
[Unit]
Description=Check the wmux Tailscale TLS certificate daily

[Timer]
OnCalendar=daily
RandomizedDelaySec=1h
Persistent=true
Unit=wmux-cert-renew.service

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now wmux-cert-renew.timer
systemctl --user start wmux-cert-renew.service

echo "Tailscale certificate installed for ${DOMAIN}"
echo "certificate: ${CERT_FILE}"
echo "private key: ${KEY_FILE}"
echo "renewal timer: wmux-cert-renew.timer"
echo "configure wmux with WMUX_CERT_FILE, WMUX_KEY_FILE, and WMUX_PUBLIC_URL=${PUBLIC_URL}"
