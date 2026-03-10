-- Add new tables for comprehensive race data
-- Migration script for F1 Intelligence Hub

-- Weather Data Table
CREATE TABLE IF NOT EXISTS weather_data (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL,
    air_temp FLOAT,
    track_temp FLOAT,
    humidity FLOAT,
    pressure FLOAT,
    wind_speed FLOAT,
    wind_direction INTEGER,
    rainfall BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_weather_session ON weather_data(session_id);
CREATE INDEX idx_weather_timestamp ON weather_data(timestamp);

-- Session Status Table
CREATE TABLE IF NOT EXISTS session_status (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL,
    status VARCHAR(100),
    message TEXT
);

CREATE INDEX idx_session_status_session ON session_status(session_id);
CREATE INDEX idx_session_status_timestamp ON session_status(timestamp);

-- Race Control Messages Table
CREATE TABLE IF NOT EXISTS race_control_messages (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL,
    lap_number INTEGER,
    category VARCHAR(100),
    message TEXT NOT NULL,
    flag VARCHAR(50),
    scope VARCHAR(50),
    driver_code VARCHAR(3),
    sector INTEGER
);

CREATE INDEX idx_race_control_session ON race_control_messages(session_id);
CREATE INDEX idx_race_control_timestamp ON race_control_messages(timestamp);
CREATE INDEX idx_race_control_flag ON race_control_messages(flag);

-- Add comments
COMMENT ON TABLE weather_data IS 'Weather conditions during race sessions';
COMMENT ON TABLE session_status IS 'Session status timeline (started, stopped, finished)';
COMMENT ON TABLE race_control_messages IS 'Race control messages, flags, and safety car events';
