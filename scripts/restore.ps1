# F1 Intelligence Hub — Database Restore
# Restores backups\f1_dump.sql into the running Postgres container
# Run from the project root: .\scripts\restore.ps1
# Optionally pass a specific file: .\scripts\restore.ps1 -File backups\f1_dump_2026-03-10.sql

param(
    [string]$File = "backups\f1_dump.sql"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $File)) {
    Write-Error "Backup file not found: $File`nRun .\scripts\backup.ps1 on your source machine first."
    exit 1
}

# Check the container is running
$state = docker inspect --format="{{.State.Status}}" f1_postgres 2>$null
if ($state -ne "running") {
    Write-Error "f1_postgres container is not running. Start it with: docker compose up -d postgres"
    exit 1
}

$sizeMB = [math]::Round((Get-Item $File).Length / 1MB, 1)
Write-Host "Restoring from $File ($sizeMB MB)..." -ForegroundColor Cyan
Write-Host "This may take a minute for large datasets." -ForegroundColor DarkGray

Get-Content $File | docker exec -i f1_postgres psql -U f1user -d f1_intelligence_hub -q
if ($LASTEXITCODE -ne 0) { Write-Error "psql restore failed."; exit 1 }

Write-Host "Restore complete!" -ForegroundColor Green
Write-Host "Restart the backend to ensure connections are refreshed:" -ForegroundColor Yellow
Write-Host "  docker compose restart backend" -ForegroundColor White
