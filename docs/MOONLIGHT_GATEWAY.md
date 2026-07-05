# wmux Moonlight Gateway

`wmux-moonlight-gateway` is a small browser-facing wrapper for a Moonlight Web/Sunshine remote-control stack. It gives wmux a stable health endpoint and iframe URL while keeping the actual Moonlight protocol implementation in an external process.

The intended host layout is:

- Sunshine runs on the machine being controlled.
- A browser-native Moonlight bridge such as Moonlight Web Stream runs near that Sunshine host.
- `wmux-moonlight-gateway` binds to loopback, Tailscale, or RFC1918/internal IP and proxies HTTP plus WebSocket traffic to the Moonlight bridge.
- wmux embeds the gateway URL from the Stream button for machines configured with `stream.provider: "moonlight-gateway"`.

This avoids copying GPL Moonlight Web Stream code into wmux. The gateway is a process and HTTP boundary; replacing the upstream bridge later should not change the wmux UI contract.

## Run

Point the gateway at an existing Moonlight Web Stream server:

```bash
WMUX_MOONLIGHT_WEB_URL=http://127.0.0.1:8080 \
  scripts/wmux-moonlight-gateway --host 100.x.y.z --port 3490
```

Or let the gateway launch a bridge executable and still proxy to its HTTP endpoint:

```bash
WMUX_MOONLIGHT_WEB_URL=http://127.0.0.1:8080 \
  scripts/wmux-moonlight-gateway \
    --host 100.x.y.z \
    --port 3490 \
    --bin /path/to/web-server
```

The gateway refuses public bind addresses. Use loopback, Tailscale `100.64.0.0/10`, or RFC1918/internal addresses.

Health and status endpoints:

```bash
curl http://100.x.y.z:3490/api/wmux/health
curl http://100.x.y.z:3490/api/wmux/sessions
curl http://100.x.y.z:3490/api/wmux/config
```

## Automated Pairing

The gateway can drive the Moonlight Web pair flow and submit the generated PIN to Sunshine. This uses supported APIs on both sides: Moonlight Web generates and stores the client identity, and Sunshine receives the PIN through `/api/pin`.

Configure the gateway with credentials:

```bash
export WMUX_MOONLIGHT_WEB_USER=wmux
export WMUX_MOONLIGHT_WEB_PASSWORD='...'
export WMUX_SUNSHINE_URL=https://127.0.0.1:47990
export WMUX_SUNSHINE_USER=wmux
export WMUX_SUNSHINE_PASSWORD='...'
export WMUX_MOONLIGHT_HOST=127.0.0.1
export WMUX_MOONLIGHT_HOST_HTTP_PORT=47989
export WMUX_MOONLIGHT_PAIR_DEVICE_NAME=roth
export WMUX_SUNSHINE_PIN_DELAY_MS=3500
```

Moonlight Web Stream v2.10.0 hardcodes its pair device name to `roth` in the actual pair request. The gateway submits that same name to Sunshine's PIN API by default. Override `WMUX_MOONLIGHT_PAIR_DEVICE_NAME` only when the upstream bridge changes its pair-device-name behavior.

Then call:

```bash
curl -fsS -X POST \
  -H 'content-type: application/json' \
  http://100.x.y.z:3490/api/wmux/setup/pair
```

You can also pass the same values in the request body:

```json
{
  "moonlight": {
    "user": "wmux",
    "password": "...",
    "host": "127.0.0.1",
    "httpPort": 47989,
    "pairDeviceName": "roth"
  },
  "sunshine": {
    "url": "https://127.0.0.1:47990",
    "user": "wmux",
    "password": "...",
    "pinDelayMs": 3500,
    "insecure": true
  }
}
```

For local Sunshine URLs, the gateway allows the self-signed Sunshine certificate by default. For remote HTTPS URLs, set `"insecure": true` or `WMUX_SUNSHINE_INSECURE=1` only when the URL is on the trusted internal network.

Check setup readiness:

```bash
curl http://100.x.y.z:3490/api/wmux/setup/status
```

### Browser Login

When `WMUX_MOONLIGHT_WEB_USER` and `WMUX_MOONLIGHT_WEB_PASSWORD` are set in the gateway environment, wmux opens Moonlight gateway streams through:

```text
/api/wmux/open
```

That endpoint logs into Moonlight Web server-side, resolves the configured `WMUX_MOONLIGHT_HOST`, picks the configured `WMUX_MOONLIGHT_APP_TITLE` or `Desktop`, sets Moonlight Web's browser setting to use websocket transport by default, and opens Moonlight Web's `stream.html` for that host/app. The gateway also injects a server-owned Moonlight session cookie into proxied HTTP and WebSocket requests, so browsers that block iframe cookie storage can still use the UI. Keep the credentials in a mode-600 environment file or service environment; do not place raw credentials in `wmux.config.json`.

