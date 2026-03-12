from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from database.config import get_db
from database.models import LapTime, Driver, Session as DBSession, Race
from typing import List, Optional
from pydantic import BaseModel

router = APIRouter()


# Pydantic schemas
class PaceAnalysisSchema(BaseModel):
    driver_code: str
    avg_lap_time: float
    best_lap_time: float
    consistency: float
    
    class Config:
        from_attributes = True


class TireStrategySchema(BaseModel):
    driver_code: str
    compound: str
    stint_start: int
    stint_end: int
    avg_lap_time: float
    
    class Config:
        from_attributes = True


class SectorTimeSchema(BaseModel):
    driver_code: str
    sector1_avg: Optional[float]
    sector2_avg: Optional[float]
    sector3_avg: Optional[float]
    sector1_best: Optional[float]
    sector2_best: Optional[float]
    sector3_best: Optional[float]
    
    class Config:
        from_attributes = True


@router.get("/pace-analysis")
async def get_pace_analysis(
    session_id: int,
    db: Session = Depends(get_db)
):
    """
    Analyze pace for drivers in a session
    """
    session = db.query(DBSession).filter(DBSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Calculate pace metrics per driver
    pace_data = db.query(
        Driver.code,
        func.avg(LapTime.lap_time_seconds).label('avg_lap_time'),
        func.min(LapTime.lap_time_seconds).label('best_lap_time'),
        func.stddev(LapTime.lap_time_seconds).label('std_dev')
    ).join(Driver).filter(
        LapTime.session_id == session_id,
        LapTime.lap_time_seconds.isnot(None),
        LapTime.is_pit_out_lap == False,
        LapTime.is_pit_in_lap == False
    ).group_by(Driver.code).all()
    
    result = []
    for code, avg, best, std in pace_data:
        consistency = 1.0 / (1.0 + float(std or 0)) if std else 1.0
        result.append({
            "driver_code": code,
            "avg_lap_time": float(avg) if avg else 0.0,
            "best_lap_time": float(best) if best else 0.0,
            "consistency": consistency
        })
    
    return sorted(result, key=lambda x: x['avg_lap_time'])


@router.get("/tire-strategies")
async def get_tire_strategies(
    session_id: int,
    db: Session = Depends(get_db)
):
    """
    Analyze tire strategies for a session
    """
    session = db.query(DBSession).filter(DBSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Get tire usage data including tire_life for fresh/used detection
    lap_times = db.query(
        Driver.code,
        LapTime.tire_compound,
        LapTime.lap_number,
        LapTime.lap_time_seconds,
        LapTime.tire_life,
    ).join(Driver).filter(
        LapTime.session_id == session_id,
        LapTime.tire_compound.isnot(None)
    ).order_by(Driver.code, LapTime.lap_number).all()

    # Detect actual stints: a new stint begins whenever the compound changes
    stints_by_driver: dict = {}  # driver_code -> list of stint dicts
    for code, compound, lap_num, lap_time, tire_life in lap_times:
        if code not in stints_by_driver:
            stints_by_driver[code] = []
        driver_stints = stints_by_driver[code]
        # Start a new stint if no stints yet OR compound has changed from previous lap
        if not driver_stints or driver_stints[-1]["compound"] != compound:
            driver_stints.append({
                "compound": compound,
                "laps": [],
                "times": [],
                "first_tire_life": tire_life,  # tire_life on the first lap of the stint
            })
        driver_stints[-1]["laps"].append(lap_num)
        if lap_time is not None:
            driver_stints[-1]["times"].append(lap_time)

    # Format results
    result = []
    for code, stints in stints_by_driver.items():
        for i, stint in enumerate(stints):
            if stint["laps"]:
                times = stint["times"]
                first_life = stint.get("first_tire_life")
                # A tyre is fresh/new when its life starts at 1 (or 0)
                fresh_tyre = (first_life is not None and first_life <= 1)
                # How many laps were already on the tyre when the stint started
                tire_age_when_started = max(0, (first_life or 1) - 1)
                result.append({
                    "driver_code": code,
                    "compound": stint["compound"],
                    "stint_start": min(stint["laps"]),
                    "stint_end": max(stint["laps"]),
                    "stint_number": i + 1,
                    "lap_count": len(stint["laps"]),
                    "avg_lap_time": sum(times) / len(times) if times else 0.0,
                    "fastest_lap_time": min(times) if times else 0.0,
                    "fresh_tyre": fresh_tyre,
                    "tire_age_when_started": tire_age_when_started,
                })

    return result


@router.get("/sector-times")
async def get_sector_analysis(
    session_id: int,
    db: Session = Depends(get_db)
):
    """
    Analyze sector times for drivers
    """
    session = db.query(DBSession).filter(DBSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Calculate sector statistics
    sector_data = db.query(
        Driver.code,
        func.avg(LapTime.sector1_time).label('sector1_avg'),
        func.avg(LapTime.sector2_time).label('sector2_avg'),
        func.avg(LapTime.sector3_time).label('sector3_avg'),
        func.min(LapTime.sector1_time).label('sector1_best'),
        func.min(LapTime.sector2_time).label('sector2_best'),
        func.min(LapTime.sector3_time).label('sector3_best')
    ).join(Driver).filter(
        LapTime.session_id == session_id
    ).group_by(Driver.code).all()
    
    return [
        {
            "driver_code": code,
            "sector1_avg": float(s1_avg) if s1_avg else None,
            "sector2_avg": float(s2_avg) if s2_avg else None,
            "sector3_avg": float(s3_avg) if s3_avg else None,
            "sector1_best": float(s1_best) if s1_best else None,
            "sector2_best": float(s2_best) if s2_best else None,
            "sector3_best": float(s3_best) if s3_best else None
        }
        for code, s1_avg, s2_avg, s3_avg, s1_best, s2_best, s3_best in sector_data
    ]
