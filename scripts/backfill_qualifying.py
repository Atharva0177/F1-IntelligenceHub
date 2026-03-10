"""
Backfill the Qualifying table from FastF1 cached data.
Reads qualifying session results (position + Q1/Q2/Q3 times) for all races
that currently have 0 rows in the qualifying table.
"""
import sys
import os
from pathlib import Path

backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

import logging
import pandas as pd
from dotenv import load_dotenv

load_dotenv()

from database.config import SessionLocal, init_db
from database.models import Race, Season, Driver, Qualifying, Session as DBSession
from data_pipeline.fastf1_client import FastF1Client

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)


def backfill(year: int = 2021):
    init_db()
    db = SessionLocal()
    cache_dir = os.getenv("FASTF1_CACHE_DIR", "./fastf1_cache")
    client = FastF1Client(cache_dir=cache_dir)

    season = db.query(Season).filter(Season.year == year).first()
    if not season:
        log.error("Season %s not found in DB", year)
        return

    races = db.query(Race).filter(Race.season_id == season.id).order_by(Race.round_number).all()
    log.info("Found %d races for %s", len(races), year)

    total_inserted = 0

    for race in races:
        existing = db.query(Qualifying).filter(Qualifying.race_id == race.id).count()
        if existing > 0:
            log.info("  [SKIP] %s — already has %d qualifying rows", race.name, existing)
            continue

        log.info("  [LOAD] %s (round %s)", race.name, race.round_number)
        try:
            session = client.get_session(year, race.round_number, "Q")
            if session is None:
                log.warning("    No qualifying session available")
                continue

            # FastF1 results DataFrame
            results = session.results
            if results is None or len(results) == 0:
                log.warning("    Empty results for qualifying session")
                continue

            inserted = 0
            for _, row in results.iterrows():
                driver_code = str(row.get("Abbreviation", "")).strip()
                if not driver_code:
                    continue

                driver = db.query(Driver).filter(Driver.code == driver_code).first()
                if not driver:
                    log.warning("    Driver %s not in DB, skipping", driver_code)
                    continue

                def to_seconds(t):
                    """Convert pandas Timedelta / float / NaT to seconds float or None."""
                    if t is None:
                        return None
                    try:
                        if pd.isna(t):
                            return None
                    except (TypeError, ValueError):
                        pass
                    if hasattr(t, "total_seconds"):
                        secs = t.total_seconds()
                        return float(secs) if secs > 0 else None
                    try:
                        return float(t)
                    except (TypeError, ValueError):
                        return None

                position = int(row.get("Position", 0)) if not pd.isna(row.get("Position", float("nan"))) else None
                q1 = to_seconds(row.get("Q1"))
                q2 = to_seconds(row.get("Q2"))
                q3 = to_seconds(row.get("Q3"))

                q_row = Qualifying(
                    race_id=race.id,
                    driver_id=driver.id,
                    position=position,
                    q1_time=q1,
                    q2_time=q2,
                    q3_time=q3,
                )
                db.add(q_row)
                inserted += 1

            db.commit()
            log.info("    ✓ Inserted %d qualifying rows", inserted)
            total_inserted += inserted

        except Exception as exc:
            db.rollback()
            log.error("    ERROR: %s", exc, exc_info=True)

    db.close()
    log.info("Done. Total inserted: %d", total_inserted)


if __name__ == "__main__":
    year = int(sys.argv[1]) if len(sys.argv) > 1 else 2021
    backfill(year)
