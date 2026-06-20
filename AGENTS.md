# AGENTS.md

## Project

wmux is a local web terminal multiplexer. It provides a browser UI with cmux-style workspaces, tabs, and split panes, backed by server-owned PTY sessions and rendered in the browser with `ghostty-web`.

## Commands

- `npm install` installs dependencies.
- `npm run dev -- --host 127.0.0.1 --port 3478` starts the app in development mode.
- `npm run build` builds the client and server.
- `npm run start -- --host 127.0.0.1 --port 3478` runs the built service.

## Network Safety

The service must only bind to loopback, Tailscale `100.64.0.0/10`, or RFC1918/internal addresses. Do not weaken the bind checks in `src/server/bind.ts` without adding a replacement control that still prevents public internet exposure.

For MagicDNS names or reverse-proxy hostnames, set `WMUX_ALLOWED_HOSTS` to a comma-separated allowlist. `*.ts.net` is allowed for Tailscale host headers.

## Architecture Notes

- Server state lives in `~/.wmux/state.json` unless `WMUX_STATE_PATH` is set.
- Server-backed UI settings live in `~/.wmux/settings.json` unless `WMUX_SETTINGS_PATH` is set.
- Machine definitions are read from `./wmux.config.json` first, then `~/.wmux/config.json`.
- Local and SSH panes default to durable `tmux`/`screen` sessions via `sessionBackend: "auto"`.
- A pane maps to one long-lived server PTY client while the wmux service process is alive.
- Closing or refreshing the browser disconnects the WebSocket but does not kill the pane process.
- Restarting the wmux service restores layout metadata and reattaches local/SSH durable sessions when the target has `tmux` or `screen`. Raw PTY and PowerShell panes still cannot preserve live process state across service restart.
- SSH panes stage `wmux-media`, `wmux-notify`, and `wmux-title` into `~/.cache/wmux/bin` on the remote host and try to place shims in common user bin directories such as `~/.local/bin`, `~/.cargo/bin`, and `~/bin`.
- Remote helper staging must run under POSIX `sh`; do not rely on zsh/bash-specific word splitting in `src/server/machines.ts`.

## Code Style

- Keep server-only code under `src/server` and browser code under `src/client/src`.
- Prefer structured JSON APIs over ad hoc message strings.
- Use `apply_patch` for manual edits.
- Keep remote-machine behavior explicit in `MachineConfig` instead of hiding it in UI-only state.
- Do not commit generated runtime output such as `dist/`, `node_modules/`, or `test-results/`.
