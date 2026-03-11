# 🏎️ F1 Intelligence Hub - Ultimate Analytics Platform

<div align="center">
  <img src="docs/images/home.png" alt="F1 Intelligence Hub - Home Dashboard" width="100%" style="border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.5);">
  <p><i>The F1 IntelliHub Home Dashboard featuring live stats, recent races, and a driver spotlight.</i></p>
</div>

**F1 Intelligence Hub** is an advanced, full-stack predictive and analytical platform explicitly engineered to harvest, store, and visualize official Formula 1 timing data, telemetry, and race control information. Built using **FastF1, PostgreSQL, TimescaleDB, FastAPI, and Next.js 14**, this platform processes high-frequency telemetry sequences into interactive, dynamic frontend visualizations.

This documentation serves as an extremely exhaustive guide designed to explain the **exact purpose, inner workings, and flow** of every single component within the repository, alongside a complete visual tour of the platform.

---

## 📸 Platform Tour & Features

### 1. The Race Hub & Deep Analytics
The platform provides an unparalleled look into every single race of the season. 

<div align="center">
  <img src="docs/images/races.png" alt="Season Races Overview" width="100%" style="border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.5);">
  <p><i>The <b>Season Races Hub</b>: A grid view of the entire calendar. Each card highlights the circuit layout outline, date, location, and the winner of the Grand Prix. Top-right filters allow sorting by season year.</i></p>
</div>

Inside a specific Race Detail page, you have access to multiple deeply analytical tabs:

<div align="center">
  <img src="docs/images/race_card1.png" alt="Race Results Grid" width="49%" style="display:inline-block; border-radius: 8px; margin-right: 1%;">
  <img src="docs/images/race_card2.png" alt="Lap-by-Lap Positions" width="49%" style="display:inline-block; border-radius: 8px;">
</div>
<p><i><b>Left (Results):</b> The finalized classification grid showing finishing positions, point allocations, time gaps, and fastest laps. <b>Right (Lap-by-Lap Chart):</b> A responsive Recharts line graph tracking every driver's precise position across the entire race duration. Hovering over a lap reveals exact track context and overtakes.</i></p>

<div align="center">
  <img src="docs/images/race_card3.png" alt="Track Dominance & Telemetry" width="49%" style="display:inline-block; border-radius: 8px; margin-right: 1%;">
  <img src="docs/images/race_card4.png" alt="Live Race Replay Engine" width="49%" style="display:inline-block; border-radius: 8px;">
</div>
<p><i><b>Left (Track Dominance):</b> Real-time telemetry overlay on the 2D circuit map. Glowing neon segments indicate precise braking, throttle, and top-speed zones per driver. <b>Right (Live Race Replay):</b> An advanced engine utilizing <code>requestAnimationFrame</code>. It physically animates driver "dots" along the SVG track path, simulating the race live alongside rolling DRS activation zones.</i></p>


<div align="center">
  <img src="docs/images/race_card5.png" alt="Tire Strategy & Pit Stops" width="49%" style="display:inline-block; border-radius: 8px; margin-right: 1%;">
  <img src="docs/images/race_card6.png" alt="Sector Times" width="49%" style="display:inline-block; border-radius: 8px;">
</div>
<p><i><b>Left (Tire Strategy):</b> A detailed timeline showing precisely which tire compounds (Soft/Medium/Hard/Inter/Wet) were used, stint lengths, and pit-stop durations. <b>Right (Sector Pace):</b> Comparative sector time analysis broken down into micro-sectors, allowing clear identification of where drivers lost or gained time.</i></p>

<div align="center">
  <img src="docs/images/race_card7.png" alt="Weather Timeline" width="49%" style="display:inline-block; border-radius: 8px; margin-right: 1%;">
  <img src="docs/images/race_card8.png" alt="Race Control & Flags" width="49%" style="display:inline-block; border-radius: 8px;">
</div>
<p><i><b>Left (Weather):</b> A session-long environmental timeline charting track temperature, air temperature, and humidity percentages. <b>Right (Race Control):</b> A chronological, searchable feed of official FIA steward messages, flagging incidents, safety cars, and penalties as they occurred.</i></p>

#### Qualifying Details
<div align="center">
  <img src="docs/images/quali_card1.png" alt="Qualifying Results" width="49%" style="display:inline-block; border-radius: 8px; margin-right: 1%;">
  <img src="docs/images/quali_card2.png" alt="Q1, Q2, Q3 Time Breakdown" width="49%" style="display:inline-block; border-radius: 8px;">
