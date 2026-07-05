function global:__wmuxFileUriPath([string]$PathValue) {
  $Normalized = $PathValue -replace '\\', '/'
  if ($Normalized -match '^[A-Za-z]:') {
    $Normalized = '/' + $Normalized
  }
  $Segments = $Normalized.Split([char]'/', [System.StringSplitOptions]::None)
  return (($Segments | ForEach-Object { [System.Uri]::EscapeDataString($_) }) -join '/')
}

function global:__wmuxEmitCwd {
  try {
    if ($PWD.Provider.Name -ne 'FileSystem') { return }
    $HostName = if ($env:COMPUTERNAME) { $env:COMPUTERNAME } else { 'windows' }
    $PathPart = __wmuxFileUriPath $PWD.ProviderPath
    [Console]::Write("$([char]27)]7;file://$HostName$PathPart$([char]7)")
  } catch {}
}

function global:prompt {
  __wmuxEmitCwd
  "PS $($executionContext.SessionState.Path.CurrentLocation)> "
}

try {
  Set-PSReadLineOption -PredictionSource None -ErrorAction SilentlyContinue
} catch {}
