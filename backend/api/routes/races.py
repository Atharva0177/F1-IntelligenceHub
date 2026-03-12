from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from database.config import get_db
from database.models import Race, Season, Circuit, Result, Driver, Team, LapTime, Session as DBSession, TelemetryData, RaceControlMessage
from typing import List, Optional
from pydantic import BaseModel
from datetime import date, datetime

router = APIRouter()


def _driver_full_name(driver) -> str:
    """Return a properly formatted full name from a Driver ORM object.
    Handles the broadcast abbreviation format stored as last_name, e.g. 'L HAMILTON' → 'Hamilton'.
    """
    first = driver.first_name or ""
    last = driver.last_name or ""
    # Broadcast format: "L HAMILTON" → first token is 1-2 uppercase chars
    parts = last.split(" ", 1)
    if len(parts) == 2 and len(parts[0]) <= 2 and parts[0].isupper():
        last = parts[1].title()  # "HAMILTON" → "Hamilton"
    return f"{first} {last}".strip() or "N/A"


# Pydantic Schemas
class CircuitSchema(BaseModel):
    id: int
    name: str
    country: str
    location: Optional[str]
    
    class Config:
        from_attributes = True


class SeasonSchema(BaseModel):
    year: int
    
    class Config:
        from_attributes = True


class DriverResultSchema(BaseModel):
    driver_code: str
    driver_name: str
    team_name: str
    position: Optional[int]
    grid_position: Optional[int]
    points: float
    status: str
    laps_completed: Optional[int]
    
    class Config:
        from_attributes = True


class RaceSchema(BaseModel):
    id: int
    name: str
    round_number: int
    date: Optional[date]
    season_year: int
    circuit: CircuitSchema
    winner_name: Optional[str] = None
    winner_team: Optional[str] = None
    status: str = "UPCOMING"
    
    class Config:
        from_attributes = True


class RaceDetailSchema(BaseModel):
    id: int
    name: str
    round_number: int
    date: Optional[date]
    season_year: int
    circuit: CircuitSchema
    results: List[DriverResultSchema]
    pole_position_driver: Optional[str] = None
    pole_position_team: Optional[str] = None
    fastest_lap_driver: Optional[str] = None
    fastest_lap_time: Optional[float] = None
    
    class Config:
        from_attributes = True


class SessionSchema(BaseModel):
    id: int
    session_type: str
    date: Optional[datetime]
    
    class Config:
        from_attributes = True


class LapTimeSchema(BaseModel):
    session_id: int
    lap_number: int
    driver_code: str
    lap_time_seconds: Optional[float]
    tire_compound: Optional[str]
    
    class Config:
        from_attributes = True


# API Endpoints
@router.get("/seasons")
async def get_seasons(db: Session = Depends(get_db)):
    """Return a sorted list of all season years that have race data."""
    from sqlalchemy import distinct
    years = db.query(distinct(Race.season_id)).all()
    # season_id is the year value in this schema
    season_years = sorted(
        {db.query(Season).filter(Season.id == y[0]).first().year for y in years if y[0]},
        reverse=True,
    )
    return {"seasons": season_years}


@router.get("", response_model=List[RaceSchema])
async def get_races(
    season: Optional[int] = None,
    limit: int = 100,
    db: Session = Depends(get_db)
):
    """
    Get all races, optionally filtered by season
    """
    query = db.query(Race).options(
        joinedload(Race.season),
        joinedload(Race.circuit),
        joinedload(Race.results).joinedload(Result.driver),
        joinedload(Race.results).joinedload(Result.team)
    )
    
    if season:
        query = query.join(Season).filter(Season.year == season)
    
    races = query.order_by(Race.date).limit(limit).all()
    
    result = []
    for race in races:
        winner_name = None
        winner_team = None
        status = "UPCOMING"
        
        if race.date and race.date < date.today():
            status = "COMPLETED"
            
        # Find winner (position 1)
        winner = next((r for r in race.results if r.position == 1), None)
        if winner:
            winner_name = _driver_full_name(winner.driver)
            winner_team = winner.team.name
            status = "COMPLETED"
            
        result.append({
            "id": race.id,
            "name": race.name,
            "round_number": race.round_number,
            "date": race.date,
            "season_year": race.season.year,
            "circuit": {
                "id": race.circuit.id,
                "name": race.circuit.name,
                "country": race.circuit.country,
                "location": race.circuit.location,
            },
            "winner_name": winner_name,
            "winner_team": winner_team,
            "status": status
        })
    
    return result