</div>
<p><i>A distinct breakdown of the Qualifying shootout structure. Evaluates who was knocked out in Q1 vs Q2, alongside the dominant pole-lap times constructed in Q3.</i></p>

---

### 2. Championship Standings
View the ongoing war for the Driver and Constructor championships.

<div align="center">
  <img src="docs/images/standings.png" alt="Standings Overview" width="100%" style="border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.5);">
  <p><i><b>The Championship Hub:</b> Featuring an automatically generated top-3 podium graphic derived from point totals, followed by a total-field horizontal bar chart. You can seamlessly toggle views between Drivers and Constructors standings for any historic year.</i></p>
</div>
<br>
<div align="center">
  <img src="docs/images/driver_standings.png" alt="Driver Standings Table" width="49%" style="display:inline-block; border-radius: 8px; margin-right: 1%;">
  <img src="docs/images/team_standings.png" alt="Team Standings Table" width="49%" style="display:inline-block; border-radius: 8px;">
</div>
<p><i>The raw tabulated standings list calculating accrued points per race, sorted descending. Shows driver profiles alongside their current constructor associations.</i></p>

---

### 3. Drivers & Constructor Profiles
Dedicated hubs for every single entity on the grid.

<div align="center">
  <img src="docs/images/drivers.png" alt="Drivers Roster" width="49%" style="display:inline-block; border-radius: 8px; margin-right: 1%;">
  <img src="docs/images/driver_card.png" alt="Driver Profile Detail" width="49%" style="display:inline-block; border-radius: 8px;">
</div>
<p><i><b>Left (Driver Roster):</b> A filterable, scannable grid showcasing every driver in a given season, styled with their official headshots. <b>Right (Profile Focus):</b> Deep-dives into an individual driver's career stats, accumulated points across seasons, and head-to-head ratios against teammates.</i></p>

<div align="center">
  <img src="docs/images/teams.png" alt="Constructors Roster" width="49%" style="display:inline-block; border-radius: 8px; margin-right: 1%;">
  <img src="docs/images/team_card.png" alt="Team Profile Detail" width="49%" style="display:inline-block; border-radius: 8px;">
</div>
<p><i><b>Left (Constructors):</b> Team-colored cards displaying the full constructor line up and current point tallies. <b>Right (Team Profile):</b> Highlights the official team machine (livery), historical race outcomes, and the direct performance comparison between their two drivers.</i></p>

---

### 4. Season Analytics
<div align="center">
  <img src="docs/images/analytics.png" alt="Global Season Analytics" width="100%" style="border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.5);">
  <p><i><b>The Command Center Analytic Dash:</b> An immersive top-level view comparing global metrics. Here you witness macro-trends like absolute team dominance (points ratios), season win distributions among drivers, and comparative reliability scores via vast Recharts visual graphs.</i></p>
</div>

---

## 🧭 1. What is the Project Flow?

The F1 IntelliHub architecture operates as a robust, decoupled pipeline, cleanly separating ingestion, storage, API serving, and client-side rendering.

1. **Data Ingestion (The Loader)**: Utilizing the Python `fastf1` library, the backend scripts parse and digest high-frequency data files (`.ff1pkl`) directly from live-timing caches or the Jolpi.ca F1 Ergast API mirror.
2. **Data Transformation & Aggregation**: Raw pandas DataFrames are converted into standard Python dictionaries and lists. Positional variables, vectors, and floating-point errors are safely pre-cast.
3. **Database Population (The Store)**: The data is aggressively bulk-inserted into a **PostgreSQL 14** database. Crucially, raw telemetry time-series points (speed, throttle, brake, gear, RPM, DRS, XYZ coordinates) are written into a **TimescaleDB hypertable**, allowing for rapid query aggregations over millions of rows.
4. **Backend API (The Engine)**: A **FastAPI** application connects to this PostgreSQL instance via SQLAlchemy. It acts as the gatekeeper, serving strictly typed JSON responses (validated via Pydantic) to the frontend.
5. **Frontend Rendering (The Interface)**: A globally distributed **Next.js 14** application fetches from these REST endpoints and uses specialized libraries (like Recharts) to draw lap-time charts, SVG circuit maps, interactive race replays, and rich driver dashboards.
6. **Live Auto-Refresh Mechanism**: To provide a live-feel, the frontend polls `/api/races/data-version` every 30 seconds. If the backend reports an increased version identifier (triggered by new ingestion), the frontend invalidates its cache and naturally fetches the newly available race data.

