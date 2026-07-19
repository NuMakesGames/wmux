param(
  [switch]$Once,
  [string]$StateDir = (Join-Path $HOME '.wmux')
)

$ErrorActionPreference = 'Stop'

$WmuxUrl = $env:WMUX_URL
if (-not $WmuxUrl) {
  $UrlFile = Join-Path $StateDir 'url'
  if (Test-Path -LiteralPath $UrlFile) { $WmuxUrl = (Get-Content -LiteralPath $UrlFile -Raw).Trim() }
}
if (-not $WmuxUrl) { $WmuxUrl = 'http://127.0.0.1:3478' }
$WmuxUrl = $WmuxUrl.TrimEnd('/')

$Token = $env:WMUX_REGISTRATION_TOKEN
if (-not $Token) {
  $TokenFile = Join-Path $StateDir 'registration-token'
  if (Test-Path -LiteralPath $TokenFile) { $Token = (Get-Content -LiteralPath $TokenFile -Raw).Trim() }
}
if (-not $Token) {
  throw "no registration token: set WMUX_REGISTRATION_TOKEN or create $StateDir\registration-token"
}
if ($Token -match "[\r\n]") { throw 'registration token must not contain a newline' }

$ConfigFile = if ($env:WMUX_HEARTBEAT_CONFIG) { $env:WMUX_HEARTBEAT_CONFIG } else { Join-Path $StateDir 'heartbeat.json' }
if (-not (Test-Path -LiteralPath $ConfigFile -PathType Leaf)) { throw "missing $ConfigFile" }
$AgentConfigFile = if ($env:WMUX_WINDOWS_AGENT_CONFIG) { $env:WMUX_WINDOWS_AGENT_CONFIG } else { Join-Path $StateDir 'windows-agent.json' }
if (-not (Test-Path -LiteralPath $AgentConfigFile -PathType Leaf)) { throw "missing $AgentConfigFile" }

$Failed = $false
try {
  $Registration = Get-Content -LiteralPath $ConfigFile -Raw | ConvertFrom-Json
  $AgentConfig = Get-Content -LiteralPath $AgentConfigFile -Raw | ConvertFrom-Json
  if (-not $Registration.machine) { throw 'heartbeat.json must contain a machine object' }
  if ($AgentConfig.machine -and [string]$Registration.machine.id -ne [string]$AgentConfig.machine) {
    throw 'heartbeat machine id does not match windows-agent.json'
  }
  $AgentToken = if ($AgentConfig.token) { [string]$AgentConfig.token } elseif ($env:WMUX_AGENT_TOKEN) { $env:WMUX_AGENT_TOKEN } else { '' }
  if (-not $AgentToken) { throw 'windows-agent.json is missing the agent token' }
  $AgentPort = if ($AgentConfig.port) { [int]$AgentConfig.port } else { 3481 }
  $Registration.machine | Add-Member -NotePropertyName sessionBackend -NotePropertyValue 'agent' -Force
  $Registration.machine | Add-Member -NotePropertyName agentPort -NotePropertyValue $AgentPort -Force
  $Registration.machine | Add-Member -NotePropertyName agentToken -NotePropertyValue $AgentToken -Force
  $Body = $Registration | ConvertTo-Json -Depth 20 -Compress
  Invoke-RestMethod -Method Post -Uri "$WmuxUrl/api/registry/hosts" `
    -Headers @{ Authorization = "Bearer $Token" } `
    -ContentType 'application/json' -Body $Body -TimeoutSec 15 | Out-Null
} catch {
  $Failed = $true
  Write-Warning "wmux-heartbeat: $($_.Exception.Message)"
}
if ($Failed) { exit 1 }
exit 0
