$ErrorActionPreference = 'Stop'

$ActionName = if ($args.Count -gt 0) { [string]$args[0] } else { 'install' }
$TaskName = if ($env:WMUX_WINDOWS_AGENT_TASK) { $env:WMUX_WINDOWS_AGENT_TASK } else { 'wmux-windows-agent' }
$StateDir = Join-Path $HOME '.wmux'
$LogDir = Join-Path $StateDir 'logs'
$Config = if ($env:WMUX_WINDOWS_AGENT_CONFIG) { $env:WMUX_WINDOWS_AGENT_CONFIG } else { Join-Path $StateDir 'windows-agent.json' }
$HelperDir = if ($env:WMUX_HELPER_DIR) { $env:WMUX_HELPER_DIR } else { Join-Path $env:LOCALAPPDATA 'wmux\bin' }
$Agent = Join-Path $HelperDir 'wmux-windows-agent.py'
$Wrapper = Join-Path $HelperDir 'wmux-windows-agent-task.ps1'
$RestartTaskName = "$TaskName-update"
$OutLog = Join-Path $LogDir 'windows-agent.out.log'
$ErrLog = Join-Path $LogDir 'windows-agent.err.log'
$Force = @($args) -contains '--force'

function ConvertTo-PowerShellLiteral {
  param([string]$Value)
  return "'$($Value -replace "'", "''")'"
}

function ConvertTo-CmdArgument {
  param([string]$Value)
  return '"' + ($Value -replace '"', '\"') + '"'
}

function Get-PythonLaunch {
  $Py = Get-Command py.exe -ErrorAction SilentlyContinue
  if ($Py) {
    return [ordered]@{
      exe = [string]$Py.Source
      prefix = '-3 '
    }
  }
  $Python = Get-Command python.exe -ErrorAction SilentlyContinue
  if ($Python) {
    return [ordered]@{
      exe = [string]$Python.Source
      prefix = ''
    }
  }
  return $null
}