---

## 🏗️ 2. Extensive Architecture Breakdown

### The Backend Ecosystem (Python / FastAPI / Postgres)
The core of the data lies in `backend/database/models.py`. The design mimics a highly normalized relational model bounded by large time-series telemetry dumps:
- `Season` holds `Race` events.
- `Race` holds `Session` entities (e.g., FP1, FP2, Qualifying, Sprint, Race).
- Each `Session` triggers thousands of nested entries: `LapTime`, `Result`, `PitStop`, `WeatherData`, and `RaceControlMessage`.
- `TelemetryData` tracks every microsecond movement of every car on track (often netting hundreds of thousands of rows per race). This is managed by TimescaleDB to stop standard Postgres B-Trees from degrading.

### The Frontend Ecosystem (React / Next.js 14 / Tailwind)
Built to look modern, dark, and sleek, using Next.js App Router.
- The UI uses TailwindCSS for responsive layouts and glassmorphism.
- Charts and data are displayed heavily relying on explicit APIs `useDataVersion` for state checking.
- The `RaceReplay` engine explicitly calculates SVG boundaries and animates div markers simulating cars based on `PositionData` downsampled chunks.

### Infrastructure & Containerization
The whole application requires strictly zero local dependencies natively other than Docker.
`docker-compose.yml` ties together:
1. `postgres` (TimescaleDB)
2. `backend` (FastAPI)
3. `frontend` (Next.js)
4. `loader` (Ephemeral Python instance triggered manually to sync new data)

---

## 📂 3. Exact File-by-File Technical Dictionary

### 📁 Root Directory
- **`docker-compose.yml`**: Defines the virtual network `f1_network`. Manages volume mapping for `postgres_data` and binds the frontend and backend ports explicitly.
- **`setup.ps1`**: A convenience PowerShell script for Windows users. It initializes Docker, builds the images, and creates the default `.env` environment.
- **`README.md`**: This exact comprehensive file.
- **`COMMANDS.md`**: Specialized local developer commands reference.

### 📁 `backend/` Directory (The API)
This folder is purely dedicated to Python code.

- **`main.py`**: The top-level FastAPI bootstrap. It loads `.env`, initiates CORS middleware (Crucial for the Next.js port 3000 to interact with Port 8000), maps all routing modules from `api/routes`, and calls `init_db()` to auto-migrate.
- **`requirements.txt`**: Pinned Python dependencies. Main packages: `fastapi`, `uvicorn`, `sqlalchemy`, `fastf1`, `pandas`, `psycopg2-binary`.

#### 📂 `backend/database/` (ORM & Storage logic)
- **`config.py`**: Sets up `sqlalchemy.create_engine` linking to PostgreSQL. Creates the declarative base `Base` used across the app. Contains `get_db` generator for HTTP dependency injection.
- **`models.py`**: Absolute core DB schemas mapped to Python objects. Contains classes like `Circuit`, `Driver`, `Team`, `Race`, `Session`, `LapTime`, and the massive `TelemetryData`.
- **`schemas.sql`**: Native SQL script. Crucial function: Converts the `telemetry_data` table into a TimescaleDB hypertable partitioned by `timestamp`.

#### 📂 `backend/data_pipeline/` (The Ingestion Logics)
- **`fastf1_client.py`**: Wraps the somewhat clunky `fastf1` native library. Sets up caching (`fastf1_cache/`) and points Ergast lookups to the `jolpi.ca` mirror to bypass deprecated F1 Ergast endpoints. Exposes reliable methods like `get_lap_data()` securely.
- **`data_processor.py`**: The mapping layer. Takes pure Pandas DataFrames (which FastF1 yields) and iteratively strips out NA's/NaNs, converting datetimes and casting variable types into standard Python dicts to prevent SQL insertion faults.
- **`db_operations.py`**: Contains `DatabaseOperations`. Has highly optimized methods like `bulk_insert_lap_times` and `bulk_insert_telemetry`. These methods are entirely idempotent, utilizing SQL `ON CONFLICT DO NOTHING` logic so you can run the sync infinitely securely.

