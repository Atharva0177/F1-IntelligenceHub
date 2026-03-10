"""
Weather API Routes
Endpoints for accessing weather data
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime

from database.config import get_db
from database.models import WeatherData, Session as DBSession

router = APIRouter(prefix="/api/weather", tags=["weather"])


@router.get("/{session_id}")
def get_session_weather(session_id: int, db: Session = Depends(get_db)):
    """
    Get all weather data for a specific session
    
    Args:
        session_id: ID of the session
        
    Returns:
        List of weather data points
    """
    weather_data = db.query(WeatherData).filter(
        WeatherData.session_id == session_id
    ).order_by(WeatherData.timestamp).all()
    
    if not weather_data:
        return []
    
    return [{
        "id": w.id,
        "timestamp": w.timestamp.isoformat() if w.timestamp else None,
        "air_temp": w.air_temp,
        "track_temp": w.track_temp,
        "humidity": w.humidity,
        "pressure": w.pressure,
        "wind_speed": w.wind_speed,
        "wind_direction": w.wind_direction,
        "rainfall": w.rainfall,
    } for w in weather_data]


@router.get("/{session_id}/summary")
def get_weather_summary(session_id: int, db: Session = Depends(get_db)):
    """
    Get weather summary statistics for a session
    
    Args:
        session_id: ID of the session
        
    Returns:
        Dictionary with weather summary
    """
    from sqlalchemy import func
    
    summary = db.query(
        func.avg(WeatherData.air_temp).label('avg_air_temp'),
        func.max(WeatherData.air_temp).label('max_air_temp'),
        func.min(WeatherData.air_temp).label('min_air_temp'),
        func.avg(WeatherData.track_temp).label('avg_track_temp'),
        func.max(WeatherData.track_temp).label('max_track_temp'),
        func.avg(WeatherData.humidity).label('avg_humidity'),
        func.avg(WeatherData.wind_speed).label('avg_wind_speed'),
        func.max(WeatherData.wind_speed).label('max_wind_speed'),
    ).filter(
        WeatherData.session_id == session_id
    ).first()
    
    if not summary or summary.avg_air_temp is None:
        raise HTTPException(status_code=404, detail="No weather data found for this session")

    # Check if any rainfall occurred during the session
    rainfall_occurred = db.query(WeatherData).filter(
        WeatherData.session_id == session_id,
        WeatherData.rainfall == True,
    ).first() is not None

    return {
        "avg_air_temp": round(summary.avg_air_temp, 1) if summary.avg_air_temp else None,
        "max_air_temp": round(summary.max_air_temp, 1) if summary.max_air_temp else None,
        "min_air_temp": round(summary.min_air_temp, 1) if summary.min_air_temp else None,
        "avg_track_temp": round(summary.avg_track_temp, 1) if summary.avg_track_temp else None,
        "max_track_temp": round(summary.max_track_temp, 1) if summary.max_track_temp else None,
        "avg_humidity": round(summary.avg_humidity, 1) if summary.avg_humidity else None,
        "avg_wind_speed": round(summary.avg_wind_speed, 1) if summary.avg_wind_speed else None,
        "max_wind_speed": round(summary.max_wind_speed, 1) if summary.max_wind_speed else None,
        "rainfall_occurred": rainfall_occurred,
    }
