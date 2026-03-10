from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, Text, Date, Time
from sqlalchemy.orm import relationship
from datetime import datetime
from database.config import Base


class Season(Base):
    """F1 Season"""
    __tablename__ = "seasons"
    
    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, unique=True, nullable=False, index=True)
    
    # Relationships
    races = relationship("Race", back_populates="season")
    
    def __repr__(self):
        return f"<Season {self.year}>"


class Circuit(Base):
    """F1 Circuit/Track"""
    __tablename__ = "circuits"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    location = Column(String(255))
    country = Column(String(100))
    latitude = Column(Float)
    longitude = Column(Float)
    length_km = Column(Float)  # Track length in kilometers
    
    # Relationships
    races = relationship("Race", back_populates="circuit")


class Driver(Base):
    """F1 Driver"""
    __tablename__ = "drivers"
    
    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(3), unique=True, index=True)  # e.g., HAM, VET
    number = Column(Integer)  # Racing number
    first_name = Column(String(100))
    last_name = Column(String(100))
    nationality = Column(String(100))
    date_of_birth = Column(Date, nullable=True)
    
    # Relationships
    lap_times = relationship("LapTime", back_populates="driver")
    position_data = relationship("PositionData", back_populates="driver")
    results = relationship("Result", back_populates="driver")
    qualifying_results = relationship("Qualifying", back_populates="driver")
    
    def __repr__(self):
        return f"<Driver {self.code}>"


class Team(Base):
    """F1 Team (Constructor)"""
    __tablename__ = "teams"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    nationality = Column(String(100))
    
    # Relationships
    results = relationship("Result", back_populates="team")


class Race(Base):
    """F1 Race Event"""
    __tablename__ = "races"
    
    id = Column(Integer, primary_key=True, index=True)
    season_id = Column(Integer, ForeignKey("seasons.id"), nullable=False)
    circuit_id = Column(Integer, ForeignKey("circuits.id"), nullable=False)
    
    name = Column(String(255), nullable=False)  # e.g., "Australian Grand Prix"
    round_number = Column(Integer)  # Race number in season
    date = Column(Date)
    time = Column(Time, nullable=True)
    
    # FastF1 specific
    event_name = Column(String(255))  # FastF1 event name
    official_name = Column(String(255))  # Official race name
    
    # Relationships
    season = relationship("Season", back_populates="races")
    circuit = relationship("Circuit", back_populates="races")
    sessions = relationship("Session", back_populates="race")
    results = relationship("Result", back_populates="race")
    
    def __repr__(self):
        return f"<Race {self.name} {self.season_id}>"


class Session(Base):
    """Race Session (Practice, Qualifying, Race, Sprint)"""
    __tablename__ = "sessions"
    
    id= Column(Integer, primary_key=True, index=True)
    race_id = Column(Integer, ForeignKey("races.id"), nullable=False)
    
    session_type = Column(String(50))  # FP1, FP2, FP3, Q, R, S (Sprint)
    date = Column(DateTime)
    
    # Relationships
    race = relationship("Race", back_populates="sessions")
    lap_times = relationship("LapTime", back_populates="session")
    telemetry_data = relationship("TelemetryData", back_populates="session")
    position_data = relationship("PositionData", back_populates="session")
    pit_stops = relationship("PitStop", back_populates="session")


class LapTime(Base):
    """Lap Time Data"""
    __tablename__ = "lap_times"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=False)
    
    lap_number = Column(Integer, nullable=False)
    lap_time_seconds = Column(Float)  # Lap time in seconds
    sector1_time = Column(Float)
    sector2_time = Column(Float)
    sector3_time = Column(Float)
    
    # Tire information
    tire_compound = Column(String(50))  # SOFT, MEDIUM, HARD
    tire_life = Column(Integer)  # Age of tire in laps
    
    # Status
    is_pit_out_lap = Column(Boolean, default=False)
    is_pit_in_lap = Column(Boolean, default=False)
    is_personal_best = Column(Boolean, default=False)
    
    # Track status
    track_status = Column(String(50))  # Green, Yellow, SC, VSC, Red
    
    # Relationships
    session = relationship("Session", back_populates="lap_times")
    driver = relationship("Driver", back_populates="lap_times")
    
    def __repr__(self):
        return f"<LapTime {self.driver_id} L{self.lap_number} {self.lap_time_seconds}s>"


