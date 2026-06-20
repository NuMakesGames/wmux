#!/usr/bin/env bash
set -euo pipefail

host="${WMUX_STREAM_HOST:-}"
port_rtsp="${WMUX_STREAM_RTSP_PORT:-8554}"
port_webrtc="${WMUX_STREAM_WEBRTC_PORT:-8889}"
port_webrtc_udp="${WMUX_STREAM_WEBRTC_UDP_PORT:-8189}"
version="${WMUX_MEDIAMTX_VERSION:-}"

if [[ -z "$host" ]]; then
  host="$(ip -4 addr show tailscale0 2>/dev/null | sed -n 's/.*inet \([0-9.]*\).*/\1/p' | head -n 1)"
fi
if [[ -z "$host" ]]; then
  echo "WMUX_STREAM_HOST is required when no tailscale0 IPv4 address is available" >&2
  exit 2
fi

case "$(uname -m)" in
  x86_64|amd64) arch="amd64" ;;
  aarch64|arm64) arch="arm64" ;;
  armv7l) arch="armv7" ;;
  *) echo "unsupported architecture: $(uname -m)" >&2; exit 2 ;;
esac

if [[ -z "$version" ]]; then
  version="$(curl -fsSL https://api.github.com/repos/bluenviron/mediamtx/releases/latest | sed -n 's/.*"tag_name": "\([^"]*\)".*/\1/p' | head -n 1)"
fi
if [[ -z "$version" ]]; then
  echo "could not resolve latest MediaMTX release" >&2
  exit 2
fi

install_dir="$HOME/.local/bin"
state_dir="$HOME/.wmux"
unit_dir="$HOME/.config/systemd/user"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

mkdir -p "$install_dir" "$state_dir" "$unit_dir"
asset="mediamtx_${version}_linux_${arch}.tar.gz"
url="https://github.com/bluenviron/mediamtx/releases/download/${version}/${asset}"
curl -fL "$url" -o "$tmp_dir/mediamtx.tar.gz"
tar -xzf "$tmp_dir/mediamtx.tar.gz" -C "$tmp_dir"
install -m 0755 "$tmp_dir/mediamtx" "$install_dir/mediamtx"

cat > "$state_dir/mediamtx.yml" <<EOF
logLevel: info
logDestinations: [stdout]

authInternalUsers:
  - user: any
    pass:
    ips: ["127.0.0.1", "::1", "100.64.0.0/10", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]
    permissions:
      - action: publish
        path: "~^wmux-[A-Za-z0-9_-]+$"
      - action: read
        path: "~^wmux-[A-Za-z0-9_-]+$"
      - action: playback
        path: "~^wmux-[A-Za-z0-9_-]+$"
  - user: any
    pass:
    ips: ["127.0.0.1", "::1"]
    permissions:
      - action: api

api: true
apiAddress: 127.0.0.1:9997

metrics: false
pprof: false
playback: false

rtsp: true
rtspTransports: [tcp]
rtspAddress: ${host}:${port_rtsp}

rtmp: false
hls: false
srt: false
moq: false

webrtc: true
webrtcAddress: ${host}:${port_webrtc}
webrtcAllowOrigins: ["*"]
webrtcLocalUDPAddress: ${host}:${port_webrtc_udp}
webrtcLocalTCPAddress: ""
webrtcIPsFromInterfaces: false
webrtcAdditionalHosts: [${host}]
webrtcICEServers2: []

paths:
  "~^wmux-[A-Za-z0-9_-]+$": {}
EOF

cat > "$unit_dir/wmux-mediamtx.service" <<'EOF'
[Unit]
Description=wmux MediaMTX WebRTC stream router
After=network-online.target tailscaled.service
Wants=network-online.target

[Service]
Type=simple
ExecStart=%h/.local/bin/mediamtx %h/.wmux/mediamtx.yml
Restart=on-failure
RestartSec=2

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now wmux-mediamtx.service

echo "MediaMTX ${version} installed"
echo "RTSP publish: rtsp://${host}:${port_rtsp}/wmux-local"
echo "WebRTC view: http://${host}:${port_webrtc}/wmux-local"
