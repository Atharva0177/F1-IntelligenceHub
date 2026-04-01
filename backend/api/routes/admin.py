from datetime import date as dt_date, datetime as dt_datetime, time as dt_time
from pathlib import Path
import subprocess
import sys
import threading
import os
import base64
import hashlib
import hmac
import json
import time
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import case, func
from sqlalchemy.orm import Session, joinedload

from database.config import get_db
from database.models import (
    Circuit,
    Driver,
    LapTime,
    Race,
    Result,
    RaceControlMessage,
    Season,
    SeasonDriverProfile,
    SeasonTeamProfile,
    Session as DBSession,
    SessionStatus,
    Team,
    TelemetryData,
    Qualifying,
    WeatherData,
    PositionData,
    PitStop,
)

ADMIN_SESSION_COOKIE = "admin_session"


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _b64url_decode(raw: str) -> bytes:
    padded = raw + "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(padded.encode("utf-8"))


def _admin_signing_secret() -> str:
    return (
        (os.getenv("ADMIN_SESSION_SECRET") or "").strip()
        or (os.getenv("ADMIN_API_KEY") or "").strip()
        or "dev-only-change-me"
    )


def _admin_password() -> str:
    return (os.getenv("ADMIN_PASSWORD") or "").strip() or (os.getenv("ADMIN_API_KEY") or "").strip()


