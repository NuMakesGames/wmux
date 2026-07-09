---
name: wmux
description: "Use when Codex needs to orchestrate visible or durable work through the user's wmux browser terminal multiplexer on homelab: inspecting configured machines, starting workspaces or tabs on specific hosts, sending terminal input to local/SSH/Windows panes, tracking remote commands, using wmux helper commands, validating reachability, or updating wmux machine configuration in ../wmux."
---

# wmux

## Purpose

Use wmux when a task should run on a specific homelab/Tailscale machine with a visible browser terminal surface, durable local/SSH panes, wmux activity metadata, or helper commands such as `wmux-run`, `wmux-notify`, `wmux-copy`, and `wmux-agent-event`.

Prefer direct local tools or SSH only for quick invisible checks. Prefer wmux when the user asks to orchestrate remote work, wants to monitor the task in the browser, the task spans machines, or the command should remain attached to a wmux workspace.

## First Steps

1. Read live machine state before acting. The source config is `/home/gisenberg/git/gisenberg/wmux/wmux.config.json`; the live API usually runs at `https://homelab.tail2fcc57.ts.net:3478`.
2. Use `references/api-and-machines.md` when you need exact endpoints, machine ids, or setup caveats.
3. Use `scripts/wmuxctl.py` for common API actions:

```bash
python3 ~/.codex/skills/wmux/scripts/wmuxctl.py machines
python3 ~/.codex/skills/wmux/scripts/wmuxctl.py open away-team --title "Build check"
python3 ~/.codex/skills/wmux/scripts/wmuxctl.py run 9800x3d --title "Windows smoke" --line "wmux-run -- pwsh -NoLogo -NoProfile -Command '$PSVersionTable.PSVersion'"
python3 ~/.codex/skills/wmux/scripts/wmuxctl.py ps win-ci --title "Runner repair" --script "Get-ScheduledTask -TaskName gitea-act-runner"
python3 ~/.codex/skills/wmux/scripts/wmuxctl.py finish --machine win-ci --title "Runner repair" --status completed --summary "Runner repaired" --close
python3 ~/.codex/skills/wmux/scripts/wmuxctl.py send pane_abc123 --line "wmux-agent-event --agent codex --status completed --title Done --summary 'Remote step finished'"
```

The helper reads `~/.wmux/url`/`WMUX_URL` and `WMUX_TOKEN`/`~/.wmux/token`; it never prints the token. A stale `WMUX_URL` may point at the old HTTP service, so prefer the helper default or pass `--url "$(cat ~/.wmux/url)"`.

## Operating Rules

- Treat wmux as live infrastructure. Creating workspaces is usually safe; closing panes, tabs, or workspaces kills the matching session and must be intentional.
- Do not expose bearer tokens in final answers, logs, code, or committed files.
- Honor current repo and host instructions. In the homelab repo, shell commands are expected to be prefixed with `rtk`.
- Do not weaken wmux bind, Host/Origin, token, CORS, or helper-staging protections.
- For Windows machines from homelab, use `kind: "powershell-ssh"` behavior. Do not switch to legacy WSMan `powershell` unless explicitly debugging that path.
- Check `/api/bootstrap` for `reachable`, `reason`, and `backendDetail` before assuming a machine is ready. Windows status includes helper, stream, Python/FFmpeg, and agent health probes.
- Use exact machine ids from the current config. Do not rely on stale docs if `wmux.config.json` or `/api/bootstrap` differs.
- Always give automated work a descriptive `--title`; `wmuxctl open`, `run`, and `ps` reuse an existing workspace with that exact title by default. Use `--new` only when a genuinely separate workspace is wanted.
- Prefer `wmuxctl ps` for Windows multi-step scripts. Avoid pasting long raw PowerShell blocks into an interactive prompt; they can leave continuation prompts or unreadable base64 fragments in the terminal.
- For one-shot automated work that the agent created and completed successfully, record a final event and close the workspace with `wmuxctl finish --status completed --close`. Keep the workspace open when the task failed, needs user inspection, is interactive, or leaves a long-running process that the user should monitor.
- Do not dump full process command lines from wmux-managed Windows shells. They can contain encoded wmux bootstrap URLs or tokens. Select safe fields such as `ProcessId`, `Name`, `CreationDate`, and service/task state unless the user explicitly needs command-line debugging.

## Workflow

1. Identify the target machine id and verify it is reachable.
2. Create or reuse one titled workspace for the task. Keep reusing the returned `paneId`; do not create a new workspace for each diagnostic command.
3. Send commands with `wmuxctl run` for simple shell lines or `wmuxctl ps` for Windows PowerShell scripts. The helper records a `running` agent event for launched commands.
4. Wrap substantive commands in `wmux-run -- ...` from inside the pane when you want command duration/exit tracking in the activity drawer.
5. Use `wmux-agent-event` at task boundaries when running inside a wmux pane, especially for long remote agent sessions. End with `completed` or `failed` and a useful summary.
6. For successful, non-interactive task-owned workspaces, run `wmuxctl finish --workspace <workspaceId> --status completed --summary "..." --close` after recording the result. For failures, debugging, or user-visible long-running sessions, use `finish` without `--close` and leave the workspace open.
7. Report the workspace URL, pane id, machine id, final status, and whether the workspace was closed.

## References

- `references/api-and-machines.md`: live endpoint, auth paths, current machine table, common API calls, and platform caveats.
- `/home/gisenberg/git/gisenberg/wmux/README.md`: authoritative wmux user/service docs.
- `/home/gisenberg/git/gisenberg/wmux/AGENTS.md`: project-specific engineering constraints.
- `/home/gisenberg/git/gisenberg/homelab/README.md`: homelab inventory snapshot.
