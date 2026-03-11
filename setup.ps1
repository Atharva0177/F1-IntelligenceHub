# F1 Intelligence Hub — New Device Setup
# Run once after cloning: .\setup.ps1
# Requires: Docker Desktop (nothing else — no Python, conda, or Node needed)

$ErrorActionPreference = "Continue"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "  F1 Intelligence Hub - Setup" -ForegroundColor Red
Write-Host "  =============================" -ForegroundColor DarkRed
Write-Host ""

# ── 1. Docker check ────────────────────────────────────────────────────────────
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Host "  ERROR: Docker is not installed or not in PATH." -ForegroundColor Red
    Write-Host "         Install Docker Desktop and retry." -ForegroundColor Yellow
    exit 1
}
docker info *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: Docker Desktop is not running. Start it and retry." -ForegroundColor Red
    exit 1
}
Write-Host "  [1/6] Docker OK" -ForegroundColor Green

# ── 2. .env file ───────────────────────────────────────────────────────────────
if (-not (Test-Path ".env")) {
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "  [2/6] .env created from .env.example" -ForegroundColor Green
    } else {
        Write-Host "  [2/6] WARNING: no .env or .env.example found — continuing" -ForegroundColor Yellow
    }
} else {
    Write-Host "  [2/6] .env already exists — skipped" -ForegroundColor DarkGray
}

# ── 3. Directories ─────────────────────────────────────────────────────────────
New-Item -ItemType Directory -Force -Path "fastf1_cache"             | Out-Null
New-Item -ItemType Directory -Force -Path "frontend\public\circuits" | Out-Null
New-Item -ItemType Directory -Force -Path "backups"                  | Out-Null
Write-Host "  [3/6] Directories ready" -ForegroundColor Green

# ── 4. Build + start services ──────────────────────────────────────────────────
Write-Host "  [4/6] Building and starting services..." -ForegroundColor Cyan
docker compose build 
docker compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "  ERROR: docker compose up failed." -ForegroundColor Red; exit 1
}
Write-Host "  [4/6] Services started" -ForegroundColor Green

# ── 5. Wait for Postgres ───────────────────────────────────────────────────────
Write-Host "  [5/6] Waiting for postgres to be ready..." -ForegroundColor Cyan
$maxWait = 90; $waited = 0
while ($waited -lt $maxWait) {
    $health = docker inspect --format="{{.State.Health.Status}}" f1_postgres 2>$null
    if ($health -eq "healthy") { break }
    Start-Sleep -Seconds 2; $waited += 2
}
if ($health -ne "healthy") {
    Write-Host "  ERROR: postgres did not become healthy in ${maxWait}s." -ForegroundColor Red; exit 1
}
Write-Host "  [5/6] Postgres ready" -ForegroundColor Green

# ── 6. Data ────────────────────────────────────────────────────────────────────
$backupFile = "backups\f1_dump.sql"

