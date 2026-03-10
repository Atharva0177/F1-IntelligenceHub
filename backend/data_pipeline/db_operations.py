import sys
import os

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session
from database.models import (
    Season, Circuit, Driver, Team, Race, 
    Session as DBSession, LapTime, TelemetryData, 
    PitStop, Result, Qualifying
)
from typing import List, Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)


class DatabaseOperations:
    """
    Database operations for F1 data insertion and retrieval
    """
    
    def __init__(self, db_session: Session):
        """
        Initialize with database session
        
        Args:
            db_session: SQLAlchemy Session
        """
        self.db = db_session
    
    def get_or_create_season(self, year: int) -> Season:
        """
        Get existing season or create new one
        
        Args:
            year: Season year
            
        Returns:
            Season model instance
        """
        season = self.db.query(Season).filter(Season.year == year).first()
        if not season:
            season = Season(year=year)
            self.db.add(season)
            self.db.commit()
            self.db.refresh(season)
            logger.info(f"Created season: {year}")
        return season
    
    def get_or_create_circuit(self, circuit_data: Dict[str, Any]) -> Circuit:
        """
        Get existing circuit or create new one
        
        Args:
            circuit_data: Dictionary with circuit information
            
        Returns:
            Circuit model instance
        """
        circuit_name = circuit_data.get('name')
        circuit = self.db.query(Circuit).filter(Circuit.name == circuit_name).first()
        
        if not circuit:
            circuit = Circuit(**circuit_data)
            self.db.add(circuit)
            self.db.commit()
            self.db.refresh(circuit)
            logger.info(f"Created circuit: {circuit_name}")
        
        return circuit
    
    def get_or_create_driver(self, driver_data: Dict[str, Any]) -> Driver:
        """
        Get existing driver or create new one
        
        Args:
            driver_data: Dictionary with driver information
            
        Returns:
            Driver model instance
        """
        driver_code = driver_data.get('code')
        driver = self.db.query(Driver).filter(Driver.code == driver_code).first()
        
        if not driver:
            driver = Driver(**driver_data)
            self.db.add(driver)
            self.db.commit()
            self.db.refresh(driver)
            logger.info(f"Created driver: {driver_code}")
        else:
            # Update driver info if provided
            for key, value in driver_data.items():
                if value is not None and hasattr(driver, key):
                    setattr(driver, key, value)
            self.db.commit()
        
        return driver
    
    def get_or_create_team(self, team_data: Dict[str, Any]) -> Team:
        """
        Get existing team or create new one
        
        Args:
            team_data: Dictionary with team information
            
        Returns:
            Team model instance
        """
        team_name = team_data.get('name')
        team = self.db.query(Team).filter(Team.name == team_name).first()
        
        if not team:
            team = Team(**team_data)
            self.db.add(team)
            self.db.commit()
            self.db.refresh(team)
            logger.info(f"Created team: {team_name}")
        
        return team
    
    def get_or_create_race(self, race_data: Dict[str, Any], season: Season, circuit: Circuit) -> Race:
        """
        Get existing race or create new one
        
        Args:
            race_data: Dictionary with race information
            season: Season model instance
            circuit: Circuit model instance
            
        Returns:
            Race model instance
        """
        race = self.db.query(Race).filter(
            Race.season_id == season.id,
            Race.round_number == race_data.get('round_number')
        ).first()
        
        if not race:
            race = Race(
                season_id=season.id,
                circuit_id=circuit.id,
                **race_data
            )
            self.db.add(race)
            self.db.commit()
            self.db.refresh(race)
            logger.info(f"Created race: {race_data.get('name')}")
        
        return race
    
    def create_session(self, session_data: Dict[str, Any], race: Race) -> DBSession:
        """
        Create a new session
        
        Args:
            session_data: Dictionary with session information
            race: Race model instance
            
        Returns:
            Session model instance
        """
        # Check if session already exists
        existing_session = self.db.query(DBSession).filter(
            DBSession.race_id == race.id,
            DBSession.session_type == session_data.get('session_type')
        ).first()
        
        if existing_session:
            logger.info(f"Session already exists: {session_data.get('session_type')}")
            return existing_session
        
        db_session = DBSession(
            race_id=race.id,
            **session_data
        )
        self.db.add(db_session)
        self.db.commit()
        self.db.refresh(db_session)
        logger.info(f"Created session: {session_data.get('session_type')}")
        
        return db_session
    
    def bulk_insert_lap_times(self, lap_times: List[Dict[str, Any]], session: DBSession):
        """
        Bulk insert lap times. Skips silently if the session already has lap data
        (idempotent — safe to call on re-runs).
        """
        existing = self.db.query(LapTime).filter(LapTime.session_id == session.id).count()
        if existing:
            logger.info(f"  Lap times already exist for session {session.id} ({existing} rows), skipping")
            return

        lap_objects = []
        
        for lap_data in lap_times:
            # Get driver
            driver_code = lap_data.pop('driver_code', None)
            if not driver_code:
                continue
            
            driver = self.db.query(Driver).filter(Driver.code == driver_code).first()
            if not driver:
                # Auto-create driver if not found
                logger.info(f"Auto-creating driver: {driver_code}")
                driver = Driver(code=driver_code)
                self.db.add(driver)
                self.db.flush()  # Flush to get the ID without committing
            
            lap = LapTime(
                session_id=session.id,
                driver_id=driver.id,
                **lap_data
            )
            lap_objects.append(lap)
        
        if lap_objects:
            self.db.bulk_save_objects(lap_objects)
            self.db.commit()
            logger.info(f"Inserted {len(lap_objects)} lap times")
    
    def bulk_insert_telemetry(self, telemetry_data: List[Dict[str, Any]], session: DBSession):
        """
        Bulk insert telemetry data. Skips silently if the session already has
        telemetry for the given driver (idempotent — safe to call on re-runs).
        """
        if not telemetry_data:
            return

        # All points in one call belong to the same driver — peek at the code
        # without popping so the loop below still sees it.
        first_code = telemetry_data[0].get('driver_code') if telemetry_data else None
        if first_code:
            first_driver = self.db.query(Driver).filter(Driver.code == first_code).first()
            if first_driver:
                existing = self.db.query(TelemetryData).filter(
                    TelemetryData.session_id == session.id,
                    TelemetryData.driver_id == first_driver.id,
                ).count()
                if existing:
                    logger.info(f"  Telemetry already exists for {first_code} in session {session.id}, skipping")
                    return

        telemetry_objects = []
        
        for telem_data in telemetry_data:
            # Get driver
            driver_code = telem_data.pop('driver_code', None)
            if not driver_code:
                continue
            
            driver = self.db.query(Driver).filter(Driver.code == driver_code).first()
            if not driver:
                continue
            
            telem = TelemetryData(
                session_id=session.id,
                driver_id=driver.id,
                **telem_data
            )
            telemetry_objects.append(telem)
        
        if telemetry_objects:
            self.db.bulk_save_objects(telemetry_objects)
            self.db.commit()
            logger.info(f"Inserted {len(telemetry_objects)} telemetry points")
    
    def insert_result(self, result_data: Dict[str, Any], race: Race):
        """
        Insert race result
        
        Args:
            result_data: Dictionary with result information
            race: Race model instance
        """
        # Get driver and team
        driver_code = result_data.pop('driver_code', None)
        team_name = result_data.pop('team_name', None)
        
        # Remove driver info fields (these are not in Result table)
        first_name = result_data.pop('first_name', None)
        last_name = result_data.pop('last_name', None)
        driver_number = result_data.pop('driver_number', None)
        
        if not driver_code or not team_name:
            return
        
        driver = self.db.query(Driver).filter(Driver.code == driver_code).first()
        team = self.db.query(Team).filter(Team.name == team_name).first()
        
        if not driver or not team:
            logger.warning(f"Driver or team not found: {driver_code}, {team_name}")
            return
        
        is_sprint = result_data.get('is_sprint', False)

        # Check if result already exists (sprint and race are stored separately)
        existing_result = self.db.query(Result).filter(
            Result.race_id == race.id,
            Result.driver_id == driver.id,
            Result.is_sprint == is_sprint,
        ).first()
        
        if existing_result:
            # Update existing result with new data (including fastest lap data)
            for key, value in result_data.items():
                setattr(existing_result, key, value)
            self.db.commit()
            logger.info(f"Updated result for {driver_code}")
            return
        
        result = Result(
            race_id=race.id,
            driver_id=driver.id,
            team_id=team.id,
            **result_data
        )
        self.db.add(result)
        self.db.commit()
        logger.info(f"Inserted result for {driver_code}")

    def bulk_insert_qualifying(self, qualifying_rows: List[Dict[str, Any]], race: Race):
        """
        Insert or update qualifying results for a race.
        Skips the race if rows already exist.

        Each dict must have: driver_code, position, q1_time, q2_time, q3_time
        (times in seconds as float or None).
        """
        existing = self.db.query(Qualifying).filter(Qualifying.race_id == race.id).count()
        if existing:
            logger.info(f"  Qualifying rows already exist for race {race.id}, skipping")
            return 0

        inserted = 0
        for row in qualifying_rows:
            driver_code = row.get("driver_code")
            if not driver_code:
                continue
            driver = self.db.query(Driver).filter(Driver.code == driver_code).first()
            if not driver:
                logger.warning(f"  Driver {driver_code} not found in DB, skipping qualifying row")
                continue
            q = Qualifying(
                race_id=race.id,
                driver_id=driver.id,
                position=row.get("position"),
                q1_time=row.get("q1_time"),
                q2_time=row.get("q2_time"),
                q3_time=row.get("q3_time"),
            )
            self.db.add(q)
            inserted += 1

        if inserted:
            self.db.commit()
        return inserted

    def session_exists(self, race: Race, session_type: str) -> bool:
        """
        Check if session already exists
        
        Args:
            race: Race model instance
            session_type: Type of session
            
        Returns:
            True if exists, False otherwise
        """
        session = self.db.query(DBSession).filter(
            DBSession.race_id == race.id,
            DBSession.session_type == session_type
        ).first()
        
        return session is not None
    
    def bulk_insert_weather(self, weather_data: List[Dict[str, Any]], session: DBSession):
        """
        Bulk insert weather data
        
        Args:
            weather_data: List of weather dictionaries
            session: Session model instance
        """
        from database.models import WeatherData
        
        weather_objects = []
        
        for weather_point in weather_data:
            if weather_point.get('timestamp'):
                weather = WeatherData(
                    session_id=session.id,
                    **weather_point
                )
                weather_objects.append(weather)
        
        if weather_objects:
            self.db.bulk_save_objects(weather_objects)
            self.db.commit()
            logger.info(f"Inserted {len(weather_objects)} weather data points")
    
    def bulk_insert_race_control_messages(self, messages: List[Dict[str, Any]], session: DBSession):
        """
        Bulk insert race control messages
        
        Args:
            messages: List of race control message dictionaries
            session: Session model instance
        """
        from database.models import RaceControlMessage
        
        message_objects = []
        
        for msg in messages:
            if msg.get('message'):
                race_msg = RaceControlMessage(
                    session_id=session.id,
                    **msg
                )
                message_objects.append(race_msg)
        
        if message_objects:
            self.db.bulk_save_objects(message_objects)
            self.db.commit()
            logger.info(f"Inserted {len(message_objects)} race control messages")
    
    def bulk_insert_session_status(self, status_data: List[Dict[str, Any]], session: DBSession):
        """
        Bulk insert session status data
        
        Args:
            status_data: List of session status dictionaries
            session: Session model instance
        """
        from database.models import SessionStatus
        
        status_objects = []
        
        for status in status_data:
            if status.get('timestamp') and status.get('status'):
                session_status = SessionStatus(
                    session_id=session.id,
                    **status
                )
                status_objects.append(session_status)
        
        if status_objects:
            self.db.bulk_save_objects(status_objects)
            self.db.commit()
            logger.info(f"Inserted {len(status_objects)} session status records")


if __name__ == "__main__":
    print("DatabaseOperations module loaded successfully")