def _create_admin_session_token() -> str:
    ttl_hours = max(1, int(os.getenv("ADMIN_SESSION_TTL_HOURS", "12")))
    payload = {
        "iat": int(time.time()),
        "exp": int(time.time()) + ttl_hours * 3600,
    }
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    signature = hmac.new(
        _admin_signing_secret().encode("utf-8"),
        payload_b64.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return f"{payload_b64}.{signature}"


def _validate_admin_session_token(token: str) -> bool:
    try:
        payload_b64, signature = token.split(".", 1)
    except ValueError:
        return False

    expected = hmac.new(
        _admin_signing_secret().encode("utf-8"),
        payload_b64.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(signature, expected):
        return False

    try:
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    except Exception:
        return False

    exp = int(payload.get("exp", 0))
    return exp > int(time.time())


def require_admin_auth(request: Request, x_admin_key: Optional[str] = Header(default=None)):
    # Allow auth endpoints to be called without prior session.
    if request.url.path.endswith("/auth/login") or request.url.path.endswith("/auth/status") or request.url.path.endswith("/auth/logout"):
        return

    configured_key = (os.getenv("ADMIN_API_KEY") or "").strip()
    configured_password = _admin_password()

    # Allow server-to-server/admin tooling with shared key.
    if configured_key and x_admin_key and x_admin_key == configured_key:
        return

    token = request.cookies.get(ADMIN_SESSION_COOKIE)
    if token and _validate_admin_session_token(token):
        return

    # Development fallback: if no auth configured, keep admin open.
    if not configured_key and not configured_password:
        return

    raise HTTPException(status_code=401, detail="Unauthorized")


router = APIRouter(dependencies=[Depends(require_admin_auth)])


class AdminLoginRequest(BaseModel):
    password: str = Field(..., min_length=1, max_length=512)


class AdminRaceSchema(BaseModel):
    id: int
    season_year: int
    round_number: Optional[int] = None
    name: str
    date: Optional[dt_date] = None
    time: Optional[dt_time] = None
    event_name: Optional[str] = None
    official_name: Optional[str] = None
    circuit_id: int
    circuit_name: str
    circuit_country: Optional[str] = None


class AdminRaceCreateRequest(BaseModel):
    season_year: int = Field(..., ge=1950, le=2100)
    circuit_id: int
    name: str = Field(..., min_length=2, max_length=255)
    round_number: Optional[int] = Field(default=None, ge=1, le=40)
    date: Optional[dt_date] = None
    time: Optional[dt_time] = None
    event_name: Optional[str] = Field(default=None, max_length=255)
    official_name: Optional[str] = Field(default=None, max_length=255)


class AdminRaceUpdateRequest(BaseModel):
    season_year: Optional[int] = Field(default=None, ge=1950, le=2100)
    circuit_id: Optional[int] = None
    name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    round_number: Optional[int] = Field(default=None, ge=1, le=40)
    date: Optional[dt_date] = None
    time: Optional[dt_time] = None
    event_name: Optional[str] = Field(default=None, max_length=255)
    official_name: Optional[str] = Field(default=None, max_length=255)


class ImageUpdateRequest(BaseModel):
    image_url: Optional[str] = None


class AdminSessionSchema(BaseModel):
    id: int
    race_id: int
    race_name: str
    season_year: int
    session_type: str
    date: Optional[dt_datetime] = None


class AdminSessionUpsertRequest(BaseModel):
    race_id: int
    session_type: str = Field(..., min_length=1, max_length=50)
    date: Optional[dt_datetime] = None


class AdminSyncRequest(BaseModel):
    season_year: Optional[int] = Field(default=None, ge=1950, le=2100)


class AdminSyncStatusSchema(BaseModel):
    running: bool
    season_year: Optional[int] = None
    status: str
    started_at: Optional[dt_datetime] = None
    finished_at: Optional[dt_datetime] = None
    exit_code: Optional[int] = None
    command: Optional[str] = None
    output_tail: Optional[str] = None


class AdminSeasonDeleteRequest(BaseModel):
    force: bool = False


class SeasonalDriverProfileSchema(BaseModel):
    id: int
    code: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    default_number: Optional[int] = None
    default_image_url: Optional[str] = None
    season_number: Optional[int] = None
    season_image_url: Optional[str] = None


class SeasonalDriverProfileUpdateRequest(BaseModel):
    season_year: int = Field(..., ge=1950, le=2100)
    driver_number: Optional[int] = Field(default=None, ge=0, le=999)
    image_url: Optional[str] = None


class SeasonalTeamProfileSchema(BaseModel):
    id: int
    name: str
    default_image_url: Optional[str] = None
    season_image_url: Optional[str] = None


class SeasonalTeamProfileUpdateRequest(BaseModel):
    season_year: int = Field(..., ge=1950, le=2100)
    image_url: Optional[str] = None


_sync_state_lock = threading.Lock()
_sync_state = {
    "running": False,
    "season_year": None,
    "status": "idle",
    "started_at": None,
    "finished_at": None,
    "exit_code": None,
    "command": None,
    "output_tail": None,
}


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _resolve_sync_command(season_year: int) -> tuple[list[str], Path]:
    candidate_roots = [Path("/workspace"), _repo_root()]

    for root in candidate_roots:
        script = root / "scripts" / "initial_data_load.py"
        if script.exists():
            return [sys.executable, str(script), str(season_year), "--sync"], root

    # Fallback for environments where only compose tooling is available.
    root = _repo_root()
    return [
        "docker",
        "compose",
        "run",
        "--rm",
        "loader",
        "python",
        "scripts/initial_data_load.py",
        str(season_year),
        "--sync",
    ], root


def _run_sync_job(season_year: int):
    cmd, cwd = _resolve_sync_command(season_year)

    with _sync_state_lock:
        _sync_state.update(
            {
                "running": True,
                "season_year": season_year,
                "status": "running",
                "started_at": dt_datetime.utcnow(),
                "finished_at": None,
                "exit_code": None,
                "command": " ".join(cmd),
                "output_tail": None,
            }
        )

    try:
        proc = subprocess.run(
            cmd,
            cwd=str(cwd),
            capture_output=True,
            text=True,
            timeout=60 * 60,
            check=False,
        )
        combined_output = (proc.stdout or "") + ("\n" + proc.stderr if proc.stderr else "")
        tail_lines = "\n".join(combined_output.strip().splitlines()[-250:])

        with _sync_state_lock:
            _sync_state.update(
                {
                    "running": False,
                    "status": "completed" if proc.returncode == 0 else "failed",
                    "finished_at": dt_datetime.utcnow(),
                    "exit_code": proc.returncode,
                    "output_tail": tail_lines,
                }
            )
    except Exception as exc:
        with _sync_state_lock:
            _sync_state.update(
                {
                    "running": False,
                    "status": "failed",
                    "finished_at": dt_datetime.utcnow(),
                    "exit_code": -1,
                    "output_tail": str(exc),
                }
            )


def _get_or_create_season_by_year(db: Session, season_year: int) -> Season:
    season = db.query(Season).filter(Season.year == season_year).first()
    if not season:
        season = Season(year=season_year)
        db.add(season)
        db.flush()
    return season


def _delete_session_children(db: Session, session_ids: list[int]):
    if not session_ids:
        return
    db.query(LapTime).filter(LapTime.session_id.in_(session_ids)).delete(synchronize_session=False)
    db.query(TelemetryData).filter(TelemetryData.session_id.in_(session_ids)).delete(synchronize_session=False)
    db.query(PositionData).filter(PositionData.session_id.in_(session_ids)).delete(synchronize_session=False)
    db.query(PitStop).filter(PitStop.session_id.in_(session_ids)).delete(synchronize_session=False)
    db.query(WeatherData).filter(WeatherData.session_id.in_(session_ids)).delete(synchronize_session=False)
    db.query(RaceControlMessage).filter(RaceControlMessage.session_id.in_(session_ids)).delete(synchronize_session=False)
    db.query(SessionStatus).filter(SessionStatus.session_id.in_(session_ids)).delete(synchronize_session=False)


@router.post("/auth/login")
async def admin_login(payload: AdminLoginRequest, response: Response):
    expected_password = _admin_password()
    if not expected_password:
        raise HTTPException(status_code=503, detail="Admin password is not configured")

    if payload.password != expected_password:
        raise HTTPException(status_code=401, detail="Invalid password")

    ttl_hours = max(1, int(os.getenv("ADMIN_SESSION_TTL_HOURS", "12")))
    secure_cookie = os.getenv("COOKIE_SECURE", "false").lower() == "true"
    response.set_cookie(
        key=ADMIN_SESSION_COOKIE,
        value=_create_admin_session_token(),
        max_age=ttl_hours * 3600,
        httponly=True,
        secure=secure_cookie,
        samesite="lax",
        path="/",
    )
    return {"authenticated": True}


@router.get("/auth/status")
async def admin_auth_status(request: Request):
    token = request.cookies.get(ADMIN_SESSION_COOKIE)
    return {"authenticated": bool(token and _validate_admin_session_token(token))}


@router.post("/auth/logout")
async def admin_logout(response: Response):
    response.delete_cookie(key=ADMIN_SESSION_COOKIE, path="/")
    return {"authenticated": False}


@router.get("/stats")
async def get_admin_stats(db: Session = Depends(get_db)):
    race_count = db.query(func.count(Race.id)).scalar() or 0
    session_count = db.query(func.count(DBSession.id)).scalar() or 0
    lap_count = db.query(func.count(LapTime.id)).scalar() or 0
    telemetry_count = db.query(func.count(TelemetryData.id)).scalar() or 0
    results_count = db.query(func.count(Result.id)).scalar() or 0
    drivers_count = db.query(func.count(Driver.id)).scalar() or 0
    teams_count = db.query(func.count(Team.id)).scalar() or 0

    completed_race_count = (
        db.query(func.count(func.distinct(Result.race_id)))
        .filter(Result.is_sprint.is_(False))
        .scalar()
        or 0
    )

    season_rows = (
        db.query(
            Season.year.label("season_year"),
            func.count(func.distinct(Race.id)).label("race_count"),
            func.count(func.distinct(DBSession.id)).label("session_count"),
            func.count(func.distinct(Result.id)).label("result_rows"),
            func.count(func.distinct(Result.race_id)).label("completed_races"),
        )
        .outerjoin(Race, Race.season_id == Season.id)
        .outerjoin(DBSession, DBSession.race_id == Race.id)
        .outerjoin(Result, Result.race_id == Race.id)
        .group_by(Season.year)
        .order_by(Season.year.desc())
        .all()
    )

    top_driver_row = (
        db.query(
            Driver.id,
            Driver.code,
            Driver.first_name,
            Driver.last_name,
            func.sum(Result.points).label("points"),
        )
        .join(Result, Result.driver_id == Driver.id)
        .group_by(Driver.id)
        .order_by(func.sum(Result.points).desc())
        .first()
    )

    top_team_row = (
        db.query(Team.id, Team.name, func.sum(Result.points).label("points"))
        .join(Result, Result.team_id == Team.id)
        .group_by(Team.id)
        .order_by(func.sum(Result.points).desc())
        .first()
    )

    latest_race_date = db.query(func.max(Race.date)).scalar()

    session_type_rows = (
        db.query(DBSession.session_type, func.count(DBSession.id).label("count"))
        .group_by(DBSession.session_type)
        .order_by(func.count(DBSession.id).desc())
        .all()
    )

    races_with_sessions = db.query(func.count(func.distinct(DBSession.race_id))).scalar() or 0
    races_with_results = db.query(func.count(func.distinct(Result.race_id))).scalar() or 0
    sessions_with_laps = db.query(func.count(func.distinct(LapTime.session_id))).scalar() or 0
    sessions_with_telemetry = db.query(func.count(func.distinct(TelemetryData.session_id))).scalar() or 0
    sessions_with_weather = db.query(func.count(func.distinct(WeatherData.session_id))).scalar() or 0
    sessions_with_positions = db.query(func.count(func.distinct(PositionData.session_id))).scalar() or 0
    sessions_with_race_control = db.query(func.count(func.distinct(RaceControlMessage.session_id))).scalar() or 0
    qualifying_count = db.query(func.count(Qualifying.id)).scalar() or 0

    avg_laps_per_session = round((lap_count / session_count), 2) if session_count else 0
    avg_telemetry_per_session = round((telemetry_count / session_count), 2) if session_count else 0

    recent_race_rows = (
        db.query(Race, Season, Circuit)
        .join(Season, Race.season_id == Season.id)
        .outerjoin(Circuit, Race.circuit_id == Circuit.id)
        .order_by(Season.year.desc(), Race.date.desc().nulls_last(), Race.round_number.desc().nulls_last())
        .limit(8)
        .all()
    )

    top_driver_rows = (
        db.query(
            Driver.id,
            Driver.code,
            Driver.first_name,
            Driver.last_name,
            func.sum(Result.points).label("points"),
            func.count(Result.id).label("results"),
            func.sum(case((Result.position == 1, 1), else_=0)).label("wins"),
        )
        .join(Result, Result.driver_id == Driver.id)
        .group_by(Driver.id)
        .order_by(func.sum(Result.points).desc())
        .limit(5)
        .all()
    )

    top_team_rows = (
        db.query(
            Team.id,
            Team.name,
            func.sum(Result.points).label("points"),
            func.count(Result.id).label("results"),
            func.sum(case((Result.position == 1, 1), else_=0)).label("wins"),
        )
        .join(Result, Result.team_id == Team.id)
        .group_by(Team.id)
        .order_by(func.sum(Result.points).desc())
        .limit(5)
        .all()
    )

    return {
        "entity_counts": {
            "seasons": db.query(func.count(Season.id)).scalar() or 0,
            "races": race_count,
            "sessions": session_count,
            "drivers": drivers_count,
            "teams": teams_count,
            "results": results_count,
            "lap_times": lap_count,
            "telemetry_points": telemetry_count,
        },
        "coverage": {
            "completed_races": completed_race_count,
            "total_races": race_count,
            "completion_ratio": round((completed_race_count / race_count), 4) if race_count else 0,
            "races_with_sessions": races_with_sessions,
            "races_with_results": races_with_results,
            "sessions_with_laps": sessions_with_laps,
            "sessions_with_telemetry": sessions_with_telemetry,
            "sessions_with_weather": sessions_with_weather,
            "sessions_with_positions": sessions_with_positions,
            "sessions_with_race_control": sessions_with_race_control,
        },
        "data_density": {
            "avg_laps_per_session": avg_laps_per_session,
            "avg_telemetry_points_per_session": avg_telemetry_per_session,
            "qualifying_rows": qualifying_count,
        },
        "session_type_breakdown": [
            {
                "session_type": row.session_type,
                "count": row.count,
                "ratio": round((row.count / session_count), 4) if session_count else 0,
            }
            for row in session_type_rows
        ],
        "top_entities": {
            "driver": {
                "id": top_driver_row.id,
                "code": top_driver_row.code,
                "name": f"{top_driver_row.first_name or ''} {top_driver_row.last_name or ''}".strip(),
                "points": float(top_driver_row.points or 0),
            }
            if top_driver_row
            else None,
            "team": {
                "id": top_team_row.id,
                "name": top_team_row.name,
                "points": float(top_team_row.points or 0),
            }
            if top_team_row
            else None,
        },
        "top_lists": {
            "drivers": [
                {
                    "id": row.id,
                    "code": row.code,
                    "name": f"{row.first_name or ''} {row.last_name or ''}".strip(),
                    "points": float(row.points or 0),
                    "results": int(row.results or 0),
                    "wins": int(row.wins or 0),
                }
                for row in top_driver_rows
            ],
            "teams": [
                {
                    "id": row.id,
                    "name": row.name,
                    "points": float(row.points or 0),
                    "results": int(row.results or 0),
                    "wins": int(row.wins or 0),
                }
                for row in top_team_rows
            ],
        },
        "latest_race_date": latest_race_date.isoformat() if latest_race_date else None,
        "recent_races": [
            {
                "race_id": race.id,
                "season_year": season_obj.year,
                "round_number": race.round_number,
                "race_name": race.name,
                "race_date": race.date.isoformat() if race.date else None,
                "circuit_name": circuit.name if circuit else None,
            }
            for race, season_obj, circuit in recent_race_rows
        ],
        "season_breakdown": [
            {
                "season_year": row.season_year,
                "race_count": row.race_count,
                "session_count": row.session_count,
                "result_rows": row.result_rows,
                "completed_races": row.completed_races,
                "completion_ratio": round((row.completed_races / row.race_count), 4) if row.race_count else 0,
            }
            for row in season_rows
        ],
    }


@router.get("/races", response_model=List[AdminRaceSchema])
async def get_admin_races(
    season: Optional[int] = None,
    limit: int = 250,
    db: Session = Depends(get_db),
):
    query = db.query(Race).join(Season, Race.season_id == Season.id).options(joinedload(Race.circuit), joinedload(Race.season))
    if season:
        query = query.filter(Season.year == season)

    races = query.order_by(Season.year.desc(), Race.round_number.asc().nulls_last(), Race.date.asc().nulls_last()).limit(limit).all()

    return [
        {
            "id": race.id,
            "season_year": race.season.year,
            "round_number": race.round_number,
            "name": race.name,
            "date": race.date,
            "time": race.time,
            "event_name": race.event_name,
            "official_name": race.official_name,
            "circuit_id": race.circuit_id,
            "circuit_name": race.circuit.name if race.circuit else "Unknown Circuit",
            "circuit_country": race.circuit.country if race.circuit else None,
        }
        for race in races
    ]


@router.post("/races", response_model=AdminRaceSchema)
async def create_race(payload: AdminRaceCreateRequest, db: Session = Depends(get_db)):
    circuit = db.query(Circuit).filter(Circuit.id == payload.circuit_id).first()
    if not circuit:
        raise HTTPException(status_code=404, detail="Circuit not found")

    season = db.query(Season).filter(Season.year == payload.season_year).first()
    if not season:
        season = Season(year=payload.season_year)
        db.add(season)
        db.flush()

    race = Race(
        season_id=season.id,
        circuit_id=payload.circuit_id,
        name=payload.name,
        round_number=payload.round_number,
        date=payload.date,
        time=payload.time,
        event_name=payload.event_name,
        official_name=payload.official_name,
    )
    db.add(race)
    db.commit()
    db.refresh(race)

    return {
        "id": race.id,
        "season_year": season.year,
        "round_number": race.round_number,
        "name": race.name,
        "date": race.date,
        "time": race.time,
        "event_name": race.event_name,
        "official_name": race.official_name,
        "circuit_id": race.circuit_id,
        "circuit_name": circuit.name,
        "circuit_country": circuit.country,
    }


@router.patch("/races/{race_id}", response_model=AdminRaceSchema)
async def update_race(race_id: int, payload: AdminRaceUpdateRequest, db: Session = Depends(get_db)):
    race = db.query(Race).filter(Race.id == race_id).first()
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")

    if payload.circuit_id is not None:
        circuit = db.query(Circuit).filter(Circuit.id == payload.circuit_id).first()
        if not circuit:
            raise HTTPException(status_code=404, detail="Circuit not found")
        race.circuit_id = payload.circuit_id

    if payload.season_year is not None:
        season = db.query(Season).filter(Season.year == payload.season_year).first()
        if not season:
            season = Season(year=payload.season_year)
            db.add(season)
            db.flush()
        race.season_id = season.id

    for field in ["name", "round_number", "date", "time", "event_name", "official_name"]:
        value = getattr(payload, field)
        if value is not None:
            setattr(race, field, value)

    db.commit()
    db.refresh(race)

    season = db.query(Season).filter(Season.id == race.season_id).first()
    circuit = db.query(Circuit).filter(Circuit.id == race.circuit_id).first()

    return {
        "id": race.id,
        "season_year": season.year if season else 0,
        "round_number": race.round_number,
        "name": race.name,
        "date": race.date,
        "time": race.time,
        "event_name": race.event_name,
        "official_name": race.official_name,
        "circuit_id": race.circuit_id,
        "circuit_name": circuit.name if circuit else "Unknown Circuit",
        "circuit_country": circuit.country if circuit else None,
    }


@router.delete("/races/{race_id}")
async def delete_race(race_id: int, force: bool = False, db: Session = Depends(get_db)):
    race = db.query(Race).filter(Race.id == race_id).first()
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")

    session_count = db.query(func.count(DBSession.id)).filter(DBSession.race_id == race_id).scalar() or 0
    result_count = db.query(func.count(Result.id)).filter(Result.race_id == race_id).scalar() or 0
    qualifying_count = db.query(func.count(Qualifying.id)).filter(Qualifying.race_id == race_id).scalar() or 0

    if not force and (session_count or result_count or qualifying_count):
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Race cannot be deleted while related session/result data exists",
                "dependencies": {
                    "sessions": session_count,
                    "results": result_count,
                    "qualifying": qualifying_count,
                },
            },
        )

    if force:
        session_ids = [sid for (sid,) in db.query(DBSession.id).filter(DBSession.race_id == race_id).all()]
        _delete_session_children(db, session_ids)
        db.query(DBSession).filter(DBSession.race_id == race_id).delete(synchronize_session=False)
        db.query(Result).filter(Result.race_id == race_id).delete(synchronize_session=False)
        db.query(Qualifying).filter(Qualifying.race_id == race_id).delete(synchronize_session=False)

    db.delete(race)
    db.commit()
    return {"deleted": True, "race_id": race_id, "force": force}


