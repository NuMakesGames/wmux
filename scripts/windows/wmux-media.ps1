$ErrorActionPreference = 'Stop'

$WmuxUrl = $env:WMUX_URL
if (-not $WmuxUrl) { $WmuxUrl = 'http://127.0.0.1:3478' }
$PaneId = $env:WMUX_PANE_ID
$WorkspaceId = $env:WMUX_WORKSPACE_ID
$TabId = $env:WMUX_TAB_ID
$MimeType = ''
$Name = ''
$Mode = $env:WMUX_MEDIA_MODE
if (-not $Mode) { $Mode = 'auto' }
$File = ''

function Show-Usage {
  Write-Error 'Usage: wmux-media [--url <url>] [--pane <id>] [--workspace <id>] [--tab <id>] [--mime <type>] [--name <name>] [--mode auto|kitty|http] <file>'
}

function Get-WmuxMimeType([string]$PathValue) {
  switch ([System.IO.Path]::GetExtension($PathValue).ToLowerInvariant()) {
    '.png' { return 'image/png' }
    '.jpg' { return 'image/jpeg' }
    '.jpeg' { return 'image/jpeg' }
    '.gif' { return 'image/gif' }
    '.webp' { return 'image/webp' }
    '.svg' { return 'image/svg+xml' }
    '.wav' { return 'audio/wav' }
    '.mp3' { return 'audio/mpeg' }
    '.m4a' { return 'audio/mp4' }
    '.ogg' { return 'audio/ogg' }
    '.mp4' { return 'video/mp4' }
    '.webm' { return 'video/webm' }
    default { return 'application/octet-stream' }
  }
}

for ($Index = 0; $Index -lt $args.Count; $Index++) {
  $Arg = [string]$args[$Index]
  switch ($Arg) {
    '--url' { $Index++; $WmuxUrl = [string]$args[$Index]; continue }
    '--pane' { $Index++; $PaneId = [string]$args[$Index]; continue }
    '--workspace' { $Index++; $WorkspaceId = [string]$args[$Index]; continue }
    '--tab' { $Index++; $TabId = [string]$args[$Index]; continue }
    '--mime' { $Index++; $MimeType = [string]$args[$Index]; continue }
    '--name' { $Index++; $Name = [string]$args[$Index]; continue }
    '--mode' { $Index++; $Mode = [string]$args[$Index]; continue }
    '-h' { Show-Usage; exit 0 }
    '--help' { Show-Usage; exit 0 }
    default {
      if (-not $File) {
        $File = $Arg
      } else {
        throw "unknown argument: $Arg"
      }
    }
  }
}

if ($Mode -notin @('auto', 'kitty', 'http')) {
  Write-Error "invalid --mode: $Mode"
  exit 2
}
if (-not $File -or -not (Test-Path -LiteralPath $File -PathType Leaf)) {
  Show-Usage
  exit 2
}
if ($Mode -eq 'kitty') {
  Write-Error 'wmux-media: kitty inline rendering is not implemented for Windows helpers yet; use --mode http'
  exit 1
}

$ResolvedFile = (Resolve-Path -LiteralPath $File).Path
if (-not $Name) { $Name = [System.IO.Path]::GetFileName($ResolvedFile) }
if (-not $MimeType) { $MimeType = Get-WmuxMimeType $ResolvedFile }

$Payload = [ordered]@{
  name = $Name
  mimeType = $MimeType
  data = [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($ResolvedFile))
}
if ($PaneId) { $Payload.paneId = $PaneId }
if ($WorkspaceId) { $Payload.workspaceId = $WorkspaceId }
if ($TabId) { $Payload.tabId = $TabId }

$Json = $Payload | ConvertTo-Json -Depth 8 -Compress
Invoke-RestMethod -Method Post -Uri ($WmuxUrl.TrimEnd('/') + '/api/media') -ContentType 'application/json' -Body $Json | Out-Null
