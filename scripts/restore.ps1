# F1 Intelligence Hub — Database Restore
# Full wipe + restore from a pg_dump SQL file, with live progress bar.
# Run from the project root: .\scripts\restore.ps1
# Optionally pass a specific file: .\scripts\restore.ps1 -File backups\f1_dump_2026-03-10.sql

param(
    [string]$File = "backups\f1_dump.sql"
)

$ErrorActionPreference = "Continue"
Set-Location (Split-Path -Parent $PSScriptRoot)  # project root

Write-Host ""
Write-Host "  F1 Intelligence Hub - Database Restore" -ForegroundColor Red
Write-Host "  ========================================" -ForegroundColor DarkRed
Write-Host ""

# ---------------------------------------------------------------------------
# 1. Validate
# ---------------------------------------------------------------------------
if (-not (Test-Path $File)) {
    Write-Host "  ERROR: Backup file not found: $File" -ForegroundColor Red
    Write-Host "         Run .\scripts\backup.ps1 on the source machine first." -ForegroundColor Yellow
    exit 1
}

$health = docker inspect --format="{{.State.Health.Status}}" f1_postgres 2>$null
if ($health -ne "healthy") {
    Write-Host "  ERROR: f1_postgres is not running or unhealthy." -ForegroundColor Red
    Write-Host "         Run: docker compose up -d postgres" -ForegroundColor Yellow
    exit 1
}

$dumpSizeBytes = (Get-Item $File).Length
$dumpSizeMB    = [math]::Round($dumpSizeBytes / 1MB, 1)
Write-Host "  Source  : $File ($dumpSizeMB MB)" -ForegroundColor DarkGray
Write-Host ""

# ---------------------------------------------------------------------------
# 2. Stop backend (avoids open-connection conflicts during DROP DATABASE)
# ---------------------------------------------------------------------------
Write-Host "  [1/6] Pausing backend..." -ForegroundColor Cyan
docker compose stop backend 2>$null | Out-Null
Write-Host "         OK" -ForegroundColor Green

# ---------------------------------------------------------------------------
# 3. Drop and recreate the database — clean slate, no schema conflicts
# ---------------------------------------------------------------------------
Write-Host "  [2/6] Wiping database..." -ForegroundColor Cyan
docker exec f1_postgres psql -U f1user -d postgres -q `
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='f1_intelligence_hub';" `
    2>$null | Out-Null
docker exec f1_postgres psql -U f1user -d postgres -q `
    -c "DROP DATABASE IF EXISTS f1_intelligence_hub;" 2>$null | Out-Null
docker exec f1_postgres psql -U f1user -d postgres -q `
    -c "CREATE DATABASE f1_intelligence_hub OWNER f1user;" 2>$null | Out-Null
Write-Host "         OK" -ForegroundColor Green

# ---------------------------------------------------------------------------
# 4. Enable TimescaleDB restore mode
#    timescaledb_pre_restore() suspends background workers and disables the
#    FK / trigger checks that fire on hypertable chunks during ALTER TABLE.
# ---------------------------------------------------------------------------
Write-Host "  [3/6] Enabling TimescaleDB restore mode..." -ForegroundColor Cyan
docker exec f1_postgres psql -U f1user -d f1_intelligence_hub -q `
    -c "CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;" 2>$null | Out-Null
docker exec f1_postgres psql -U f1user -d f1_intelligence_hub -q `
    -c "SELECT timescaledb_pre_restore();" 2>$null | Out-Null
Write-Host "         OK" -ForegroundColor Green

# ---------------------------------------------------------------------------
# 5. Copy dump into the container
#    NEVER pipe via Get-Content on Windows: PowerShell 5 re-encodes the text
#    and corrupts every COPY ... FROM stdin block, leaving tables empty.
# ---------------------------------------------------------------------------
Write-Host "  [4/6] Copying dump into container..." -ForegroundColor Cyan
$alreadyThere = docker exec f1_postgres sh -c "test -f /tmp/f1_dump.sql && echo yes" 2>$null
if ($alreadyThere -ne "yes") {
    docker cp $File "f1_postgres:/tmp/f1_dump.sql"
} else {
    Write-Host "         (file already in container from previous attempt)" -ForegroundColor DarkGray
}
Write-Host "         OK" -ForegroundColor Green

# ---------------------------------------------------------------------------
# 6. Restore with live progress bar
#    pv (pipe viewer) shows bytes/sec, percentage, and ETA.
#    If pv is not available it falls back to a polling display.
# ---------------------------------------------------------------------------
Write-Host "  [5/6] Restoring..." -ForegroundColor Cyan

