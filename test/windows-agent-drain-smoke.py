#!/usr/bin/env python3
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request


def request(method: str, url: str, payload: dict | None = None) -> tuple[int, dict]:
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"content-type": "application/json"} if data is not None else {}
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers, method=method), timeout=5) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read().decode("utf-8"))


def free_port() -> int:
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def main() -> int:
    if os.name != "nt":
        print("windows-agent-drain-smoke: Windows is required", file=sys.stderr)
        return 2
    agent_path = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else "scripts/wmux-windows-agent")
    port = free_port()
    with tempfile.TemporaryDirectory(prefix="wmux-agent-drain-") as root:
        config_path = os.path.join(root, "config.json")
        with open(config_path, "w", encoding="utf-8") as handle:
            json.dump({
                "machine": "drain-smoke",
                "host": "127.0.0.1",
                "port": port,
                "backend": "stdio",
                "helperDir": os.path.join(root, "helpers"),
            }, handle)
        process = subprocess.Popen(
            [sys.executable, agent_path, "--config", config_path],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
        )
        base_url = f"http://127.0.0.1:{port}"
        try:
            deadline = time.monotonic() + 10
            while True:
                try:
                    status, health = request("GET", f"{base_url}/health")
                    if status == 200 and health.get("ok") is True:
                        break
                except OSError:
                    pass
                if process.poll() is not None or time.monotonic() >= deadline:
                    stderr = process.stderr.read() if process.stderr else ""
                    raise RuntimeError(f"agent did not become ready: {stderr[-2000:]}")
                time.sleep(0.1)

            status, session = request("POST", f"{base_url}/sessions/pane_smoke", {
                "cwd": root,
                "shell": "pwsh",
                "cols": 80,
                "rows": 24,
            })
            if status != 200 or session.get("status") != "running":
                raise RuntimeError(f"failed to create smoke session: {status} {session}")

            status, drain = request("POST", f"{base_url}/drain", {
                "restartWhenIdle": True,
                "allowNewSessions": True,
            })
            if (status != 200 or drain.get("activeSessions") != 1
                    or drain.get("draining") is not False or drain.get("updatePending") is not True):
                raise RuntimeError(f"unexpected drain response: {status} {drain}")

            allowed_status, allowed = request("POST", f"{base_url}/sessions/pane_allowed", {
                "cwd": root,
                "shell": "pwsh",
                "cols": 80,
                "rows": 24,
            })
            if allowed_status != 200 or allowed.get("status") != "running":
                raise RuntimeError(f"new session was not allowed: {allowed_status} {allowed}")

            status, removed = request("DELETE", f"{base_url}/sessions/pane_smoke")
            if status != 200 or removed.get("removed") is not True:
                raise RuntimeError(f"failed to close smoke session: {status} {removed}")
            if process.poll() is not None:
                raise RuntimeError("agent restarted before the final pane closed")

            status, removed = request("DELETE", f"{base_url}/sessions/pane_allowed")
            if status != 200 or removed.get("removed") is not True:
                raise RuntimeError(f"failed to close allowed session: {status} {removed}")

            exit_code = process.wait(timeout=10)
            result = {
                "activeSessionsBeforeClose": drain.get("activeSessions"),
                "allowedStatus": allowed_status,
                "restartExitCode": exit_code,
            }
            print(json.dumps(result, separators=(",", ":")))
            return 0 if exit_code == 75 else 1
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=5)


if __name__ == "__main__":
    raise SystemExit(main())
