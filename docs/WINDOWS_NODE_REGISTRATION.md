# Windows Node Registration

This runbook is for registering a Windows machine, such as `9800x3d`, as a wmux node from the rtx6000 Ubuntu wmux server.

wmux should use `kind: "powershell-ssh"` for Windows nodes reached from non-Windows servers. This transport starts local `pwsh` on the wmux server and runs `Enter-PSSession -HostName ... -UserName ...`, which uses PowerShell remoting over SSH. Do not use the legacy `kind: "powershell"` WSMan transport from rtx6000.

References:

- Microsoft PowerShell remoting over SSH: https://learn.microsoft.com/en-us/powershell/scripting/security/remoting/ssh-remoting-in-powershell
- Microsoft OpenSSH Server setup for Windows: https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_install_firstuse
- Microsoft OpenSSH Server configuration for Windows: https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh-server-configuration
- Microsoft OpenSSH key management for Windows: https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_keymanagement

## Inputs

Collect these values before changing either host:

```text
wmux server: rtx6000
windows node id: 9800x3d
windows node host: 100.68.206.111
windows ssh user: gisen
windows ssh port: 22
```

If the Tailscale IP or Windows username differs, update the commands and `wmux.config.json` accordingly.

## 1. Prepare The wmux Server

Run on rtx6000.

1. Confirm the Windows node is reachable over Tailscale:

```bash
tailscale ping --timeout=3s --c 1 100.68.206.111
timeout 3 bash -lc '</dev/tcp/100.68.206.111/22' && echo 'ssh reachable'
```

2. Confirm PowerShell 7 exists locally. `kind: "powershell-ssh"` is marked offline when this is missing:

```bash
command -v pwsh
pwsh -NoLogo -NoProfile -Command '$PSVersionTable.PSVersion'
```

If `pwsh` is missing, install PowerShell 7 on rtx6000 using Microsoft’s Ubuntu instructions before registering the node.

3. Confirm the SSH key that wmux should use:

```bash
test -f ~/.ssh/id_ed25519.pub && cat ~/.ssh/id_ed25519.pub
```

If no key exists, create one:

```bash
ssh-keygen -t ed25519 -C 'wmux rtx6000'
```

## 2. Prepare The Windows Node

Run on the Windows node as Administrator.

1. Confirm PowerShell 7 is installed:

```powershell
pwsh -NoLogo -NoProfile -Command '$PSVersionTable.PSVersion'
```

Install PowerShell 7 if this command fails.

2. Install and start OpenSSH Server:

```powershell
Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Server*'
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic
```

3. Scope inbound SSH to the Tailnet. Disable the broad default OpenSSH rule if it exists, then add a Tailnet-scoped rule:

```powershell
Disable-NetFirewallRule -Name OpenSSH-Server-In-TCP -ErrorAction SilentlyContinue
New-NetFirewallRule `
  -Name 'wmux-sshd-tailscale' `
  -DisplayName 'wmux OpenSSH over Tailscale' `
  -Enabled True `
  -Direction Inbound `
  -Protocol TCP `
  -LocalPort 22 `
  -RemoteAddress 100.64.0.0/10 `
  -Action Allow
```

4. Configure the PowerShell SSH subsystem in `C:\ProgramData\ssh\sshd_config`.

Prefer a no-spaces symlink target so the subsystem path is stable:

```powershell
New-Item `
  -ItemType SymbolicLink `
  -Path 'C:\ProgramData\ssh\pwsh.exe' `
  -Target (Get-Command pwsh.exe).Source `
  -Force
```

Ensure these lines exist in `C:\ProgramData\ssh\sshd_config`:

```text
PubkeyAuthentication yes
PasswordAuthentication yes
Subsystem powershell C:/ProgramData/ssh/pwsh.exe -sshs -NoLogo -NoProfile
```

`PasswordAuthentication yes` is acceptable for initial validation. Prefer disabling it after key authentication works.

5. Install the rtx6000 public key for the Windows user.

For a non-administrator user, append the public key from rtx6000 to:

```text
$env:USERPROFILE\.ssh\authorized_keys
```

For an administrator user, append it to:

```text
C:\ProgramData\ssh\administrators_authorized_keys
```

Then lock down the administrator key file permissions:

```powershell
icacls.exe 'C:\ProgramData\ssh\administrators_authorized_keys' /inheritance:r /grant 'Administrators:F' /grant 'SYSTEM:F'
```

6. Restart SSH:

```powershell
Restart-Service sshd
```

## 3. Validate From rtx6000

Run on rtx6000.

1. Validate plain SSH:

```bash
ssh gisen@100.68.206.111 hostname
```

2. Validate that PowerShell can run through SSH:

```bash
ssh gisen@100.68.206.111 pwsh -NoLogo -NoProfile -Command '$PSVersionTable.PSVersion'
```

3. Validate PowerShell remoting over SSH:

```bash
pwsh -NoLogo -NoProfile -Command '
$session = New-PSSession -HostName 100.68.206.111 -UserName gisen
Invoke-Command -Session $session -ScriptBlock { hostname; $PSVersionTable.PSVersion.ToString() }
Remove-PSSession $session
'
```

If this prompts for a password, complete the first validation interactively, then fix key authentication before expecting wmux to open panes without manual prompts.

## 4. Register In wmux

Update `wmux.config.json` or `~/.wmux/config.json`:

```json
{
  "id": "9800x3d",
  "name": "9800x3d",
  "kind": "powershell-ssh",
  "host": "100.68.206.111",
  "user": "gisen",
  "port": 22
}
```

Build and restart the service if code changed; restart is enough for config-only changes:

```bash
npm run build
systemctl --user restart wmux.service
```

Check wmux status:

```bash
curl -fsS http://100.107.241.79:3478/api/bootstrap |
  jq '.machines[] | select(.id == "9800x3d")'
```

The node is registered correctly when wmux reports:

```json
{
  "id": "9800x3d",
  "kind": "powershell-ssh",
  "reachable": true,
  "endpoint": "100.68.206.111:22"
}
```

## Definition Of Done

- rtx6000 has local `pwsh`.
- rtx6000 can SSH to the Windows user on `100.68.206.111:22` without a password prompt.
- `New-PSSession -HostName 100.68.206.111 -UserName gisen` works from rtx6000.
- Windows firewall exposes SSH only to Tailscale/internal clients.
- `wmux.config.json` uses `kind: "powershell-ssh"`, not legacy `kind: "powershell"`.
- `/api/bootstrap` reports `9800x3d` as reachable.
- Creating a wmux workspace on `9800x3d` opens an interactive PowerShell session.

## Known Limits

- PowerShell-over-SSH panes are not durable yet. They are killed when `wmux.service` restarts.
- Remote helper staging is POSIX-shell-specific and does not run for `powershell-ssh` panes yet.
- Windows screen streaming still needs a Windows-side stream-agent service/session strategy.
