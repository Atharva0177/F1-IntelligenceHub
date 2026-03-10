from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database.config import get_db
from database.models import TelemetryData, Driver, Session as DBSession
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

router = APIRouter()


# Pydantic schemas
class TelemetryPointSchema(BaseModel):
    timestamp: datetime
    lap_number: Optional[int]
    x: Optional[float]
    y: Optional[float]
    z: Optional[float]
    speed: Optional[float]
    throttle: Optional[float]
    brake: Optional[bool]
    gear: Optional[int]
    distance: Optional[float]
    
    class Config:
        from_attributes = True


@router.get("/{session_id}", response_model=List[TelemetryPointSchema])
async def get_session_telemetry(
    session_id: int,
    driver_code: Optional[str] = None,
    lap_number: Optional[int] = None,
    limit: int = 1000,
    db: Session = Depends(get_db)
):
    """
    Get telemetry data for a specific session
    """
    session = db.query(DBSession).filter(DBSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    query = db.query(TelemetryData).filter(TelemetryData.session_id == session_id)
    
    if driver_code:
        driver = db.query(Driver).filter(Driver.code == driver_code).first()
        if driver:
            query = query.filter(TelemetryData.driver_id == driver.id)
    
    if lap_number is not None:
        query = query.filter(TelemetryData.lap_number == lap_number)
    
    telemetry = query.order_by(TelemetryData.timestamp).limit(limit).all()
    
    return [
        {
            "timestamp": t.timestamp,
            "lap_number": t.lap_number,
            "x": t.x,
            "y": t.y,
            "z": t.z,
            "speed": t.speed,
            "throttle": t.throttle,
            "brake": t.brake,
            "gear": t.gear,
            "distance": t.distance
        }
        for t in telemetry
    ]


@router.get("/track/{circuit_id}")
async def get_track_coordinates(circuit_id: int, db: Session = Depends(get_db)):
    """
    Get 3D track coordinates for a circuit
    """
    # Get unique XYZ points from telemetry data for this circuit
    # This is a simplified version - in production, you'd want to cache this
    
    from database.models import Circuit, Race
    
    circuit = db.query(Circuit).filter(Circuit.id == circuit_id).first()
    if not circuit:
        raise HTTPException(status_code=404, detail="Circuit not found")
    
    # Get a race at this circuit
    race = db.query(Race).filter(Race.circuit_id == circuit_id).first()
    if not race or not race.sessions:
        raise HTTPException(status_code=404, detail="No telemetry data available for this circuit")
    
    # Get session
    session = race.sessions[0] if race.sessions else None
    if not session:
        raise HTTPException(status_code=404, detail="No session data available")
    
    # Get sample telemetry points (every 10th point to reduce data)
    telemetry = db.query(
        TelemetryData.x,
        TelemetryData.y,
        TelemetryData.z,
        TelemetryData.distance
    ).filter(
        TelemetryData.session_id == session.id
    ).order_by(TelemetryData.distance).limit(2000).all()
    
    if not telemetry:
        raise HTTPException(status_code=404, detail="No telemetry data found")
    
    # Return track points
    return {
        "circuit_name": circuit.name,
        "points": [
            {"x": t.x, "y": t.y, "z": t.z, "distance": t.distance}
            for t in telemetry if t.x and t.y
        ]
    }
