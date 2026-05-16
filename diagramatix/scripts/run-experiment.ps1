<#
.SYNOPSIS
  Launch a second Diagramatix instance against the cloned Postgres
  database (`diagramatix_clone`) on a different port — so you can
  experiment with Backup / Restore / destructive actions without
  touching your live local DB.

.DESCRIPTION
  Sets `DATABASE_URL` to point at the clone and `PORT` to 3001, then
  runs `npm run go`. Your main `:3000` instance keeps using
  `diagramatix` and is untouched.

  This is a NON-build launcher — it expects the production build has
  already happened (or that `npm run go` will trigger it). The clone
  database must already exist; create it with `scripts\clone-db.ps1`.

.PARAMETER Clone
  Clone database name. Default: diagramatix_clone.

.PARAMETER Port
  Port for the experiment instance. Default: 3001.

.PARAMETER User
  Postgres user. Default: postgres.

.PARAMETER Password
  Postgres password. Default: postgres.

.EXAMPLE
  scripts\run-experiment.ps1
  Launches on http://localhost:3001 against diagramatix_clone.

.EXAMPLE
  scripts\run-experiment.ps1 -Port 3002
  Use a different port if 3001 is taken.
#>
[CmdletBinding()]
param(
  [string]$Clone    = "diagramatix_clone",
  [int]   $Port     = 3001,
  [string]$User     = "postgres",
  [string]$Password = "postgres"
)

$ErrorActionPreference = "Stop"

# Sanity-check Node is on PATH. Memory notes Node lives at
# C:\Program Files\nodejs and isn't always on default PATH.
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  $nodeBin = "C:\Program Files\nodejs"
  if (Test-Path $nodeBin) {
    $env:PATH = "$nodeBin;$env:PATH"
  } else {
    throw "npm not found on PATH and C:\Program Files\nodejs does not exist."
  }
}

# Sanity-check the clone exists. Bail early if not — better than a
# Prisma connect error mid-startup.
$env:PGPASSWORD = $Password
$psql = $null
$pathPsql = Get-Command psql -ErrorAction SilentlyContinue
if ($pathPsql) { $psql = $pathPsql.Source }
else {
  $candidates = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue
  if ($candidates) { $psql = ($candidates | Sort-Object Name -Descending | Select-Object -First 1).FullName }
}
if ($psql) {
  $exists = & $psql -U $User -d postgres -X -q -t -A -c "SELECT 1 FROM pg_database WHERE datname = '$Clone';"
  if ($LASTEXITCODE -ne 0 -or -not $exists.Trim()) {
    Write-Host "Clone database '$Clone' not found." -ForegroundColor Red
    Write-Host "Create it first: scripts\clone-db.ps1" -ForegroundColor Red
    exit 1
  }
}

$env:DATABASE_URL = "postgres://${User}:${Password}@localhost:5432/$Clone"
$env:PORT         = "$Port"
$env:AUTH_TRUST_HOST = "true"

Write-Host ""
Write-Host "Launching experiment instance" -ForegroundColor Green
Write-Host "  DATABASE_URL = postgres://${User}:***@localhost:5432/$Clone" -ForegroundColor DarkGray
Write-Host "  PORT         = $Port" -ForegroundColor DarkGray
Write-Host "  URL          = http://localhost:$Port" -ForegroundColor White
Write-Host ""
Write-Host "Ctrl-C to stop. Your main instance on :3000 is unaffected." -ForegroundColor DarkGray
Write-Host ""

# Hand off to npm run go. The env vars are inherited.
& npm run go
