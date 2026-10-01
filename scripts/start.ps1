$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
node scripts/doctor.mjs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node scripts/start-local.mjs
exit $LASTEXITCODE
