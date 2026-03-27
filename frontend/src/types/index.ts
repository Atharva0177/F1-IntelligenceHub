// Type definitions for F1 Intelligence Hub

export interface Circuit {
  id: number;
  name: string;
  location?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  length_km?: number;
}

export interface Driver {
  id: number;
  code: string;
  number?: number;
  driver_number?: number;
  first_name: string;
  last_name: string;
  nationality?: string;
  date_of_birth?: string;
  image_url?: string;
  team_name?: string;
  total_races?: number;
  total_points?: number;
  wins?: number;
  podiums?: number;
}

export interface Team {
  id: number;
  name: string;
  nationality?: string;
  image_url?: string;
}

export interface Race {
  id: number;
  name: string;
  round_number: number;
  date?: string;
  circuit: Circuit;
  season_year: number;
  winner_name?: string;
  winner_team?: string;
  status?: string;
}

export interface RaceDetail extends Race {
  results: DriverResult[];
  pole_position_driver?: string;
  pole_position_team?: string;
  fastest_lap_driver?: string;
  fastest_lap_time?: number;
}

export interface Session {
  id: number;
  session_type: string;
  date?: string;
}

export interface DriverResult {
  driver_code: string;
  driver_name: string;
  team_name: string;
  position?: number;
  grid_position?: number;
  points: number;
  status: string;
}

export interface LapTime {
  session_id: number;
  lap_number: number;
  driver_code: string;
  lap_time_seconds?: number;
  sector1_time?: number;
  sector2_time?: number;
  sector3_time?: number;
  tire_compound?: string;
  tire_life?: number;
}

export interface TelemetryPoint {
  timestamp: string;
  lap_number?: number;
  x?: number;
  y?: number;
  z?: number;
  speed?: number;
  throttle?: number;
  brake?: boolean;
  gear?: number;
  rpm?: number;
  drs?: number;
  distance?: number;
}

export interface PaceAnalysis {
  driver_code: string;
  avg_lap_time: number;
  best_lap_time: number;
  consistency: number;
}

export interface TireStrategy {
  driver_code: string;
  compound: string;
  stint_start: number;
  stint_end: number;
  avg_lap_time: number;
  fresh_tyre?: boolean;
  tire_age_when_started?: number;
}

export interface SectorAnalysis {
  driver_code: string;
  sector1_avg?: number;
  sector2_avg?: number;
  sector3_avg?: number;
  sector1_best?: number;
  sector2_best?: number;
  sector3_best?: number;
}

// Standings
export interface DriverStanding {
  position: number;
  driver_id: number;
  driver_code: string;
  driver_name: string;
  team_name: string;
  nationality?: string;
  points: number;
  wins: number;
  podiums: number;
}

export interface ConstructorStanding {
  position: number;
  team_id: number;
  team_name: string;
  points: number;
  wins: number;
  drivers: string[];
}

export interface StandingsResponse {
  season: number;
  round?: number;
  drivers: DriverStanding[];
  constructors: ConstructorStanding[];
}

// Calendar
export interface CalendarRound {
  id: number;
  round_number: number;
  name: string;
  date?: string;
  status: 'COMPLETED' | 'UPCOMING';
  circuit_name?: string;
  country?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  winner_name?: string;
  winner_team?: string;
}

// Constructors
export interface ConstructorDriver {
  driver_id: number;
  driver_code: string;
  driver_name: string;
  points: number;
  wins: number;
}

export interface ConstructorSeasonResult {
  round_number: number;
  race_name: string;
  race_date?: string;
  driver_code: string;
  position?: number;
  points: number;
}

export interface ConstructorDetail {
  id: number;
  name: string;
  nationality?: string;
  image_url?: string;
  season: number;
  total_points: number;
  wins: number;
  podiums: number;
  drivers: ConstructorDriver[];
  race_results: ConstructorSeasonResult[];
}

// Head-to-Head
export interface H2HStats {
  shared_races: number;
  driver1_race_ahead: number;
  driver2_race_ahead: number;
  driver1_quali_ahead: number;
  driver2_quali_ahead: number;
  driver1_total_points: number;
  driver2_total_points: number;
  driver1_wins: number;
  driver2_wins: number;
  driver1_podiums: number;
  driver2_podiums: number;
  driver1_avg_finish?: number;
  driver2_avg_finish?: number;
}

export interface H2HRound {
  round_number: number;
  race_name: string;
  race_date?: string;
  season: number;
  driver1_position?: number;
  driver2_position?: number;
  driver1_points: number;
  driver2_points: number;
  driver1_quali?: number;
  driver2_quali?: number;
}

