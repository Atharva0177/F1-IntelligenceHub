import pandas as pd
import numpy as np
from datetime import datetime, time, date
from typing import Dict, List, Optional, Any
import logging

logger = logging.getLogger(__name__)


class DataProcessor:
    """
    Process and transform FastF1 data for database storage
    """
    
    @staticmethod
    def process_event_data(event_row) -> Dict[str, Any]:
        """
        Process event data from FastF1 schedule
        
        Args:
            event_row: Row from EventSchedule DataFrame
            
        Returns:
            Dictionary with processed event data
        """
        return {
            'round_number': int(event_row['RoundNumber']) if pd.notna(event_row.get('RoundNumber')) else None,
            'event_name': str(event_row['EventName']),
            'official_name': str(event_row.get('OfficialEventName', event_row['EventName'])),
            'location': str(event_row.get('Location', '')),
            'country': str(event_row.get('Country', '')),
            'event_date': event_row['EventDate'].date() if pd.notna(event_row.get('EventDate')) else None,
        }
    
    @staticmethod
    def process_session_data(session) -> Dict[str, Any]:
        """
        Process session metadata
        
        Args:
            session: FastF1 Session object
            
        Returns:
            Dictionary with session data
        """
        return {
            'session_type': session.name,  # 'Race', 'Qualifying', etc.
            'date': session.date if hasattr(session, 'date') else None,
        }
    
    @staticmethod
    def process_lap_data(laps_df: pd.DataFrame) -> List[Dict[str, Any]]:
        """
        Process lap times DataFrame
        
        Args:
            laps_df: FastF1 laps DataFrame
            
        Returns:
            List of dictionaries with lap data
        """
        processed_laps = []
        
        for _, lap in laps_df.iterrows():
            # Convert lap time to seconds
            lap_time_seconds = None
            if pd.notna(lap.get('LapTime')):
                lap_time = lap['LapTime']
                if hasattr(lap_time, 'total_seconds'):
                    lap_time_seconds = lap_time.total_seconds()
            
            # Process sector times
            sector1 = DataProcessor._timedelta_to_seconds(lap.get('Sector1Time'))
            sector2 = DataProcessor._timedelta_to_seconds(lap.get('Sector2Time'))
            sector3 = DataProcessor._timedelta_to_seconds(lap.get('Sector3Time'))
            
            processed_lap = {
                'driver_code': str(lap['Driver']) if pd.notna(lap.get('Driver')) else None,
                'lap_number': int(lap['LapNumber']) if pd.notna(lap.get('LapNumber')) else None,
                'lap_time_seconds': lap_time_seconds,
                'sector1_time': sector1,
                'sector2_time': sector2,
                'sector3_time': sector3,
                'tire_compound': str(lap['Compound']) if pd.notna(lap.get('Compound')) else None,
                'tire_life': int(lap['TyreLife']) if pd.notna(lap.get('TyreLife')) else None,
                'is_pit_out_lap': bool(lap.get('PitOutTime') is not pd.NaT) if 'PitOutTime' in lap else False,
                'is_pit_in_lap': bool(lap.get('PitInTime') is not pd.NaT) if 'PitInTime' in lap else False,
                'is_personal_best': bool(lap.get('IsPersonalBest', False)),
                'track_status': str(lap.get('TrackStatus', '')) if pd.notna(lap.get('TrackStatus')) else None,
            }
            
            processed_laps.append(processed_lap)
        
        return processed_laps
    
    @staticmethod
    def process_telemetry_data(telemetry_df: pd.DataFrame, driver_code: str, lap_number: int, session_start: datetime = None) -> List[Dict[str, Any]]:
        """
        Process telemetry DataFrame
        
        Args:
            telemetry_df: FastF1 telemetry DataFrame
            driver_code: Driver abbreviation
            lap_number: Lap number
            session_start: Session start datetime for timestamp conversion
            
        Returns:
            List of dictionaries with telemetry data
        """
        processed_telemetry = []
        
        for _, row in telemetry_df.iterrows():
            # Convert timestamp - telemetry Time is Timedelta from lap start
            timestamp = row.get('Time')
            if pd.notna(timestamp) and session_start:
                if hasattr(timestamp, 'total_seconds'):  # It's a Timedelta
                    timestamp = session_start + timestamp
                # Otherwise assume it's already a datetime
            else:
                timestamp = None
            
            telemetry_point = {
                'driver_code': driver_code,
                'lap_number': lap_number,
                'timestamp': timestamp,
                'x': float(row['X']) if pd.notna(row.get('X')) else None,
                'y': float(row['Y']) if pd.notna(row.get('Y')) else None,
                'z': float(row['Z']) if pd.notna(row.get('Z')) else None,
                'speed': float(row['Speed']) if pd.notna(row.get('Speed')) else None,
                'throttle': float(row['Throttle']) if pd.notna(row.get('Throttle')) else None,
                'brake': bool(row.get('Brake', False)),
                'gear': int(row['nGear']) if pd.notna(row.get('nGear')) else None,
                'rpm': float(row['RPM']) if pd.notna(row.get('RPM')) else None,
                'drs': int(row['DRS']) if pd.notna(row.get('DRS')) else None,
                'distance': float(row['Distance']) if pd.notna(row.get('Distance')) else None,
            }
            processed_telemetry.append(telemetry_point)
        
        return processed_telemetry
    
    @staticmethod
    def process_results_data(results_df: pd.DataFrame) -> List[Dict[str, Any]]:
        """
        Process race results DataFrame
        
        Args:
            results_df: FastF1 results DataFrame
            
        Returns:
            List of dictionaries with result data
        """
        processed_results = []
        
        for _, result in results_df.iterrows():
            race_time = None
            if pd.notna(result.get('Time')):
                time_val = result['Time']
                if hasattr(time_val, 'total_seconds'):
                    race_time = time_val.total_seconds()
            
            # Process fastest lap data
            fastest_lap_time = None
            fastest_lap_number = None
            if 'FastestLapTime' in result and pd.notna(result['FastestLapTime']):
                fl_time = result['FastestLapTime']
                if hasattr(fl_time, 'total_seconds'):
                    fastest_lap_time = fl_time.total_seconds()
            
            if 'FastestLap' in result and pd.notna(result['FastestLap']):
                fastest_lap_number = int(result['FastestLap'])
            
            processed_result = {
                'driver_code': str(result['Abbreviation']) if pd.notna(result.get('Abbreviation')) else None,
                'team_name': str(result['TeamName']) if pd.notna(result.get('TeamName')) else None,
                'position': int(result['Position']) if pd.notna(result.get('Position')) else None,
                'grid_position': int(result['GridPosition']) if pd.notna(result.get('GridPosition')) else None,
                'points': float(result['Points']) if pd.notna(result.get('Points')) else 0.0,
                'status': str(result['Status']) if pd.notna(result.get('Status')) else 'Unknown',
                'first_name': str(result.get('FirstName', '')),
                'last_name': str(result.get('LastName', '')),
                'driver_number': int(result['DriverNumber']) if pd.notna(result.get('DriverNumber')) else None,
                'fastest_lap_time': fastest_lap_time,
                'fastest_lap_number': fastest_lap_number,
            }
            
            processed_results.append(processed_result)
        
        return processed_results
    
    @staticmethod
    def _timedelta_to_seconds(td) -> Optional[float]:
        """
        Convert timedelta to seconds
        
        Args:
            td: Timedelta object or NaT
            
        Returns:
            Seconds as float or None
        """
        if pd.isna(td) or td is pd.NaT:
            return None
        if hasattr(td, 'total_seconds'):
            return td.total_seconds()
        return None
    
    @staticmethod
    def clean_driver_code(code: str) -> str:
        """
        Clean and standardize driver code
        
        Args:
            code: Driver abbreviation
            
        Returns:
            Cleaned driver code
        """
        if not code:
            return ""
        return str(code).strip().upper()
    
    @staticmethod
    def calculate_pace_metrics(laps_df: pd.DataFrame) -> Dict[str, Any]:
        """
        Calculate pace metrics from lap data
        
        Args:
            laps_df: DataFrame with lap times
            
        Returns:
            Dictionary with pace metrics
        """
        # Filter out pit laps and outliers
        valid_laps = laps_df[
            (laps_df['PitOutTime'].isna()) & 
            (laps_df['PitInTime'].isna()) &
            (laps_df['LapTime'].notna())
        ].copy()
        
        if len(valid_laps) == 0:
            return {}
        
        # Convert lap times to seconds
        valid_laps['LapTimeSeconds'] = valid_laps['LapTime'].apply(
            lambda x: x.total_seconds() if pd.notna(x) and hasattr(x, 'total_seconds') else None
        )
        
        valid_laps = valid_laps[valid_laps['LapTimeSeconds'].notna()]
        
        if len(valid_laps) == 0:
            return {}
        
        return {
            'avg_pace': float(valid_laps['LapTimeSeconds'].mean()),
            'best_pace': float(valid_laps['LapTimeSeconds'].min()),
            'pace_std': float(valid_laps['LapTimeSeconds'].std()),
            'consistency_score': 1.0 / (1.0 + valid_laps['LapTimeSeconds'].std()) if valid_laps['LapTimeSeconds'].std() > 0 else 1.0,
        }
    
    @staticmethod
    def process_weather_data(weather_df: pd.DataFrame, session_start: datetime = None) -> List[Dict[str, Any]]:
        """
        Process weather data from FastF1
        
        Args:
            weather_df: FastF1 weather DataFrame
            session_start: Session start datetime for converting Timedelta timestamps
            
        Returns:
            List of dictionaries with weather data
        """
        if weather_df is None or len(weather_df) == 0:
            return []
        
        processed_weather = []
        
        for _, row in weather_df.iterrows():
            # Convert timestamp - FastF1 weather Time is Timedelta from session start
            timestamp = row.get('Time')
            if pd.notna(timestamp) and session_start:
                if hasattr(timestamp, 'total_seconds'):  # It's a Timedelta
                    timestamp = session_start + timestamp
                # Otherwise assume it's already a datetime
            else:
                timestamp = None
            
            weather_point = {
                'timestamp': timestamp,
                'air_temp': float(row['AirTemp']) if pd.notna(row.get('AirTemp')) else None,
                'track_temp': float(row['TrackTemp']) if pd.notna(row.get('TrackTemp')) else None,
                'humidity': float(row['Humidity']) if pd.notna(row.get('Humidity')) else None,
                'pressure': float(row['Pressure']) if pd.notna(row.get('Pressure')) else None,
                'wind_speed': float(row['WindSpeed']) if pd.notna(row.get('WindSpeed')) else None,
                'wind_direction': int(row['WindDirection']) if pd.notna(row.get('WindDirection')) else None,
                'rainfall': bool(row.get('Rainfall', False)),
            }
            processed_weather.append(weather_point)
        
        return processed_weather
    
    @staticmethod
    def process_race_control_messages(session, session_start: datetime = None) -> List[Dict[str, Any]]:
        """
        Process race control messages from FastF1 session
        
        Args:
            session: FastF1 Session object
            
        Returns:
            List of dictionaries with race control messages
        """
        try:
            # Try to get race control messages (not available for all sessions)
            if not hasattr(session, 'race_control_messages'):
                return []
            
            messages_df = session.race_control_messages
            if messages_df is None or len(messages_df) == 0:
                return []
            
            processed_messages = []
            
            for _, msg in messages_df.iterrows():
                message_dict = {
                    'timestamp': msg.get('Time') if pd.notna(msg.get('Time')) else None,
                    'category': str(msg.get('Category', 'Other')),
                    'message': str(msg.get('Message', '')),
                    'status': str(msg.get('Status', '')) if pd.notna(msg.get('Status')) else None,
                    'flag': str(msg['Flag']) if pd.notna(msg.get('Flag')) else None,
                    'scope': str(msg.get('Scope')) if pd.notna(msg.get('Scope')) else None,
                    'sector': int(msg['Sector']) if pd.notna(msg.get('Sector')) else None,
                }
                processed_messages.append(message_dict)
            
            return processed_messages
        
        except Exception as e:
            logger.warning(f"Could not process race control messages: {e}")
            return []
    
    @staticmethod
    def process_session_status(session, session_start: datetime = None) -> List[Dict[str, Any]]:
        """
        Process session status data from FastF1 session
        
        Args:
            session: FastF1 Session object
            session_start: Session start datetime for timestamp conversion
            
        Returns:
            List of dictionaries with session status events
        """
        try:
            # Try to get session status data
            if not hasattr(session, 'session_status'):
                return []
            
            status_df = session.session_status
            if status_df is None or len(status_df) == 0:
                return []
            
            processed_status = []
            
            for _, status_row in status_df.iterrows():
                # Convert timestamp
                timestamp = status_row.get('Time')
                if pd.notna(timestamp) and session_start:
                    if hasattr(timestamp, 'total_seconds'):  # It's a Timedelta
                        timestamp = session_start + timestamp
                else:
                    timestamp = None
                
                status_dict = {
                    'timestamp': timestamp,
                    'status': str(status_row.get('Status', '')),
                }
                processed_status.append(status_dict)
            
            return processed_status
        
        except Exception as e:
            logger.warning(f"Could not process session status: {e}")
            return []


if __name__ == "__main__":
    # Test data processor
    print("DataProcessor module loaded successfully")
