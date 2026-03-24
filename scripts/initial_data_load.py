"""
F1 Intelligence Hub - Initial Data Load Script
Loads F1 season data using FastF1 library - ALL SESSIONS.

Loaded per session:
  - Lap times (all sessions)
  - Telemetry: fastest-lap per driver (all sessions)
  - Weather data  (all sessions)
  - Race control messages  (all sessions)
  - Session status  (all sessions)
  - Race / Sprint results  (Race + Sprint only)
  - Qualifying results  (Qualifying only)
"""

import sys
import os
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent.parent / 'backend'
sys.path.insert(0, str(backend_path))

import json
import logging
import re
import unicodedata
import numpy as np
import pandas as pd
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from database.config import SessionLocal, init_db
from database.models import Driver, Race as RaceModel, Session as DBSession
from data_pipeline.fastf1_client import FastF1Client, get_telemetry_safe
from data_pipeline.data_processor import DataProcessor
from data_pipeline.db_operations import DatabaseOperations

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('data_load.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


# ── Circuit coordinate helpers ────────────────────────────────────────────────

def _slugify_circuit(name: str) -> str:
    """Produce ASCII slug matching the frontend circuitSlug() function."""
    normalized = unicodedata.normalize('NFD', name)
    ascii_name = ''.join(c for c in normalized if unicodedata.category(c) != 'Mn')
    return re.sub(r'[^a-z0-9]+', '_', ascii_name.lower()).strip('_')


def _rotate(xy, angle: float):
    """Rotate a point or array of points by angle (radians)."""
    rot_mat = np.array([[np.cos(angle), np.sin(angle)],
                        [-np.sin(angle), np.cos(angle)]])
    return np.matmul(xy, rot_mat)


def extract_circuit_coords_from_session(session, event_name: str) -> bool:
    """
    Extract circuit track coordinates from an already-loaded FastF1 Race session
    and write them to frontend/public/circuits/<slug>.json.
    Returns True on success, False if skipped or failed.
    """
    output_dir = Path(__file__).parent.parent / 'frontend' / 'public' / 'circuits'
    output_dir.mkdir(parents=True, exist_ok=True)

    slug = _slugify_circuit(event_name)
    out_path = output_dir / f'{slug}.json'

    if out_path.exists():
        logger.info(f"    ↷ Circuit JSON already exists: {slug}.json")
        return True

    try:
        fastest_lap = session.laps.pick_fastest()
        if fastest_lap is None:
            logger.warning(f"    ⚠️  No fastest lap for circuit extraction: {event_name}")
            return False

        pos = fastest_lap.get_pos_data()
        if pos is None or len(pos) == 0:
            logger.warning(f"    ⚠️  Empty position data for circuit: {event_name}")
            return False

        try:
            circuit_info = session.get_circuit_info()
            rotation = float(circuit_info.rotation)
        except Exception:
            circuit_info = None
            rotation = 0.0

        track_angle = rotation / 180 * np.pi
        xy = pos.loc[:, ('X', 'Y')].to_numpy(dtype=float)
        rot_mat = np.array([[np.cos(track_angle), np.sin(track_angle)],
                            [-np.sin(track_angle), np.cos(track_angle)]])
        rotated = xy @ rot_mat

        corners = []
        if circuit_info is not None:
            try:
                for _, corner in circuit_info.corners.iterrows():
                    cx, cy = _rotate([corner['X'], corner['Y']], track_angle)
                    corners.append({
                        'number': int(corner['Number']),
                        'letter': str(corner['Letter']),
                        'x': float(cx),
                        'y': float(cy),
                        'angle': float(corner['Angle']),
                    })
            except Exception:
                pass

        data = {
            'name': event_name,
            'rotation': rotation,
            'x': rotated[:, 0].tolist(),
            'y': rotated[:, 1].tolist(),
            'corners': corners,
        }
        with open(out_path, 'w') as f:
            json.dump(data, f, indent=2)

        logger.info(f"    ✓ Circuit coords saved: {slug}.json ({len(data['x'])} pts, {len(corners)} corners)")
        return True

    except Exception as e:
        logger.warning(f"    ⚠️  Circuit coords extraction failed for {event_name}: {e}")
        return False


def extract_circuit_svg_from_session(session, event_name: str) -> bool:
    """
    Generate a normalized SVG path for the circuit from an already-loaded FastF1
    Race session and upsert the entry into frontend/src/lib/circuitLayouts.ts.
    Returns True on success, False if skipped or failed.
    """
    output_file = Path(__file__).parent.parent / 'frontend' / 'src' / 'lib' / 'circuitLayouts.ts'

    safe_name = event_name.replace("'", "\\'")

    # Idempotency check — skip if the circuit already has an entry
    if output_file.exists():
        existing = output_file.read_text(encoding='utf-8')
        if f"'{safe_name}'" in existing:
            logger.info(f"    ↷ SVG layout already exists for: {event_name}")
            return True
    else:
        existing = None

    try:
        fastest_lap = session.laps.pick_fastest()
        if fastest_lap is None:
            logger.warning(f"    ⚠️  No fastest lap for SVG extraction: {event_name}")
            return False

        pos = fastest_lap.get_pos_data()
        if pos is None or len(pos) == 0:
            logger.warning(f"    ⚠️  Empty position data for SVG: {event_name}")
            return False

        x = pos['X'].values.astype(float)
        y = pos['Y'].values.astype(float)

        # Normalize to 0-1000 SVG viewport with 50px padding, flip Y axis
        x_min, x_max = x.min(), x.max()
        y_min, y_max = y.min(), y.max()
        max_range = max(x_max - x_min, y_max - y_min)
        padding = 50
        scale = (1000 - 2 * padding) / max_range
        x_norm = (x - x_min) * scale + padding
        y_norm = 1000 - ((y - y_min) * scale + padding)

        path_data = f"M {x_norm[0]:.2f},{y_norm[0]:.2f} "
        for i in range(1, len(x_norm)):
            path_data += f"L {x_norm[i]:.2f},{y_norm[i]:.2f} "
        path_data = path_data.rstrip() + " Z"

        # Event metadata from the already-loaded session
        try:
            round_num = int(session.event['RoundNumber'])
            country = str(session.event.get('Country', ''))
            location = str(session.event.get('Location', ''))
        except Exception:
            round_num = 0
            country = ''
            location = ''

        safe_country = country.replace("'", "\\'")
        safe_location = location.replace("'", "\\'")

        entry = (
            f"  '{safe_name}': {{\n"
            f"    round: {round_num},\n"
            f"    name: '{safe_name}',\n"
            f"    country: '{safe_country}',\n"
            f"    location: '{safe_location}',\n"
            f"    svgPath: '{path_data}'\n"
            f"  }},\n"
        )

        if existing is None:
            # File does not yet exist — create it from scratch
            ts_content = (
                "// Auto-generated circuit SVG paths from FastF1 position data\n"
                "// Generated using scripts/generate_circuit_svgs.py\n\n"
                "export interface CircuitLayout {\n"
                "  round: number;\n"
                "  name: string;\n"
                "  country: string;\n"
                "  location: string;\n"
                "  svgPath: string;\n"
                "}\n\n"
                "export const circuitLayouts: Record<string, CircuitLayout> = {\n"
                + entry
                + "};\n\n"
                "export default circuitLayouts;\n"
            )
            output_file.parent.mkdir(parents=True, exist_ok=True)
            output_file.write_text(ts_content, encoding='utf-8')
        else:
            # Append new entry before the closing `};`
            closing_idx = existing.rfind('};')
            if closing_idx == -1:
                logger.warning(f"    ⚠️  Unexpected circuitLayouts.ts format — skipping SVG for {event_name}")
                return False
            suffix = existing[closing_idx + 2:].lstrip('\n')
            new_content = existing[:closing_idx].rstrip() + '\n' + entry + '};\n'
            if suffix:
                new_content += '\n' + suffix
            output_file.write_text(new_content, encoding='utf-8')

        logger.info(f"    ✓ SVG layout saved: {event_name} ({len(x_norm)} pts)")
        return True

    except Exception as e:
        logger.warning(f"    ⚠️  SVG layout extraction failed for {event_name}: {e}")
        return False


# FastF1 schedule session name -> (session identifiers to try, DB session label)
_SESSION_PLAN_MAP = {
    'Practice 1': (['FP1'], 'FP1'),
    'Practice 2': (['FP2'], 'FP2'),
    'Practice 3': (['FP3'], 'FP3'),
    'Sprint Qualifying': (['SQ', 'SS'], 'Sprint Qualifying'),
    'Sprint Shootout': (['SQ', 'SS'], 'Sprint Shootout'),
    'Sprint': (['S'], 'Sprint'),
    'Qualifying': (['Q'], 'Qualifying'),
    'Race': (['R'], 'Race'),
}


def _build_session_plan_from_event(event_row) -> list[tuple[list[str], str]]:
    """Build an ordered session plan from FastF1 EventSchedule Session1..Session5."""
    plan: list[tuple[list[str], str]] = []

    for idx in range(1, 6):
        raw_name = event_row.get(f'Session{idx}')
        if raw_name is None:
            continue

        session_name = str(raw_name).strip()
        if not session_name or session_name.lower() == 'nan':
            continue

        mapped = _SESSION_PLAN_MAP.get(session_name)
        if mapped is None:
            logger.info(f"  Skipping unsupported session type from schedule: {session_name}")
            continue

        identifiers, db_label = mapped
        if any(existing_label == db_label for _, existing_label in plan):
            continue
        plan.append((identifiers, db_label))

    return plan


def _event_first_session_date(event_row):
    """Return the earliest known session date for an event (or EventDate fallback)."""
    candidate_cols = [f'Session{i}Date' for i in range(1, 6)] + [f'Session{i}DateUtc' for i in range(1, 6)]
    dates = []

    for col in candidate_cols:
        value = event_row.get(col)
        if value is None:
            continue
        try:
            if pd.notna(value):
                dates.append(pd.to_datetime(value).date())
        except Exception:
            continue

    if dates:
        return min(dates)

    try:
        event_date = event_row.get('EventDate')
        if pd.notna(event_date):
            return pd.to_datetime(event_date).date()
    except Exception:
        pass

    return None


# ── Main data loading ──────────────────────────────────────────────────────────

def load_season(year, from_round: int = 1, to_round: int = None, results_only: bool = False, skip_circuits: bool = False, telemetry_only: bool = False):
    """
    Load complete F1 season data for a specific year.

    Args:
        year: The season year.
        from_round: Skip rounds below this number (useful for resuming a partial load).
        to_round: Stop after this round number (inclusive). None = load all rounds.
        results_only: When True, only Race results are loaded — laps, telemetry,
                      weather and messages are skipped (much faster for repairs).
        skip_circuits: When True, skip generating circuit coordinate JSON files
                       for the frontend (useful when they're already up to date).
        telemetry_only: When True, only load telemetry for Race sessions — all other
                        data (results, laps, weather, messages) is skipped. Requires
                        sessions to already exist in the DB. Use to backfill telemetry
                        for seasons that were loaded with results_only=True.
    """
    logger.info("=" * 80)
    logger.info(f"F1 Intelligence Hub - Data Loading Started for {year}")
    logger.info("=" * 80)
    
    # Initialize database
    logger.info("Initializing database...")
    init_db()
    
    # Create database session
    db = SessionLocal()
    db_ops = DatabaseOperations(db)
    
    # Initialize FastF1 client
    cache_dir = os.getenv('FASTF1_CACHE_DIR', './fastf1_cache')
    f1_client = FastF1Client(cache_dir=cache_dir)
    
    try:
        # Get season schedule
        logger.info(f"\nFetching {year} season schedule...")
        schedule = f1_client.get_event_schedule(year)
        logger.info(f"Found {len(schedule)} events in {year} season\n")
        
        # Create season
        season = db_ops.get_or_create_season(year)
        logger.info(f"Season created/retrieved: {year}\n")
        
        # Process each race
        total_races = len(schedule)
        
        for idx, event in schedule.iterrows():
            round_num = int(event['RoundNumber'])
            event_name = event['EventName']
            
            if round_num < from_round:
                logger.info(f"Skipping Round {round_num}: {event_name} (before --from-round {from_round})")
                continue

            if to_round is not None and round_num > to_round:
                logger.info(f"Stopping at Round {to_round} (reached --to-round limit)")
                break
            
            logger.info("*" * 80)
            logger.info(f"Processing Round {round_num}/{total_races}: {event_name}")
            logger.info("*" * 80)
            
            try:
                # Process event data
                event_data = DataProcessor.process_event_data(event)
                
                # Create circuit
                circuit_data = {
                    'name': event_data['location'],
                    'location': event_data['location'],
                    'country': event_data['country'],
                }
                circuit = db_ops.get_or_create_circuit(circuit_data)
                
                # Create race
                race_data = {
                    'name': event_name,
                    'round_number': round_num,
                    'date': event_data['event_date'],
                    'event_name': event_data['event_name'],
                    'official_name': event_data['official_name'],
                }
                race = db_ops.get_or_create_race(race_data, season, circuit)

                # In telemetry_only mode, skip rounds that have no existing Race
                # session — avoids creating empty entries for future/unloaded races
                if telemetry_only:
                    existing_race_session = db_ops.db.query(DBSession).filter(
                        DBSession.race_id == race.id,
                        DBSession.session_type == 'Race',
                    ).first()
                    if not existing_race_session:
                        logger.info(f"  No existing Race session for Round {round_num} ({event_name}), skipping (telemetry-only mode)")
                        continue

                # Decide which sessions to load for this event.
                # For full loads, follow FastF1 Session1..Session5 order so sprint
                # weekends load as FP1 -> Sprint Qualifying -> Sprint -> Qualifying -> Race.
                if telemetry_only:
                    session_types_to_load = [(['R'], 'Race')]
                elif results_only:
                    session_types_to_load = [(['S'], 'Sprint'), (['R'], 'Race')]
                else:
                    session_types_to_load = _build_session_plan_from_event(event)
                    if not session_types_to_load:
                        # Fallback for unexpected schedule payloads.
                        session_types_to_load = [
                            (['FP1'], 'FP1'),
                            (['FP2'], 'FP2'),
                            (['FP3'], 'FP3'),
                            (['SQ', 'SS'], 'Sprint Qualifying'),
                            (['S'], 'Sprint'),
                            (['Q'], 'Qualifying'),
                            (['R'], 'Race'),
                        ]

                for session_identifiers, session_name in session_types_to_load:
                    try:
                        # Ensure each session starts with a clean transaction.
                        db_ops.db.rollback()

                        logger.info(f"  Loading {session_name} session...")
                        session = None
                        for session_identifier in session_identifiers:
                            session = f1_client.get_session(
                                year,
                                round_num,
                                session_identifier,
                                results_only=results_only and not telemetry_only,
                            )
                            if session is not None:
                                break

                        if session is None:
                            logger.info(f"    ℹ️  {session_name} session not available")
                            continue
                        
                        # Create session record
                        session_data = DataProcessor.process_session_data(session)
                        session_data['session_type'] = session_name
                        db_session = db_ops.create_session(session_data, race)
                        
                        # ── Qualifying results ───────────────────────────────
                        if session_name == 'Qualifying' and not telemetry_only:
                            logger.info(f"    Processing Qualifying results...")
                            try:
                                q_results = session.results
                                if q_results is not None and len(q_results) > 0:
                                    def _to_sec(t):
                                        if t is None:
                                            return None
                                        try:
                                            if pd.isna(t):
                                                return None
                                        except (TypeError, ValueError):
                                            pass
                                        if hasattr(t, 'total_seconds'):
                                            s = t.total_seconds()
                                            return float(s) if s > 0 else None
                                        try:
                                            return float(t)
                                        except (TypeError, ValueError):
                                            return None

                                    qual_rows = []
                                    for _, row in q_results.iterrows():
                                        code = str(row.get('Abbreviation', '')).strip()
                                        if not code:
                                            continue
                                        pos = row.get('Position')
                                        try:
                                            pos = int(pos) if pos is not None and not pd.isna(pos) else None
                                        except (TypeError, ValueError):
                                            pos = None
                                        qual_rows.append({
                                            'driver_code': code,
                                            'position': pos,
                                            'q1_time': _to_sec(row.get('Q1')),
                                            'q2_time': _to_sec(row.get('Q2')),
                                            'q3_time': _to_sec(row.get('Q3')),
                                        })
                                    n = db_ops.bulk_insert_qualifying(qual_rows, race)
                                    logger.info(f"    ✓ Inserted {n} qualifying rows")
                            except Exception as qe:
                                logger.warning(f"    ⚠️  Qualifying results skipped: {qe}")

                        # ── Race / Sprint results ────────────────────────────
                        if session_name in ['Race', 'Sprint'] and not telemetry_only:
                            logger.info(f"    Processing {session_name} results...")
                            results = f1_client.get_results(session)
                            if results is not None and len(results) > 0:
                                processed_results = DataProcessor.process_results_data(results)
                                
                                # Create drivers and teams from results
                                for result in processed_results:
                                    # Tag whether this is a sprint result
                                    result['is_sprint'] = (session_name == 'Sprint')

                                    # Create/update driver
                                    driver_data = {
                                        'code': result['driver_code'],
                                        'number': result.get('driver_number'),
                                        'first_name': result.get('first_name', ''),
                                        'last_name': result.get('last_name', ''),
                                    }
                                    db_ops.get_or_create_driver(driver_data)
                                    
                                    # Create/update team
                                    team_data = {
                                        'name': result['team_name'],
                                    }
                                    db_ops.get_or_create_team(team_data)
                                    
                                    # Insert result
                                    db_ops.insert_result(result, race)
                                
                                logger.info(f"    ✓ Inserted {len(processed_results)} {session_name} results")

                        # ── Circuit coordinates ──────────────────────────────
                        # Extract track layout from the Race session while laps
                        # are already in memory — skip in results-only mode
                        # (no laps loaded) and for Sprint sessions.
                        if session_name == 'Race' and not results_only and not skip_circuits and not telemetry_only:
                            extract_circuit_coords_from_session(session, event_name)
                            extract_circuit_svg_from_session(session, event_name)

                        # Load lap times for all sessions
                        if not results_only and not telemetry_only:
                            logger.info(f"    Processing lap times...")
                            laps = f1_client.get_lap_data(session)
                            if laps is not None and len(laps) > 0:
                                processed_laps = DataProcessor.process_lap_data(laps)
                                db_ops.bulk_insert_lap_times(processed_laps, db_session)
                                logger.info(f"    ✓ Inserted {len(processed_laps)} lap times")

                        # ── Telemetry: fastest lap per driver ────────────────
                        if not results_only or telemetry_only:
                            try:
                                driver_list = f1_client.get_driver_list(session)
                                logger.info(f"      Loading telemetry for {len(driver_list)} drivers...")

                                telemetry_count = 0
                                for driver_code in driver_list:
                                    try:
                                        logger.info(f"      Loading telemetry for {driver_code}...")
                                        if hasattr(session.laps, 'pick_drivers'):
                                            driver_laps = session.laps.pick_drivers(driver_code)
                                        else:
                                            driver_laps = session.laps.pick_driver(driver_code)
                                        if len(driver_laps) == 0:
                                            logger.warning(f"      No laps found for {driver_code}")
                                            continue
                                        fastest_lap = driver_laps.pick_fastest()
                                        if fastest_lap is None or pd.isna(fastest_lap.get('LapNumber')):
                                            logger.warning(f"      No valid fastest lap for {driver_code}")
                                            continue
                                        lap_number = int(fastest_lap['LapNumber'])
                                        telemetry = get_telemetry_safe(fastest_lap)
                                        if telemetry is not None and len(telemetry) > 0:
                                            session_start_tel = session.date if hasattr(session, 'date') else None
                                            processed_telemetry = DataProcessor.process_telemetry_data(
                                                telemetry, driver_code, lap_number, session_start_tel
                                            )
                                            if processed_telemetry:
                                                db_ops.bulk_insert_telemetry(processed_telemetry, db_session)
                                                telemetry_count += len(processed_telemetry)
                                                logger.info(f"        ✓ Loaded {len(processed_telemetry)} telemetry points for lap {lap_number}")
                                    except Exception as driver_error:
                                        logger.warning(f"      Could not load telemetry for {driver_code}: {driver_error}")
                                        continue

                                if telemetry_count > 0:
                                    logger.info(f"    ✓ Inserted {telemetry_count} telemetry points for {len(driver_list)} drivers")
                            except Exception as telemetry_error:
                                logger.warning(f"    ⚠️  Telemetry loading skipped: {telemetry_error}")

                        # Get session start time for timestamp conversion
                        session_start = session.date if hasattr(session, 'date') else None

                        # Load Weather Data
                        if not results_only and not telemetry_only:
                            logger.info(f"    Processing weather data...")
                            weather = f1_client.get_weather_data(session)
                            if weather is not None and len(weather) > 0:
                                processed_weather = DataProcessor.process_weather_data(weather, session_start)
                                if processed_weather:
                                    db_ops.bulk_insert_weather(processed_weather, db_session)
                                    logger.info(f"    ✓ Inserted {len(processed_weather)} weather data points")

                        # Load Race Control Messages
                        if not results_only and not telemetry_only:
                            logger.info(f"    Processing race control messages...")
                            race_messages = DataProcessor.process_race_control_messages(session, session_start)
                            if race_messages:
                                db_ops.bulk_insert_race_control_messages(race_messages, db_session)
                                logger.info(f"    ✓ Inserted {len(race_messages)} race control messages")

                        # Load Session Status
                        if not results_only and not telemetry_only:
                            logger.info(f"    Processing session status...")
                            session_status = DataProcessor.process_session_status(session, session_start)
                            if session_status:
                                db_ops.bulk_insert_session_status(session_status, db_session)
                                logger.info(f"    ✓ Inserted {len(session_status)} session status records")
                        
                        logger.info(f"  ✅ Completed {session_name} session")
                    
                    except Exception as session_error:
                        logger.error(f"  ❌ Error loading {session_name} session: {session_error}")
                        db_ops.db.rollback()
                        continue
                
                logger.info(f"✅ Completed Round {round_num}: {event_name}\n")
                
            except Exception as e:
                logger.error(f"❌ Error processing Round {round_num}: {e}")
                logger.exception(e)
                db_ops.db.rollback()
                continue
        
        logger.info("=" * 80)
        logger.info(f"✅ Data loading for {year} completed successfully!")
        logger.info("=" * 80)

        # Make sure summary reads run outside any failed transaction state.
        db_ops.db.rollback()
        
        # Summary statistics
        logger.info("\n📊 Summary Statistics:")
        logger.info(f"  • Total drivers: {db.query(Driver).count()}")
        logger.info(f"  • Total races loaded: {total_races}")
        
    except Exception as e:
        logger.error(f"❌ Fatal error: {e}")
        logger.exception(e)
    
    finally:
        db.close()
        logger.info(f"\n🏁 Data loading script for {year} finished")


# ── Automatic sync ─────────────────────────────────────────────────────────────

def sync_season(year: int):
    """
    Inspect the DB state for every started round (first session date ≤ today)
    and load only what is missing. Three states are recognised per round:

      FULL       – race has no results or no lap times → full load
      TELEM_ONLY – results + laps present but no telemetry → telemetry backfill
      SKIP       – results, laps and telemetry all present → nothing to do

    This is fully idempotent: re-running will not duplicate any rows.
    """
    from database.models import Result, LapTime, TelemetryData as TelDB

    init_db()
    db = SessionLocal()
    db_ops = DatabaseOperations(db)
    cache_dir = os.getenv('FASTF1_CACHE_DIR', './fastf1_cache')
    f1_client = FastF1Client(cache_dir=cache_dir)

    today = datetime.now().date()

    logger.info("=" * 80)
    logger.info(f"F1 Intelligence Hub - Sync for {year}  (today = {today})")
    logger.info("=" * 80)

    schedule = f1_client.get_event_schedule(year)
    season = db_ops.get_or_create_season(year)

    rounds_full: list[int] = []
    rounds_telem: list[int] = []
    rounds_skip: list[int] = []

    for _, event in schedule.iterrows():
        round_num = int(event['RoundNumber'])
        if round_num < 1:
            continue
        event_name = event['EventName']

        first_session_date = _event_first_session_date(event)
        if first_session_date is None:
            logger.info(f"  Round {round_num:>2}: {event_name} — no schedule date, skipping")
            continue

        if first_session_date > today:
            logger.info(
                f"  Round {round_num:>2}: {event_name} — weekend starts on {first_session_date}, skipping"
            )
            continue

        existing_race = db.query(RaceModel).filter(
            RaceModel.season_id == season.id,
            RaceModel.round_number == round_num,
        ).first()

        if existing_race is None:
            logger.info(f"  Round {round_num:>2}: {event_name} — not in DB → FULL LOAD")
            rounds_full.append(round_num)
            continue

        result_count = db.query(Result).filter(
            Result.race_id == existing_race.id,
            Result.is_sprint == False,
        ).count()

        race_session = db.query(DBSession).filter(
            DBSession.race_id == existing_race.id,
            DBSession.session_type == 'Race',
        ).first()

        lap_count = (
            db.query(LapTime).filter(LapTime.session_id == race_session.id).count()
            if race_session else 0
        )
        telem_count = (
            db.query(TelDB).filter(TelDB.session_id == race_session.id).count()
            if race_session else 0
        )

        if result_count == 0 or lap_count == 0:
            logger.info(
                f"  Round {round_num:>2}: {event_name} — "
                f"results={result_count} laps={lap_count} → FULL LOAD"
            )
            rounds_full.append(round_num)
        elif telem_count == 0:
            logger.info(
                f"  Round {round_num:>2}: {event_name} — "
                f"results={result_count} laps={lap_count} telem=0 → TELEMETRY ONLY"
            )
            rounds_telem.append(round_num)
        else:
            logger.info(
                f"  Round {round_num:>2}: {event_name} — "
                f"results={result_count} laps={lap_count} telem={telem_count} ✓ COMPLETE"
            )
            rounds_skip.append(round_num)

    db.close()

    logger.info(f"\nSync plan for {year}:")
    logger.info(f"  Full load      : {rounds_full  or 'none'}")
    logger.info(f"  Telemetry only : {rounds_telem or 'none'}")
    logger.info(f"  Already done   : {rounds_skip  or 'none'}")

    for r in rounds_full:
        load_season(year, from_round=r, to_round=r)

    for r in rounds_telem:
        load_season(year, from_round=r, to_round=r, telemetry_only=True, skip_circuits=True)

    logger.info(f"\n✅ Sync for {year} complete")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Load F1 season data")
    parser.add_argument(
        "years", nargs="*", type=int,
        help="Season years to load (e.g. 2021 2022). Defaults to current year."
    )
    parser.add_argument(
        "--from-round", type=int, default=1, metavar="N",
        help="Start loading from round N (skip earlier rounds). Useful for resuming."
    )
    parser.add_argument(
        "--to-round", type=int, default=None, metavar="N",
        help="Stop after round N (inclusive). Default: load all rounds."
    )
    parser.add_argument(
        "--results-only", action="store_true",
        help="Only load Race results — skip laps, telemetry, weather and messages (fast repair mode)."
    )
    parser.add_argument(
        "--skip-circuits", action="store_true",
        help="Skip generating circuit coordinate JSON files for the frontend."
    )
    parser.add_argument(
        "--telemetry-only", action="store_true",
        help="Only load telemetry for Race sessions — skip results, laps, weather, messages. "
             "Use to backfill telemetry for seasons loaded with --results-only."
    )
    parser.add_argument(
        "--sync", action="store_true",
        help=(
            "Auto-sync mode: inspect every completed round and load only what is missing. "
            "Equivalent to manually running --telemetry-only or a full load per round as needed. "
            "Idempotent — safe to run after every race weekend."
        ),
    )
    args = parser.parse_args()
    current_year = datetime.now().year
    seasons_to_load = args.years if args.years else [current_year]

    start_time = datetime.now()
    logger.info(f"Start time: {start_time}")

    if args.sync:
        for season in seasons_to_load:
            sync_season(season)
    else:
        if args.from_round > 1:
            logger.info(f"Starting from round {args.from_round}")
        if args.to_round:
            logger.info(f"Stopping after round {args.to_round}")
        if args.results_only:
            logger.info("Mode: results-only (laps/telemetry/weather/messages skipped)")
        if args.skip_circuits:
            logger.info("Mode: skip-circuits (circuit coordinate JSONs will not be generated)")
        if args.telemetry_only:
            logger.info("Mode: telemetry-only (only telemetry will be inserted for Race sessions)")

        for season in seasons_to_load:
            load_season(
                season,
                from_round=args.from_round,
                to_round=args.to_round,
                results_only=args.results_only,
                skip_circuits=args.skip_circuits,
                telemetry_only=args.telemetry_only,
            )

    end_time = datetime.now()
    logger.info(f"\nEnd time: {end_time}")
    logger.info(f"Total duration: {end_time - start_time}")