export interface H2HDriverInfo {
  id: number;
  code: string;
  name: string;
  nationality?: string;
  team_name?: string;
}

export interface H2HResponse {
  driver1: H2HDriverInfo;
  driver2: H2HDriverInfo;
  season?: number;
  stats: H2HStats;
  rounds: H2HRound[];
}

// Circuit Guide
export interface CircuitHistoryEntry {
  race_id: number;
  season: number;
  round_number: number;
  race_name: string;
  date?: string;
  winner?: string;
  winner_team?: string;
  pole_position?: string;
  fastest_lap_time?: number;
  fastest_lap_driver?: string;
}

export interface CircuitGuide {
  id: number;
  name: string;
  country?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  length_km?: number;
  total_races: number;
  first_gp_year?: number;
  lap_record_time?: number;
  lap_record_driver?: string;
  lap_record_year?: number;
  race_history: CircuitHistoryEntry[];
  history?: Array<{
    race_name: string;
    year: number;
    winner_name: string;
    winner_team: string;
    date: string;
  }>;
}

export type CircuitDetail = CircuitGuide;

export interface TrackCoordinates {
  circuit_name: string;
  points: Array<{
    x: number;
    y: number;
    z?: number;
    distance?: number;
  }>;
}

// API Response types
export interface APIResponse<T> {
  data: T;
  error?: string;
}

// Component prop types
export interface ChartProps {
  data: any[];
  width?: number | string;
  height?: number;
}

// Admin
export interface AdminRace {
  id: number;
  season_year: number;
  round_number?: number;
  name: string;
  date?: string;
  time?: string;
  event_name?: string;
  official_name?: string;
  circuit_id: number;
  circuit_name: string;
  circuit_country?: string;
}

export interface AdminRacePayload {
  season_year: number;
  circuit_id: number;
  name: string;
  round_number?: number;
  date?: string;
  time?: string;
  event_name?: string;
  official_name?: string;
}

export interface AdminImageEntry {
  id: number;
  code?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  image_url?: string | null;
}

export interface AdminStats {
  entity_counts: Record<string, number>;
  coverage: {
    completed_races: number;
    total_races: number;
    completion_ratio: number;
    races_with_sessions: number;
    races_with_results: number;
    sessions_with_laps: number;
    sessions_with_telemetry: number;
    sessions_with_weather: number;
    sessions_with_positions: number;
    sessions_with_race_control: number;
  };
  data_density: {
    avg_laps_per_session: number;
    avg_telemetry_points_per_session: number;
    qualifying_rows: number;
  };
  session_type_breakdown: Array<{
    session_type: string;
    count: number;
    ratio: number;
  }>;
  top_lists: {
    drivers: Array<{ id: number; code?: string; name: string; points: number; results: number; wins: number }>;
    teams: Array<{ id: number; name: string; points: number; results: number; wins: number }>;
  };
  top_entities: {
    driver?: { id: number; code?: string; name: string; points: number } | null;
    team?: { id: number; name: string; points: number } | null;
  };
  latest_race_date?: string | null;
  recent_races: Array<{
    race_id: number;
    season_year: number;
    round_number?: number;
    race_name: string;
    race_date?: string | null;
    circuit_name?: string | null;
  }>;
  season_breakdown: Array<{
    season_year: number;
    race_count: number;
    session_count: number;
    result_rows: number;
    completed_races: number;
    completion_ratio: number;
  }>;
}

export interface AdminSession {
  id: number;
  race_id: number;
  race_name: string;
  season_year: number;
  session_type: string;
  date?: string;
}

export interface AdminSessionUpsertPayload {
  race_id: number;
  session_type: string;
  date?: string;
}

export interface AdminSyncStatus {
  running: boolean;
  season_year?: number;
  status: 'idle' | 'running' | 'completed' | 'failed' | string;
  started_at?: string;
  finished_at?: string;
  exit_code?: number;
  command?: string;
  output_tail?: string;
}

export interface AdminSeasonSummary {
  year: number;
  race_count: number;
  session_count: number;
}

export interface SeasonalDriverProfile {
  id: number;
  code?: string;
  first_name?: string;
  last_name?: string;
  default_number?: number;
  default_image_url?: string;
  season_number?: number;
  season_image_url?: string;
}

export interface SeasonalTeamProfile {
  id: number;
  name: string;
  default_image_url?: string;
  season_image_url?: string;
}
