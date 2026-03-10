# F1 Intelligence Hub — Database Backup
# Dumps the running Postgres container to backups\f1_dump.sql
# Run from the project root: .\scripts\backup.ps1

$ErrorActionPreference = "Stop"

# Ensure backups directory exists
New-Item -ItemType Directory -Force -Path "backups" | Out-Null

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm"
$timestampedFile = "backups\f1_dump_$timestamp.sql"
$latestFile = "backups\f1_dump.sql"

Write-Host "Backing up database from f1_postgres container..." -ForegroundColor Cyan

# Check the container is running
$state = docker inspect --format="{{.State.Status}}" f1_postgres 2>$null
if ($state -ne "running") {
    Write-Error "f1_postgres container is not running. Start it with: docker compose up -d postgres"
    exit 1
}

# Dump
docker exec f1_postgres pg_dump -U f1user -d f1_intelligence_hub | Out-File -FilePath $timestampedFile -Encoding utf8
if ($LASTEXITCODE -ne 0) { Write-Error "pg_dump failed."; exit 1 }

# Copy to latest alias
Copy-Item $timestampedFile $latestFile -Force

$sizeMB = [math]::Round((Get-Item $latestFile).Length / 1MB, 1)
Write-Host "Backup complete!" -ForegroundColor Green
Write-Host "  Timestamped : $timestampedFile ($sizeMB MB)" -ForegroundColor Gray
Write-Host "  Latest      : $latestFile" -ForegroundColor Gray
Write-Host ""
Write-Host "Transfer the backups\ folder to your new device, then run:" -ForegroundColor Yellow
Write-Host "  .\scripts\restore.ps1" -ForegroundColor White

# Show fastf1_cache size
if (Test-Path "fastf1_cache") {
    $cacheSize = [math]::Round((Get-ChildItem "fastf1_cache" -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1MB, 0)
    Write-Host ""
    Write-Host "fastf1_cache is $cacheSize MB. Copy it to the new device to avoid re-downloading." -ForegroundColor DarkGray
}
