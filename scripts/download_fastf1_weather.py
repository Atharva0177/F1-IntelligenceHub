"""
FastF1 Weather Data Downloader
==============================
Downloads race-session weather data (rainfall, temp, humidity) for all
historical races using FastF1 and stores aggregated stats in the
race_weather table.

FastF1 weather_data provides per-minute samples with:
  AirTemp (°C), Humidity (%), Pressure (mbar), Rainfall (bool),
  TrackTemp (°C), WindDirection (°), WindSpeed (m/s)

Usage:
    python scripts/download_fastf1_weather.py [--start-year 2020] [--dry-run]
"""

import sys
import os
import argparse
import logging
import time

# Add parent directory to path so we can import backend modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

import fastf1
import pandas as pd
import psycopg2
from psycopg2.extras import execute_values

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s  %(levelname)s  %(message)s',
    datefmt='%H:%M:%S',
)
log = logging.getLogger(__name__)

# ─── DB connection ─────────────────────────────────────────────────────────────
DB_DSN = os.environ.get(
    'DATABASE_URL',
    'postgresql://f1user:f1password@localhost:5432/f1_intelligence_hub',
)

CACHE_DIR = os.path.join(os.path.dirname(__file__), '..', 'fastf1_cache')

# ─── Non-finish statuses that count as DNF (used here for validation only) ────
DNF_STATUSES = {
    'Retired', 'Collision', 'Collision damage', 'Accident',
    'Engine', 'Gearbox', 'Brakes', 'Power Unit', 'Electrical',
    'Hydraulics', 'Suspension', 'Did not start', 'Disqualified',
    'Mechanical', 'Transmission', 'Wheel', 'Overheating', 'Damage',
}


def get_races_needing_weather(conn, start_year: int):
    """Return list of (race_id, year, round_number, name) that have no weather row."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT r.id, s.year, r.round_number, r.name
            FROM races r
            JOIN seasons s ON s.id = r.season_id
            LEFT JOIN race_weather rw ON rw.race_id = r.id
            WHERE s.year >= %s
              AND rw.id IS NULL
            ORDER BY s.year, r.round_number
        """, (start_year,))
        return cur.fetchall()


def upsert_weather(conn, race_id: int, stats: dict, dry_run: bool = False):
    """Insert or replace weather stats for a race."""
    if dry_run:
        log.info(f"  [dry-run] Would upsert race_id={race_id}: {stats}")
        return
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO race_weather (race_id, air_temp_avg, track_temp_avg, humidity_avg,
                                      rainfall, wind_speed_avg)
            VALUES (%(race_id)s, %(air_temp_avg)s, %(track_temp_avg)s, %(humidity_avg)s,
                    %(rainfall)s, %(wind_speed_avg)s)
            ON CONFLICT (race_id) DO UPDATE SET
                air_temp_avg  = EXCLUDED.air_temp_avg,
                track_temp_avg = EXCLUDED.track_temp_avg,
                humidity_avg  = EXCLUDED.humidity_avg,
                rainfall      = EXCLUDED.rainfall,
                wind_speed_avg = EXCLUDED.wind_speed_avg,
                fetched_at    = NOW()
        """, {**stats, 'race_id': race_id})
    conn.commit()


def download_race_weather(year: int, round_num: int) -> dict | None:
    """
    Load the Race session (weather only, no laps/telemetry) via FastF1
    and return aggregated weather stats.
    """
    try:
        session = fastf1.get_session(year, round_num, 'R')
        # Only load weather — far faster than loading laps/telemetry
        session.load(laps=False, telemetry=False, weather=True, messages=False)
    except Exception as exc:
        log.warning(f"  FastF1 load failed: {exc}")
        return None

    w = getattr(session, 'weather_data', None)
    if w is None or (isinstance(w, pd.DataFrame) and w.empty):
        log.warning("  No weather data returned by FastF1")
        return None

    try:
        stats = {
            'air_temp_avg':   round(float(w['AirTemp'].mean()),   2),
            'track_temp_avg': round(float(w['TrackTemp'].mean()), 2),
            'humidity_avg':   round(float(w['Humidity'].mean()),  2),
            'wind_speed_avg': round(float(w['WindSpeed'].mean()), 2),
            # Rainfall = True if ANY sample during the race recorded rain
            'rainfall':       bool(w['Rainfall'].any()),
        }
        return stats
    except Exception as exc:
        log.warning(f"  Weather aggregation failed: {exc}")
        return None


def main():
    parser = argparse.ArgumentParser(description='Download FastF1 race weather data')
    parser.add_argument('--start-year', type=int, default=2020,
                        help='First season year to download (default: 2020)')
    parser.add_argument('--dry-run', action='store_true',
                        help='Fetch data but do not write to DB')
    parser.add_argument('--delay', type=float, default=2.0,
                        help='Seconds to wait between FastF1 API calls (default: 2.0)')
    args = parser.parse_args()

    # Enable FastF1 cache
    os.makedirs(CACHE_DIR, exist_ok=True)
    fastf1.Cache.enable_cache(CACHE_DIR)
    log.info(f"FastF1 cache: {CACHE_DIR}")

    conn = psycopg2.connect(DB_DSN)
    log.info("DB connected")

    races = get_races_needing_weather(conn, args.start_year)
    log.info(f"Races needing weather data: {len(races)}")

    ok = skipped = failed = 0
    for race_id, year, round_num, name in races:
        log.info(f"→ [{year} Rd {round_num:2d}] {name}  (race_id={race_id})")
        stats = download_race_weather(year, round_num)

        if stats is None:
            log.warning(f"  Skipping {name} — no data available")
            skipped += 1
            continue

        upsert_weather(conn, race_id, stats, dry_run=args.dry_run)
        rainfall_str = '🌧  RAIN' if stats['rainfall'] else '☀  dry'
        log.info(
            f"  {rainfall_str}  air={stats['air_temp_avg']}°C  "
            f"track={stats['track_temp_avg']}°C  "
            f"humidity={stats['humidity_avg']}%"
        )
        ok += 1
        time.sleep(args.delay)

    conn.close()
    log.info(
        f"\nDone — downloaded={ok}  skipped={skipped}  failed={failed}"
        + (' [DRY RUN]' if args.dry_run else '')
    )


if __name__ == '__main__':
    main()