@router.get("/calendar/{year}")
async def get_season_calendar(year: int, db: Session = Depends(get_db)):
    """
    Get the full race calendar for a season with circuit coordinates for map display.
    Each round includes lat/lon, status (COMPLETED/UPCOMING), and the winner if available.
    """
    season = db.query(Season).filter(Season.year == year).first()
    if not season:
        raise HTTPException(status_code=404, detail=f"No data found for season {year}")

    races = db.query(Race).options(
        joinedload(Race.circuit),
        joinedload(Race.results).joinedload(Result.driver),
        joinedload(Race.results).joinedload(Result.team),
    ).filter(Race.season_id == season.id).order_by(Race.round_number).all()

    result = []
    for race in races:
        winner = next((r for r in race.results if r.position == 1), None)
        is_completed = bool(winner or (race.date and race.date < date.today()))
        result.append({
            "id": race.id,
            "round_number": race.round_number,
            "name": race.name,
            "date": race.date.isoformat() if race.date else None,
            "status": "COMPLETED" if is_completed else "UPCOMING",
            "circuit_name": race.circuit.name if race.circuit else None,
            "country": race.circuit.country if race.circuit else None,
            "location": race.circuit.location if race.circuit else None,
            "latitude": race.circuit.latitude if race.circuit else None,
            "longitude": race.circuit.longitude if race.circuit else None,
            "winner_name": _driver_full_name(winner.driver) if winner else None,
            "winner_team": winner.team.name if winner else None,
        })

    return result


@router.get("/data-version")
async def get_data_version(db: Session = Depends(get_db)):
    """Lightweight endpoint that returns a version fingerprint of the current
    DB state.  The frontend polls this every 30 s to detect when new race data
    has been loaded so pages can refetch automatically."""
    max_session = db.query(func.max(DBSession.id)).scalar() or 0
    max_result  = db.query(func.max(Result.id)).scalar() or 0
    return {"version": max(max_session, max_result)}


@router.get("/{race_id}", response_model=RaceDetailSchema)
async def get_race_detail(race_id: int, db: Session = Depends(get_db)):
    """
    Get detailed information about a specific race including results
    """
    race = db.query(Race).options(
        joinedload(Race.season),
        joinedload(Race.circuit),
        joinedload(Race.results).joinedload(Result.driver),
        joinedload(Race.results).joinedload(Result.team)
    ).filter(Race.id == race_id).first()
    
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")
    
    # Find pole position (grid position 1)
    pole_position = next((r for r in race.results if r.grid_position == 1), None)
    pole_driver = None
    pole_team = None
    if pole_position:
        pole_driver = _driver_full_name(pole_position.driver)
        pole_team = pole_position.team.name
    
    # Find fastest lap — prefer Result.fastest_lap_time, fall back to best time in lap_times table
    fastest_lap_time = None
    fastest_lap_driver_name = None

    results_with_fastest = [r for r in race.results if r.fastest_lap_time]
    if results_with_fastest:
        best_result = min(results_with_fastest, key=lambda r: r.fastest_lap_time)
        fastest_lap_time = best_result.fastest_lap_time
        fastest_lap_driver_name = _driver_full_name(best_result.driver)
    else:
        # Fallback: compute from lap_times table using the Race session
        race_session = db.query(DBSession).filter(
            DBSession.race_id == race_id,
            DBSession.session_type == "Race"
        ).first()
        if race_session:
            best_lap = (
                db.query(LapTime)
                .filter(
                    LapTime.session_id == race_session.id,
                    LapTime.lap_time_seconds.isnot(None),
                    LapTime.lap_time_seconds > 0,
                )
                .order_by(LapTime.lap_time_seconds)
                .first()
            )
            if best_lap:
                fastest_lap_time = best_lap.lap_time_seconds
                driver = db.query(Driver).filter(Driver.id == best_lap.driver_id).first()
                if driver:
                    fastest_lap_driver_name = _driver_full_name(driver)
    
    return {
        "id": race.id,
        "name": race.name,
        "round_number": race.round_number,
        "date": race.date,
        "season_year": race.season.year,
        "circuit": {
            "id": race.circuit.id,
            "name": race.circuit.name,
            "country": race.circuit.country,
            "location": race.circuit.location,
        },
        "pole_position_driver": pole_driver,
        "pole_position_team": pole_team,
        "fastest_lap_driver": fastest_lap_driver_name,
        "fastest_lap_time": fastest_lap_time,
        "results": [{
            "driver_code": result.driver.code,
            "driver_name": _driver_full_name(result.driver),
            "team_name": result.team.name,
            "position": result.position,
            "grid_position": result.grid_position,
            "points": result.points,
            "status": result.status,
            "laps_completed": result.laps_completed,
        } for result in sorted(race.results, key=lambda r: r.position if r.position else 999)]
    }