function Write-Wrapper {
  New-Item -ItemType Directory -Force -Path $StateDir, $LogDir, $HelperDir | Out-Null
  $Python = Get-PythonLaunch
  if (-not $Python) {
    Write-Error 'Python was not found. Run wmux-windows-setup install-deps, then retry install-agent.'
    exit 127
  }
  $HelperDirLiteral = ConvertTo-PowerShellLiteral $HelperDir
  $LogDirLiteral = ConvertTo-PowerShellLiteral $LogDir
  $PythonArgText = $Python.prefix.Trim()
  $PythonArgs = @()
  if ($PythonArgText) { $PythonArgs += $PythonArgText }
  $CommandParts = @(
    (ConvertTo-CmdArgument $Python.exe)
  )
  $CommandParts += $PythonArgs
  $CommandParts += @(
    (ConvertTo-CmdArgument $Agent)
    '--config'
    (ConvertTo-CmdArgument $Config)
    '>>'
    '"%WMUX_AGENT_OUT%"'
    '2>>'
    '"%WMUX_AGENT_ERR%"'
  )
  $Command = $CommandParts -join ' '
  $CommandLiteral = ConvertTo-PowerShellLiteral $Command
  $Content = @"
`$ErrorActionPreference = 'Continue'
`$env:PATH = $HelperDirLiteral + ';' + `$env:PATH
`$env:WMUX_AGENT_RUN = "`$(Get-Random)-`$(Get-Random)"
`$env:WMUX_AGENT_OUT = Join-Path $LogDirLiteral "windows-agent-`$(`$env:WMUX_AGENT_RUN).out.log"
`$env:WMUX_AGENT_ERR = Join-Path $LogDirLiteral "windows-agent-`$(`$env:WMUX_AGENT_RUN).err.log"
`$Command = $CommandLiteral
& `$env:ComSpec /d /s /c `$Command
exit `$LASTEXITCODE
"@
  [System.IO.File]::WriteAllText($Wrapper, $Content, [System.Text.UTF8Encoding]::new($false))
}

function New-HiddenPowerShellAction {
  param([string]$ScriptPath = $Wrapper)
  $PowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  if (-not (Test-Path -LiteralPath $PowerShell -PathType Leaf)) {
    $PowerShell = (Get-Command powershell.exe -ErrorAction Stop).Source
  }
  $QuotedScript = '"' + ($ScriptPath -replace '"', '\"') + '"'
  New-ScheduledTaskAction `
    -Execute $PowerShell `
    -Argument "-NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File $QuotedScript"
}

function Stop-AgentProcesses {
  Get-CimInstance Win32_Process |
    Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine -like '*wmux-windows-agent.py*' } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Get-AgentEndpoint {
  $Document = if (Test-Path -LiteralPath $Config -PathType Leaf) {
    Get-Content -LiteralPath $Config -Raw | ConvertFrom-Json
  } else {
    [pscustomobject]@{}
  }
  $HostValue = if ($Document.host) { [string]$Document.host } else { '127.0.0.1' }
  if ($HostValue -in @('0.0.0.0', '::')) { $HostValue = '127.0.0.1' }
  $PortValue = if ($Document.port) { [int]$Document.port } else { 3481 }
  [pscustomobject]@{
    url = "http://${HostValue}:$PortValue"
    token = if ($Document.token) { [string]$Document.token } elseif ($env:WMUX_AGENT_TOKEN) { $env:WMUX_AGENT_TOKEN } else { '' }
  }
}

function Invoke-AgentRequest {
  param(
    [ValidateSet('GET', 'POST', 'DELETE')][string]$Method,
    [string]$Path,
    [hashtable]$Body
  )
  $Endpoint = Get-AgentEndpoint
  $Headers = @{}
  if ($Endpoint.token) { $Headers.Authorization = "Bearer $($Endpoint.token)" }
  $Arguments = @{
    Method = $Method
    Uri = "$($Endpoint.url)$Path"
    Headers = $Headers
    TimeoutSec = 5
  }
  if ($Body) {
    $Arguments.ContentType = 'application/json'
    $Arguments.Body = $Body | ConvertTo-Json -Compress
  }
  Invoke-RestMethod @Arguments
}

function Get-ActiveSessionCount {
  param($Health)
  if ($null -ne $Health.activeSessions) { return [int]$Health.activeSessions }
  if ($null -ne $Health.sessions) { return [int]$Health.sessions }
  return 0
}

function New-WmuxTaskSettings {
  New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -MultipleInstances IgnoreNew
}

function Get-AgentLogonType {
  if ($env:WMUX_WINDOWS_AGENT_LOGON_TYPE) {
    if ($env:WMUX_WINDOWS_AGENT_LOGON_TYPE -notin @('Interactive', 'S4U')) {
      Write-Error 'WMUX_WINDOWS_AGENT_LOGON_TYPE must be Interactive or S4U.'
      exit 2
    }
    return $env:WMUX_WINDOWS_AGENT_LOGON_TYPE
  }
  $InteractiveUser = (Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue).UserName
  if ($InteractiveUser) { return 'Interactive' }
  return 'S4U'
}

function Show-Usage {
  Write-Error 'usage: wmux-windows-agent-service [install|activate-update|cancel-update|restart [--force]|stop|uninstall|status|logs|diagnose]'
}

switch ($ActionName) {
  'install' {
    if (-not (Test-Path -LiteralPath $Agent -PathType Leaf)) {
      Write-Error "wmux-windows-agent was not found at $Agent"
      exit 127
    }
    Write-Wrapper
    $TaskAction = New-HiddenPowerShellAction
    $TaskTrigger = New-ScheduledTaskTrigger -AtLogOn
    $Identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
    $LogonType = Get-AgentLogonType
    $TaskPrincipal = New-ScheduledTaskPrincipal -UserId $Identity -LogonType $LogonType
    $TaskSettings = New-WmuxTaskSettings
    $Task = New-ScheduledTask -Action $TaskAction -Trigger $TaskTrigger -Principal $TaskPrincipal -Settings $TaskSettings
    Register-ScheduledTask -TaskName $TaskName -InputObject $Task -Force | Out-Null
    Start-ScheduledTask -TaskName $TaskName
    Write-Output "Installed $TaskName"
    Write-Output "Logon type: $LogonType"
    Write-Output "Logs: $LogDir"
  }
  'restart' {
    if (-not $Force) {
      $DrainStarted = $false
      try {
        $Health = Invoke-AgentRequest -Method POST -Path '/drain' -Body @{ restartWhenIdle = $false }
        $DrainStarted = $true
      } catch {
        $Health = Invoke-AgentRequest -Method GET -Path '/health'
      }
      $ActiveSessions = Get-ActiveSessionCount $Health
      if ($ActiveSessions -gt 0) {
        if ($DrainStarted) {
          try { Invoke-AgentRequest -Method DELETE -Path '/drain' | Out-Null } catch {}
        }
        Write-Error "Refusing to restart $TaskName with $ActiveSessions active pane session(s). Use activate-update to drain safely, or restart --force to terminate them."
        exit 3
      }
    }
    # Task Scheduler owns this launcher outside the agent's process tree. A
    # plain Start-Process child is still terminated with an agent-owned pane or
    # an OpenSSH session, which can leave the main task stopped and port dark.
    $RestartScript = Join-Path $HelperDir 'wmux-windows-agent-restart.ps1'
    $Sequence = @"
Stop-ScheduledTask -TaskName '$($TaskName -replace "'", "''")' -ErrorAction SilentlyContinue
Get-CimInstance Win32_Process |
  Where-Object { `$_.ProcessId -ne `$PID -and `$_.CommandLine -and `$_.CommandLine -like '*wmux-windows-agent.py*' } |
  ForEach-Object { Stop-Process -Id `$_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1
Start-ScheduledTask -TaskName '$($TaskName -replace "'", "''")'
"@
    [System.IO.File]::WriteAllText($RestartScript, $Sequence, [System.Text.UTF8Encoding]::new($false))
    $MainTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    $RestartAction = New-HiddenPowerShellAction -ScriptPath $RestartScript
    $RestartSettings = New-ScheduledTaskSettingsSet `
      -AllowStartIfOnBatteries `
      -DontStopIfGoingOnBatteries `
      -ExecutionTimeLimit (New-TimeSpan -Minutes 2) `
      -MultipleInstances IgnoreNew
    $RestartTask = New-ScheduledTask -Action $RestartAction -Principal $MainTask.Principal -Settings $RestartSettings
    Register-ScheduledTask -TaskName $RestartTaskName -InputObject $RestartTask -Force | Out-Null
    Start-ScheduledTask -TaskName $RestartTaskName
    Write-Output "Restarting $TaskName through the independent $RestartTaskName task"
  }
  'activate-update' {
    try {
      $Drain = Invoke-AgentRequest -Method POST -Path '/drain' -Body @{ restartWhenIdle = $true }
    } catch {
      Write-Error "The running agent does not support safe drain activation. Stage the current helper, then restart --force only when losing active panes is acceptable. $($_.Exception.Message)"
      exit 4
    }
    $ActiveSessions = Get-ActiveSessionCount $Drain
    if ($ActiveSessions -gt 0) {
      Write-Output "Update staged; agent is draining $ActiveSessions active pane session(s)."
      Write-Output 'New pane creation is paused. The agent will restart automatically after the final pane closes.'
    } else {
      Write-Output 'Update staged; no active panes remain. Agent restart has been scheduled.'
    }
  }
  'cancel-update' {
    $Drain = Invoke-AgentRequest -Method DELETE -Path '/drain'
    Write-Output "Drain cancelled; active pane sessions: $(Get-ActiveSessionCount $Drain)"
  }
  'stop' {
    Stop-ScheduledTask -TaskName $RestartTaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $RestartTaskName -Confirm:$false -ErrorAction SilentlyContinue
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Stop-AgentProcesses
  }
  'uninstall' {
    Stop-ScheduledTask -TaskName $RestartTaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $RestartTaskName -Confirm:$false -ErrorAction SilentlyContinue
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Stop-AgentProcesses
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Output "Uninstalled $TaskName"
  }
  'status' {
    Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop | Format-List *
    Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue | Format-List *
    try {
      Invoke-AgentRequest -Method GET -Path '/health' | Select-Object version, backend, processTree, activeSessions, draining, restartWhenIdle | Format-List
    } catch {
      Write-Warning "Agent health unavailable: $($_.Exception.Message)"
    }
  }
  'logs' {
    $Files = @()
    $Files += Get-Item -LiteralPath $OutLog, $ErrLog -ErrorAction SilentlyContinue
    $Files += Get-ChildItem -LiteralPath $LogDir -Filter 'windows-agent-*.out.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 2
    $Files += Get-ChildItem -LiteralPath $LogDir -Filter 'windows-agent-*.err.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 2
    foreach ($File in @($Files | Sort-Object FullName -Unique)) {
      Write-Output "--- $($File.FullName) ---"
      Get-Content -LiteralPath $File.FullName -Tail 120 -ErrorAction SilentlyContinue
    }
  }
  'diagnose' {
    Write-Output "task=$TaskName"
    Write-Output "agent=$Agent"
    Write-Output "wrapper=$Wrapper"
    Write-Output "config=$Config"
    Write-Output "logs=$LogDir"
    Write-Output '--- commands ---'
    Get-Command python.exe -ErrorAction SilentlyContinue
    Get-Command py.exe -ErrorAction SilentlyContinue
    Write-Output '--- task ---'
    Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue | Format-List *
    Write-Output '--- processes ---'
    Get-Process | Where-Object { $_.ProcessName -match 'python|py|pwsh' } | Select-Object Id, ProcessName, Path
    Write-Output '--- logs ---'
    & $PSCommandPath logs
  }
  default {
    Show-Usage
    exit 2
  }
}
