from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from database.config import get_db
from database.models import Driver, Result, Race, Team, Season
from typing import List, Optional
from pydantic import BaseModel

router = APIRouter()


# Pydantic schemas
class DriverListSchema(BaseModel):
    id: int
    code: str
    number: Optional[int]
    first_name: str
    last_name: str
    nationality: Optional[str]
    team_name: Optional[str]
    total_races: int
    total_points: float
    wins: int
    
    class Config:
        from_attributes = True


class DriverDetailSchema(BaseModel):
    id: int
    code: str
    number: Optional[int]
    driver_number: Optional[int]
    first_name: str
    last_name: str
    nationality: Optional[str]
    date_of_birth: Optional[str]
    team_name: Optional[str]
    total_races: int
    total_points: float
    wins: int
    podiums: int
    
    class Config:
        from_attributes = True


class RaceResultSchema(BaseModel):
    race_name: str
    race_date: Optional[str]
    season: int
    position: Optional[int]
    points: float
    grid_position: Optional[int]
    status: Optional[str]
    
    class Config:
        from_attributes = True


@router.get("", response_model=List[DriverListSchema])
async def get_drivers(
    skip: int = 0,
    limit: int = 100,
    season: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Get list of all drivers with career statistics
    Optionally filter by season
    """
    from sqlalchemy import case, distinct
    
    # Query drivers with aggregated stats and team info
    query = db.query(
        Driver,
        func.count(Result.id).label('total_races'),
        func.sum(Result.points).label('total_points'),
        func.sum(case((Result.position == 1, 1), else_=0)).label('wins')
    ).outerjoin(Result)
    
    # Filter by season if provided
    if season:
        query = query.join(Race, Result.race_id == Race.id).join(Season, Race.season_id == Season.id).filter(Season.year == season)
    
    drivers_query = query.group_by(Driver.id)
    
    drivers_data = drivers_query.offset(skip).limit(limit).all()
    
    result = []
    for driver, total_races, total_points, wins in drivers_data:
        # Get the driver's most recent team (for the specified season or overall)
        team_query = db.query(Result, Race, Team).join(
            Race, Result.race_id == Race.id
        ).join(
            Team, Result.team_id == Team.id
        ).filter(
            Result.driver_id == driver.id
        )
        
        if season:
             team_query = team_query.join(Season, Race.season_id == Season.id).filter(Season.year == season)
            
        team_result = team_query.order_by(Race.date.desc()).first()
        
        team_name = team_result[2].name if team_result and len(team_result) > 2 else None
        
        result.append({
            "id": driver.id,
            "code": driver.code,
            "number": driver.number,
            "first_name": driver.first_name or "",
            "last_name": driver.last_name or "",
            "nationality": driver.nationality,
            "team_name": team_name,
            "total_races": total_races or 0,
            "total_points": float(total_points or 0.0),
            "wins": wins or 0
        })
    
    return result


@router.get("/{driver_id}", response_model=DriverDetailSchema)
async def get_driver_details(driver_id: int, db: Session = Depends(get_db)):
    """
    Get detailed information about a specific driver
    """
    driver = db.query(Driver).filter(Driver.id == driver_id).first()
    
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    
    # Get statistics
    from sqlalchemy import case
    stats = db.query(
        func.count(Result.id).label('total_races'),
        func.sum(Result.points).label('total_points'),
        func.sum(case((Result.position == 1, 1), else_=0)).label('wins'),
        func.sum(case((Result.position <= 3, 1), else_=0)).label('podiums')
    ).filter(Result.driver_id == driver_id).first()
    
    # Get the driver's most recent team
    team_result = db.query(Result, Race, Team).join(
        Race, Result.race_id == Race.id
    ).join(
        Team, Result.team_id == Team.id
    ).filter(
        Result.driver_id == driver_id
    ).order_by(Race.date.desc()).first()
    
    team_name = team_result[2].name if team_result and len(team_result) > 2 else None
    
    return {
        "id": driver.id,
        "code": driver.code,
        "number": driver.number,
        "driver_number": driver.number,
        "first_name": driver.first_name or "",
        "last_name": driver.last_name or "",
        "nationality": driver.nationality,
        "date_of_birth": driver.date_of_birth.isoformat() if driver.date_of_birth else None,
        "team_name": team_name,
        "total_races": stats.total_races or 0,
        "total_points": float(stats.total_points or 0.0),
        "wins": stats.wins or 0,
        "podiums": stats.podiums or 0,
    }


@router.get("/{driver_id}/results", response_model=List[RaceResultSchema])
async def get_driver_results(
    driver_id: int,
    season: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Get race results for a specific driver
    """
    driver = db.query(Driver).filter(Driver.id == driver_id).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    
    query = db.query(Result, Race, Season).join(
        Race, Result.race_id == Race.id
    ).join(
        Season, Race.season_id == Season.id
    ).filter(
        Result.driver_id == driver_id
    )
    
    if season:
        query = query.filter(Season.year == season)
    
    results = query.order_by(Season.year.desc(), Race.round_number).all()
    
    return [
        {
            "race_name": race.name,
            "race_date": race.date.isoformat() if race.date else None,
            "season": season_obj.year,
            "position": result.position,
            "points": result.points,
            "grid_position": result.grid_position,
            "status": result.status
        }
        for result, race, season_obj in results
    ]


@router.get("/{driver_id}/compare/{driver_id2}")
async def compare_drivers(
    driver_id: int,
    driver_id2: int,
    db: Session = Depends(get_db)
):
    """
    Compare two drivers head-to-head
    """
    driver1 = db.query(Driver).filter(Driver.id == driver_id).first()
    driver2 = db.query(Driver).filter(Driver.id == driver_id2).first()
    
    if not driver1 or not driver2:
        raise HTTPException(status_code=404, detail="Driver not found")
    
    # Get stats for both drivers
    def get_driver_stats(driver_id):
        from sqlalchemy import case
        return db.query(
            func.count(Result.id).label('races'),
            func.sum(Result.points).label('points'),
            func.sum(case((Result.position == 1, 1), else_=0)).label('wins'),
            func.avg(Result.position).label('avg_position')
        ).filter(Result.driver_id == driver_id).first()
    
    stats1 = get_driver_stats(driver_id)
    stats2 = get_driver_stats(driver_id2)
    
    return {
        "driver1": {
            "name": f"{driver1.first_name} {driver1.last_name}",
            "code": driver1.code,
            "races": stats1.races or 0,
            "points": float(stats1.points or 0),
            "wins": stats1.wins or 0,
            "avg_position": float(stats1.avg_position or 0) if stats1.avg_position else None
        },
        "driver2": {
            "name": f"{driver2.first_name} {driver2.last_name}",
            "code": driver2.code,
            "races": stats2.races or 0,
            "points": float(stats2.points or 0),
            "wins": stats2.wins or 0,
            "avg_position": float(stats2.avg_position or 0) if stats2.avg_position else None
        }
    }
