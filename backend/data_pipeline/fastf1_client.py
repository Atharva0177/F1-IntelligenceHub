import fastf1
import fastf1.ergast
import os
from typing import Optional, List
from datetime import datetime
import logging


def get_telemetry_safe(lap):
    """Return merged telemetry for a lap without X/Y/Z dtype-preservation warnings.

    FastF1's ``get_telemetry()`` internally merges car data (integer-typed
    Speed/Gear/…) with position data (X/Y/Z).  After the time-based
    resampling, NaN values are introduced into those position columns;
    FastF1 then tries to cast them back to the original integer dtype, which
    fails and triggers a WARNING for every lap.  Casting X/Y/Z to float64
    *before* the merge avoids the issue entirely.
    """
    car_data = lap.get_car_data()
    pos_data = lap.get_pos_data()
    for col in ('X', 'Y', 'Z'):
        if col in pos_data.columns:
            pos_data[col] = pos_data[col].astype('float64')
    return car_data.merge_channels(pos_data).add_distance()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class FastF1Client:
    """
    Wrapper for FastF1 library to fetch F1 data
    """
    
    def __init__(self, cache_dir: str = "./fastf1_cache"):
        """
        Initialize FastF1 client with cache directory
        
        Args:
            cache_dir: Directory to cache FastF1 data
        """
        self.cache_dir = cache_dir
        
        # Create cache directory if it doesn't exist
        if not os.path.exists(cache_dir):
            os.makedirs(cache_dir)
        
        # Configure FastF1 to use alternative Ergast API (ergast.com is deprecated)
        # Use the Jolpi.ca mirror which provides the same Ergast API data
        fastf1.ergast.interface.BASE_URL = 'https://api.jolpi.ca/ergast/f1'
        logger.info("Configured FastF1 to use Jolpi.ca Ergast API mirror")
        
        # Enable FastF1 cache
        fastf1.Cache.enable_cache(cache_dir)
        logger.info(f"FastF1 cache enabled at: {cache_dir}")
    
    def get_event_schedule(self, year: int) -> fastf1.events.EventSchedule:
        """
        Get event schedule for a given year
        
        Args:
            year: Season year
            
        Returns:
            EventSchedule object
        """
        try:
            schedule = fastf1.get_event_schedule(year)
            logger.info(f"Retrieved schedule for {year} season: {len(schedule)} events")
            return schedule
        except Exception as e:
            logger.error(f"Error fetching event schedule for {year}: {e}")
            raise
    
    def get_session(
        self, 
        year: int, 
        race_round: int, 
        session_type: str = 'R',
        results_only: bool = False
    ) -> Optional[fastf1.core.Session]:
        """
        Get a specific session
        
        Args:
            year: Season year
            race_round: Round number (1-based)
            session_type: Session type ('FP1', 'FP2', 'FP3', 'Q', 'R', 'S')
            results_only: When True, skip loading laps/telemetry to speed up results repair
            
        Returns:
            Session object or None if error
        """
        try:
            logger.info(f"Loading session: {year} Round {race_round} {session_type}")
            session = fastf1.get_session(year, race_round, session_type)
            if results_only:
                # Only the session.results property is needed — skip heavy data
                session.load(laps=False, telemetry=False, weather=False, messages=False)
            else:
                session.load()
            logger.info(f"Session loaded successfully")
            return session
        except Exception as e:
            logger.error(f"Error loading session {year} R{race_round} {session_type}: {e}")
            return None
    
    def get_lap_data(self, session: fastf1.core.Session):
        """
        Extract lap data from session
        
        Args:
            session: FastF1 Session object
            
        Returns:
            DataFrame with lap data
        """
        try:
            laps = session.laps
            logger.info(f"Retrieved {len(laps)} laps from session")
            return laps
        except Exception as e:
            logger.error(f"Error getting lap data: {e}")
            return None
    
    def get_telemetry_data(
        self, 
        session: fastf1.core.Session, 
        driver: str, 
        lap_number: Optional[int] = None
    ):
        """
        Extract telemetry data for a specific driver
        
        Args:
            session: FastF1 Session object
            driver: Driver code (e.g., 'HAM', 'VER')
            lap_number: Specific lap number (optional, gets fastest lap if None)
            
        Returns:
            DataFrame with telemetry data
        """
        try:
            if hasattr(session.laps, 'pick_drivers'):
                driver_laps = session.laps.pick_drivers(driver)
            else:
                driver_laps = session.laps.pick_driver(driver)
            
            if lap_number:
                lap = driver_laps[driver_laps['LapNumber'] == lap_number].iloc[0]
            else:
                # Get fastest lap
                lap = driver_laps.pick_fastest()
            
            telemetry = get_telemetry_safe(lap)
            logger.info(f"Retrieved telemetry for {driver} lap {lap['LapNumber']}")
            return telemetry
        except Exception as e:
            logger.error(f"Error getting telemetry for {driver}: {e}")
            return None
    
    def get_weather_data(self, session: fastf1.core.Session):
        """
        Extract weather data from session
        
        Args:
            session: FastF1 Session object
            
        Returns:
            DataFrame with weather data
        """
        try:
            weather = session.weather_data
            logger.info(f"Retrieved weather data: {len(weather)} records")
            return weather
        except Exception as e:
            logger.error(f"Error getting weather data: {e}")
            return None
    
    def get_results(self, session: fastf1.core.Session):
        """
        Get session results
        
        Args:
            session: FastF1 Session object
            
        Returns:
            DataFrame with results
        """
        try:
            results = session.results
            logger.info(f"Retrieved results for {len(results)} drivers")
            return results
        except Exception as e:
            logger.error(f"Error getting results: {e}")
            return None
    
    def get_driver_list(self, session: fastf1.core.Session) -> List[str]:
        """
        Get list of driver codes in session
        
        Args:
            session: FastF1 Session object
            
        Returns:
            List of driver codes
        """
        try:
            drivers = session.drivers
            driver_codes = [session.get_driver(d)['Abbreviation'] for d in drivers]
            logger.info(f"Retrieved {len(driver_codes)} drivers")
            return driver_codes
        except Exception as e:
            logger.error(f"Error getting driver list: {e}")
            return []
    
    def get_race_control_messages(self, session: fastf1.core.Session):
        """
        Get race control messages from session
        
        Args:
            session: FastF1 Session object
            
        Returns:
            DataFrame with race control messages
        """
        try:
            race_control_msgs = session.race_control_messages
            logger.info(f"Retrieved {len(race_control_msgs)} race control messages")
            return race_control_msgs
        except Exception as e:
            logger.error(f"Error getting race control messages: {e}")
            return None


if __name__ == "__main__":
    # Test the client
    client = FastF1Client()
    
    # Get 2018 schedule
    schedule = client.get_event_schedule(2018)
    print(f"\n2018 F1 Calendar: {len(schedule)} races")
    print(schedule[['RoundNumber', 'EventName', 'EventDate']])
    
    # Load a session (Australian GP 2018)
    session = client.get_session(2018, 1, 'R')
    if session:
        print(f"\nSession: {session.event['EventName']}")
        print(f"Session Type: {session.name}")
        
        # Get lap data
        laps = client.get_lap_data(session)
        if laps is not None:
            print(f"\nTotal laps: {len(laps)}")