if (-not (Test-Path $backupFile)) {
    Write-Host "  [6/6] No backup found." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Load data with (runs entirely inside Docker):" -ForegroundColor Yellow
    Write-Host "  docker compose run --rm loader python scripts/initial_data_load.py 2026 --sync" -ForegroundColor White
} else {
    $dumpSizeMB = [math]::Round((Get-Item $backupFile).Length / 1MB, 1)
    Write-Host "  [6/6] Found $backupFile ($dumpSizeMB MB)" -ForegroundColor Cyan
    Write-Host ""
    $answer = Read-Host "         Restore it now? (y/n)"

    if ($answer -ne "y") {
        Write-Host "  Skipped. Run .\scripts\restore.ps1 any time to restore." -ForegroundColor DarkGray
    } else {

        # ── [a] Stop backend ───────────────────────────────────────────────────
        Write-Host ""
        Write-Host "    [a] Pausing backend..." -ForegroundColor Cyan
        docker compose stop backend 2>$null | Out-Null
        Write-Host "        OK" -ForegroundColor Green

        # ── [b] Drop + recreate DB (clean slate — avoids "already exists" errors)
        Write-Host "    [b] Wiping database..." -ForegroundColor Cyan
        docker exec f1_postgres psql -U f1user -d postgres -q -c `
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='f1_intelligence_hub';" `
            2>$null | Out-Null
        docker exec f1_postgres psql -U f1user -d postgres -q -c `
            "DROP DATABASE IF EXISTS f1_intelligence_hub;" 2>$null | Out-Null
        docker exec f1_postgres psql -U f1user -d postgres -q -c `
            "CREATE DATABASE f1_intelligence_hub OWNER f1user;" 2>$null | Out-Null
        Write-Host "        OK" -ForegroundColor Green

        # ── [c] TimescaleDB pre-restore (suppresses hypertable FK chunk errors) ─
        Write-Host "    [c] Enabling TimescaleDB restore mode..." -ForegroundColor Cyan
        docker exec f1_postgres psql -U f1user -d f1_intelligence_hub -q -c `
            "CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;" 2>$null | Out-Null
        docker exec f1_postgres psql -U f1user -d f1_intelligence_hub -q -c `
            "SELECT timescaledb_pre_restore();" 2>$null | Out-Null
        Write-Host "        OK" -ForegroundColor Green

        # ── [d] Copy dump into container ───────────────────────────────────────
        # NEVER pipe via Get-Content: PowerShell 5 re-encodes text and corrupts
        # every COPY...FROM stdin block, leaving all tables empty.
        Write-Host "    [d] Copying dump into container..." -ForegroundColor Cyan
        $alreadyThere = docker exec f1_postgres sh -c "test -f /tmp/f1_dump.sql && echo yes" 2>$null
        if ($alreadyThere -eq "yes") {
            Write-Host "        (file already present from a previous attempt)" -ForegroundColor DarkGray
        } else {
            docker cp $backupFile "f1_postgres:/tmp/f1_dump.sql"
        }
        Write-Host "        OK" -ForegroundColor Green

        # ── [e] Restore with live progress bar ────────────────────────────────
        Write-Host "    [e] Restoring..." -ForegroundColor Cyan
        docker exec f1_postgres sh -c "which pv >/dev/null 2>&1 || apk add --no-cache pv >/dev/null 2>&1"
        $pvAvailable = (docker exec f1_postgres sh -c "which pv >/dev/null 2>&1 && echo yes" 2>$null) -eq "yes"
        Write-Host ""
        $sw = [Diagnostics.Stopwatch]::StartNew()
        if ($pvAvailable) {
            docker exec -it f1_postgres sh -c "pv -petar /tmp/f1_dump.sql | psql -U f1user -d f1_intelligence_hub -q"
        } else {
            Write-Host "        (pv not available — showing live row counts)" -ForegroundColor DarkGray
            $job = Start-Job -ScriptBlock {
                docker exec f1_postgres psql -U f1user -d f1_intelligence_hub -q -f /tmp/f1_dump.sql 2>&1
            }
            $spin = @('|','/','-','\'); $spinIdx = 0
            while ($job.State -eq 'Running') {
                Start-Sleep -Seconds 3
                $s = $spin[$spinIdx++ % 4]
                $r = docker exec f1_postgres psql -U f1user -d f1_intelligence_hub -t -q -c `
                     "SELECT relname||'='||n_live_tup FROM pg_stat_user_tables WHERE n_live_tup>0 ORDER BY n_live_tup DESC LIMIT 5;" 2>$null
                $summary = ($r | Where-Object { $_ -match '\S' } | ForEach-Object { $_.Trim() }) -join '  '
                Write-Host "        $s [$($sw.Elapsed.ToString('mm\:ss'))]  $summary" -ForegroundColor DarkGray
            }
            Receive-Job $job | Out-Null; Remove-Job $job
        }
        $sw.Stop()
        Write-Host ""
        Write-Host "        Completed in $($sw.Elapsed.ToString('mm\:ss'))" -ForegroundColor Green

        # ── [f] Post-restore + restart backend ────────────────────────────────
        Write-Host "    [f] Finalising..." -ForegroundColor Cyan
        docker exec f1_postgres psql -U f1user -d f1_intelligence_hub -q -c `
            "SELECT timescaledb_post_restore();" 2>$null | Out-Null
        docker exec f1_postgres rm -f /tmp/f1_dump.sql
        docker compose start backend | Out-Null
        Write-Host "        OK" -ForegroundColor Green

        # ── Row-count verification (real COUNT(*), not stale autovacuum stats) ─
        Write-Host ""
        Write-Host "    Row counts:" -ForegroundColor Cyan
        $verifySql = @"
SELECT table_name, cnt FROM (
  SELECT 'circuits'                AS table_name, count(*) AS cnt FROM circuits
  UNION ALL SELECT 'drivers',               count(*) FROM drivers
  UNION ALL SELECT 'teams',                 count(*) FROM teams
  UNION ALL SELECT 'seasons',               count(*) FROM seasons
  UNION ALL SELECT 'races',                 count(*) FROM races
  UNION ALL SELECT 'sessions',              count(*) FROM sessions
  UNION ALL SELECT 'results',               count(*) FROM results
  UNION ALL SELECT 'qualifying',            count(*) FROM qualifying
  UNION ALL SELECT 'lap_times',             count(*) FROM lap_times
  UNION ALL SELECT 'telemetry_data',        count(*) FROM telemetry_data
  UNION ALL SELECT 'weather_data',          count(*) FROM weather_data
  UNION ALL SELECT 'pit_stops',             count(*) FROM pit_stops
  UNION ALL SELECT 'position_data',         count(*) FROM position_data
  UNION ALL SELECT 'race_control_messages', count(*) FROM race_control_messages
  UNION ALL SELECT 'session_status',        count(*) FROM session_status
) t ORDER BY cnt DESC;
"@
        $verifySql | docker exec -i f1_postgres psql -U f1user -d f1_intelligence_hub `
            2>&1 | Where-Object { $_ -notmatch "console mode" }
    }
}

# ── Done ───────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "  Frontend : http://localhost:3000" -ForegroundColor Cyan
Write-Host "  Backend  : http://localhost:8000" -ForegroundColor Cyan
Write-Host "  API Docs : http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Useful commands:" -ForegroundColor DarkGray
Write-Host "    Load data  : docker compose run --rm loader python scripts/initial_data_load.py 2026 --sync" -ForegroundColor DarkGray
Write-Host "    Back up DB : .\scripts\backup.ps1" -ForegroundColor DarkGray
Write-Host "    Restore DB : .\scripts\restore.ps1" -ForegroundColor DarkGray
Write-Host ""