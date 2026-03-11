from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from database.config import get_db
from database.models import Race, Circuit, Result, Driver, Season
from typing import List, Dict, Optional
from pathlib import Path
import json
import os
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/{race_id}/layout")
async def get_circuit_layout(race_id: int, db: Session = Depends(get_db)):
    """
    Get circuit layout coordinates for 3D visualization
    """
    # Get the race
    race = db.query(Race).filter(Race.id == race_id).first()
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")
    
    # Try to find the circuit file based on race name
    # The files are named like "bahrain_grand_prix.json"
    # API is in backend/api/routes, so go up 3 levels to project root, then into frontend/public/circuits
    circuits_dir = Path(__file__).parent.parent.parent.parent / 'frontend' / 'public' / 'circuits'
    
    # Convert race name to filename format
    filename = race.name.lower().replace(' ', '_').replace('-', '_') + '.json'
    file_path = circuits_dir / filename
    
    logger.info(f"Looking for circuit file: {file_path}")
    
    if file_path.exists():
        try:
            with open(file_path, 'r') as f:
                data = json.load(f)
                logger.info(f"Loaded circuit data with {len(data.get('x', []))} points")
                return {
                    "x": data.get("x", []),
                    "y": data.get("y", [])
                }
        except Exception as e:
            logger.error(f"Error reading circuit file: {e}")
            return {"x": [], "y": []}
    
    # If no file found, return empty (will be handled by frontend)
    logger.warning(f"Circuit file not found: {file_path}")
    return {
        "x": [],
        "y": []
    }


@router.get("")
async def get_circuits(db: Session = Depends(get_db)):
    """Get all circuits with basic info."""
    circuits = db.query(Circuit).order_by(Circuit.country).all()
    return [{
        "id": c.id,
        "name": c.name,
        "country": c.country,
        "location": c.location,
        "latitude": c.latitude,
        "longitude": c.longitude,
        "length_km": c.length_km,
    } for c in circuits]


@router.get("/{circuit_id}/history")
async def get_circuit_history(circuit_id: int, db: Session = Depends(get_db)):
    """Return race-by-race history at this circuit in a flat format for the frontend."""
    circuit = db.query(Circuit).filter(Circuit.id == circuit_id).first()
    if not circuit:
        raise HTTPException(status_code=404, detail="Circuit not found")

    races = db.query(Race).options(
        joinedload(Race.season),
        joinedload(Race.results).joinedload(Result.driver),
        joinedload(Race.results).joinedload(Result.team),
    ).filter(Race.circuit_id == circuit_id).order_by(Race.date.desc()).all()

    history = []
    for race in races:
        winner = next((r for r in race.results if r.position == 1), None)
        history.append({
            "race_name": race.name,
            "year": race.season.year if race.season else None,
            "date": race.date.isoformat() if race.date else None,
            "winner_name": (
                f"{winner.driver.first_name} {winner.driver.last_name}" if winner and winner.driver else None
            ),
            "winner_team": winner.team.name if winner and winner.team else None,
        })
    return history


@router.get("/{circuit_id}")
async def get_circuit(circuit_id: int, db: Session = Depends(get_db)):
    """
    Get full circuit guide: metadata + race history at this venue.
    """
    circuit = db.query(Circuit).filter(Circuit.id == circuit_id).first()
    if not circuit:
        raise HTTPException(status_code=404, detail="Circuit not found")

    # Race history at this circuit
    races = db.query(Race).options(
        joinedload(Race.season),
        joinedload(Race.results).joinedload(Result.driver),
        joinedload(Race.results).joinedload(Result.team),
    ).filter(Race.circuit_id == circuit_id).order_by(Race.date.desc()).all()

    history = []
    for race in races:
        winner = next((r for r in race.results if r.position == 1), None)
        pole = next((r for r in race.results if r.grid_position == 1), None)
        fastest_results = [r for r in race.results if r.fastest_lap_time]
        fastest = min(fastest_results, key=lambda r: r.fastest_lap_time) if fastest_results else None
        history.append({
            "race_id": race.id,
            "season": race.season.year,
            "round_number": race.round_number,
            "race_name": race.name,
            "date": race.date.isoformat() if race.date else None,
            "winner": f"{winner.driver.first_name} {winner.driver.last_name}" if winner else None,
            "winner_team": winner.team.name if winner else None,
            "pole_position": f"{pole.driver.first_name} {pole.driver.last_name}" if pole else None,
            "fastest_lap_time": fastest.fastest_lap_time if fastest else None,
            "fastest_lap_driver": (
                f"{fastest.driver.first_name} {fastest.driver.last_name}" if fastest else None
            ),
        })

    # Lap record: best ever fastest_lap_time at this circuit
    lap_record = None
    lap_record_driver = None
    lap_record_season = None
    if history:
        best = min(
            [(h["fastest_lap_time"], h["fastest_lap_driver"], h["season"]) for h in history if h["fastest_lap_time"]],
            key=lambda x: x[0],
            default=None,
        )
        if best:
            lap_record, lap_record_driver, lap_record_season = best

    return {
        "id": circuit.id,
        "name": circuit.name,
        "country": circuit.country,
        "location": circuit.location,
        "latitude": circuit.latitude,
        "longitude": circuit.longitude,
        "length_km": circuit.length_km,
        "total_races": len(history),
        "first_gp_year": history[-1]["season"] if history else None,
        "lap_record_time": lap_record,
        "lap_record_driver": lap_record_driver,
        "lap_record_year": lap_record_season,
        "race_history": history,
    }