@router.get("/seasons")
async def get_admin_seasons(db: Session = Depends(get_db)):
    rows = (
        db.query(
            Season.year,
            func.count(func.distinct(Race.id)).label("race_count"),
            func.count(func.distinct(DBSession.id)).label("session_count"),
        )
        .outerjoin(Race, Race.season_id == Season.id)
        .outerjoin(DBSession, DBSession.race_id == Race.id)
        .group_by(Season.id)
        .order_by(Season.year.desc())
        .all()
    )

    return [
        {
            "year": year,
            "race_count": race_count,
            "session_count": session_count,
        }
        for year, race_count, session_count in rows
    ]


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: int, force: bool = False, db: Session = Depends(get_db)):
    session = db.query(DBSession).filter(DBSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    dependencies = {
        "lap_times": db.query(func.count(LapTime.id)).filter(LapTime.session_id == session_id).scalar() or 0,
        "telemetry": db.query(func.count(TelemetryData.id)).filter(TelemetryData.session_id == session_id).scalar() or 0,
        "positions": db.query(func.count(PositionData.id)).filter(PositionData.session_id == session_id).scalar() or 0,
        "pit_stops": db.query(func.count(PitStop.id)).filter(PitStop.session_id == session_id).scalar() or 0,
        "weather": db.query(func.count(WeatherData.id)).filter(WeatherData.session_id == session_id).scalar() or 0,
        "race_control": db.query(func.count(RaceControlMessage.id)).filter(RaceControlMessage.session_id == session_id).scalar() or 0,
        "session_status": db.query(func.count(SessionStatus.id)).filter(SessionStatus.session_id == session_id).scalar() or 0,
    }

    if not force and any(dependencies.values()):
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Session cannot be deleted while related data exists",
                "dependencies": dependencies,
            },
        )

    if force:
        _delete_session_children(db, [session_id])

    db.delete(session)
    db.commit()
    return {"deleted": True, "session_id": session_id, "force": force}