# Try to install pv (Alpine apk — no-op if already present)
docker exec f1_postgres sh -c "which pv >/dev/null 2>&1 || apk add --no-cache pv >/dev/null 2>&1"
$pvAvailable = (docker exec f1_postgres sh -c "which pv >/dev/null 2>&1 && echo yes" 2>$null) -eq "yes"

Write-Host ""
$sw = [Diagnostics.Stopwatch]::StartNew()

if ($pvAvailable) {
    # pv reads the file, writes progress to the terminal, pipes data to psql.
    # -p progress bar  -e ETA  -t elapsed  -r rate  -a average rate
    # Use docker exec -it so pv can detect a TTY and draw the progress bar.
    docker exec -it f1_postgres sh -c `
        "pv -petar /tmp/f1_dump.sql | psql -U f1user -d f1_intelligence_hub -q"
} else {
    # Fallback: run psql in a background job, poll row counts every 3 s.
    Write-Host "  (pv not available — showing live row counts instead)" -ForegroundColor DarkGray
    Write-Host ""

    $job = Start-Job -ScriptBlock {
        docker exec f1_postgres psql -U f1user -d f1_intelligence_hub -q -f /tmp/f1_dump.sql 2>&1
    }

    $spin    = @('|','/','-','\')
    $spinIdx = 0
    $monitorSql = @"
SELECT relname AS t, n_live_tup AS r
FROM   pg_stat_user_tables
WHERE  n_live_tup > 0
ORDER  BY n_live_tup DESC
LIMIT  8;
"@
    while ($job.State -eq 'Running') {
        Start-Sleep -Seconds 3
        $elapsed = $sw.Elapsed.ToString("mm\:ss")
        $s       = $spin[$spinIdx++ % 4]
        $rows    = docker exec f1_postgres psql -U f1user -d f1_intelligence_hub `
                     -t -q -c $monitorSql 2>$null
        $summary = ($rows | Where-Object { $_ -match "\|" } |`
                    ForEach-Object { $_.Trim() -replace '\s*\|\s*', '=' }) -join '  '
        Write-Host "  $s [$elapsed]  $summary" -ForegroundColor DarkGray
    }
    Receive-Job $job | Out-Null
    Remove-Job $job
}

$sw.Stop()
Write-Host ""
Write-Host "  Restore completed in $($sw.Elapsed.ToString('mm\:ss'))" -ForegroundColor Green

# ---------------------------------------------------------------------------
# 7. Finalise
# ---------------------------------------------------------------------------
Write-Host "  [6/6] Finalising..." -ForegroundColor Cyan
docker exec f1_postgres psql -U f1user -d f1_intelligence_hub -q `
    -c "SELECT timescaledb_post_restore();" 2>$null | Out-Null
docker exec f1_postgres rm -f /tmp/f1_dump.sql
docker compose start backend | Out-Null
Write-Host "         OK" -ForegroundColor Green

# ---------------------------------------------------------------------------
# Final verification — real COUNT(*) per table, not pg_stat_user_tables
# (n_live_tup is an autovacuum estimate and shows 0 for freshly loaded data)
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "  Row counts:" -ForegroundColor Cyan
$verifySql = @"
SELECT table_name, cnt FROM (
  SELECT 'circuits'              AS table_name, count(*) AS cnt FROM circuits
  UNION ALL SELECT 'drivers',              count(*) FROM drivers
  UNION ALL SELECT 'teams',               count(*) FROM teams
  UNION ALL SELECT 'seasons',             count(*) FROM seasons
  UNION ALL SELECT 'races',               count(*) FROM races
  UNION ALL SELECT 'sessions',            count(*) FROM sessions
  UNION ALL SELECT 'results',             count(*) FROM results
  UNION ALL SELECT 'qualifying',          count(*) FROM qualifying
  UNION ALL SELECT 'lap_times',           count(*) FROM lap_times
  UNION ALL SELECT 'telemetry_data',      count(*) FROM telemetry_data
  UNION ALL SELECT 'weather_data',        count(*) FROM weather_data
  UNION ALL SELECT 'pit_stops',           count(*) FROM pit_stops
  UNION ALL SELECT 'position_data',       count(*) FROM position_data
  UNION ALL SELECT 'race_control_messages', count(*) FROM race_control_messages
  UNION ALL SELECT 'session_status',      count(*) FROM session_status
) t ORDER BY cnt DESC;
"@
$verifySql | docker exec -i f1_postgres psql -U f1user -d f1_intelligence_hub 2>&1 | Where-Object { $_ -notmatch "console mode" }

Write-Host ""
Write-Host "  Frontend : http://localhost:3000" -ForegroundColor Cyan
Write-Host "  Backend  : http://localhost:8000" -ForegroundColor Cyan
Write-Host ""
