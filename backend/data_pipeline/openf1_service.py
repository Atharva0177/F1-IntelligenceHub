"""
OpenF1 REST Service
Async client for the OpenF1 public API (https://api.openf1.org/v1).
Used for season calendar, circuit metadata, and live session discovery.
"""

import logging
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

OPENF1_BASE_URL = "https://api.openf1.org/v1"
# Timeout: 10s connect, 20s read
_TIMEOUT = httpx.Timeout(20.0, connect=10.0)


async def _get(endpoint: str, params: Optional[Dict[str, Any]] = None) -> Any:
    """Make a GET request to the OpenF1 API."""
    url = f"{OPENF1_BASE_URL}{endpoint}"
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        try:
            response = await client.get(url, params=params)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as exc:
            logger.error("OpenF1 HTTP error %s for %s", exc.response.status_code, url)
            raise
        except httpx.RequestError as exc:
            logger.error("OpenF1 request error for %s: %s", url, exc)
            raise


async def get_season_meetings(year: int) -> List[Dict]:
    """
    Fetch all race meetings for a given year from OpenF1.
    Returns list of meeting dicts with circuit name, country, lat/lon, and date.
    """
    data = await _get("/meetings", {"year": year})
    return data or []


async def get_meeting(meeting_key: int) -> Optional[Dict]:
    """Fetch a single meeting by its OpenF1 meeting_key."""
    data = await _get("/meetings", {"meeting_key": meeting_key})
    return data[0] if data else None


async def get_sessions_for_meeting(meeting_key: int) -> List[Dict]:
    """Fetch all sessions for a given meeting."""
    data = await _get("/sessions", {"meeting_key": meeting_key})
    return data or []


async def get_active_session(year: int) -> Optional[Dict]:
    """
    Return the currently active session for the given year, if any.
    OpenF1 returns sessions; we check date_start vs now.
    """
    from datetime import datetime, timezone

    sessions = await _get("/sessions", {"year": year})
    now = datetime.now(timezone.utc)
    for s in (sessions or []):
        start = s.get("date_start")
        end = s.get("date_end")
        if start and end:
            try:
                s_start = datetime.fromisoformat(start.replace("Z", "+00:00"))
                s_end = datetime.fromisoformat(end.replace("Z", "+00:00"))
                if s_start <= now <= s_end:
                    return s
            except ValueError:
                continue
    return None