@router.delete("/seasons/{season_year}")
async def delete_season(season_year: int, force: bool = False, db: Session = Depends(get_db)):
    season = db.query(Season).filter(Season.year == season_year).first()
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")

    race_ids = [rid for (rid,) in db.query(Race.id).filter(Race.season_id == season.id).all()]
    session_ids = [sid for (sid,) in db.query(DBSession.id).join(Race, DBSession.race_id == Race.id).filter(Race.season_id == season.id).all()]

    dependencies = {
        "races": len(race_ids),
        "sessions": len(session_ids),
        "results": db.query(func.count(Result.id)).filter(Result.race_id.in_(race_ids)).scalar() if race_ids else 0,
        "qualifying": db.query(func.count(Qualifying.id)).filter(Qualifying.race_id.in_(race_ids)).scalar() if race_ids else 0,
        "lap_times": db.query(func.count(LapTime.id)).filter(LapTime.session_id.in_(session_ids)).scalar() if session_ids else 0,
        "telemetry": db.query(func.count(TelemetryData.id)).filter(TelemetryData.session_id.in_(session_ids)).scalar() if session_ids else 0,
    }

    if not force and any(dependencies.values()):
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Season cannot be deleted while related data exists",
                "dependencies": dependencies,
            },
        )

    if race_ids:
        if session_ids:
            _delete_session_children(db, session_ids)
            db.query(DBSession).filter(DBSession.id.in_(session_ids)).delete(synchronize_session=False)

        db.query(Result).filter(Result.race_id.in_(race_ids)).delete(synchronize_session=False)
        db.query(Qualifying).filter(Qualifying.race_id.in_(race_ids)).delete(synchronize_session=False)
        db.query(Race).filter(Race.id.in_(race_ids)).delete(synchronize_session=False)

    db.query(SeasonDriverProfile).filter(SeasonDriverProfile.season_id == season.id).delete(synchronize_session=False)
    db.query(SeasonTeamProfile).filter(SeasonTeamProfile.season_id == season.id).delete(synchronize_session=False)
    db.delete(season)
    db.commit()

    return {"deleted": True, "season_year": season_year, "force": force}


