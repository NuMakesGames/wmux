# wmux

A browser-based terminal multiplexer for a Tailscale or internal network.

wmux combines:

- a localterm-style PTY-over-WebSocket service,
- a cmux-style left workspace rail with tabs and split panes,
- ghostty-web canvas terminal rendering in the browser.

## Run

```bash
npm install
npm run build
npm run start -- --host 127.0.0.1 --port 3478
```

To expose on Tailscale, bind to this machine's Tailscale IP:

```bash
npm run start -- --host 100.x.y.z --port 3478
```

The server refuses public bind hosts. Use loopback, Tailscale `100.64.0.0/10`, or an RFC1918/internal address.

## Run As A User Service

Install and start the systemd user service:

```bash
scripts/install-user-service.sh
```

This chooses the first Tailscale IPv4 address when available. Override it with:

```bash
WMUX_HOST=100.x.y.z WMUX_PORT=3478 scripts/install-user-service.sh
```

Useful service commands:

```bash
systemctl --user status wmux.service
systemctl --user restart wmux.service
journalctl --user -u wmux.service -f
```

## Configure Machines

Put machine definitions in `wmux.config.json` or `~/.wmux/config.json`. See `IMPLEMENTATION_PLAN.md` for an example.

Unix-like local and SSH machines default to `"sessionBackend": "auto"`, which attaches panes to a durable `tmux` session when available, or `screen` when `tmux` is not installed. Use `"sessionBackend": "pty"` to force the original raw PTY behavior for a machine.

## Settings

The settings modal writes to `~/.wmux/settings.json` on the wmux server. Current settings cover terminal font size and host display aliases, so aliases follow you across browsers without changing the underlying machine IDs used for connections.

## Notifications

Each pane receives these environment variables:

```bash
WMUX_URL
WMUX_WORKSPACE_ID
WMUX_WORKSPACE_NAME
WMUX_TAB_ID
WMUX_TAB_TITLE
WMUX_PANE_ID
```

Local panes also have this repo's `scripts/` directory prepended to `PATH`, so a command or agent hook can notify wmux with:

```bash
wmux-notify --title "Codex" --subtitle "Completed" --body "Run finished"
```

The same endpoint works from remote machines on the Tailnet:

```bash
curl -fsS \
  -H 'content-type: application/json' \
  -d "{\"paneId\":\"$WMUX_PANE_ID\",\"title\":\"Codex\",\"subtitle\":\"Completed\",\"body\":\"Run finished\"}" \
  "$WMUX_URL/api/notifications"
```

Unread notifications light the workspace, tab, and pane. The browser notification button in the top bar requests browser notification permission.

SSH panes stage remote helper commands into `~/.cache/wmux/bin` when the pane process starts. That makes `wmux-notify`, `wmux-title`, and `wmux-media` available on hosts like Away-Team without manually copying this repo there.

## Browser Media

Raw `cat image.png` still writes binary bytes to the terminal. To hand the browser a typed media payload, use:

```bash
wmux-media ./image.png
wmux-media ./sound.wav
```

Images render in the originating pane. Audio and video render with browser-native controls, so playback starts from a user click instead of autoplay.

## Workspace Titles

wmux has cmux-inspired generated title support. Generated titles are tracked separately from user-owned titles, so an auto update cannot overwrite a workspace or tab you manually named.

From inside a pane:

```bash
wmux-title --title "Auth Refactor" --descriptor "codex completed"
```

To intentionally claim a manual workspace name:

```bash
wmux-title --manual --title "Production Logs"
```

The API endpoint behind this is `POST /api/workspaces/:workspaceId/auto-title` with `title`, optional `descriptor`, optional `tabId`, and optional `tabOnlyIfMultiple`.

## Direct Links

Workspace rows and tab pills are real navigation links. A specific workspace and tab can be opened directly with:

```text
/workspaces/:workspaceId/tabs/:tabId
```

The link button in the top bar copies the active workspace/tab URL when the browser allows clipboard access.

## Splits

- `Cmd+D` / `Ctrl+D` splits the active pane to the right.
- `Cmd+Shift+D` / `Ctrl+Shift+D` splits the active pane below.
- The close button on a split pane removes that pane and collapses the layout.
- Exiting a shell in a split pane removes that pane.
- Exiting the last pane in a tab closes the tab.
- Exiting the last tab in a workspace closes the workspace. If it was the final workspace, wmux creates a fresh idle local workspace.

## Restart Persistence

wmux persists workspace/tab/pane metadata in `~/.wmux/state.json`. For local and SSH machines using the default durable backend, each pane also maps to a stable `tmux`/`screen` session named from the pane ID. After a wmux service restart, reopening the pane attaches to that durable session instead of starting a fresh shell.

Explicitly closing a pane, tab, or workspace from wmux kills the matching durable session. PowerShell remoting does not yet have an equivalent durable backend.

## Keyboard Shortcuts

wmux implements the cmux shortcuts that fit a browser app. Use `Cmd` on macOS and `Ctrl` on Windows/Linux unless a shortcut explicitly says otherwise.

- `Cmd/Ctrl+N`: new workspace
- `Cmd/Ctrl+1` through `Cmd/Ctrl+8`: jump to workspace 1 through 8
- `Cmd/Ctrl+9`: jump to the last workspace
- `Ctrl+Cmd+]` / `Ctrl+Cmd+[`: next / previous workspace on macOS
- `Ctrl+Alt+]` / `Ctrl+Alt+[`: next / previous workspace on Windows/Linux
- `Cmd/Ctrl+T`: new tab
- `Alt+1` through `Alt+8`: jump to tab 1 through 8
- `Alt+9`: jump to the last tab
- `Cmd/Ctrl+Shift+]` / `Cmd/Ctrl+Shift+[`: next / previous tab
- `Ctrl+Tab` / `Ctrl+Shift+Tab`: next / previous tab, when the browser allows it
- `Cmd/Ctrl+W`: close tab, when the browser allows it
- `Cmd/Ctrl+Shift+W`: close workspace, when the browser allows it
- `Cmd/Ctrl+B`: toggle sidebar
- `Cmd/Ctrl+D`: split right
- `Cmd/Ctrl+Shift+D`: split down
- `Option/Alt+Left` / `Option/Alt+Right`: move cursor to previous / next word in the active shell
- `Option+Cmd+Arrow` / `Alt+Ctrl+Arrow`: focus neighboring pane in layout order
- `Cmd/Ctrl+Shift+U`: jump to latest unread notification

Some browser or OS-reserved shortcuts may not reach wmux on every platform.