#### 📂 `backend/api/routes/` (The REST endpoints)
- **`races.py`**: Main traffic route. Exposes `/api/races/` for getting calendar data, and `/api/races/data-version` for frontend polling. Also handles the extremely complex `/replay-data` which combines lap data and DRS limits.
- **`drivers.py` & `constructors.py`**: Gets profile information and aggregates championship points over time.
- **`telemetry.py`**: The heaviest endpoint. Dumps raw XY coordinates and speed metrics to the client for the "Track Dominance" feature.
- **`standings.py`, `analytics.py`, `circuits.py`, `h2h.py`, `weather.py`**: Fetch granular specific details as implied by their names.

### 📁 `frontend/` Directory (The Interface)
A Next.js 14 App Router project.

- **`tailwind.config.js`**: Specifies custom dark theme colors, fonts, and animation constraints.
- **`next.config.js`**: Maps external image domains and sets strict mode.

#### 📂 `frontend/public/`
- **`circuits/*.json`**: Geolocation boundary points for drawing the tracks on a 2D plane. Generated dynamically by the backend python script.
- **`races/` & `team-cars/`**: Theme assets for the UI.

#### 📂 `frontend/src/app/` (Next.js Pages)
- **`page.tsx` (Home)**: Displays the animated stats block, recent races grid, and top profiles.
- **`races/page.tsx`**: Roster of all races mapped in cards with winners highlighted.
- **`races/[raceId]/page.tsx`**: The crown jewel nested page. Contains heavy tab management to switch between Results, Lap Times, Positions, Strategy and Weather tabs.
- **`races/[raceId]/RaceReplay.tsx`**: The actual live replay visualizer component.
- **`standings/page.tsx` & `drivers/page.tsx` & `teams/page.tsx`**: Primary roster views.
- **`analytics/page.tsx`**: Heavy Recharts logic.

#### 📂 `frontend/src/components/` & `frontend/src/lib/`
- **`lib/api.ts`**: A massive Axios SDK wrapper defining strict types for every single API endpoint available in the backend.
- **`lib/useDataVersion.ts`**: The polling hero. Fires a background `setTimeout` recursion to keep the frontend updated quietly.

### 📁 `scripts/` Directory (CLI Utilities)
- **`initial_data_load.py`**: The most important script. `python scripts/initial_data_load.py 2026 --sync` will crawl F1 results, see what the database lacks, and patch it in automatically.
- **`recreate_database.py`**: Wipes everything and drops schemas.
- **`generate_circuit_coords.py`**: Analyzes telemetry XY plots to generate the actual JSON mapping shape of a race track.
- **`backup.ps1` & `restore.ps1`**: Tools to safely dump the `postgres` Docker container to disk.

---

## 🚀 4. Comprehensive Setup Guide

There are exactly two ways to run this: **The Docker Way (Recommended)** or **The Local Dev Way**.

### Method A: Immediate Setup (The Docker Way) 🐳
The entire environment comes with its own containers. You need **Docker Desktop**. This is the only prerequisite—no Python, conda, or Node.js needed on the new machine.

1. **Clone the Repository**: 
   ```powershell
   git clone https://github.com/Atharva0177/F1-IntelliHub.git
   cd F1-IntelliHub
   ```
2. **Run the Automatic Setup Script**: 
   ```powershell
   # Builds all Docker images, starts services, and offers to restore from a backup
   .\setup.ps1
   ```
   - This script creates `.env`, brings up Postgres, FastAPI, and Next.js instantly.
   - If it detects `backups\f1_dump.sql`, it will ask whether to restore it. Answer **y**.
3. **Access the Platform**:
   - Frontend: `http://localhost:3000`
   - Backend API: `http://localhost:8000`
   - Interactive Swagger API Docs: `http://localhost:8000/docs`

> **No backup? Load fresh data inside Docker:**
> ```powershell
> docker compose run --rm loader python scripts/initial_data_load.py 2026 --sync
> ```

### Method B: Raw Local Development Setup 🐍 + 🌐
If you want to edit Python files instantly without rebuilding containers, you will need Python 3.11+, Node.js 18+, and PostgreSQL 14+ with TimescaleDB.

1. **Database Initialization:**
   ```sql
   CREATE USER f1user WITH PASSWORD 'f1password';
   CREATE DATABASE f1_intelligence_hub OWNER f1user;
   \c f1_intelligence_hub
   CREATE EXTENSION IF NOT EXISTS timescaledb;
   ```

