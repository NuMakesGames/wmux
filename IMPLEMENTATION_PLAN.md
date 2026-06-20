# IMPLEMENTATION_PLAN.md

## Research Findings

- localterm provides the useful PTY-over-WebSocket baseline, but its explicit lifecycle is one browser tab per shell and closing the tab kills the shell. wmux therefore uses the same general PTY/WebSocket pattern but makes panes server-owned and reconnectable.
- cmux is a native macOS application, not a reusable web component. wmux borrows the workspace/sidebar, tab, split-pane, notification-ready layout ideas, but implements them in React.
- ghostty-web is directly usable in the browser. wmux uses its `Terminal` and `FitAddon` APIs for canvas rendering and resize behavior.

## Implementation Stages

1. Build a Node service constrained to loopback, Tailscale, or internal bind addresses.
2. Persist server-owned workspace, tab, pane, split, and machine-affinity metadata.
3. Maintain long-lived PTY sessions keyed by pane id, with WebSocket reconnect and bounded output replay.
4. Build a React UI with a left workspace rail, machine reachability state, tab strip, and recursive split layout.
5. Render each pane with `ghostty-web`, sending input and resize events over structured WebSocket messages.
6. Add file-based machine configuration for local, SSH, PowerShell, and future remote-service machines.
7. Track non-trivial missing features in `FEATURE_GAPS.md` rather than silently implying support.

## Machine Configuration

Create `wmux.config.json` in this repo or `~/.wmux/config.json`:

```json
{
  "machines": [
    {
      "id": "away-team",
      "name": "Away-Team",
      "kind": "ssh",
      "host": "away-team.tailnet-name.ts.net",
      "user": "gisenberg"
    },
    {
      "id": "9800x3d",
      "name": "9800x3d",
      "kind": "powershell",
      "host": "9800x3d"
    }
  ]
}
```

If the browser accesses wmux through a MagicDNS or reverse-proxy name that is not under `*.ts.net`, set:

```bash
export WMUX_ALLOWED_HOSTS=wmux.your-tailnet-hostname
```