class TelemetryData(Base):
    """Telemetry Data (Time-series - TimescaleDB hypertable)"""
    __tablename__ = "telemetry_data"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=False)
    
    timestamp = Column(DateTime, nullable=False)  # Hypertable partition key
    lap_number = Column(Integer)
    
    # Position
    x = Column(Float)  # X coordinate
    y = Column(Float)  # Y coordinate
    z = Column(Float)  # Z coordinate (elevation)
    
    # Speed and controls
    speed = Column(Float)  # km/h
    throttle = Column(Float)  # 0-100%
    brake = Column(Boolean)
    gear = Column(Integer)
    rpm = Column(Float)
    drs = Column(Integer)  # DRS status
    
    # Track position
    distance = Column(Float)  # Distance along track (meters)
    
    # Relationships
    session = relationship("Session", back_populates="telemetry_data")


class PositionData(Base):
    """Position/Location Data for Track Map (Downsampled 10x)"""
    __tablename__ = "position_data"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False, index=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=False, index=True)
    
    timestamp = Column(DateTime, nullable=False)
    
    # Position coordinates
    x = Column(Float)  # X coordinate
    y = Column(Float)  # Y coordinate
    z = Column(Float)  # Z coordinate (elevation)
    
    # Relationships
    session = relationship("Session", back_populates="position_data")
    driver = relationship("Driver", back_populates="position_data")
    
    def __repr__(self):
        return f"<PositionData driver={self.driver_id} x={self.x} y={self.y}>"


class PitStop(Base):
    """Pit Stop Data"""
    __tablename__ = "pit_stops"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=False)
    
    lap_number = Column(Integer, nullable=False)
    stop_number = Column(Integer)  # Pit stop count for this driver
    duration_seconds = Column(Float)
    
    # Tire change
    tire_fitted = Column(String(50))  # Compound fitted
    
    # Relationships
    session = relationship("Session", back_populates="pit_stops")


class Result(Base):
    """Race Result"""
    __tablename__ = "results"
    
    id = Column(Integer, primary_key=True, index=True)
    race_id = Column(Integer, ForeignKey("races.id"), nullable=False)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id"), nullable=False)
    
    is_sprint = Column(Boolean, default=False)  # True for Sprint race results
    position = Column(Integer)  # Final position (null if DNF)
    grid_position = Column(Integer)  # Starting position
    points = Column(Float, default=0.0)
    laps_completed = Column(Integer)
    race_time_seconds = Column(Float, nullable=True)
    status = Column(String(100))  # Finished, +1 Lap, Accident, etc.
    
    fastest_lap_number = Column(Integer, nullable=True)
    fastest_lap_time = Column(Float, nullable=True)
    
    # Relationships
    race = relationship("Race", back_populates="results")
    driver = relationship("Driver", back_populates="results")
    team = relationship("Team", back_populates="results")


class Qualifying(Base):
    """Qualifying Results"""
    __tablename__ = "qualifying"
    
    id = Column(Integer, primary_key=True, index=True)
    race_id = Column(Integer, ForeignKey("races.id"), nullable=False)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=False)
    
    position = Column(Integer)
    q1_time = Column(Float, nullable=True)
    q2_time = Column(Float, nullable=True)
    q3_time = Column(Float, nullable=True)
    
    # Relationships
    driver = relationship("Driver", back_populates="qualifying_results")


class WeatherData(Base):
    """Weather Data for Race Sessions"""
    __tablename__ = "weather_data"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False, index=True)
    
    timestamp = Column(DateTime, nullable=False, index=True)
    air_temp = Column(Float)  # Air temperature in Celsius
    track_temp = Column(Float)  # Track temperature in Celsius
    humidity = Column(Float)  # Humidity percentage
    pressure = Column(Float)  # Atmospheric pressure
    wind_speed = Column(Float)  # Wind speed in m/s
    wind_direction = Column(Integer)  # Wind direction in degrees
    rainfall = Column(Boolean, default=False)
    
    # Relationships
    session = relationship("Session", backref="weather_data")


class RaceControlMessage(Base):
    """Race Control  Messages (flags, safety car, etc.)"""
    __tablename__ = "race_control_messages"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False, index=True)
    
    timestamp = Column(DateTime, nullable=False, index=True)
    category = Column(String(100))  # Flag, SafetyCar, etc.
    message = Column(Text)
    status = Column(String(50))  # GREEN, YELLOW, RED, SC, VSC
    flag = Column(String(50))  # GREEN, YELLOW, RED, BLUE, etc.
    scope = Column(String(50))  # Track, Sector, Driver
    sector = Column(Integer, nullable=True)


class SessionStatus(Base):
    """Session Status Events (Started, Aborted, Finished, etc.)"""
    __tablename__ = "session_status"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id"), nullable=False, index=True)
    
    timestamp = Column(DateTime, nullable=False, index=True)
    status = Column(String(100))  # Started, Finalized, Ends, Aborted, etc.
