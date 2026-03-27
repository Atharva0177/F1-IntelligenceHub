-- F1 Intelligence Hub Database Schema
-- Requires PostgreSQL with TimescaleDB extension

-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Seasons table
CREATE TABLE IF NOT EXISTS seasons (
    id SERIAL PRIMARY KEY,
    year INTEGER UNIQUE NOT NULL
);

CREATE INDEX idx_seasons_year ON seasons(year);

-- Circuits table
CREATE TABLE IF NOT EXISTS circuits (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location VARCHAR(255),
    country VARCHAR(100),
    latitude FLOAT,
    longitude FLOAT,
    length_km FLOAT
);

-- Drivers table
CREATE TABLE IF NOT EXISTS drivers (
    id SERIAL PRIMARY KEY,
    code VARCHAR(3) UNIQUE NOT NULL,
    number INTEGER,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    nationality VARCHAR(100),
    date_of_birth DATE,
    image_url VARCHAR(500)
);

CREATE INDEX idx_drivers_code ON drivers(code);

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    nationality VARCHAR(100),
    image_url VARCHAR(500)
);

-- Races table
CREATE TABLE IF NOT EXISTS races (
    id SERIAL PRIMARY KEY,
    season_id INTEGER NOT NULL REFERENCES seasons(id),
    circuit_id INTEGER NOT NULL REFERENCES circuits(id),
    name VARCHAR(255) NOT NULL,
    round_number INTEGER,
    date DATE,
    time TIME,
    event_name VARCHAR(255),
    official_name VARCHAR(255)
);

CREATE INDEX idx_races_season ON races(season_id);
CREATE INDEX idx_races_circuit ON races(circuit_id);
CREATE INDEX idx_races_date ON races(date);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    race_id INTEGER NOT NULL REFERENCES races(id),
    session_type VARCHAR(50),
    date TIMESTAMP
);

CREATE INDEX idx_sessions_race ON sessions(race_id);
CREATE INDEX idx_sessions_type ON sessions(session_type);

-- Lap times table
CREATE TABLE IF NOT EXISTS lap_times (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    driver_id INTEGER NOT NULL REFERENCES drivers(id),
    lap_number INTEGER NOT NULL,
    lap_time_seconds FLOAT,
    sector1_time FLOAT,
    sector2_time FLOAT,
    sector3_time FLOAT,
    tire_compound VARCHAR(50),
    tire_life INTEGER,
    is_pit_out_lap BOOLEAN DEFAULT FALSE,
    is_pit_in_lap BOOLEAN DEFAULT FALSE,
    is_personal_best BOOLEAN DEFAULT FALSE,
    track_status VARCHAR(50)
);

CREATE INDEX idx_lap_times_session ON lap_times(session_id);
CREATE INDEX idx_lap_times_driver ON lap_times(driver_id);
CREATE INDEX idx_lap_times_lap_number ON lap_times(lap_number);

-- Telemetry data table (TimescaleDB hypertable)
CREATE TABLE IF NOT EXISTS telemetry_data (
    id SERIAL,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    driver_id INTEGER NOT NULL REFERENCES drivers(id),
    timestamp TIMESTAMP NOT NULL,
    lap_number INTEGER,
    x FLOAT,
    y FLOAT,
    z FLOAT,
    speed FLOAT,
    throttle FLOAT,
    brake BOOLEAN,
    gear INTEGER,
    rpm FLOAT,
    drs INTEGER,
    distance FLOAT
);

-- Convert telemetry_data to hypertable (time-series optimization)
SELECT create_hypertable('telemetry_data', 'timestamp', 
    if_not_exists => TRUE,
    chunk_time_interval => INTERVAL '1 day'
);

CREATE INDEX idx_telemetry_session ON telemetry_data(session_id, timestamp DESC);
CREATE INDEX idx_telemetry_driver ON telemetry_data(driver_id, timestamp DESC);

-- Pit stops table
CREATE TABLE IF NOT EXISTS pit_stops (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES sessions(id),
    driver_id INTEGER NOT NULL REFERENCES drivers(id),
    lap_number INTEGER NOT NULL,
    stop_number INTEGER,
    duration_seconds FLOAT,
    tire_fitted VARCHAR(50)
);

CREATE INDEX idx_pit_stops_session ON pit_stops(session_id);
CREATE INDEX idx_pit_stops_driver ON pit_stops(driver_id);

-- Results table
CREATE TABLE IF NOT EXISTS results (
    id SERIAL PRIMARY KEY,
    race_id INTEGER NOT NULL REFERENCES races(id),
    driver_id INTEGER NOT NULL REFERENCES drivers(id),
    team_id INTEGER NOT NULL REFERENCES teams(id),
    is_sprint BOOLEAN NOT NULL DEFAULT FALSE,
    position INTEGER,
    grid_position INTEGER,
    points FLOAT DEFAULT 0.0,
    laps_completed INTEGER,
    race_time_seconds FLOAT,
    status VARCHAR(100),
    fastest_lap_number INTEGER,
    fastest_lap_time FLOAT
);