@router.get("/{race_id}/sessions", response_model=List[SessionSchema])
async def get_race_sessions(race_id: int, db: Session = Depends(get_db)):
    """
    Get all sessions for a specific race (FP1, FP2, FP3, Qualifying, Sprint, Race)
    """
    race = db.query(Race).options(
        joinedload(Race.sessions)
    ).filter(Race.id == race_id).first()
    
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")
    
    # Sort sessions by typical order
    session_order = {
        'FP1': 1, 'FP2': 2, 'FP3': 3,
        'Practice 1': 1, 'Practice 2': 2, 'Practice 3': 3,
        'Qualifying': 4, 'Sprint': 5, 'Race': 6
    }
    
    sessions = sorted(race.sessions, key=lambda s: session_order.get(s.session_type, 99))
    
    return [{
        "id": session.id,
        "session_type": session.session_type,
        "date": session.date,
    } for session in sessions]


@router.get("/{race_id}/lap-times", response_model=List[LapTimeSchema])
async def get_race_lap_times(
    race_id: int,
    driver_code: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get lap times for ALL sessions of a specific race
    """
    # Get race sessions
    race = db.query(Race).filter(Race.id == race_id).first()
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")
    
    # Get ALL session IDs for this race
    session_ids = [session.id for session in race.sessions]
    
    if not session_ids:
        return []
    
    # Query lap times for ALL sessions of this race
    query = db.query(LapTime, Driver.code).join(Driver).filter(
        LapTime.session_id.in_(session_ids)
    )
    
    if driver_code:
        query = query.filter(Driver.code == driver_code)
    
    lap_times = query.order_by(LapTime.session_id, LapTime.lap_number).all()
    
    result = []
    for lap_time, driver_code in lap_times:
        result.append({
            "session_id": lap_time.session_id,
            "lap_number": lap_time.lap_number,
            "driver_code": driver_code,
            "lap_time_seconds": lap_time.lap_time_seconds,
            "tire_compound": lap_time.tire_compound,
        })
    
    return result


@router.get("/{race_id}/replay-data")
async def get_race_replay_data(race_id: int, db: Session = Depends(get_db)):
    """
    Get comprehensive data for the Race Replay tab.
    Always uses the Race session (not the currently selected session).
    Returns lap times enriched with tire compound and pit-lap flags,
    plus per-driver metadata (team, final position, laps completed, status).
    """
    race = db.query(Race).options(
        joinedload(Race.results).joinedload(Result.driver),
        joinedload(Race.results).joinedload(Result.team),
    ).filter(Race.id == race_id).first()
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")

    race_session = db.query(DBSession).filter(
        DBSession.race_id == race_id,
        DBSession.session_type == "Race"
    ).first()
    if not race_session:
        raise HTTPException(status_code=404, detail="Race session not found")

    lap_rows = (
        db.query(LapTime, Driver.code)
        .join(Driver)
        .filter(LapTime.session_id == race_session.id)
        .order_by(Driver.code, LapTime.lap_number)
        .all()
    )

    laps = [
        {
            "lap_number": lt.lap_number,
            "driver_code": dc,
            "lap_time_seconds": lt.lap_time_seconds,
            "tire_compound": lt.tire_compound,
            "is_pit_in_lap": lt.is_pit_in_lap,
            "is_pit_out_lap": lt.is_pit_out_lap,
            "track_status": lt.track_status,
        }
        for lt, dc in lap_rows
    ]

    drivers = {
        r.driver.code: {
            "full_name": _driver_full_name(r.driver),
            "team": r.team.name if r.team else "",
            "final_position": r.position,
            "grid_position": r.grid_position,
            "laps_completed": r.laps_completed,
            "status": r.status,
        }
        for r in race.results
        if r.driver
    }

    # Race control messages for the race session (flags & safety car only)
    rc_rows = (
        db.query(RaceControlMessage)
        .filter(
            RaceControlMessage.session_id == race_session.id,
            RaceControlMessage.category.in_(["Flag", "SafetyCar"]),
        )
        .order_by(RaceControlMessage.timestamp)
        .all()
    )
    race_control = [
        {
            "timestamp": msg.timestamp.isoformat() if msg.timestamp else None,
            "category": msg.category,
            "message": msg.message,
            "flag": msg.flag,
            "status": msg.status,
            "scope": msg.scope,
        }
        for msg in rc_rows
    ]

    # Provide the session start time so the frontend can compute message elapsed times
    session_start_iso = race_session.date.isoformat() if race_session.date else None

    return {
        "laps": laps,
        "drivers": drivers,
        "race_control": race_control,
        "session_start": session_start_iso,
    }


@router.get("/{race_id}/drs-telemetry")
async def get_drs_telemetry(race_id: int, db: Session = Depends(get_db)):
    """
    Returns DRS zone fractions (0-1 of circuit length) and per-driver telemetry
    samples (200 uniformly-spaced points across the lap distance) for the Race
    Replay animation overlay.
    Each sample is a 5-element list: [speed, throttle, brake(0/1), drs, gear]
    """
    race_session = db.query(DBSession).filter(
        DBSession.race_id == race_id,
        DBSession.session_type == "Race"
    ).first()
    if not race_session:
        raise HTTPException(status_code=404, detail="Race session not found")

    rows = (
        db.query(
            TelemetryData.distance,
            TelemetryData.speed,
            TelemetryData.throttle,
            TelemetryData.brake,
            TelemetryData.drs,
            TelemetryData.gear,
            Driver.code,
        )
        .join(Driver)
        .filter(
            TelemetryData.session_id == race_session.id,
            TelemetryData.distance.isnot(None),
        )
        .order_by(Driver.code, TelemetryData.distance)
        .all()
    )

    if not rows:
        return {"drs_zones": [], "driver_telemetry": {}, "circuit_length": 0}

    from collections import defaultdict

    driver_data: dict = defaultdict(list)
    for row in rows:
        driver_data[row.code].append({
            "dist": float(row.distance or 0),
            "s": round(float(row.speed or 0)),
            "t": round(float(row.throttle or 0)),
            "b": 1 if row.brake else 0,
            "d": int(row.drs or 0),
            "g": int(row.gear or 0),
        })

    # Circuit length = max distance across all drivers
    max_dist = max(
        (max(p["dist"] for p in pts) if pts else 0.0)
        for pts in driver_data.values()
    )
    if max_dist <= 0:
        return {"drs_zones": [], "driver_telemetry": {}, "circuit_length": 0}

    # Sample each driver at N uniform distance points
    N = 200
    driver_telemetry: dict = {}
    for code, pts in driver_data.items():
        pts.sort(key=lambda x: x["dist"])
        dists = [p["dist"] for p in pts]
        samples = []
        for i in range(N):
            target = (i / (N - 1)) * max_dist
            lo, hi = 0, len(dists) - 1
            while lo < hi:
                mid = (lo + hi + 1) >> 1
                if dists[mid] <= target:
                    lo = mid
                else:
                    hi = mid - 1
            p = pts[lo]
            samples.append([p["s"], p["t"], p["b"], p["d"], p["g"]])
        driver_telemetry[code] = samples

    # ── DRS zone detection ────────────────────────────────────────────────
    # Race telemetry is unreliable for locating DRS zones: DRS only opens when
    # a driver is within 1 s of the car ahead, so many zones have zero or
    # sparse activation data.  Qualifying telemetry is vastly better because
    # every driver opens DRS at every zone on every flying lap.
    # Strategy: prefer Qualifying session; fall back to any session with good
    # DRS coverage; last resort: use race data with a very low threshold.

    qual_session = db.query(DBSession).filter(
        DBSession.race_id == race_id,
        DBSession.session_type == "Qualifying",
    ).first()

    # Pick the best session for zone detection
    zone_session = qual_session or race_session

    zone_rows = (
        db.query(TelemetryData.distance, TelemetryData.drs, Driver.code)
        .join(Driver)
        .filter(
            TelemetryData.session_id == zone_session.id,
            TelemetryData.distance.isnot(None),
        )
        .order_by(Driver.code, TelemetryData.distance)
        .all()
    )

    from collections import defaultdict as _ddict
    zone_driver_data: dict = _ddict(list)
    for row in zone_rows:
        zone_driver_data[row.code].append((float(row.distance or 0), int(row.drs or 0)))

    # Use the same max_dist reference as the race telemetry so fractions align
    zone_max_dist = (
        max(
            (max(d for d, _ in pts) if pts else 0.0)
            for pts in zone_driver_data.values()
        )
        if zone_driver_data else 0.0
    ) or max_dist

    # In Qualifying every driver opens DRS (drs >= 12) at every zone, giving
    # clean activation boundaries.  In Race (fallback) we accept drs >= 8.
    DRS_THRESHOLD = 12 if qual_session else 8
    # Vote at ZONE_N uniform distance points
    ZONE_N = 500
    zone_votes = [0] * ZONE_N
    zone_total = [0] * ZONE_N

    for code, pts in zone_driver_data.items():
        pts.sort(key=lambda x: x[0])
        dists = [p[0] for p in pts]
        for i in range(ZONE_N):
            target = (i / (ZONE_N - 1)) * zone_max_dist
            lo, hi = 0, len(dists) - 1
            while lo < hi:
                mid = (lo + hi + 1) >> 1
                if dists[mid] <= target:
                    lo = mid
                else:
                    hi = mid - 1
            zone_total[i] += 1
            if pts[lo][1] >= DRS_THRESHOLD:
                zone_votes[i] += 1

    # Require ≥ 50 % of drivers for Qualifying (clean data),
    # or just ≥ 1 driver for Race fallback (sparse data).
    VOTE_THRESHOLD = 0.50 if qual_session else (1 / max(len(zone_driver_data), 1))
    in_zone_flags = [
        (zone_votes[i] / zone_total[i] >= VOTE_THRESHOLD if zone_total[i] > 0 else False)
        for i in range(ZONE_N)
    ]

    # Extract contiguous runs of True flags, converting indices → lap fractions
    # relative to the RACE circuit length (so overlays align with race track).
    dist_scale = zone_max_dist / max_dist  # usually ≈ 1.0
    drs_zones: list = []
    in_zone = False
    zone_start_idx = 0
    for i, flag in enumerate(in_zone_flags):
        if flag and not in_zone:
            in_zone = True
            zone_start_idx = i
        elif not flag and in_zone:
            in_zone = False
            s = (zone_start_idx / (ZONE_N - 1)) / dist_scale
            e = ((i - 1) / (ZONE_N - 1)) / dist_scale
            drs_zones.append({"start": round(min(s, 1.0), 4), "end": round(min(e, 1.0), 4)})
    if in_zone:
        s = (zone_start_idx / (ZONE_N - 1)) / dist_scale
        drs_zones.append({"start": round(min(s, 1.0), 4), "end": 1.0})

    # Merge zones that are separated by a very small gap (< 3 % of lap)
    # to handle sampling noise at zone boundaries.
    MERGE_GAP = 0.03
    merged: list = []
    for zone in drs_zones:
        if merged and zone["start"] - merged[-1]["end"] < MERGE_GAP:
            merged[-1]["end"] = zone["end"]
        else:
            merged.append(dict(zone))
    drs_zones = merged

    # Drop trivially short segments (< 1.5 % of lap) — noise artefacts
    drs_zones = [z for z in drs_zones if z["end"] - z["start"] > 0.015]

    # Detect wrap-around: if the first zone starts at 0 AND the last zone ends
    # at 1.0, they are two halves of the same physical zone crossing the
    # start/finish line.  Keep both SVG segments but report 1 fewer physical zone.
    physical_zone_count = len(drs_zones)
    if (len(drs_zones) >= 2
            and drs_zones[0]["start"] <= 0.02
            and drs_zones[-1]["end"] >= 0.98):
        physical_zone_count -= 1

    return {
        "drs_zones": drs_zones,
        "zone_count": physical_zone_count,
        "driver_telemetry": driver_telemetry,
        "circuit_length": round(max_dist),
    }


@router.get("/{race_id}/positions")
async def get_race_positions(race_id: int, db: Session = Depends(get_db)):
    """
    Get granular position data for TOP 3 drivers in a race
    Returns coordinate indices based on sampled telemetry data from FastF1
    Samples multiple points per lap for smooth animation and overtake visualization
    Limited to top 3 finishers for performance
    """
    import fastf1
    import numpy as np
    from pathlib import Path
    import logging
    
    logger = logging.getLogger(__name__)
    
    # Get the race with season relationship and results
    race = db.query(Race).options(
        joinedload(Race.season),
        joinedload(Race.results).joinedload(Result.driver)
    ).filter(Race.id == race_id).first()
    
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")
    
    try:
        # Get top 3 finishers from race results
        top_3_results = sorted(
            [r for r in race.results if r.position is not None and r.position <= 3],
            key=lambda x: x.position
        )
        
        if len(top_3_results) == 0:
            logger.warning(f"No race results found for race {race_id}")
            return []
        
        top_3_drivers = [r.driver.code for r in top_3_results if r.driver and r.driver.code]
        logger.info(f"Processing top 3 drivers: {top_3_drivers}")
        
        # Load FastF1 session
        cache_dir = Path(__file__).parent.parent.parent.parent / '.fastf1_cache'
        fastf1.Cache.enable_cache(str(cache_dir))
        
        session = fastf1.get_session(race.season.year, race.round_number, 'R')
        session.load(telemetry=True, laps=True, weather=False, messages=False)
        
        # Get circuit coordinates for mapping
        circuit_file = Path(__file__).parent.parent.parent.parent / 'frontend' / 'public' / 'circuits' / f"{race.name.lower().replace(' ', '_')}.json"
        
        if not circuit_file.exists():
            raise HTTPException(status_code=404, detail="Circuit data not found")
        
        import json
        with open(circuit_file, 'r') as f:
            circuit_data = json.load(f)
        
        circuit_x = np.array(circuit_data['x'])
        circuit_y = np.array(circuit_data['y'])
        
        # Get all laps - but filter to top 3 drivers only
        all_laps = session.laps
        
        if all_laps.empty:
            return []
        
        # Filter laps to only include top 3 drivers
        top_3_laps = all_laps[all_laps['Driver'].isin(top_3_drivers)]
        
        if top_3_laps.empty:
            logger.warning(f"No laps found for top 3 drivers: {top_3_drivers}")
            return []
        
        # Get max lap number
        max_lap = int(top_3_laps['LapNumber'].max())
        
        # Sample telemetry at regular intervals (e.g., 10 samples per lap)
        samples_per_lap = 10
        
        # Build result array
        result = []
        
        for lap_num in range(1, min(max_lap + 1, 15)):  # Limit to first 15 laps for performance
            # Get laps for this lap number (top 3 only)
            laps_this_lap = top_3_laps[top_3_laps['LapNumber'] == lap_num]
            
            logger.info(f"Processing lap {lap_num}: {len(laps_this_lap)} laps found (top 3 only)")
            
            # Sample telemetry points throughout the lap
            for sample_idx in range(samples_per_lap):
                lap_data = {'lap': lap_num + (sample_idx / samples_per_lap)}
                
                for idx, lap in laps_this_lap.iterrows():
                    try:
                        driver_code = lap['Driver']
                        
                        # Get telemetry for this lap
                        from data_pipeline.fastf1_client import get_telemetry_safe
                        telemetry = get_telemetry_safe(lap)
                        
                        if telemetry is None or len(telemetry) == 0:
                            logger.warning(f"No telemetry for {driver_code} lap {lap_num}")
                            continue
                        
                        # Sample at this fraction of the lap
                        sample_position = int((sample_idx / samples_per_lap) * len(telemetry))
                        sample_position = min(sample_position, len(telemetry) - 1)
                        
                        sample_point = telemetry.iloc[sample_position]
                        
                        # Get X, Y coordinates
                        car_x = sample_point['X']
                        car_y = sample_point['Y']
                        
                        # Check for NaN values
                        if np.isnan(car_x) or np.isnan(car_y):
                            logger.warning(f"NaN coordinates for {driver_code} lap {lap_num}")
                            continue
                        
                        # Find nearest circuit coordinate index
                        distances = np.sqrt((circuit_x - car_x)**2 + (circuit_y - car_y)**2)
                        nearest_idx = int(np.argmin(distances))
                        
                        # Store as 1-based index (frontend expects 1-based)
                        lap_data[driver_code] = nearest_idx + 1
                        
                        if lap_num == 1 and sample_idx == 0:
                            logger.info(f"Lap 1 sample 0: {driver_code} at idx {nearest_idx + 1}")
                        
                    except Exception as e:
                        # Skip this driver if telemetry is unavailable
                        logger.error(f"Error processing {driver_code} lap {lap_num}: {e}")
                        continue
                
                result.append(lap_data)
                
        logger.info(f"Returning {len(result)} data points for top 3 drivers")
        return result
        
    except Exception as e:
        logger.error(f"Error loading FastF1 data: {e}")
        raise HTTPException(status_code=500, detail=f"Could not load race position data: {str(e)}")
