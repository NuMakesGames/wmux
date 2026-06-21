$ErrorActionPreference = 'Stop'

$ActionName = if ($args.Count -gt 0) { [string]$args[0] } else { 'install' }
$TaskName = if ($env:WMUX_WINDOWS_AGENT_TASK) { $env:WMUX_WINDOWS_AGENT_TASK } else { 'wmux-windows-agent' }
$StateDir = Join-Path $HOME '.wmux'
$LogDir = Join-Path $StateDir 'logs'
$Config = if ($env:WMUX_WINDOWS_AGENT_CONFIG) { $env:WMUX_WINDOWS_AGENT_CONFIG } else { Join-Path $StateDir 'windows-agent.json' }
$HelperDir = if ($env:WMUX_HELPER_DIR) { $env:WMUX_HELPER_DIR } else { Join-Path $env:LOCALAPPDATA 'wmux\bin' }
$Agent = Join-Path $HelperDir 'wmux-windows-agent.cmd'
$Wrapper = Join-Path $HelperDir 'wmux-windows-agent-task.cmd'
$OutLog = Join-Path $LogDir 'windows-agent.out.log'
$ErrLog = Join-Path $LogDir 'windows-agent.err.log'

function Write-Wrapper {
  New-Item -ItemType Directory -Force -Path $StateDir, $LogDir, $HelperDir | Out-Null
  $Content = @"
@echo off
setlocal
"$Agent" --config "$Config" >> "$OutLog" 2>> "$ErrLog"
exit /b %ERRORLEVEL%
"@
  [System.IO.File]::WriteAllText($Wrapper, $Content, [System.Text.UTF8Encoding]::new($false))
}

function Stop-AgentProcesses {
  Get-CimInstance Win32_Process |
    Where-Object { $_.CommandLine -and $_.CommandLine -like '*wmux-windows-agent.py*' } |
    ForEach-Object {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Show-Usage {
  Write-Error 'usage: wmux-windows-agent-service [install|restart|stop|uninstall|status|logs|diagnose]'
}

switch ($ActionName) {
  'install' {
    if (-not (Test-Path -LiteralPath $Agent -PathType Leaf)) {
      Write-Error "wmux-windows-agent was not found at $Agent"
      exit 127
    }
    Write-Wrapper
    $TaskAction = New-ScheduledTaskAction -Execute $Wrapper
    $TaskTrigger = New-ScheduledTaskTrigger -AtLogOn
    $TaskPrincipal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
    $Task = New-ScheduledTask -Action $TaskAction -Trigger $TaskTrigger -Principal $TaskPrincipal
    Register-ScheduledTask -TaskName $TaskName -InputObject $Task -Force | Out-Null
    Start-ScheduledTask -TaskName $TaskName
    Write-Output "Installed $TaskName"
    Write-Output "Logs:"
    Write-Output "  $OutLog"
    Write-Output "  $ErrLog"
  }
  'restart' {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Stop-AgentProcesses
    Start-ScheduledTask -TaskName $TaskName
  }
  'stop' {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Stop-AgentProcesses
  }
  'uninstall' {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Stop-AgentProcesses
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Output "Uninstalled $TaskName"
  }
  'status' {
    Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop | Format-List *
    Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue | Format-List *
  }
  'logs' {
    if (Test-Path -LiteralPath $OutLog) { Get-Content -LiteralPath $OutLog -Tail 120 }
    if (Test-Path -LiteralPath $ErrLog) { Get-Content -LiteralPath $ErrLog -Tail 120 }
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
