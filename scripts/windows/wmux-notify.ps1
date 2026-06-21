$ErrorActionPreference = 'Stop'

$WmuxUrl = $env:WMUX_URL
if (-not $WmuxUrl) { $WmuxUrl = 'http://127.0.0.1:3478' }
$Title = 'wmux'
$Subtitle = ''
$Body = ''
$PaneId = $env:WMUX_PANE_ID
$WorkspaceId = $env:WMUX_WORKSPACE_ID
$TabId = $env:WMUX_TAB_ID

for ($Index = 0; $Index -lt $args.Count; $Index++) {
  $Arg = [string]$args[$Index]
  switch ($Arg) {
    '--url' { $Index++; $WmuxUrl = [string]$args[$Index]; continue }
    '--title' { $Index++; $Title = [string]$args[$Index]; continue }
    '--subtitle' { $Index++; $Subtitle = [string]$args[$Index]; continue }
    '--body' { $Index++; $Body = [string]$args[$Index]; continue }
    '--pane' { $Index++; $PaneId = [string]$args[$Index]; continue }
    '--workspace' { $Index++; $WorkspaceId = [string]$args[$Index]; continue }
    '--tab' { $Index++; $TabId = [string]$args[$Index]; continue }
    default {
      if (-not $Body) {
        $Body = $Arg
      } else {
        throw "unknown argument: $Arg"
      }
    }
  }
}

$Payload = [ordered]@{
  title = $Title
  subtitle = $Subtitle
  body = $Body
}
if ($PaneId) { $Payload.paneId = $PaneId }
if ($WorkspaceId) { $Payload.workspaceId = $WorkspaceId }
if ($TabId) { $Payload.tabId = $TabId }

$Json = $Payload | ConvertTo-Json -Depth 8 -Compress
Invoke-RestMethod -Method Post -Uri ($WmuxUrl.TrimEnd('/') + '/api/notifications') -ContentType 'application/json' -Body $Json | Out-Null
