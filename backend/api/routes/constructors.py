"""
Constructors (Teams) API Routes
Constructor championship profiles and statistics.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from database.config import get_db
from database.models import Result, Race, Season, Driver, Team
from typing import List, Optional
from pydantic import BaseModel

router = APIRouter()


class ConstructorSummary(BaseModel):
    id: int
    name: str
    nationality: Optional[str] = None

    class Config:
        from_attributes = True


class DriverInConstructor(BaseModel):
    driver_id: int
    driver_code: str
    driver_name: str
    points: float
    wins: int

    class Config:
        from_attributes = True


class SeasonPerformance(BaseModel):
    round_number: int
    race_name: str
    race_date: Optional[str]
    driver_code: str
    position: Optional[int]
    points: float

    class Config:
        from_attributes = True


class ConstructorDetailResponse(BaseModel):
    id: int
    name: str
    nationality: Optional[str] = None
    season: int
    total_points: float
    wins: int
    podiums: int
    drivers: List[DriverInConstructor]
    race_results: List[SeasonPerformance]

    class Config:
        from_attributes = True


@router.get("", response_model=List[ConstructorSummary])
async def get_constructors(db: Session = Depends(get_db)):
    """Get all constructors (teams) in the database."""
    teams = db.query(Team).order_by(Team.name).all()
    return [{"id": t.id, "name": t.name, "nationality": t.nationality} for t in teams]


@router.get("/{team_id}", response_model=ConstructorDetailResponse)
async def get_constructor_detail(
    team_id: int,
    season: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Get detailed constructor profile including season performance and driver breakdown.
    """
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Constructor not found")

    # Determine season to use (default to most recent)
    if season:
        season_obj = db.query(Season).filter(Season.year == season).first()
        if not season_obj:
            raise HTTPException(status_code=404, detail=f"No data for season {season}")
    else:
        # Find most recent season this team competed in
        latest = db.query(func.max(Season.year)).join(
            Race, Race.season_id == Season.id
        ).join(Result, Result.race_id == Race.id
        ).filter(Result.team_id == team_id).scalar()
        if not latest:
            raise HTTPException(status_code=404, detail="No race data found for this constructor")
        season_obj = db.query(Season).filter(Season.year == latest).first()

    season_year = season_obj.year

    # Per-driver stats for this season
    driver_rows = db.query(
        Driver,
        func.sum(Result.points).label("points"),
        func.sum(case((Result.position == 1, 1), else_=0)).label("wins"),
    ).join(Result, Driver.id == Result.driver_id
    ).join(Race, Result.race_id == Race.id
    ).filter(Result.team_id == team_id, Race.season_id == season_obj.id
    ).group_by(Driver.id).order_by(func.sum(Result.points).desc()).all()

    drivers_list = []
    for driver, pts, wins in driver_rows:
        drivers_list.append({
            "driver_id": driver.id,
            "driver_code": driver.code or "",
            "driver_name": f"{driver.first_name or ''} {driver.last_name or ''}".strip(),
            "points": float(pts or 0),
            "wins": wins or 0,
        })

    # Overall team stats for this season
    agg = db.query(
        func.sum(Result.points),
        func.sum(case((Result.position == 1, 1), else_=0)),
        func.sum(case((Result.position <= 3, 1), else_=0)),
    ).join(Race, Result.race_id == Race.id
    ).filter(Result.team_id == team_id, Race.season_id == season_obj.id).first()

    total_points = float(agg[0] or 0)
    wins = agg[1] or 0
    podiums = agg[2] or 0

    # Race-by-race results for the season
    race_rows = db.query(Result, Race, Driver).join(
        Race, Result.race_id == Race.id
    ).join(Driver, Result.driver_id == Driver.id
    ).filter(
        Result.team_id == team_id,
        Race.season_id == season_obj.id
    ).order_by(Race.round_number).all()

    race_results = []
    for result, race, driver in race_rows:
        race_results.append({
            "round_number": race.round_number,
            "race_name": race.name,
            "race_date": race.date.isoformat() if race.date else None,
            "driver_code": driver.code or "",
            "position": result.position,
            "points": float(result.points or 0),
        })

    return {
        "id": team.id,
        "name": team.name,
        "nationality": team.nationality,
        "season": season_year,
        "total_points": total_points,
        "wins": wins,
        "podiums": podiums,
        "drivers": drivers_list,
        "race_results": race_results,
    }
