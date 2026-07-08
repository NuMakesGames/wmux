#!/usr/bin/env python3
"""Small wmux API helper for Codex skills."""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_URL = "https://homelab.tail2fcc57.ts.net:3478"


def read_text(path: str | Path) -> str:
    try:
        return Path(path).expanduser().read_text(encoding="utf-8").strip()
    except OSError:
        return ""


def default_url() -> str:
    return read_text("~/.wmux/url") or os.environ.get("WMUX_URL") or DEFAULT_URL


def default_token(token_path: str | None) -> str:
    if os.environ.get("WMUX_TOKEN"):
        return os.environ["WMUX_TOKEN"]
    path = token_path or os.environ.get("WMUX_TOKEN_PATH") or "~/.wmux/token"
    return read_text(path)


class WmuxClient:
    def __init__(self, url: str, token: str) -> None:
        self.url = url.rstrip("/")
        self.token = token

    def request(self, method: str, path: str, body: dict[str, Any] | None = None) -> Any:
        data = None if body is None else json.dumps(body).encode("utf-8")
        headers = {"content-type": "application/json"}
        if self.token:
            headers["authorization"] = f"Bearer {self.token}"
        request = urllib.request.Request(self.url + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                raw = response.read()
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")
            if error.code == 401:
                raise SystemExit("wmuxctl: unauthorized; set WMUX_TOKEN or ensure ~/.wmux/token is readable") from error
            raise SystemExit(f"wmuxctl: HTTP {error.code} for {path}: {detail}") from error
        except urllib.error.URLError as error:
            raise SystemExit(f"wmuxctl: cannot reach {self.url}: {error.reason}") from error
        if not raw:
            return None
        return json.loads(raw.decode("utf-8"))

    def bootstrap(self) -> dict[str, Any]:
        return self.request("GET", "/api/bootstrap")

    def create_workspace(self, machine_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
        result = self.request("POST", "/api/workspaces", {"machineId": machine_id})
        return result["workspace"], result["state"]

    def set_workspace_title(self, workspace_id: str, title: str) -> None:
        self.request("POST", f"/api/workspaces/{urllib.parse.quote(workspace_id)}/title", {"title": title})

    def record_agent_event(
        self,
        workspace_id: str,
        tab_id: str,
        pane_id: str,
        agent: str,
        status: str,
        title: str,
        summary: str,
    ) -> None:
        self.request(
            "POST",
            "/api/agent-events",
            {
                "workspaceId": workspace_id,
                "tabId": tab_id,
                "paneId": pane_id,
                "agent": agent,
                "status": status,
                "title": title,
                "summary": summary,
            },
        )

    def send_input(self, pane_id: str, data: str, cols: int, rows: int) -> dict[str, Any]:
        return self.request(
            "POST",
            f"/api/panes/{urllib.parse.quote(pane_id)}/input",
            {"data": data, "cols": cols, "rows": rows},
        )


def active_tab(workspace: dict[str, Any]) -> dict[str, Any]:
    active_id = workspace.get("activeTabId")
    for tab in workspace.get("tabs", []):
        if tab.get("id") == active_id:
            return tab
    tabs = workspace.get("tabs", [])
    if tabs:
        return tabs[0]
    raise SystemExit("wmuxctl: created workspace has no tabs")


def active_pane(tab: dict[str, Any]) -> dict[str, Any]:
    active_id = tab.get("activePaneId")
    for pane in tab.get("panes", []):
        if pane.get("id") == active_id:
            return pane
    panes = tab.get("panes", [])
    if panes:
        return panes[0]
    raise SystemExit("wmuxctl: active tab has no panes")


def workspace_url(base_url: str, workspace_id: str, tab_id: str) -> str:
    return f"{base_url.rstrip('/')}/workspaces/{urllib.parse.quote(workspace_id)}/tabs/{urllib.parse.quote(tab_id)}"


def print_json(value: Any) -> None:
    print(json.dumps(value, indent=2, sort_keys=True))


def cmd_machines(client: WmuxClient, args: argparse.Namespace) -> int:
    payload = client.bootstrap()
    if args.json:
        print_json(payload["machines"])
        return 0
    for machine in payload["machines"]:
        reachable = "up" if machine.get("reachable") else "down"
        detail = machine.get("backendDetail") or machine.get("reason") or ""
        endpoint = machine.get("endpoint") or ""
        print(f"{machine['id']}\t{machine['kind']}\t{reachable}\t{endpoint}\t{detail}")
    return 0


def cmd_bootstrap(client: WmuxClient, _args: argparse.Namespace) -> int:
    print_json(client.bootstrap())
    return 0


def describe_workspace(base_url: str, workspace: dict[str, Any]) -> dict[str, Any]:
    tab = active_tab(workspace)
    pane = active_pane(tab)
    return {
        "workspaceId": workspace["id"],
        "tabId": tab["id"],
        "paneId": pane["id"],
        "machineId": workspace["machineId"],
        "url": workspace_url(base_url, workspace["id"], tab["id"]),
    }


def workspace_title(workspace: dict[str, Any]) -> str:
    for key in ("manualTitle", "title", "autoTitle", "name"):
        value = workspace.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def find_workspace(client: WmuxClient, machine_id: str, title: str) -> dict[str, Any] | None:
    if not title:
        return None
    payload = client.bootstrap()
    matches = [
        workspace
        for workspace in payload.get("workspaces", [])
        if workspace.get("machineId") == machine_id and workspace_title(workspace) == title
    ]
    if not matches:
        return None
    return sorted(matches, key=lambda workspace: workspace.get("updatedAt") or workspace.get("createdAt") or "")[-1]


def get_or_create_workspace(client: WmuxClient, machine_id: str, title: str, force_new: bool) -> tuple[dict[str, Any], bool]:
    if not force_new:
        workspace = find_workspace(client, machine_id, title)
        if workspace:
            return workspace, True
    workspace, _state = client.create_workspace(machine_id)
    if title:
        client.set_workspace_title(workspace["id"], title)
        workspace["manualTitle"] = title
        workspace["name"] = title
    return workspace, False


def maybe_record_running_event(client: WmuxClient, args: argparse.Namespace, info: dict[str, Any], summary: str) -> None:
    if args.no_event:
        return
    client.record_agent_event(
        info["workspaceId"],
        info["tabId"],
        info["paneId"],
        args.agent,
        "running",
        args.title or "wmux task",
        args.summary or summary,
    )


def cmd_open(client: WmuxClient, args: argparse.Namespace) -> int:
    workspace, reused = get_or_create_workspace(client, args.machine, args.title, args.new)
    info = describe_workspace(client.url, workspace)
    info["reused"] = reused
    print_json(info)
    return 0


def cmd_send(client: WmuxClient, args: argparse.Namespace) -> int:
    line = args.line
    if args.enter and not line.endswith("\r"):
        line += "\r"
    client.send_input(args.pane, line, args.cols, args.rows)
    print_json({"paneId": args.pane, "sentBytes": len(line.encode("utf-8"))})
    return 0


def cmd_run(client: WmuxClient, args: argparse.Namespace) -> int:
    workspace, reused = get_or_create_workspace(client, args.machine, args.title, args.new)
    info = describe_workspace(client.url, workspace)
    line = args.line
    if args.enter and not line.endswith("\r"):
        line += "\r"
    maybe_record_running_event(client, args, info, f"sent {len(line.encode('utf-8'))} bytes")
    client.send_input(info["paneId"], line, args.cols, args.rows)
    info["reused"] = reused
    info["sentBytes"] = len(line.encode("utf-8"))
    print_json(info)
    return 0


def read_script_arg(args: argparse.Namespace) -> str:
    if args.file:
        return read_text(args.file)
    if args.script:
        return args.script
    if not sys.stdin.isatty():
        return sys.stdin.read()
    raise SystemExit("wmuxctl: provide --script, --file, or stdin")


def powershell_encoded_command(script: str, sentinel: str) -> str:
    prelude = "$ErrorActionPreference='Continue'; $ProgressPreference='SilentlyContinue';\n"
    trailer = f"\nWrite-Output '{sentinel}';\n" if sentinel else ""
    return base64.b64encode((prelude + script + trailer).encode("utf-16le")).decode("ascii")


def cmd_ps(client: WmuxClient, args: argparse.Namespace) -> int:
    workspace, reused = get_or_create_workspace(client, args.machine, args.title, args.new)
    info = describe_workspace(client.url, workspace)
    script = read_script_arg(args)
    sentinel = "" if args.no_sentinel else f"__WMUX_DONE_{info['paneId']}_{os.getpid()}__"
    encoded = powershell_encoded_command(script, sentinel)
    line = f"pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -EncodedCommand {encoded}\r"
    if len(line.encode("utf-8")) > 240_000:
        raise SystemExit("wmuxctl: encoded PowerShell command is too large for one pane input")
    maybe_record_running_event(client, args, info, f"PowerShell script sent; sentinel {sentinel}" if sentinel else "PowerShell script sent")
    client.send_input(info["paneId"], line, args.cols, args.rows)
    info["reused"] = reused
    info["sentBytes"] = len(line.encode("utf-8"))
    if sentinel:
        info["sentinel"] = sentinel
    print_json(info)
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Interact with the homelab wmux API.")
    parser.add_argument("--url", default=default_url(), help=f"wmux base URL (default: {DEFAULT_URL})")
    parser.add_argument("--token-path", default=None, help="token file path when WMUX_TOKEN is unset")

    subparsers = parser.add_subparsers(dest="command", required=True)

    machines = subparsers.add_parser("machines", help="list configured machine reachability")
    machines.add_argument("--json", action="store_true", help="emit raw machine JSON")
    machines.set_defaults(func=cmd_machines)

    bootstrap = subparsers.add_parser("bootstrap", help="emit full bootstrap JSON")
    bootstrap.set_defaults(func=cmd_bootstrap)

    open_workspace = subparsers.add_parser("open", help="create or reuse a titled workspace on a machine")
    open_workspace.add_argument("machine", help="machine id, for example away-team or 9800x3d")
    open_workspace.add_argument("--title", default="", help="manual workspace title")
    open_workspace.add_argument("--new", action="store_true", help="force a new workspace even when --title already exists")
    open_workspace.set_defaults(func=cmd_open)

    send = subparsers.add_parser("send", help="send one terminal input line to an existing pane")
    send.add_argument("pane", help="pane id")
    send.add_argument("--line", required=True, help="text to send exactly, before optional Enter")
    send.add_argument("--no-enter", dest="enter", action="store_false", help="do not append Enter")
    send.add_argument("--cols", type=int, default=120)
    send.add_argument("--rows", type=int, default=36)
    send.set_defaults(func=cmd_send, enter=True)

    run = subparsers.add_parser("run", help="create or reuse a titled workspace and send one terminal input line")
    run.add_argument("machine", help="machine id")
    run.add_argument("--line", required=True, help="text to send exactly, before optional Enter")
    run.add_argument("--title", default="", help="manual workspace title")
    run.add_argument("--new", action="store_true", help="force a new workspace even when --title already exists")
    run.add_argument("--agent", default="codex", help="agent name for the running event")
    run.add_argument("--summary", default="", help="running event summary")
    run.add_argument("--no-event", action="store_true", help="do not record a running agent event")
    run.add_argument("--no-enter", dest="enter", action="store_false", help="do not append Enter")
    run.add_argument("--cols", type=int, default=120)
    run.add_argument("--rows", type=int, default=36)
    run.set_defaults(func=cmd_run, enter=True)

    ps = subparsers.add_parser("ps", help="send a PowerShell script through a child pwsh -EncodedCommand")
    ps.add_argument("machine", help="Windows machine id, for example win-ci")
    ps.add_argument("--script", default="", help="PowerShell script text")
    ps.add_argument("--file", default="", help="read PowerShell script from this file")
    ps.add_argument("--title", required=True, help="manual workspace title; reused by default")
    ps.add_argument("--new", action="store_true", help="force a new workspace even when --title already exists")
    ps.add_argument("--agent", default="codex", help="agent name for the running event")
    ps.add_argument("--summary", default="", help="running event summary")
    ps.add_argument("--no-event", action="store_true", help="do not record a running agent event")
    ps.add_argument("--no-sentinel", action="store_true", help="do not append a completion marker")
    ps.add_argument("--cols", type=int, default=120)
    ps.add_argument("--rows", type=int, default=36)
    ps.set_defaults(func=cmd_ps)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    client = WmuxClient(args.url, default_token(args.token_path))
    return args.func(client, args)


if __name__ == "__main__":
    sys.exit(main())
