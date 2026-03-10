"""
Race Control API Routes
Endpoints for accessing race control messages and flags
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from database.config import get_db
from database.models import RaceControlMessage

router = APIRouter(prefix="/api/race-control", tags=["race-control"])


@router.get("/{session_id}")
def get_race_control_messages(
    session_id: int, 
    limit: Optional[int] = None,
    category: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get race control messages for a session
    
    Args:
        session_id: ID of the session
        limit: Optional limit on number of messages
        category: Optional filter by category (Flag, SafetyCar, DRS, etc.)
        
    Returns:
        List of race control messages
    """
    query = db.query(RaceControlMessage).filter(
        RaceControlMessage.session_id == session_id
    )
    
    if category:
        query = query.filter(RaceControlMessage.category == category)
    
    query = query.order_by(RaceControlMessage.timestamp)
    
    if limit:
        query = query.limit(limit)
    
    messages = query.all()
    
    return [{
        "id": msg.id,
        "timestamp": msg.timestamp.isoformat() if msg.timestamp else None,
        "category": msg.category,
        "message": msg.message,
        "status": msg.status,
        "flag": msg.flag,
        "scope": msg.scope,
        "sector": msg.sector,
    } for msg in messages]


@router.get("/{session_id}/flags")
def get_flag_changes(session_id: int, db: Session = Depends(get_db)):
    """
    Get flag changes timeline for a session
    
    Args:
        session_id: ID of the session
        
    Returns:
        List of flag changes
    """
    flags = db.query(RaceControlMessage).filter(
        RaceControlMessage.session_id == session_id,
        RaceControlMessage.flag.isnot(None)
    ).order_by(RaceControlMessage.timestamp).all()
    
    return [{
        "timestamp": flag.timestamp.isoformat() if flag.timestamp else None,
        "flag": flag.flag,
        "status": flag.status,
        "message": flag.message,
        "scope": flag.scope,
    } for flag in flags]


@router.get("/{session_id}/stats")
def get_race_control_stats(session_id: int, db: Session = Depends(get_db)):
    """
    Get statistics about race control events
    
    Args:
        session_id: ID of the session
        
    Returns:
        Dictionary with stats
    """
    from sqlalchemy import func
    
    total = db.query(func.count(RaceControlMessage.id)).filter(
        RaceControlMessage.session_id == session_id
    ).scalar()
    
    by_category = db.query(
        RaceControlMessage.category,
        func.count(RaceControlMessage.id).label('count')
    ).filter(
        RaceControlMessage.session_id == session_id
    ).group_by(RaceControlMessage.category).all()
    
    flag_count = db.query(func.count(RaceControlMessage.id)).filter(
        RaceControlMessage.session_id == session_id,
        RaceControlMessage.flag.isnot(None)
    ).scalar()
    
    return {
        "total_messages": total,
        "flag_changes": flag_count,
        "by_category": {cat: count for cat, count in by_category}
    }
