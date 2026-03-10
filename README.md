# F1 Intelligence Hub

A full-stack Formula 1 analytics platform that ingests official timing data via **FastF1**, stores it in **PostgreSQL / TimescaleDB**, serves it through a **FastAPI** backend, and displays it in a **Next.js 14** frontend. The site auto-refreshes every 30 s when new data is loaded into the database.

---

## Quick Start — New Device

The **only prerequisite is Docker Desktop** — no Python, conda, or Node.js needed on the new machine.

### Step 1 — On your current machine: back up the database

```powershell
.\scripts\backup.ps1
```

This creates `backups\f1_dump.sql`. Copy the `backups\` folder (and optionally `fastf1_cache\` to avoid re-downloading ~GB of session data) to the new machine alongside the repo.

### Step 2 — On the new machine: clone + run setup

```powershell
git clone <your-repo-url>
cd openf2

# Builds all Docker images, starts services, and offers to restore backup
.\setup.ps1
```

`setup.ps1` detects `backups\f1_dump.sql` and asks whether to restore it. Answer **y**.

### Step 3 — Done

| URL | Service |
|---|---|
| `http://localhost:3000` | Frontend |
| `http://localhost:8000` | Backend API |
| `http://localhost:8000/docs` | Interactive API docs |

> **No backup? Load fresh data — still entirely inside Docker:**
> ```powershell
> docker compose run --rm loader python scripts/initial_data_load.py 2026 --sync
> ```

---

## Table of Contents