@router.get("/sessions", response_model=List[AdminSessionSchema])
async def get_admin_sessions(
    season: Optional[int] = None,
    race_id: Optional[int] = None,
    limit: int = 500,
    db: Session = Depends(get_db),
):
    query = (
        db.query(DBSession, Race, Season)
        .join(Race, DBSession.race_id == Race.id)
        .join(Season, Race.season_id == Season.id)
    )

    if season:
        query = query.filter(Season.year == season)
    if race_id:
        query = query.filter(DBSession.race_id == race_id)

    rows = (
        query
        .order_by(Season.year.desc(), Race.round_number.asc().nulls_last(), DBSession.date.asc().nulls_last())
        .limit(limit)
        .all()
    )

    return [
        {
            "id": session.id,
            "race_id": race.id,
            "race_name": race.name,
            "season_year": season_obj.year,
            "session_type": session.session_type,
            "date": session.date,
        }
        for session, race, season_obj in rows
    ]


@router.post("/sessions/upsert", response_model=AdminSessionSchema)
async def upsert_admin_session(payload: AdminSessionUpsertRequest, db: Session = Depends(get_db)):
    race = (
        db.query(Race)
        .options(joinedload(Race.season))
        .filter(Race.id == payload.race_id)
        .first()
    )
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")

    normalized_session_type = payload.session_type.strip().upper()
    if not normalized_session_type:
        raise HTTPException(status_code=400, detail="session_type cannot be empty")

    session = (
        db.query(DBSession)
        .filter(DBSession.race_id == race.id, DBSession.session_type == normalized_session_type)
        .first()
    )

    session_date = payload.date or dt_datetime.utcnow()

    if session:
        session.date = session_date
    else:
        session = DBSession(
            race_id=race.id,
            session_type=normalized_session_type,
            date=session_date,
        )
        db.add(session)

    db.commit()
    db.refresh(session)

    return {
        "id": session.id,
        "race_id": race.id,
        "race_name": race.name,
        "season_year": race.season.year if race.season else 0,
        "session_type": session.session_type,
        "date": session.date,
    }


