"""
Session Status API Routes
Endpoints for accessing session status timeline
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database.config import get_db
from database.models import SessionStatus

router = APIRouter(prefix="/api/session-status", tags=["session-status"])


@router.get("/{session_id}")
def get_session_status(session_id: int, db: Session = Depends(get_db)):
    """
    Get session status timeline for a specific session
    
    Args:
        session_id: ID of the session
        
    Returns:
        List of session status events
    """
    status_records = db.query(SessionStatus).filter(
        SessionStatus.session_id == session_id
    ).order_by(SessionStatus.timestamp).all()
    
    return [{
        "id": status.id,
        "timestamp": status.timestamp.isoformat() if status.timestamp else None,
        "status": status.status,
    } for status in status_records]
