$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$cpvBundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$cpvNode = if (Test-Path -LiteralPath $cpvBundledNode) { $cpvBundledNode } else { (Get-Command node -ErrorAction Stop).Source }
$env:Path = (Split-Path $cpvNode) + ';' + $env:Path
$env:APP_MODE = 'connected'
$env:NEXT_TELEMETRY_DISABLED = '1'
& $cpvNode node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3100