2. **Backend Process (Python/FastAPI):**
   ```bash
   conda create -n f1 python=3.12
   conda activate f1
   pip install -r backend/requirements.txt

   # Create your .env file
   echo "DATABASE_URL=postgresql://f1user:f1password@localhost:5432/f1_intelligence_hub" > .env
   echo "FASTF1_CACHE_DIR=./fastf1_cache" >> .env
   echo "CORS_ORIGINS=http://localhost:3000" >> .env

   cd backend
   uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

3. **Frontend Process (Next.js):**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
   Your dev server is now active at `http://localhost:3000`.

---

## 🛠️ 5. The CLI Loaders / Data Ingestion

The entire platform's lifeblood is the FastF1 scraper logic in `scripts/initial_data_load.py`.

With your environment activated (or via `docker compose run --rm loader`), you execute the scraper:

```bash
# Full Load — Automatically detects and loads the current year
python scripts/initial_data_load.py 

# Smart-Sync (RECOMMENDED) — Inspects DB per round and loads only exactly what is missing
python scripts/initial_data_load.py 2026 --sync

# Backfill telemetry only (Skip API wait times if Results/Laps exist)
python scripts/initial_data_load.py 2026 --telemetry-only --skip-circuits

# Load an isolated specific round
python scripts/initial_data_load.py 2026 --from-round 1 --to-round 3
```

> **Performance Note**: FastF1 caches gigabytes of session data during the first load in `./fastf1_cache/`. A full season load might take ~45 minutes initially. Subsequent `--sync` runs take **seconds** since cached files prevent network downloads.

---

## 🖧 6. Essential Next.js / FastAPI Quick Routes Reference

API Base URL: `http://localhost:8000`

| Endpoint Focus | Route Example | Description |
|---|---|---|
| **Broad Scope** | `GET /api/races?season=2026` | Delivers the calendar summary for a whole year. |
| **Race Flow** | `GET /api/races/{id}/lap-times` | Feeds the heavy Recharts stacked Lap Time charts. |
| **Telemetry Heavy** | `GET /api/telemetry/{sessionId}` | Dumps raw XY coords + speed strings for Track Dominance. |
| **Animation Engine** | `GET /api/races/{id}/replay-data` | Synchronized positioning packets for the live Replay visualizer. |
| **Strategy Engine** | `GET /api/analytics/tire-strategies` | Returns stint analysis, used by the Strategy tab. |
| **Frontend Poller** | `GET /api/races/data-version` | Returns scalar `{"version": N}` to alert Next.js of DB changes. |

Check out the interactive Swagger sandbox at `http://localhost:8000/docs` to test every single endpoint explicitly.

---

## 🌍 7. How to Make This Website Public (Deployment Guide)

Want to share your F1 IntelliHub with the world so anyone can access it on their phone or computer? Here is the exact, extremely detailed "newbie-friendly" guide on how to take this project from your local computer and put it on the public internet for **free**.

We need to host three things: Let's break it down.

### Step 1: Host the Database (Neon or Timescale Cloud)
Your computer currently runs PostgreSQL in Docker. To make it public, we need a cloud database.

