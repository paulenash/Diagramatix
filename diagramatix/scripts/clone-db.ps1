<#
.SYNOPSIS
  Clone the local Diagramatix Postgres database for backup / restore
  experimentation, without touching the source.

.DESCRIPTION
  Creates `diagramatix_clone` as a byte-identical copy of `diagramatix`
  via Postgres's CREATE DATABASE ... TEMPLATE. The clone lives on the
  same Postgres instance (port 5432) — no second server needed.

  Re-runnable: if the clone already exists it's dropped and recreated.

  Source-DB requirement: TEMPLATE-based clone needs the source to have
  no active sessions. If the main `npm run go` (or any other client) is
  connected, Postgres refuses. Pass -Force to terminate other sessions
  to the source before cloning; otherwise the script aborts with the
  list of holding sessions so you can stop them deliberately.

.PARAMETER Source
  Source database name. Default: diagramatix.

.PARAMETER Clone
  Clone database name. Default: diagramatix_clone.

.PARAMETER User
  Postgres user. Default: postgres.

.PARAMETER Password
  Postgres password. Default: postgres. Set via -Password or by
  pre-setting $env:PGPASSWORD in the shell.

.PARAMETER Force
  Terminate other sessions to the source DB before cloning. Use this
  when the dev server is still running and you don't want to stop it
  just to make a clone.

.EXAMPLE
  scripts\clone-db.ps1
  Stop the dev server first, then create a fresh clone.

.EXAMPLE
  scripts\clone-db.ps1 -Force
  Terminate any sessions on `diagramatix`, then clone. Dev-server
  Prisma connections will reconnect automatically.
#>
[CmdletBinding()]
param(
  [string]$Source = "diagramatix",
  [string]$Clone  = "diagramatix_clone",
  [string]$User   = "postgres",
  [string]$Password = "postgres",
  [switch]$Force
)

$ErrorActionPreference = "Stop"

# Find psql — prefer the one on PATH; otherwise the standard Windows
# install path. PG 18 is what the local install uses, but we glob the
# major version so a future bump just works.
function Find-Psql {
  $onPath = Get-Command psql -ErrorAction SilentlyContinue
  if ($onPath) { return $onPath.Source }
  $candidates = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue
  if ($candidates) { return ($candidates | Sort-Object Name -Descending | Select-Object -First 1).FullName }
  throw "psql.exe not found. Install Postgres or add psql to PATH."
}

$psql = Find-Psql
$env:PGPASSWORD = $Password

function Run-Psql([string]$sql, [string]$db = "postgres") {
  # -X = don't read psqlrc, -v ON_ERROR_STOP=1 = bail on first error,
  # -q = quiet (suppress NOTICE chatter). Locals named `psqlArgs` not
  # `args` because $args is a PowerShell automatic variable.
  $psqlArgs = @("-U", $User, "-d", $db, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", $sql)
  & $psql @psqlArgs
  if ($LASTEXITCODE -ne 0) { throw "psql command failed (exit $LASTEXITCODE): $sql" }
}

Write-Host "Using psql: $psql" -ForegroundColor DarkGray

# Check for active sessions on the source. The clone won't proceed if
# anything else is connected.
$sessionsQuery = @"
SELECT count(*) FROM pg_stat_activity
WHERE datname = '$Source' AND pid <> pg_backend_pid();
"@
$sessionsRaw = & $psql -U $User -d postgres -X -q -t -A -c $sessionsQuery
if ($LASTEXITCODE -ne 0) { throw "Could not query pg_stat_activity (exit $LASTEXITCODE)" }
$sessions = [int]$sessionsRaw.Trim()

if ($sessions -gt 0) {
  if ($Force) {
    Write-Host "Terminating $sessions session(s) on '$Source' (Force)..." -ForegroundColor Yellow
    Run-Psql "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$Source' AND pid <> pg_backend_pid();"
  } else {
    Write-Host "Aborting: $sessions session(s) connected to '$Source'." -ForegroundColor Red
    Write-Host "Stop the dev server (or other Postgres clients), or re-run with -Force." -ForegroundColor Red
    & $psql -U $User -d postgres -X -q -c "SELECT pid, usename, application_name, state FROM pg_stat_activity WHERE datname = '$Source' AND pid <> pg_backend_pid();"
    exit 1
  }
}

# Drop the old clone (if any) and recreate.
Write-Host "Dropping '$Clone' (if it exists)..." -ForegroundColor DarkGray
Run-Psql "DROP DATABASE IF EXISTS `"$Clone`";"

Write-Host "Creating '$Clone' as TEMPLATE of '$Source'..." -ForegroundColor DarkGray
Run-Psql "CREATE DATABASE `"$Clone`" TEMPLATE `"$Source`";"

Write-Host ""
Write-Host "✔ Clone ready: $Clone" -ForegroundColor Green
Write-Host "  Connection string:" -ForegroundColor DarkGray
Write-Host "    postgres://${User}:***@localhost:5432/$Clone" -ForegroundColor White
Write-Host ""
Write-Host "Launch the experiment instance with:" -ForegroundColor DarkGray
Write-Host "  scripts\run-experiment.ps1" -ForegroundColor White
