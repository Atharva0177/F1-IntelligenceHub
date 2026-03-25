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