1. Go to **[Neon.tech](https://neon.tech/)** (or Timescale Cloud) and create a free account.
2. Click **Create a New Project**. Name it `f1-intellihub-db`.
3. It will give you a **Connection Details** string that looks like this:
   `postgresql://username:password@ep-cool-butterfly-123456.us-east-2.aws.neon.tech/neondb`
4. **Copy this URL and save it somewhere safe.** This is your new `DATABASE_URL`.
5. On your local computer, open `./.env` and change your `DATABASE_URL` to this new link.
6. Run the local Python script `initial_data_load.py` one more time. Instead of saving to your computer, it will securely upload all the F1 data into your new cloud database!

### Step 2: Host the Python Backend (Render or Railway)
Your FastAPI backend acts as the bridge between the database and the website. We'll put this on **Render**.

1. Create a free account on **[Render.com](https://render.com/)**, and link it to your GitHub account.
2. Ensure your code is pushed firmly to a GitHub repository.
3. On Render, click **New +** -> **Web Service**.
4. Select your `F1-IntelliHub` repository from the list.
5. Apply these settings:
   - **Name**: `f1-intellihub-api`
   - **Language**: Python
   - **Root Directory**: `backend`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port 10000`
6. Scroll down to **Environment Variables** and add:
   - `DATABASE_URL` -> *(Paste the Neon link from Step 1)*
   - `CORS_ORIGINS` -> `*` *(This allows any website to talk to your API for now)*
7. Click **Create Web Service**. Wait 5-10 minutes. 
8. Render will give you a live URL, like `https://f1-intellihub-api.onrender.com`. Save this!

### Step 3: Host the Next.js Frontend (Vercel)
This is the beautiful website people will actually see. **Vercel** makes hosting Next.js apps incredibly easy.

1. Go to **[Vercel.com](https://vercel.com/)** and sign up using your GitHub account.
2. Click **Add New Project** and select your `F1-IntelliHub` repository.
3. In the Configuration screen, match these settings:
   - **Framework Preset**: Next.js
   - **Root Directory**: `frontend`
4. Open the **Environment Variables** section and add:
   - Name: `NEXT_PUBLIC_API_URL`
   - Value: `https://f1-intellihub-api.onrender.com` *(Paste your exact Render URL from Step 2)*
5. Click **Deploy**. Vercel will install the packages, build your website, and put it on the public internet.
6. It will give you a live URL (e.g., `https://f1-intellihub.vercel.app`).

### 🎉 Step 4: You Are Live!
Go to the Vercel link on your phone. The website will load, it will quietly ask your Render backend for the F1 data, the Render backend will fetch it from your Neon database, and the charts will magically appear!

---

## 🏠 8. How to Host Publicly from Your Own Local Machine (Advanced)

If you have a powerful PC that you leave running and don't want to use Render or Vercel, you can share your exact local Docker instance with the public internet using **Ngrok**, **DynuDNS**, and URL Forwarding.

This method requires your computer to remain on and connected to the internet.

### Step 1: Install and Start Ngrok
Ngrok creates a secure tunnel from the public internet directly to your localhost port.

1. Create a free account at **[ngrok.com](https://ngrok.com/)**.
2. Download and install the Ngrok agent for your OS.
3. Authenticate your agent in your terminal using your provided authtoken:
   ```bash
   ngrok config add-authtoken <your-auth-token>
   ```
4. Start a tunnel pointing to your Next.js Frontend port (3000):
   ```bash
   ngrok http 3000
   ```
5. Ngrok will output a Forwarding URL that looks something like this:
   `https://a1b2c3d4e5f6.ngrok-free.app` -> `http://localhost:3000`

### Step 2: Configure the Backend URL
Since the frontend is now being accessed from the wider internet, Next.js can no longer just look for `localhost:8000` (because "localhost" on a stranger's phone is the phone itself, not your PC).

1. Open a second terminal window. You need to tunnel your backend port (8000) as well.
2. Run:
   ```bash
   ngrok http 8000
   ```
3. Copy this **Backend Ngrok URL** (e.g., `https://backend123.ngrok-free.app`).
4. In your frontend repository, open `frontend/.env.local` (or your system environment variables) and set:
   ```env
   NEXT_PUBLIC_API_URL=https://backend123.ngrok-free.app
   ```
5. Restart your frontend server (`npm run dev` or restart your Docker compose).

### Step 3: Get a Custom Domain via DynuDNS
Ngrok URLs randomly change every time you restart the process on the free tier. We will use DynuDNS to create a permanent address people can remember.

1. Go to **[Dynu.com](https://www.dynu.com/)** and create a free account.
2. Click **DDNS Services** and add a new hostname (e.g., `my-f1-hub.dynu.net`).
3. Under the settings for your new hostname, look for **Web Redirect** or **Web Forwarding**.
4. Enable URL Forwarding and paste your **Frontend Ngrok URL** (`https://a1b2c3d4e5f6.ngrok-free.app`) into the destination URL field.
5. Save your settings.

### 🏁 Step 4: The Result
Now, whenever someone types `http://my-f1-hub.dynu.net` into their browser:
1. DynuDNS redirects them seamlessly to your temporary Frontend Ngrok URL.
2. Ngrok tunnels the request straight into your running Next.js instance on your desktop.
3. Your Next.js app asks your temporary Backend Ngrok URL for data.
4. Ngrok tunnels that request straight into your FastAPI backend on your desktop.

*Note: Whenever you reboot your PC, you will need to start both Ngrok tunnels again and update the URL in DynuDNS and `NEXT_PUBLIC_API_URL`.*

---

<div align="center">
<i>F1 Intelligence Hub is an advanced open-source analytical tool for motorsports passionates, built iteratively to handle infinite layers of telemetry safely.</i>
<br><br>
<b>Enjoy the race. 🏁</b>
</div>