@router.get("/drivers/images")
async def get_driver_images(db: Session = Depends(get_db)):
    drivers = db.query(Driver).order_by(Driver.last_name.asc(), Driver.first_name.asc()).all()
    return [
        {
            "id": d.id,
            "code": d.code,
            "first_name": d.first_name,
            "last_name": d.last_name,
            "image_url": d.image_url,
        }
        for d in drivers
    ]


@router.patch("/drivers/{driver_id}/image")
async def update_driver_image(driver_id: int, payload: ImageUpdateRequest, db: Session = Depends(get_db)):
    driver = db.query(Driver).filter(Driver.id == driver_id).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    driver.image_url = (payload.image_url or "").strip() or None
    db.commit()

    return {
        "id": driver.id,
        "code": driver.code,
        "image_url": driver.image_url,
    }


@router.get("/teams/images")
async def get_team_images(db: Session = Depends(get_db)):
    teams = db.query(Team).order_by(Team.name.asc()).all()
    return [
        {
            "id": t.id,
            "name": t.name,
            "image_url": t.image_url,
        }
        for t in teams
    ]


@router.patch("/teams/{team_id}/image")
async def update_team_image(team_id: int, payload: ImageUpdateRequest, db: Session = Depends(get_db)):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    team.image_url = (payload.image_url or "").strip() or None
    db.commit()

    return {
        "id": team.id,
        "name": team.name,
        "image_url": team.image_url,
    }