1. [What It Does](#1-what-it-does)
2. [Architecture Overview](#2-architecture-overview)
3. [Project Structure](#3-project-structure)
4. [File-by-File Reference](#4-file-by-file-reference)
   - [Root](#root)
   - [Backend](#backend)
   - [Frontend](#frontend)
   - [Scripts](#scripts)
5. [Setup Guide](#5-setup-guide)
   - [Prerequisites](#prerequisites)
   - [Database](#database)
   - [Backend](#backend-1)
   - [Frontend](#frontend-1)
   - [Loading Data](#loading-data)
6. [CLI Reference — Data Loading](#6-cli-reference--data-loading)
7. [API Quick Reference](#7-api-quick-reference)
8. [Environment Variables](#8-environment-variables)
9. [Docker (optional)](#9-docker-optional)

---

## 1. What It Does

| Feature | Description |
|---|---|
| **Race Results** | Full grid results for every session (FP1–FP3, Q, Sprint, Race) across all loaded seasons |
| **Lap Times** | Per-lap sector times, tire compounds, pit-in/out markers for every driver |
| **Telemetry** | Fastest-lap speed, throttle, brake, gear, RPM, and DRS on a per-driver basis |
| **Track Dominance** | Side-by-side driver telemetry overlay on a 2-D circuit map |
| **Race Replay** | Animated lap-by-lap position replay with a DRS zone overlay |
| **Strategy** | Stint breakdown, tire compound usage, pit stop timing |
| **Standings** | Driver and constructor championship standings with a historical podium view |
| **Drivers & Teams** | Profile pages for every driver and constructor with per-season stats |
| **Analytics** | Season-level points, wins, and consistency charts |
| **Weather** | Track/air temperature and humidity per session |
| **Race Control** | Flags, safety cars, and steward decisions per session |
| **Auto-refresh** | The frontend polls `/api/races/data-version` every 30 s and refetches data automatically when the DB changes |

---

## 2. Architecture Overview

```
FastF1 library
     │  fetches from F1 live-timing + Jolpi.ca Ergast mirror
     ▼
scripts/initial_data_load.py   ← one-shot or --sync runs
     │  bulk-inserts via SQLAlchemy
     ▼
PostgreSQL 14 + TimescaleDB    ← telemetry_data is a hypertable
     │
     ▼
FastAPI (backend/main.py)      ← uvicorn, port 8000
     │  /api/* REST endpoints
     ▼
Next.js 14 (frontend/)         ← port 3000
     ├── polls /api/races/data-version every 30 s
     └── all pages are 'use client' + useEffect data-fetching
```

**Data flow summary:**
1. Run the load script once per season/race.
2. FastF1 downloads and caches raw session data (`.ff1pkl` files) in `fastf1_cache/`.
3. The script processes and bulk-inserts into Postgres.
4. FastAPI exposes the data over a REST API.
5. Next.js renders it; the `useDataVersion` hook triggers automatic page refetches when new data arrives.

---

## 3. Project Structure

```
openf2/
├── docker-compose.yml          # Single-command Docker stack
├── README.md                   # This file
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── main.py                 # FastAPI app entry point
│   ├── api/
│   │   └── routes/
│   │       ├── analytics.py
│   │       ├── circuits.py
│   │       ├── constructors.py
│   │       ├── drivers.py
│   │       ├── h2h.py
│   │       ├── race_control.py
│   │       ├── races.py        # Also contains /data-version endpoint
│   │       ├── session_status.py
│   │       ├── sessions.py
│   │       ├── standings.py
│   │       ├── telemetry.py
│   │       └── weather.py
│   ├── data_pipeline/
│   │   ├── data_processor.py
│   │   ├── db_operations.py
│   │   └── fastf1_client.py
│   └── database/
│       ├── config.py
│       ├── models.py
│       └── schemas.sql
│
├── frontend/
│   ├── Dockerfile
│   ├── next.config.js
│   ├── package.json
│   ├── tailwind.config.js
│   ├── public/
│   │   ├── circuits/           # Auto-generated circuit coordinate JSON files
│   │   ├── races/              # Race hero images
│   │   └── team-cars/          # Team livery images
│   └── src/
│       ├── app/
│       │   ├── page.tsx               # Home / dashboard
│       │   ├── races/page.tsx         # Season race list
│       │   ├── races/[raceId]/
│       │   │   ├── page.tsx           # Race detail (results, laps, replay, strategy)
│       │   │   └── RaceReplay.tsx     # Animated replay component
│       │   ├── standings/page.tsx
│       │   ├── drivers/page.tsx
│       │   ├── teams/page.tsx
│       │   ├── teams/[teamId]/page.tsx
│       │   └── analytics/page.tsx
│       ├── components/
│       │   ├── Layout/Navbar.tsx
│       │   ├── RaceControl/
│       │   ├── Session/
│       │   ├── Tabs/
│       │   ├── TrackMap/
│       │   └── Weather/
│       ├── lib/
│       │   ├── api.ts              # Axios client + all API methods
│       │   ├── useDataVersion.ts   # 30-s polling hook for auto-refresh
│       │   ├── circuitLayouts.ts   # Static circuit layout metadata
│       │   └── driverImages.ts     # Driver headshot URL helpers
│       └── types/index.ts          # Shared TypeScript interfaces
│
├── scripts/
│   ├── initial_data_load.py    # Main data ingestion script
│   ├── recreate_database.py    # Drop + recreate all tables
│   ├── generate_circuit_coords.py  # Standalone circuit JSON generator
│   ├── generate_circuit_svgs.py    # Generate SVG circuit outlines
│   ├── backup.ps1              # Dump DB → backups\f1_dump.sql
│   └── restore.ps1             # Restore DB from backups\f1_dump.sql
│
├── setup.ps1                   # One-command new-device bootstrap
├── .env.example                # Environment variable template
│
└── fastf1_cache/               # FastF1 local cache (gitignored)
    ├── 2018/
    ├── 2021/
    └── 2026/
```

---

## 4. File-by-File Reference

### Root

| File | Purpose |
|---|---|
| `docker-compose.yml` | Defines three services: `postgres` (TimescaleDB), `backend` (FastAPI), `frontend` (Next.js). All wired together on a private `f1_network`. |
| `README.md` | This document. |

---

### Backend

#### `backend/main.py`
FastAPI application entry point. Configures CORS (reads allowed origins from `CORS_ORIGINS` env var), registers all route modules under `/api/*`, and calls `init_db()` on startup to create any missing tables.

#### `backend/requirements.txt`
Python dependencies for the backend. Key packages:
- `fastapi` + `uvicorn` — web framework and ASGI server
- `sqlalchemy` + `psycopg2-binary` — ORM and PostgreSQL driver
- `fastf1==3.8.1` — official F1 timing data library
- `pandas` + `numpy` — data processing
- `python-dotenv` — `.env` file loading

#### `backend/database/config.py`
Creates the SQLAlchemy `engine` and `SessionLocal` from the `DATABASE_URL` environment variable. Also exports the `Base` metaclass used by all models, an `init_db()` helper that calls `Base.metadata.create_all()`, and a FastAPI `get_db()` dependency that yields a session and closes it afterwards.

#### `backend/database/models.py`
SQLAlchemy ORM models, one class per database table:

| Model | Table | Description |
|---|---|---|
| `Season` | `seasons` | Year identifier; parent of all race data |
| `Circuit` | `circuits` | Track name, country, GPS coordinates, length |
| `Driver` | `drivers` | 3-letter code, number, name, nationality |
| `Team` | `teams` | Constructor name and nationality |
| `Race` | `races` | Round number, date, links to Season + Circuit |
| `Session` | `sessions` | FP1/FP2/FP3/Q/Sprint/Race; child of Race |
| `LapTime` | `lap_times` | Per-lap sector times, tire compound, track status |
| `TelemetryData` | `telemetry_data` | Timestamp-keyed speed/throttle/brake/gear/DRS/XYZ. TimescaleDB hypertable. |
| `PositionData` | `position_data` | Downsampled XYZ for track map animation |
| `PitStop` | `pit_stops` | Pit lap, duration |
| `Result` | `results` | Final classification; `is_sprint` flag separates Sprint results |
| `Qualifying` | `qualifying` | Q1/Q2/Q3 times per driver |
| `WeatherData` | `weather_data` | Air/track temp, humidity, rainfall flag per timestamp |
| `RaceControlMessage` | `race_control_messages` | Flag, category, message text |
| `SessionStatus` | `session_status` | Session state transitions (started, red flag, etc.) |

#### `backend/database/schemas.sql`
Raw SQL that sets up the TimescaleDB hypertable on `telemetry_data` and creates composite indexes. Run automatically by the Docker `init.sql` entrypoint.

#### `backend/data_pipeline/fastf1_client.py`
Thin wrapper around the `fastf1` library. On init it:
- Redirects the Ergast API calls to the `jolpi.ca` mirror (original ergast.com is retired)
- Enables the local disk cache (`fastf1_cache/`)

Key methods: `get_event_schedule(year)`, `get_session(year, round, type)`, `get_lap_data(session)`, `get_driver_list(session)`, `get_weather_data(session)`.

Also exports `get_telemetry_safe(lap)` — a helper that pre-casts position columns to `float64` before FastF1's internal merge to suppress dtype-mismatch warnings.

#### `backend/data_pipeline/data_processor.py`
Static methods that transform raw FastF1 DataFrames into lists of plain dicts ready for DB insertion:
- `process_lap_data(laps)` — maps FastF1 lap columns to `LapTime` fields
- `process_telemetry_data(telemetry, driver_code, lap_number, session_start)` — maps car data + position columns
- `process_weather_data(weather, session_start)` — maps weather columns
- `process_race_control_messages(session, session_start)` — extracts race_control DataFrame
- `process_session_status(session, session_start)` — extracts session_status DataFrame

#### `backend/data_pipeline/db_operations.py`
`DatabaseOperations` class (takes a `db` session in its constructor). Provides:
- `get_or_create_season/circuit/driver/team/race/session` — upsert helpers, safe to call repeatedly
- `bulk_insert_lap_times(processed_laps, db_session)` — skips entire session if lap data already exists (idempotent)
- `bulk_insert_telemetry(processed_telemetry, db_session)` — skips per-driver if telemetry already loaded (idempotent)
- `bulk_insert_weather`, `bulk_insert_race_control_messages`, `bulk_insert_session_status`

#### `backend/api/routes/races.py`
Largest route file. Endpoints under `/api/races/`:

| Method + Path | Description |
|---|---|
| `GET /seasons` | List all years with data |
| `GET /` | All races (optionally filtered by `?season=`) |
| `GET /calendar/{year}` | Season calendar including future rounds |
| `GET /{raceId}` | Race detail with full result grid |
| `GET /{raceId}/sessions` | List sessions for a race |
| `GET /{raceId}/lap-times` | Lap times (optional `?driver_code=`) |
| `GET /{raceId}/positions` | Position-over-lap data for chart |
| `GET /{raceId}/replay-data` | Laps + driver metadata for animated replay |
| `GET /{raceId}/drs-telemetry` | DRS zone boundaries + per-driver distance arrays |
| `GET /data-version` | Returns `{"version": N}` (max session/result ID) used by the frontend auto-refresh hook |

#### `backend/api/routes/drivers.py`
`GET /api/drivers` (list, filterable by `?season=`), `GET /api/drivers/{id}` (profile with career stats), `GET /api/drivers/{id}/results`, `GET /api/drivers/{id1}/compare/{id2}`.

#### `backend/api/routes/standings.py`
`GET /api/standings/{year}/drivers`, `GET /api/standings/{year}/constructors`. Both accept an optional `?round=` to get standings at a specific point in the season.

#### `backend/api/routes/constructors.py`
`GET /api/constructors` (all teams), `GET /api/constructors/{id}` (detail + race results for a given `?season=`).

#### `backend/api/routes/sessions.py`
`GET /api/sessions/{sessionId}/results`, `GET /api/sessions/{sessionId}/lap-times`.

#### `backend/api/routes/telemetry.py`
`GET /api/telemetry/{sessionId}` — returns telemetry points, filterable by `driver_code` and `lap_number`. `GET /api/telemetry/track/{circuitId}` — returns XY track coordinates.

#### `backend/api/routes/analytics.py`
`GET /api/analytics/pace-analysis`, `/tire-strategies`, `/sector-times` — all require a `?session_id=` parameter.

#### `backend/api/routes/weather.py`
`GET /api/weather/{sessionId}`, `GET /api/weather/{sessionId}/summary`.

#### `backend/api/routes/race_control.py`
`GET /api/race-control/{sessionId}` — returns race control messages (flags, SC, VSC).

#### `backend/api/routes/session_status.py`
`GET /api/session-status/{sessionId}`.

#### `backend/api/routes/circuits.py`
`GET /api/circuits`, `GET /api/circuits/{id}`, `GET /api/circuits/{id}/history`.

#### `backend/api/routes/h2h.py`
`GET /api/h2h/{driverId1}/{driverId2}` — head-to-head comparison with optional `?season=`.

---

### Frontend

#### `frontend/src/lib/api.ts`
Axios instance (`baseURL = NEXT_PUBLIC_API_URL || http://localhost:8000`) plus a typed `api` object exposing every backend endpoint as an async method. All other files import from here — never use raw `axios` elsewhere.

#### `frontend/src/lib/useDataVersion.ts`
React hook that polls `GET /api/races/data-version` every 30 seconds. Returns a `refreshKey` integer. When the backend version increases (i.e., new data was loaded), `refreshKey` increments, which is used as a dependency in every page's data-fetching `useEffect` to trigger automatic refetches without a page reload.

#### `frontend/src/lib/circuitLayouts.ts`
Auto-generated TypeScript file mapping circuit names to normalized SVG path strings (1000×1000 viewport) plus metadata (round, country, location). Updated automatically by `scripts/initial_data_load.py` whenever a new Race session is processed. Used by the `TrackMap` components for static circuit outline rendering.

#### `frontend/src/lib/driverImages.ts`
Generates ordered lists of candidate headshot URLs per driver code. The UI tries each URL in sequence and falls back to a placeholder.

#### `frontend/src/types/index.ts`
All TypeScript interfaces shared across the app: `Race`, `RaceDetail`, `Driver`, `Session`, `LapTime`, `TelemetryPoint`, `DriverStanding`, `ConstructorStanding`, `CalendarRound`, `ConstructorDetail`, `H2HResponse`, `CircuitGuide`, etc.

#### `frontend/src/app/layout.tsx`
Root layout: wraps all pages with the `Navbar` and applies global CSS / font imports.

#### `frontend/src/app/page.tsx` — **Home**
Animated stats counter (total races, drivers) + recent race cards + driver spotlight grid. Fetches seasons → races + drivers for the latest year. Wired to `useDataVersion`.

#### `frontend/src/app/races/page.tsx` — **Season Race List**
Season selector (from URL `?season=`). Grid of race cards with circuit map previews, dates, and winner badges. Wired to `useDataVersion`.

#### `frontend/src/app/races/[raceId]/page.tsx` — **Race Detail**
Tabbed interface:
- **Results** — full starting grid / finishing order table
- **Sessions** — per-session result tables (Q1/Q2/Q3, Sprint, FP)
- **Positions** — lap-by-lap position chart (Recharts `LineChart`)
- **Lap Times** — stacked lap time chart per selected driver
- **Strategy** — stint/tire compound breakdown + pit stop timeline
- **Replay** — animated race replay (delegates to `RaceReplay.tsx`)
- **Track Dominance** — telemetry comparison overlay on the circuit map
- **Weather** — temperature + humidity timeline
- **Race Control** — chronological flag/message feed

#### `frontend/src/app/races/[raceId]/RaceReplay.tsx` — **Race Replay Component**
Stateful component that animates driver positions along the circuit path using `requestAnimationFrame`. Uses the `/replay-data` and `/drs-telemetry` API responses. Shows a feature card overlay with real-time speed, gear, throttle, brake, and DRS status when telemetry is available.

#### `frontend/src/app/standings/page.tsx` — **Championship Standings**
Podium display (P1 centre, P2 left, P3 right) + horizontal bar chart for the full field. Toggle between Drivers and Constructors. Season selector. Wired to `useDataVersion`.

#### `frontend/src/app/drivers/page.tsx` — **Driver Roster**
Season-filtered grid of driver cards sorted by points. Search bar. Links to individual driver pages. Wired to `useDataVersion`.

#### `frontend/src/app/teams/page.tsx` — **Constructor Roster**
Season-filtered team cards with driver line-ups and team colours. Links to individual team pages. Wired to `useDataVersion`.

#### `frontend/src/app/teams/[teamId]/page.tsx` — **Team Detail**
Constructor profile with race results, driver comparison, and per-season stats. Wired to `useDataVersion`.

#### `frontend/src/app/analytics/page.tsx` — **Analytics**
Season-level bar charts: team points, driver points, wins by driver. Filterable by season via URL param. Wired to `useDataVersion`.

#### `frontend/src/components/Layout/Navbar.tsx`
Top navigation bar with links to all main sections, a season indicator, and responsive mobile menu.

#### `frontend/src/components/TrackMap/`
SVG-based 2-D circuit map used in the race detail and replay views.

#### `frontend/src/components/Weather/`
Weather timeline chart component (temperature + humidity mini-chart).

#### `frontend/src/components/RaceControl/`
Chronological race control message list with colour-coded flag indicators.

#### `frontend/src/components/Session/`
Session tab selector and session result table components.

#### `frontend/src/components/Tabs/`
Generic accessible tab strip used across the race detail page.

#### `frontend/public/circuits/`
Auto-generated JSON files (one per circuit) containing `x`, `y`, `corners`, `rotation`, and `name` fields (rotated XY for the live replay map). Created by `scripts/initial_data_load.py` when a Race session is first processed, or by running `scripts/generate_circuit_coords.py` standalone.

---

### Scripts

#### `scripts/initial_data_load.py` — **Primary data ingestion tool**

Loads a full F1 season (or a specific round range) into the database. All operations are idempotent — safe to re-run.

```
python scripts/initial_data_load.py [year] [options]
```

Per session it loads: results, lap times, telemetry (fastest lap per driver), weather, race control messages, and session status. For each Race session it also generates `public/circuits/<slug>.json` (rotated XY coordinates for the live map) and upserts the normalized SVG path into `src/lib/circuitLayouts.ts` (used by the static track display) — both only when they don't already exist.

See [Section 6](#6-cli-reference--data-loading) for all flags.

#### `scripts/recreate_database.py`
Drops **all** tables (with `CASCADE`) and recreates them from the SQLAlchemy models. Use when you need a clean slate.

```
python scripts/recreate_database.py
```

> ⚠️ This is destructive. All data will be lost.

#### `scripts/generate_circuit_coords.py`
Standalone script to regenerate a single circuit's coordinate JSON from FastF1 telemetry data. Useful if a specific circuit file is missing or corrupted without re-running a full data load.

```python
from scripts.generate_circuit_coords import extract_circuit_coords
extract_circuit_coords(2021, 1, "Bahrain Grand Prix")
```

#### `scripts/generate_circuit_svgs.py`
Standalone utility that regenerates the full `src/lib/circuitLayouts.ts` file for an entire season in one pass. SVG generation is now also integrated into `initial_data_load.py` (runs automatically per race during a normal load); use this script only if you need to bulk-regenerate all SVG layouts independently of a data load.

#### `scripts/backup.ps1` — **Database backup**
Dumps the running `f1_postgres` container to `backups\f1_dump.sql` (plus a timestamped copy). Also reports `fastf1_cache` size so you know whether to copy it.

```powershell
.\scripts\backup.ps1
```

#### `scripts/restore.ps1` — **Database restore**
Restores `backups\f1_dump.sql` (or a custom file via `-File`) into the running `f1_postgres` container.

```powershell
.\scripts\restore.ps1
# or: .\scripts\restore.ps1 -File backups\f1_dump_2026-03-10.sql
```

#### `setup.ps1` — **New-device bootstrap**
One-command setup for a freshly cloned repo. Creates `.env`, starts Docker Compose, and offers to restore a database backup if one is present in `backups\`.

```powershell
.\setup.ps1
```

---

## 5. Setup Guide

### Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Python | 3.11+ | Use a Conda environment (recommended) |
| Node.js | 18+ | LTS version recommended |
| PostgreSQL | 14+ | With TimescaleDB extension installed |
| FastF1 | 3.8.1 | Must be installed in the Python env used for data loading |

### Database

1. **Install TimescaleDB** following the [official guide](https://docs.timescale.com/self-hosted/latest/install/) for your OS, or use Docker (see [Section 9](#9-docker-optional)).

2. **Create the database and user:**
   ```sql
   CREATE USER f1user WITH PASSWORD 'f1password';
   CREATE DATABASE f1_intelligence_hub OWNER f1user;
   \c f1_intelligence_hub
   CREATE EXTENSION IF NOT EXISTS timescaledb;
   ```

3. The application creates tables automatically on first start via `init_db()`. The `schemas.sql` file sets up the TimescaleDB hypertable and indexes; if using Docker this runs automatically via the `init.sql` entrypoint.

### Backend

1. **Create and activate a Conda environment (recommended):**
   ```bash
   conda create -n f1 python=3.12
   conda activate f1
   ```

2. **Install dependencies:**
   ```bash
   pip install -r backend/requirements.txt
   ```

3. **Configure environment variables.** Create a `.env` file in the project root (or in `backend/`):
   ```env
   DATABASE_URL=postgresql://f1user:f1password@localhost:5432/f1_intelligence_hub
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=f1_intelligence_hub
   DB_USER=f1user
   DB_PASSWORD=f1password
   FASTF1_CACHE_DIR=./fastf1_cache
   CORS_ORIGINS=http://localhost:3000
   ```

4. **Start the backend:**
   ```bash
   cd backend
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```
   API docs available at `http://localhost:8000/docs`.

### Frontend

1. **Install Node dependencies:**
   ```bash
   cd frontend
   npm install
   ```

2. **Configure the API URL** (optional — defaults to `http://localhost:8000`):
   ```env
   # frontend/.env.local
   NEXT_PUBLIC_API_URL=http://localhost:8000
   ```

3. **Start the dev server:**
   ```bash
   npm run dev
   ```
   Opens at `http://localhost:3000`.

### Loading Data

With the backend running and database ready, load one or more seasons:

```bash
# Activate the conda env first
conda activate f1

# Full load — current year (auto-detected)
python scripts/initial_data_load.py

# Full load — specific year
python scripts/initial_data_load.py 2021

# Sync — inspects DB and loads only what is missing
python scripts/initial_data_load.py 2026 --sync

# Load a specific round only
python scripts/initial_data_load.py 2021 --from-round 1 --to-round 1

# Backfill telemetry only (results + laps already in DB)
python scripts/initial_data_load.py 2021 --telemetry-only --skip-circuits
```

FastF1 downloads and caches raw session files in `fastf1_cache/`. A full season load (all sessions, all data types) takes roughly 20–60 minutes depending on internet speed; subsequent runs are much faster since cached files are reused.

---

## 6. CLI Reference — Data Loading

```
python scripts/initial_data_load.py [year] [options]
```

| Argument / Flag | Default | Description |
|---|---|---|
| `year` (positional) | current year | Season to load (e.g. `2021`, `2026`) |
| `--from-round N` | `1` | Skip rounds before N (resume interrupted load) |
| `--to-round N` | all | Stop after round N |
| `--results-only` | off | Load Race results only — skip laps, telemetry, weather, messages |
| `--telemetry-only` | off | Load Race telemetry only — sessions must already exist in DB |
| `--skip-circuits` | off | Skip generating `public/circuits/*.json` coordinate files and skip updating `circuitLayouts.ts` SVG paths |
| `--sync` | off | Smart sync: inspect DB per round and load only what is missing |

The `--sync` flag is the recommended way to keep data current. It classifies each completed round as:
- **FULL** — no results or no laps → runs a full load for that round
- **TELEM_ONLY** — results + laps present but no telemetry → telemetry backfill only
- **COMPLETE** — all data present → skip

All inserts are idempotent; re-running will not create duplicates.

---

## 7. API Quick Reference

Base URL: `http://localhost:8000`

| Endpoint | Description |
|---|---|
| `GET /api/races/seasons` | Available season years |
| `GET /api/races?season=2026` | All races for a season |
| `GET /api/races/calendar/{year}` | Full calendar including future rounds |
| `GET /api/races/{id}` | Race detail + grid results |
| `GET /api/races/{id}/sessions` | Sessions for a race |
| `GET /api/races/{id}/lap-times` | Lap times (optional `?driver_code=`) |
| `GET /api/races/{id}/positions` | Lap-by-lap positions for chart |
| `GET /api/races/{id}/replay-data` | Replay laps + driver metadata |
| `GET /api/races/{id}/drs-telemetry` | DRS zones + telemetry arrays |
| `GET /api/races/data-version` | `{"version": N}` — DB change fingerprint |
| `GET /api/drivers?season=2026` | Driver list for season |
| `GET /api/drivers/{id}/results` | Driver race results |
| `GET /api/standings/{year}/drivers` | Driver championship |
| `GET /api/standings/{year}/constructors` | Constructor championship |
| `GET /api/sessions/{id}/results` | Session classification |
| `GET /api/sessions/{id}/lap-times` | Session lap times |
| `GET /api/telemetry/{sessionId}` | Telemetry points |
| `GET /api/analytics/pace-analysis?session_id=` | Pace stats |
| `GET /api/analytics/tire-strategies?session_id=` | Stint analysis |
| `GET /api/circuits` | All circuits |
| `GET /api/constructors/{id}?season=2026` | Team detail + season results |
| `GET /api/h2h/{id1}/{id2}?season=2026` | Head-to-head comparison |
| `GET /api/weather/{sessionId}/summary` | Weather summary |
| `GET /api/race-control/{sessionId}` | Race control messages |

Full interactive docs: `http://localhost:8000/docs`

---

## 8. Environment Variables

| Variable | Default | Required | Description |
|---|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:0708@localhost:5432/f1_intelligence_hub` | ✅ | Full Postgres connection string |
| `DB_HOST` | `localhost` | | Postgres host (used by Docker) |
| `DB_PORT` | `5432` | | Postgres port |
| `DB_NAME` | `f1_intelligence_hub` | | Database name |
| `DB_USER` | `postgres` | | Database user |
| `DB_PASSWORD` | — | ✅ | Database password |
| `FASTF1_CACHE_DIR` | `./fastf1_cache` | | Path for FastF1 local cache |
| `CORS_ORIGINS` | `http://localhost:3000` | | Comma-separated allowed origins |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | | API base URL (frontend env var) |

---

## 9. Docker — Full Stack (no local tools required)

The entire project runs in Docker. **Docker Desktop is the only prerequisite** — no Python, conda, or Node.js installation needed on the host machine.

### Services

| Service | Image | Port | Description |
|---|---|---|---|
| `postgres` | `timescale/timescaledb:latest-pg14` | 5432 | Database |
| `backend` | built from `backend/Dockerfile` | 8000 | FastAPI (uvicorn) |
| `frontend` | built from `frontend/Dockerfile` | 3000 | Next.js dev server |
| `loader` | built from `Dockerfile.loader` | — | Data ingestion (run-once) |

### Start / stop

```bash
# Build images and start postgres + backend + frontend
docker compose up -d --build

# View logs
docker compose logs -f backend
docker compose logs -f frontend

# Stop everything (data persists in the postgres_data volume)
docker compose down
```

### Load data (all inside Docker — no conda needed)

```bash
# First-time full load for a season
docker compose run --rm loader python scripts/initial_data_load.py 2026

# Smart sync — only loads what is missing
docker compose run --rm loader python scripts/initial_data_load.py 2026 --sync

# Specific round only
docker compose run --rm loader python scripts/initial_data_load.py 2026 --from-round 3 --to-round 3
```

The loader writes `public/circuits/*.json` and `src/lib/circuitLayouts.ts` back to the host via bind mounts, and caches all FastF1 session data in `fastf1_cache/`.

### Rebuild after code changes

```bash
# Rebuild just the loader (e.g. after editing a script)
docker compose build loader

# Rebuild everything
docker compose build
```

