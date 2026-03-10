# F1 Intelligence Hub — New Device Setup
# Run once after cloning: .\setup.ps1
# Requires: Docker Desktop (nothing else — no Python, conda, or Node needed)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  F1 Intelligence Hub — Setup" -ForegroundColor Red
Write-Host "  =============================`n" -ForegroundColor DarkRed

# ── 1. Check Docker ────────────────────────────────────────────────────────
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Error "Docker is not installed or not in PATH. Install Docker Desktop and retry."
    exit 1
}
$dockerRunning = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Docker Desktop is not running. Start it and retry."
    exit 1
}
Write-Host "[1/5] Docker OK" -ForegroundColor Green

# ── 2. Create .env ─────────────────────────────────────────────────────────
if (-not (Test-Path ".env")) {
    Copy-Item ".env.example" ".env"
    Write-Host "[2/5] .env created from .env.example" -ForegroundColor Green
} else {
    Write-Host "[2/5] .env already exists — skipped" -ForegroundColor DarkGray
}

# ── 3. Ensure required directories exist ──────────────────────────────────
New-Item -ItemType Directory -Force -Path "fastf1_cache" | Out-Null
New-Item -ItemType Directory -Force -Path "frontend\public\circuits" | Out-Null
New-Item -ItemType Directory -Force -Path "backups" | Out-Null
Write-Host "[3/5] Directories ready" -ForegroundColor Green

# ── 4. Build + start Docker Compose services ──────────────────────────────
Write-Host "[4/5] Building and starting services (postgres, backend, frontend, loader)..." -ForegroundColor Cyan
docker compose build
docker compose up -d
if ($LASTEXITCODE -ne 0) { Write-Error "docker compose up failed."; exit 1 }
Write-Host "[4/5] Services started" -ForegroundColor Green

# ── 5. Database: restore backup or prompt to load data ────────────────────
Write-Host "[5/5] Checking for database backup..." -ForegroundColor Cyan

# Wait for postgres to be healthy
$maxWait = 60
$waited = 0
Write-Host "  Waiting for postgres to be ready..." -ForegroundColor DarkGray
while ($waited -lt $maxWait) {
    $health = docker inspect --format="{{.State.Health.Status}}" f1_postgres 2>$null
    if ($health -eq "healthy") { break }
    Start-Sleep -Seconds 2
    $waited += 2
}

if (Test-Path "backups\f1_dump.sql") {
    Write-Host ""
    $answer = Read-Host "  Found backups\f1_dump.sql. Restore it now? (y/n)"
    if ($answer -eq "y") {
        Write-Host "  Restoring database..." -ForegroundColor Cyan
        Get-Content "backups\f1_dump.sql" | docker exec -i f1_postgres psql -U f1user -d f1_intelligence_hub -q
        docker compose restart backend
        Write-Host "  Database restored!" -ForegroundColor Green
    }
} else {
    Write-Host ""
    Write-Host "  No backup found. Load data with (runs entirely inside Docker):" -ForegroundColor Yellow
    Write-Host "  docker compose run --rm loader python scripts/initial_data_load.py 2026 --sync`n" -ForegroundColor White
}

# ── Done ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  Setup complete!" -ForegroundColor Green
Write-Host "  Frontend : http://localhost:3000" -ForegroundColor Cyan
Write-Host "  Backend  : http://localhost:8000" -ForegroundColor Cyan
Write-Host "  API Docs : http://localhost:8000/docs" -ForegroundColor Cyan
Write-Host ""
Write-Host "  To load data:  docker compose run --rm loader python scripts/initial_data_load.py 2026 --sync" -ForegroundColor DarkGray
Write-Host "  To back up DB: .\scripts\backup.ps1" -ForegroundColor DarkGray
Write-Host ""

