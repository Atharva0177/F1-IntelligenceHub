"""
Delete all database data for a specific F1 season year.

This removes only season-scoped data (races, sessions, results, laps, telemetry,
weather, race control, etc.) and keeps shared master data (drivers, teams,
circuits) unless they are manually cleaned up later.

Examples:
  python scripts/delete_season_data.py 2024 --dry-run
  python scripts/delete_season_data.py 2024 --yes
"""

import sys
from pathlib import Path
import argparse

from sqlalchemy import func

# Add backend to path
backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from database.config import SessionLocal
from database.models import (
    Season,
    Race,
    Session,
    Result,
    Qualifying,
    LapTime,
    TelemetryData,
    PositionData,
    PitStop,
    WeatherData,
    RaceControlMessage,
    SessionStatus,
)


def _count_rows(db, model, filter_column=None, ids=None):
    query = db.query(func.count(model.id))
    if filter_column is not None and ids is not None:
        if not ids:
            return 0
        query = query.filter(filter_column.in_(ids))
    return int(query.scalar() or 0)


def delete_season_data(year: int, dry_run: bool, yes: bool) -> int:
    db = SessionLocal()

    try:
        season = db.query(Season).filter(Season.year == year).first()
        if not season:
            print(f"No season found for year {year}.")
            return 1

        race_ids = [r[0] for r in db.query(Race.id).filter(Race.season_id == season.id).all()]
        session_ids = [s[0] for s in db.query(Session.id).filter(Session.race_id.in_(race_ids)).all()] if race_ids else []

        counts = {
            "seasons": 1,
            "races": _count_rows(db, Race, Race.id, race_ids),
            "sessions": _count_rows(db, Session, Session.id, session_ids),
            "results": _count_rows(db, Result, Result.race_id, race_ids),
            "qualifying": _count_rows(db, Qualifying, Qualifying.race_id, race_ids),
            "lap_times": _count_rows(db, LapTime, LapTime.session_id, session_ids),
            "telemetry_data": _count_rows(db, TelemetryData, TelemetryData.session_id, session_ids),
            "position_data": _count_rows(db, PositionData, PositionData.session_id, session_ids),
            "pit_stops": _count_rows(db, PitStop, PitStop.session_id, session_ids),
            "weather_data": _count_rows(db, WeatherData, WeatherData.session_id, session_ids),
            "race_control_messages": _count_rows(db, RaceControlMessage, RaceControlMessage.session_id, session_ids),
            "session_status": _count_rows(db, SessionStatus, SessionStatus.session_id, session_ids),
        }

        print(f"Season deletion plan for {year}:")
        for key, value in counts.items():
            print(f"  - {key}: {value}")

        if dry_run:
            print("\nDry run only. No data deleted.")
            return 0

        if not yes:
            confirm = input(f"\nType DELETE-{year} to confirm deletion: ").strip()
            if confirm != f"DELETE-{year}":
                print("Confirmation mismatch. Aborting.")
                return 1

        # Delete child tables first (session scoped)
        if session_ids:
            db.query(TelemetryData).filter(TelemetryData.session_id.in_(session_ids)).delete(synchronize_session=False)
            db.query(PositionData).filter(PositionData.session_id.in_(session_ids)).delete(synchronize_session=False)
            db.query(LapTime).filter(LapTime.session_id.in_(session_ids)).delete(synchronize_session=False)
            db.query(PitStop).filter(PitStop.session_id.in_(session_ids)).delete(synchronize_session=False)
            db.query(WeatherData).filter(WeatherData.session_id.in_(session_ids)).delete(synchronize_session=False)
            db.query(RaceControlMessage).filter(RaceControlMessage.session_id.in_(session_ids)).delete(synchronize_session=False)
            db.query(SessionStatus).filter(SessionStatus.session_id.in_(session_ids)).delete(synchronize_session=False)

        # Delete race-scoped tables
        if race_ids:
            db.query(Result).filter(Result.race_id.in_(race_ids)).delete(synchronize_session=False)
            db.query(Qualifying).filter(Qualifying.race_id.in_(race_ids)).delete(synchronize_session=False)
            db.query(Session).filter(Session.race_id.in_(race_ids)).delete(synchronize_session=False)
            db.query(Race).filter(Race.id.in_(race_ids)).delete(synchronize_session=False)

        # Finally delete season row
        db.query(Season).filter(Season.id == season.id).delete(synchronize_session=False)

        db.commit()
        print(f"\nDeleted season data for {year} successfully.")
        return 0

    except Exception as exc:
        db.rollback()
        print(f"Error deleting season data for {year}: {exc}")
        return 1

    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Delete all data for a specific F1 season year")
    parser.add_argument("year", type=int, help="Season year to delete (e.g. 2024)")
    parser.add_argument("--dry-run", action="store_true", help="Preview row counts only")
    parser.add_argument("--yes", action="store_true", help="Skip interactive confirmation prompt")
    args = parser.parse_args()

    return delete_season_data(args.year, args.dry_run, args.yes)


if __name__ == "__main__":
    raise SystemExit(main())
