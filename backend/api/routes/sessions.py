"""
Session-related API endpoints
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from database.config import get_db
from database.models import LapTime, Driver, Session as DBSession, Result, Qualifying, Race


router = APIRouter(prefix="/sessions", tags=["sessions"])


def _resolve_team_name(
    db: Session,
    race_id: int,
    driver_id: int,
    season_id: Optional[int],
) -> str:
    """Resolve constructor name for a driver in a session context.

    Fallback order:
    1) Result row from the same race
    2) Latest result row from the same season
    3) Latest result row across all seasons
    """
    same_race_result = db.query(Result).filter(
        Result.race_id == race_id,
        Result.driver_id == driver_id,
    ).first()
    if same_race_result and same_race_result.team:
        return same_race_result.team.name

    if season_id is not None:
        same_season_result = (
            db.query(Result)
            .join(Race, Result.race_id == Race.id)
            .filter(
                Result.driver_id == driver_id,
                Race.season_id == season_id,
            )
            .order_by(Race.date.desc().nullslast(), Race.round_number.desc().nullslast(), Result.id.desc())
            .first()
        )
        if same_season_result and same_season_result.team:
            return same_season_result.team.name

    latest_result = (
        db.query(Result)
        .join(Race, Result.race_id == Race.id)
        .filter(Result.driver_id == driver_id)
        .order_by(Race.date.desc().nullslast(), Race.round_number.desc().nullslast(), Result.id.desc())
        .first()
    )
    if latest_result and latest_result.team:
        return latest_result.team.name

    return "Unknown"


@router.get("/{session_id}/lap-times", response_model=List[dict])
async def get_session_lap_times(
    session_id: int,
    driver_code: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get lap times for a specific session
    
    Args:
        session_id: ID of the session
        driver_code: Optional filter by driver code
        
    Returns:
        List of lap times with driver information
    """
    # Verify session exists
    session = db.query(DBSession).filter(DBSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Query lap times for this session
    query = db.query(LapTime, Driver.code).join(Driver).filter(
        LapTime.session_id == session_id
    )
    
    if driver_code:
        query = query.filter(Driver.code == driver_code)
    
    lap_times = query.order_by(LapTime.lap_number).all()
    
    result = []
    for lap_time, driver_code_value in lap_times:
        result.append({
            "session_id": lap_time.session_id,
            "lap_number": lap_time.lap_number,
            "driver_code": driver_code_value,
            "lap_time": lap_time.lap_time_seconds,  # Match frontend expectation
            "lap_time_seconds": lap_time.lap_time_seconds,
            "tire_compound": lap_time.tire_compound,
        })
    
    return result


@router.get("/{session_id}/results")
async def get_session_results(
    session_id: int,
    db: Session = Depends(get_db)
):
    """
    Get results/classification for a specific session
    Handles Race, Qualifying, and Practice sessions differently
    """
    session = db.query(DBSession).filter(DBSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    race = db.query(Race).filter(Race.id == session.race_id).first()
    season_id = race.season_id if race else None
    
    session_type = session.session_type
    
    # 1. Race / Sprint Results
    if session_type in ('Race', 'Sprint'):
        is_sprint_session = session_type == 'Sprint'
        results = db.query(Result).filter(
            Result.race_id == session.race_id,
            Result.is_sprint == is_sprint_session,
        ).all()

        if results:
            return [{
                "position": r.position,
                "driver_code": r.driver.code,
                "driver_name": f"{r.driver.first_name or ''} {r.driver.last_name or ''}".strip(),
                # TODO: consolidate with _driver_full_name helper once broadcast format is cleaned
                "team_name": r.team.name,
                "grid_position": r.grid_position,
                "points": r.points,
                "status": r.status,
                "laps_completed": r.laps_completed,
                "fastest_lap_time": r.fastest_lap_time,
                "time": r.race_time_seconds  # Total race/sprint time
            } for r in sorted(results, key=lambda x: x.position if x.position else 999)]

    # 2. Qualifying Results
    if session_type == 'Qualifying':
        from database.models import Qualifying, Team
        
        # Query Qualifying table
        qualifying_results = db.query(Qualifying).filter(Qualifying.race_id == session.race_id).all()
        
        if qualifying_results:
            # Helper to get team name (fallback to finding it from Race Results if possible)
            results_data = []
            for q in qualifying_results:
                team_name = _resolve_team_name(
                    db=db,
                    race_id=session.race_id,
                    driver_id=q.driver_id,
                    season_id=season_id,
                )
                
                # Determine best time
                best_time = q.q3_time or q.q2_time or q.q1_time
                
                results_data.append({
                    "position": q.position,
                    "driver_code": q.driver.code,
                    "driver_name": f"{q.driver.first_name or ''} {q.driver.last_name or ''}".strip(),
                    "team_name": team_name,
                    "q1": q.q1_time,
                    "q2": q.q2_time,
                    "q3": q.q3_time,
                    "best_time": best_time,
                    "best_lap_time": best_time,      # alias used by frontend table
                    "fastest_lap_time": best_time,   # secondary alias
                    "laps_completed": None,
                })
                
            return sorted(results_data, key=lambda x: x['position'] if x['position'] else 999)

    # 3. Practice Results (FP1, FP2, FP3) OR Qualifying Fallback
    # Calculate from LapTimes (Fastest Lap per driver)
    # Get all lap times for this session
    lap_times = db.query(LapTime).filter(LapTime.session_id == session_id).all()
    
    driver_best_laps = {}
    
    for lap in lap_times:
        if not lap.lap_time_seconds:
            continue
            
        driver_id = lap.driver_id
        if driver_id not in driver_best_laps:
            driver_best_laps[driver_id] = {
                "time": lap.lap_time_seconds,
                "lap_obj": lap
            }
        else:
            if lap.lap_time_seconds < driver_best_laps[driver_id]["time"]:
                driver_best_laps[driver_id] = {
                    "time": lap.lap_time_seconds,
                    "lap_obj": lap
                }
    
    # Format results
    results_data = []
    for i, (driver_id, data) in enumerate(sorted(driver_best_laps.items(), key=lambda x: x[1]["time"]), start=1):
        lap = data["lap_obj"]
        driver = lap.driver
        
        team_name = _resolve_team_name(
            db=db,
            race_id=session.race_id,
            driver_id=driver_id,
            season_id=season_id,
        )
        
        results_data.append({
            "position": i,
            "driver_code": driver.code,
            "driver_name": f"{driver.first_name or ''} {driver.last_name or ''}".strip(),
            "team_name": team_name,
            "fastest_lap_time": data["time"],
            "best_lap_time": data["time"], # Add this alias for frontend compatibility
            "laps_completed": len([l for l in lap_times if l.driver_id == driver_id]),
            "tire_compound": lap.tire_compound
        })
        
    return results_data