@router.get("/seasonal/drivers", response_model=List[SeasonalDriverProfileSchema])
async def get_seasonal_driver_profiles(season: int, db: Session = Depends(get_db)):
    season_obj = db.query(Season).filter(Season.year == season).first()
    profile_map = {}
    if season_obj:
        rows = db.query(SeasonDriverProfile).filter(SeasonDriverProfile.season_id == season_obj.id).all()
        profile_map = {row.driver_id: row for row in rows}

    # Hide placeholder rows that contain only code and no identity data.
    drivers = (
        db.query(Driver)
        .filter(
            func.coalesce(func.nullif(func.trim(Driver.first_name), ""), "") != "",
            func.coalesce(func.nullif(func.trim(Driver.last_name), ""), "") != "",
        )
        .order_by(Driver.last_name.asc(), Driver.first_name.asc())
        .all()
    )
    return [
        {
            "id": d.id,
            "code": d.code,
            "first_name": d.first_name,
            "last_name": d.last_name,
            "default_number": d.number,
            "default_image_url": d.image_url,
            "season_number": profile_map[d.id].driver_number if d.id in profile_map else None,
            "season_image_url": profile_map[d.id].image_url if d.id in profile_map else None,
        }
        for d in drivers
    ]


@router.patch("/seasonal/drivers/{driver_id}")
async def update_seasonal_driver_profile(
    driver_id: int,
    payload: SeasonalDriverProfileUpdateRequest,
    db: Session = Depends(get_db),
):
    driver = db.query(Driver).filter(Driver.id == driver_id).first()
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    season_obj = _get_or_create_season_by_year(db, payload.season_year)
    profile = db.query(SeasonDriverProfile).filter(
        SeasonDriverProfile.season_id == season_obj.id,
        SeasonDriverProfile.driver_id == driver.id,
    ).first()

    if not profile:
        profile = SeasonDriverProfile(season_id=season_obj.id, driver_id=driver.id)
        db.add(profile)

    profile.driver_number = payload.driver_number
    profile.image_url = (payload.image_url or "").strip() or None

    db.commit()
    db.refresh(profile)

    return {
        "id": driver.id,
        "season_year": season_obj.year,
        "driver_number": profile.driver_number,
        "image_url": profile.image_url,
    }