CREATE INDEX idx_results_race ON results(race_id);
CREATE INDEX idx_results_driver ON results(driver_id);
CREATE INDEX idx_results_position ON results(position);
CREATE INDEX IF NOT EXISTS idx_results_race_driver_sprint ON results(race_id, driver_id, is_sprint);

-- Backward-compatible patch for databases created before is_sprint existed
ALTER TABLE IF EXISTS results
ADD COLUMN IF NOT EXISTS is_sprint BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE IF EXISTS drivers
ADD COLUMN IF NOT EXISTS image_url VARCHAR(500);

ALTER TABLE IF EXISTS teams
ADD COLUMN IF NOT EXISTS image_url VARCHAR(500);

CREATE TABLE IF NOT EXISTS season_driver_profiles (
    id SERIAL PRIMARY KEY,
    season_id INTEGER NOT NULL REFERENCES seasons(id),
    driver_id INTEGER NOT NULL REFERENCES drivers(id),
    driver_number INTEGER,
    image_url VARCHAR(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_season_driver_profiles_unique
ON season_driver_profiles(season_id, driver_id);

CREATE TABLE IF NOT EXISTS season_team_profiles (
    id SERIAL PRIMARY KEY,
    season_id INTEGER NOT NULL REFERENCES seasons(id),
    team_id INTEGER NOT NULL REFERENCES teams(id),
    image_url VARCHAR(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_season_team_profiles_unique
ON season_team_profiles(season_id, team_id);

-- Qualifying results table
CREATE TABLE IF NOT EXISTS qualifying (
    id SERIAL PRIMARY KEY,
    race_id INTEGER NOT NULL REFERENCES races(id),
    driver_id INTEGER NOT NULL REFERENCES drivers(id),
    position INTEGER,
    q1_time FLOAT,
    q2_time FLOAT,
    q3_time FLOAT
);

CREATE INDEX idx_qualifying_race ON qualifying(race_id);
CREATE INDEX idx_qualifying_driver ON qualifying(driver_id);

-- Create continuous aggregates for common queries (TimescaleDB feature)
CREATE MATERIALIZED VIEW IF NOT EXISTS lap_times_summary
WITH (timescaledb.continuous) AS
SELECT 
    session_id,
    driver_id,
    time_bucket(INTERVAL '5 minutes', sessions.date) AS bucket,
    AVG(lap_time_seconds) AS avg_lap_time,
    MIN(lap_time_seconds) AS best_lap_time,
    COUNT(*) AS lap_count
FROM lap_times
JOIN sessions ON lap_times.session_id = sessions.id
GROUP BY session_id, driver_id, bucket
WITH NO DATA;

-- Add refresh policy for the materialized view
SELECT add_continuous_aggregate_policy('lap_times_summary',
    start_offset => INTERVAL '1 month',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => TRUE
);

-- Create views for common queries
CREATE OR REPLACE VIEW race_results_detailed AS
SELECT 
    r.id AS race_id,
    s.year AS season,
    ra.name AS race_name,
    c.name AS circuit_name,
    d.code AS driver_code,
    d.first_name || ' ' || d.last_name AS driver_name,
    t.name AS team_name,
    r.position,
    r.grid_position,
    r.points,
    r.status,
    r.fastest_lap_time
FROM results r
JOIN races ra ON r.race_id = ra.id
JOIN seasons s ON ra.season_id = s.id
JOIN circuits c ON ra.circuit_id = c.id
JOIN drivers d ON r.driver_id = d.id
JOIN teams t ON r.team_id = t.id
ORDER BY s.year DESC, ra.round_number, r.position;

-- Create view for championship standings
CREATE OR REPLACE VIEW championship_standings AS
SELECT 
    s.year AS season,
    d.code AS driver_code,
    d.first_name || ' ' || d.last_name AS driver_name,
    t.name AS team_name,
    SUM(r.points) AS total_points,
    COUNT(CASE WHEN r.position = 1 THEN 1 END) AS wins,
    COUNT(CASE WHEN r.position <= 3 THEN 1 END) AS podiums
FROM results r
JOIN races ra ON r.race_id = ra.id
JOIN seasons s ON ra.season_id = s.id
JOIN drivers d ON r.driver_id = d.id
JOIN teams t ON r.team_id = t.id
GROUP BY s.year, d.id, d.code, d.first_name, d.last_name, t.name
ORDER BY s.year DESC, total_points DESC;

-- Comments for documentation
COMMENT ON TABLE telemetry_data IS 'TimescaleDB hypertable for time-series telemetry data';
COMMENT ON TABLE lap_times IS 'Lap time data for all sessions';
COMMENT ON TABLE results IS 'Final race results and statistics';