Set `WMUX_MOONLIGHT_APP_TITLE` or `WMUX_MOONLIGHT_APP_ID` on the gateway service to default to something other than `Desktop`.
Set `WMUX_MOONLIGHT_DATA_TRANSPORT=auto` or `webrtc` only when WebRTC negotiation is known to work through the gateway; the default is `websocket`.
Set both `WMUX_MOONLIGHT_HOST_ID` and `WMUX_MOONLIGHT_APP_ID` when the gateway owns one fixed host/app. That lets `/api/wmux/open` skip live host/app discovery and immediately launch the known stream target.

### Spinner Troubleshooting

If `/api/wmux/open` loads but the stream page stays on its spinner, first check whether Moonlight Web can query the paired Sunshine host:

```bash
curl http://100.x.y.z:3490/api/host?host_id=1446783110
curl http://100.x.y.z:3490/api/apps?host_id=1446783110
```

If those hang, check Sunshine's GameStream HTTPS port from the wmux server:

```bash
curl -vk 'https://SUNSHINE_HOST:47984/serverinfo?uniqueid=0123456789abcdef&uuid=0123456789abcdef'
```

An unpaired curl client should complete TLS and then fail with a client-certificate-required alert. If the TCP connection opens but TLS never gets a ServerHello, Sunshine is wedged; restart the host-side Sunshine service, for example `wmux-sunshine-setup start-sunshine` on macOS.

### macOS Host Setup

Inside a wmux SSH pane on a macOS host:

```bash
wmux-sunshine-setup install-sunshine
export WMUX_SUNSHINE_USER=wmux
export WMUX_SUNSHINE_PASSWORD='...'
wmux-sunshine-setup configure-sunshine
wmux-sunshine-setup start-sunshine
wmux-sunshine-setup sunshine-status
```

The default installer downloads the official macOS DMG and installs `Sunshine.app` into `~/Applications`. Set `WMUX_SUNSHINE_INSTALL_METHOD=brew` to use the official LizardByte Homebrew tap. macOS may still require user approval for Screen Recording, Accessibility/Input Monitoring, and Local Network permissions before Sunshine can capture and accept input.

### Windows Host Setup

Inside a wmux Windows pane:

```powershell
wmux-windows-setup install-sunshine
$env:WMUX_SUNSHINE_USER = 'wmux'
$env:WMUX_SUNSHINE_PASSWORD = '...'
wmux-windows-setup configure-sunshine
wmux-windows-setup start-sunshine
wmux-windows-setup sunshine-status
```

`install-sunshine` uses `winget` to install `LizardByte.Sunshine` when missing. `configure-sunshine` runs Sunshine's `--creds` command with the credentials supplied through environment variables, avoiding secrets in shell history. `start-sunshine` starts Sunshine for the current logged-in user.

## Configure A Machine

Set a machine stream provider in `wmux.config.json` or `~/.wmux/config.json`:

```json
{
  "machines": [
    {
      "id": "9800x3d",
      "name": "9800x3d",
      "kind": "powershell-ssh",
      "host": "9800x3d",
      "user": "gisen",
      "stream": {
        "provider": "moonlight-gateway",
        "gatewayUrl": "http://100.x.y.z:3490"
      }
    }
  ]
}
```

`gatewayOpenUrl` can override the exact URL wmux opens or embeds if the gateway needs a subpath.

## Big Rocks From Moonlight Web Stream

- The project is GPL-3.0-or-later, so wmux should not vendor or copy its implementation unless the project intentionally accepts that license impact.
- Pairing is real state. The browser bridge needs a durable Moonlight identity and certificate material paired with Sunshine before launching streams.
- WebRTC needs network planning. LAN and Tailnet use is simpler, but restrictive networks may need fixed UDP ranges, STUN/TURN, or a WebSocket fallback.
- Browser APIs change the UX. Gamepad, Keyboard Lock, WebCodecs, clipboard, fullscreen, and audio autoplay behave better in secure contexts.
- Input is a major part of the bridge, not just video. Pointer lock, absolute/relative mouse, touch, keyboard translation, paste, and gamepad channels all need browser handling.
- Codec fallback matters. H.264 is the safest baseline; HEVC/AV1 and WebCodecs support vary by browser and platform.
- Session lifecycle needs policy. Sunshine generally expects one active stream per host/app, while wmux can have multiple browser viewers.

## Current Limits

The gateway does not implement the native Moonlight/GameStream protocol itself. It proxies a browser-native Moonlight bridge, reports health to wmux, and provides a stable URL for the stream modal. It can now automate pairing when given Moonlight Web and Sunshine credentials, but app launch, stream settings, and broader Sunshine lifecycle control are still delegated to the upstream bridge UI.
