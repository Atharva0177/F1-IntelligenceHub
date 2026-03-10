"""
Head-to-Head API Routes
Compare two drivers directly across shared races.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, case
from database.config import get_db
from database.models import Result, Race, Season, Driver, Team, Qualifying
from typing import List, Optional
from pydantic import BaseModel

router = APIRouter()


class DriverSummary(BaseModel):
    id: int
    code: str
    name: str
    nationality: Optional[str] = None
    team_name: Optional[str] = None

    class Config:
        from_attributes = True


class RoundResult(BaseModel):
    round_number: int
    race_name: str
    race_date: Optional[str] = None
    season: int
    driver1_position: Optional[int] = None
    driver2_position: Optional[int] = None
    driver1_points: float
    driver2_points: float
    driver1_quali: Optional[int] = None
    driver2_quali: Optional[int] = None

    class Config:
        from_attributes = True


class H2HStats(BaseModel):
    shared_races: int
    driver1_race_ahead: int
    driver2_race_ahead: int
    driver1_quali_ahead: int
    driver2_quali_ahead: int
    driver1_total_points: float
    driver2_total_points: float
    driver1_wins: int
    driver2_wins: int
    driver1_podiums: int
    driver2_podiums: int
    driver1_avg_finish: Optional[float]
    driver2_avg_finish: Optional[float]

    class Config:
        from_attributes = True


class H2HResponse(BaseModel):
    driver1: DriverSummary
    driver2: DriverSummary
    season: Optional[int] = None
    stats: H2HStats
    rounds: List[RoundResult]

    class Config:
        from_attributes = True


@router.get("/{driver_id1}/{driver_id2}", response_model=H2HResponse)
async def get_head_to_head(
    driver_id1: int,
    driver_id2: int,
    season: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Compare two drivers head-to-head across shared race entries.
    Optionally filter by season.
    """
    driver1 = db.query(Driver).filter(Driver.id == driver_id1).first()
    driver2 = db.query(Driver).filter(Driver.id == driver_id2).first()
    if not driver1 or not driver2:
        raise HTTPException(status_code=404, detail="Driver not found")

    # Fetch all race results for both drivers
    def results_for(driver_id):
        q = db.query(Result, Race, Season, Team).join(
            Race, Result.race_id == Race.id
        ).join(Season, Race.season_id == Season.id
        ).join(Team, Result.team_id == Team.id
        ).filter(Result.driver_id == driver_id)
        if season:
            q = q.filter(Season.year == season)
        return {r.race_id: (result, race, s, team) for result, race, s, team in q.all()}

    r1_map = results_for(driver_id1)
    r2_map = results_for(driver_id2)

    # Find races they both completed
    shared_race_ids = set(r1_map.keys()) & set(r2_map.keys())

    # Qualifying map
    def quali_for(driver_id):
        q = db.query(Qualifying, Race, Season).join(
            Race, Qualifying.race_id == Race.id
        ).join(Season, Race.season_id == Season.id
        ).filter(Qualifying.driver_id == driver_id)
        if season:
            q = q.filter(Season.year == season)
        return {row.race_id: row.position for row, race, s in q.all()}

    q1_map = quali_for(driver_id1)
    q2_map = quali_for(driver_id2)

    # Build per-round comparison
    rounds = []
    d1_race_ahead = 0
    d2_race_ahead = 0
    d1_quali_ahead = 0
    d2_quali_ahead = 0
    d1_total_pts = 0.0
    d2_total_pts = 0.0
    d1_wins = 0
    d2_wins = 0
    d1_podiums = 0
    d2_podiums = 0
    d1_finish_positions = []
    d2_finish_positions = []

    for race_id in sorted(shared_race_ids, key=lambda rid: (
        r1_map[rid][2].year, r1_map[rid][1].round_number
    )):
        res1, race, s, team1 = r1_map[race_id]
        res2, _, _, team2 = r2_map[race_id]

        d1_pos = res1.position
        d2_pos = res2.position
        d1_pts = float(res1.points or 0)
        d2_pts = float(res2.points or 0)
        d1_qpos = q1_map.get(race_id)
        d2_qpos = q2_map.get(race_id)

        d1_total_pts += d1_pts
        d2_total_pts += d2_pts

        if d1_pos and d2_pos:
            if d1_pos < d2_pos:
                d1_race_ahead += 1
            elif d2_pos < d1_pos:
                d2_race_ahead += 1

        if d1_pos == 1:
            d1_wins += 1
        if d2_pos == 1:
            d2_wins += 1
        if d1_pos and d1_pos <= 3:
            d1_podiums += 1
        if d2_pos and d2_pos <= 3:
            d2_podiums += 1

        if d1_pos:
            d1_finish_positions.append(d1_pos)
        if d2_pos:
            d2_finish_positions.append(d2_pos)

        if d1_qpos and d2_qpos:
            if d1_qpos < d2_qpos:
                d1_quali_ahead += 1
            elif d2_qpos < d1_qpos:
                d2_quali_ahead += 1

        rounds.append({
            "round_number": race.round_number,
            "race_name": race.name,
            "race_date": race.date.isoformat() if race.date else None,
            "season": s.year,
            "driver1_position": d1_pos,
            "driver2_position": d2_pos,
            "driver1_points": d1_pts,
            "driver2_points": d2_pts,
            "driver1_quali": d1_qpos,
            "driver2_quali": d2_qpos,
        })

    # Build driver summaries with team info
    def driver_team(driver_id):
        team = db.query(Team).join(
            Result, Result.team_id == Team.id
        ).join(Race, Result.race_id == Race.id
        ).join(Season, Race.season_id == Season.id
        ).filter(Result.driver_id == driver_id)
        if season:
            team = team.filter(Season.year == season)
        t = team.order_by(Race.date.desc()).first()
        return t.name if t else None

    d1_avg = sum(d1_finish_positions) / len(d1_finish_positions) if d1_finish_positions else None
    d2_avg = sum(d2_finish_positions) / len(d2_finish_positions) if d2_finish_positions else None

    return {
        "driver1": {
            "id": driver1.id,
            "code": driver1.code or "",
            "name": f"{driver1.first_name or ''} {driver1.last_name or ''}".strip(),
            "nationality": driver1.nationality,
            "team_name": driver_team(driver_id1),
        },
        "driver2": {
            "id": driver2.id,
            "code": driver2.code or "",
            "name": f"{driver2.first_name or ''} {driver2.last_name or ''}".strip(),
            "nationality": driver2.nationality,
            "team_name": driver_team(driver_id2),
        },
        "season": season,
        "stats": {
            "shared_races": len(shared_race_ids),
            "driver1_race_ahead": d1_race_ahead,
            "driver2_race_ahead": d2_race_ahead,
            "driver1_quali_ahead": d1_quali_ahead,
            "driver2_quali_ahead": d2_quali_ahead,
            "driver1_total_points": d1_total_pts,
            "driver2_total_points": d2_total_pts,
            "driver1_wins": d1_wins,
            "driver2_wins": d2_wins,
            "driver1_podiums": d1_podiums,
            "driver2_podiums": d2_podiums,
            "driver1_avg_finish": round(d1_avg, 2) if d1_avg else None,
            "driver2_avg_finish": round(d2_avg, 2) if d2_avg else None,
        },
        "rounds": rounds,
    }
