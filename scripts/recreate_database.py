"""
Script to drop and recreate all database tables
"""
import sys
from pathlib import Path

# Add backend to path
backend_path = Path(__file__).parent.parent / 'backend'
sys.path.insert(0, str(backend_path))

from database.config import engine, Base
from database.models import (
    Season, Circuit, Driver, Team, Race, Session, LapTime,
    TelemetryData, PositionData, PitStop, Result, Qualifying,
    WeatherData, RaceControlMessage, SessionStatus
)
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def recreate_database():
    """Drop all tables and recreate them"""
    logger.info("=" * 80)
    logger.info("DROPPING ALL TABLES")
    logger.info("=" * 80)
    
    # Drop all tables with CASCADE using raw SQL
    from sqlalchemy import text
    with engine.connect() as conn:
        logger.info("Dropping all tables with CASCADE...")
        try:
            # Get all table names
            result = conn.execute(text("""
                SELECT tablename FROM pg_tables 
                WHERE schemaname = 'public'
            """))
            tables = [row[0] for row in result]
            
            logger.info(f"Found {len(tables)} tables to drop")
            
            # Drop each table with CASCADE
            for table in tables:
                logger.info(f"  Dropping table: {table}")
                conn.execute(text(f"DROP TABLE IF EXISTS {table} CASCADE"))
            
            # Also drop any views
            result = conn.execute(text("""
                SELECT viewname FROM pg_views 
                WHERE schemaname = 'public'
            """))
            views = [row[0] for row in result]
            
            for view in views:
                logger.info(f"  Dropping view: {view}")
                conn.execute(text(f"DROP VIEW IF EXISTS {view} CASCADE"))
            
            conn.commit()
            logger.info("✓ All tables and views dropped")
        except Exception as e:
            logger.error(f"Error dropping tables: {e}")
            raise
    
    logger.info("")
    logger.info("=" * 80)
    logger.info("DATABASE RECREATED SUCCESSFULLY")
    logger.info("=" * 80)
    logger.info("")
    logger.info("Next step: Run the data loader to populate the database")
    logger.info("  python scripts/initial_data_load.py")
    logger.info("")

if __name__ == "__main__":
    recreate_database()
