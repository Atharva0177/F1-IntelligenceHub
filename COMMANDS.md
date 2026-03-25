# F1 IntelliHub — Commands Reference

## First-Time Setup (build everything)

```powershell
# 1. Clone the repo
git clone https://github.com/Atharva0177/F1-IntelliHub.git
cd F1-IntelliHub

# 2. Build all Docker images
docker compose build

# 3. Start all containers
docker compose up -d

# 4. (Optional) Load historical F1 data into the database
#    Replace 2026 with any season year you want
docker compose run --rm loader python scripts/initial_data_load.py 2026 --sync
```

---

## Daily Start (containers already built)

```powershell
docker compose up -d
```

---

## Get the Public Cloudflare URL

```powershell
docker compose logs cloudflared 2>&1 | Select-String "trycloudflare"
```

The URL changes every restart. The site is also always available locally at http://localhost:3000.

---

## Stop Everything

```powershell
docker compose down
```

---

## Pull Latest Code from GitHub

```powershell
$env:GIT_LFS_SKIP_SMUDGE=1; git pull
```

After pulling, restart the affected services:

```powershell
# If frontend files changed
docker compose restart frontend

# If backend files changed (usually auto-reloads, but force it)
docker compose restart backend
```

---

## Force Recreate a Container (clears stale cache)

```powershell
# Frontend only
docker compose up -d --force-recreate frontend

# Backend only
docker compose up -d --force-recreate backend

# Everything
docker compose up -d --force-recreate
```

---

## View Logs

```powershell
# All services
docker compose logs -f

# Specific service
docker compose logs -f frontend
docker compose logs -f backend
docker compose logs -f cloudflared
```

---

## Rebuild After Dependency Changes (package.json / requirements.txt)

```powershell
docker compose build frontend
docker compose build backend
docker compose up -d --force-recreate frontend backend
```

---

## Database

```powershell
# Open psql shell
docker compose exec postgres psql -U f1user -d f1_intelligence_hub

# Check race counts per season
docker compose exec postgres psql -U f1user -d f1_intelligence_hub -c \
  "SELECT year, COUNT(*) as races FROM seasons JOIN races ON seasons.id = races.season_id GROUP BY year ORDER BY year;"

# Load data for a specific year
docker compose run --rm loader python scripts/initial_data_load.py 2025 --sync

# Preview deletion counts for one season (safe)
docker compose run --rm loader python scripts/delete_season_data.py 2025 --dry-run

# Delete one season (non-interactive)
docker compose run --rm loader python scripts/delete_season_data.py 2025 --yes
```

---

## Push Changes to GitHub

```powershell
$env:GIT_LFS_SKIP_SMUDGE=1
git add .
git commit -m "your message"
git push
```

---

## Check Container Status

```powershell
docker compose ps
```