@router.get("/seasonal/teams", response_model=List[SeasonalTeamProfileSchema])
async def get_seasonal_team_profiles(season: int, db: Session = Depends(get_db)):
    season_obj = db.query(Season).filter(Season.year == season).first()
    profile_map = {}
    if season_obj:
        rows = db.query(SeasonTeamProfile).filter(SeasonTeamProfile.season_id == season_obj.id).all()
        profile_map = {row.team_id: row for row in rows}

    teams = db.query(Team).order_by(Team.name.asc()).all()
    return [
        {
            "id": t.id,
            "name": t.name,
            "default_image_url": t.image_url,
            "season_image_url": profile_map[t.id].image_url if t.id in profile_map else None,
        }
        for t in teams
    ]


@router.patch("/seasonal/teams/{team_id}")
async def update_seasonal_team_profile(
    team_id: int,
    payload: SeasonalTeamProfileUpdateRequest,
    db: Session = Depends(get_db),
):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    season_obj = _get_or_create_season_by_year(db, payload.season_year)
    profile = db.query(SeasonTeamProfile).filter(
        SeasonTeamProfile.season_id == season_obj.id,
        SeasonTeamProfile.team_id == team.id,
    ).first()

    if not profile:
        profile = SeasonTeamProfile(season_id=season_obj.id, team_id=team.id)
        db.add(profile)

    profile.image_url = (payload.image_url or "").strip() or None

    db.commit()
    db.refresh(profile)

    return {
        "id": team.id,
        "season_year": season_obj.year,
        "image_url": profile.image_url,
    }


@router.get("/sync/status", response_model=AdminSyncStatusSchema)
async def get_admin_sync_status():
    with _sync_state_lock:
        return dict(_sync_state)


@router.post("/sync/start", response_model=AdminSyncStatusSchema)
async def start_admin_sync(payload: AdminSyncRequest):
    season_year = payload.season_year or dt_datetime.utcnow().year

    with _sync_state_lock:
        if _sync_state.get("running"):
            raise HTTPException(status_code=409, detail="Sync is already running")

    thread = threading.Thread(target=_run_sync_job, args=(season_year,), daemon=True)
    thread.start()

    with _sync_state_lock:
        return dict(_sync_state)
