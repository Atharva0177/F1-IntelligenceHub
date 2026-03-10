"""
Standings API Routes
Driver and Constructor championship standings derived from race results in the DB.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, case, and_
from database.config import get_db
from database.models import Result, Race, Season, Driver, Team
from typing import List, Optional
from pydantic import BaseModel

router = APIRouter()


class DriverStandingItem(BaseModel):
    position: int
    driver_id: int
    driver_code: str
    driver_name: str
    team_name: str
    nationality: Optional[str] = None
    points: float
    wins: int
    podiums: int

    class Config:
        from_attributes = True


class ConstructorStandingItem(BaseModel):
    position: int
    team_id: int
    team_name: str
    points: float
    wins: int
    drivers: List[str]

    class Config:
        from_attributes = True


class DriverStandingsResponse(BaseModel):
    season: int
    round: Optional[int] = None
    drivers: List[DriverStandingItem]


class ConstructorStandingsResponse(BaseModel):
    season: int
    round: Optional[int] = None
    constructors: List[ConstructorStandingItem]


@router.get("/{year}/drivers", response_model=DriverStandingsResponse)
async def get_driver_standings(
    year: int,
    round: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Get driver championship standings for a season.
    Optionally filter to standings after a specific round.
    """
    season = db.query(Season).filter(Season.year == year).first()
    if not season:
        raise HTTPException(status_code=404, detail=f"No data found for season {year}")

    query = db.query(
        Driver,
        func.sum(Result.points).label("total_points"),
        func.sum(case((and_(Result.position == 1, Result.is_sprint == False), 1), else_=0)).label("wins"),
        func.sum(case((and_(Result.position <= 3, Result.is_sprint == False), 1), else_=0)).label("podiums"),
    ).join(Result, Driver.id == Result.driver_id
    ).join(Race, Result.race_id == Race.id
    ).filter(Race.season_id == season.id)

    if round:
        query = query.filter(Race.round_number <= round)

    rows = query.group_by(Driver.id).order_by(
        func.sum(Result.points).desc()
    ).all()

    standings = []
    for pos, (driver, total_points, wins, podiums) in enumerate(rows, 1):
        # Most recent team for that driver in this season
        team = db.query(Team).join(
            Result, Result.team_id == Team.id
        ).join(Race, Result.race_id == Race.id
        ).filter(
            Result.driver_id == driver.id,
            Race.season_id == season.id
        ).order_by(Race.date.desc()).first()

        standings.append({
            "position": pos,
            "driver_id": driver.id,
            "driver_code": driver.code or "",
            "driver_name": f"{driver.first_name or ''} {driver.last_name or ''}".strip(),
            "team_name": team.name if team else "Unknown",
            "nationality": driver.nationality,
            "points": float(total_points or 0),
            "wins": wins or 0,
            "podiums": podiums or 0,
        })

    return {"season": year, "round": round, "drivers": standings}


@router.get("/{year}/constructors", response_model=ConstructorStandingsResponse)
async def get_constructor_standings(
    year: int,
    round: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Get constructor championship standings for a season.
    Optionally filter to standings after a specific round.
    """
    season = db.query(Season).filter(Season.year == year).first()
    if not season:
        raise HTTPException(status_code=404, detail=f"No data found for season {year}")

    query = db.query(
        Team,
        func.sum(Result.points).label("total_points"),
        func.sum(case((and_(Result.position == 1, Result.is_sprint == False), 1), else_=0)).label("wins"),
    ).join(Result, Team.id == Result.team_id
    ).join(Race, Result.race_id == Race.id
    ).filter(Race.season_id == season.id)

    if round:
        query = query.filter(Race.round_number <= round)

    rows = query.group_by(Team.id).order_by(
        func.sum(Result.points).desc()
    ).all()

    standings = []
    for pos, (team, total_points, wins) in enumerate(rows, 1):
        # Drivers who raced for this team in this season
        driver_codes = db.query(Driver.code).join(
            Result, Result.driver_id == Driver.id
        ).join(Race, Result.race_id == Race.id
        ).filter(
            Result.team_id == team.id,
            Race.season_id == season.id
        ).distinct().all()

        standings.append({
            "position": pos,
            "team_id": team.id,
            "team_name": team.name,
            "points": float(total_points or 0),
            "wins": wins or 0,
            "drivers": [d[0] for d in driver_codes if d[0]],
        })

    return {"season": year, "round": round, "constructors": standings}
