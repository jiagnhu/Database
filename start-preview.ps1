$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$cpvBundledNode = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$cpvNode = if (Test-Path -LiteralPath $cpvBundledNode) { $cpvBundledNode } else { (Get-Command node -ErrorAction Stop).Source }
if (-not (Test-Path -LiteralPath 'node_modules\next\dist\bin\next')) { throw '请先使用 Node.js 22 或更新版本执行 npm ci。' }
if (-not (Test-Path -LiteralPath 'data\corpus.json')) { & $cpvNode scripts/prepare-corpus.mjs; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE } }
$env:Path = (Split-Path $cpvNode) + ';' + $env:Path
$env:APP_MODE = 'preview'
$env:APP_ORIGIN = 'http://localhost:3100'
$env:NEXT_TELEMETRY_DISABLED = '1'
Write-Host '打开 http://localhost:3100 。关闭此终端将停止本地预览。'
& $cpvNode node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3100
