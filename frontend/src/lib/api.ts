import axios, { AxiosInstance, AxiosError } from 'axios';
import type {
  Race,
  RaceDetail,
  Driver,
  LapTime,
  Session,
  TelemetryPoint,
  PaceAnalysis,
  TireStrategy,
  SectorAnalysis,
  TrackCoordinates,
  DriverStanding,
  ConstructorStanding,
  CalendarRound,
  ConstructorDetail,
  H2HResponse,
  CircuitGuide,
} from '@/types';

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: '',  // relative — proxied through Next.js rewrites to backend
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    console.error('API Error:', error.message);
    return Promise.reject(error);
  }
);

// API service methods
export const api = {
  // Races
  async getSeasons(): Promise<number[]> {
    const response = await apiClient.get('/api/races/seasons');
    return response.data.seasons as number[];
  },

  async getRaces(season?: number): Promise<Race[]> {
    const params = season ? { season } : {};
    const response = await apiClient.get('/api/races', { params });
    return response.data;
  },

  async getRaceDetail(raceId: number): Promise<RaceDetail> {
    const response = await apiClient.get(`/api/races/${raceId}`);
    return response.data;
  },

  async getRaceLapTimes(raceId: number, driverCode?: string): Promise<LapTime[]> {
    const params = driverCode ? { driver_code: driverCode } : {};
    const response = await apiClient.get(`/api/races/${raceId}/lap-times`, { params });
    return response.data;
  },

  async getRacePositions(raceId: number): Promise<any[]> {
    const response = await apiClient.get(`/api/races/${raceId}/positions`);
    return response.data;
  },

  async getReplayData(raceId: number): Promise<{
    laps: any[];
    drivers: Record<string, any>;
    session_start: string | null;
    race_control: Array<{
      timestamp: string | null;
      category: string;
      message: string;
      flag: string | null;
      status: string | null;
      scope: string | null;
    }>;
  }> {
    const response = await apiClient.get(`/api/races/${raceId}/replay-data`);
    return response.data;
  },

  async getDrsTelemetry(raceId: number): Promise<{
    drs_zones: { start: number; end: number }[];
    zone_count: number;
    driver_telemetry: Record<string, number[][]>;
    circuit_length: number;
  }> {
    const response = await apiClient.get(`/api/races/${raceId}/drs-telemetry`);
    return response.data;
  },

  async getRacePitStops(raceId: number): Promise<Array<{
    driver_code: string;
    lap_number: number;
    stop_number: number | null;
    duration_seconds: number | null;
    tire_fitted: string | null;
  }>> {
    const response = await apiClient.get(`/api/races/${raceId}/pit-stops`);
    return response.data;
  },

  async getSessionLapTimes(sessionId: number, driverCode?: string): Promise<LapTime[]> {
    const params = driverCode ? { driver_code: driverCode } : {};
    const response = await apiClient.get(`/api/sessions/${sessionId}/lap-times`, { params });
    return response.data;
  },

  async getSessions(raceId: number): Promise<Session[]> {
    const response = await apiClient.get(`/api/races/${raceId}/sessions`);
    return response.data;
  },

  async getSessionResults(sessionId: number): Promise<any[]> {
    const response = await apiClient.get(`/api/sessions/${sessionId}/results`);
    return response.data;
  },

  // Drivers
  async getDrivers(season?: number): Promise<Driver[]> {
    const params = season ? { season } : {};
    const response = await apiClient.get('/api/drivers', { params });
    return response.data;
  },

  async getDriverDetail(driverId: number): Promise<Driver> {
    const response = await apiClient.get(`/api/drivers/${driverId}`);
    return response.data;
  },

  async getDriverResults(driverId: number, season?: number): Promise<any[]> {
    const params = season ? { season } : {};
    const response = await apiClient.get(`/api/drivers/${driverId}/results`, { params });
    return response.data;
  },

  async compareDrivers(driverId1: number, driverId2: number): Promise<any> {
    const response = await apiClient.get(`/api/drivers/${driverId1}/compare/${driverId2}`);
    return response.data;
  },

  // Telemetry
  async getSessionTelemetry(
    sessionId: number,
    driverCode?: string,
    lapNumber?: number
  ): Promise<TelemetryPoint[]> {
    const params: any = { limit: 5000 };
    if (driverCode) params.driver_code = driverCode;
    if (lapNumber) params.lap_number = lapNumber;
    
    const response = await apiClient.get(`/api/telemetry/${sessionId}`, { params });
    return response.data;
  },

  async getTrackCoordinates(circuitId: number): Promise<TrackCoordinates> {
    const response = await apiClient.get(`/api/telemetry/track/${circuitId}`);
    return response.data;
  },

  // Analytics
  async getPaceAnalysis(sessionId: number): Promise<PaceAnalysis[]> {
    const response = await apiClient.get('/api/analytics/pace-analysis', {
      params: { session_id: sessionId }
    });
    return response.data;
  },

  async getTireStrategies(sessionId: number): Promise<TireStrategy[]> {
    const response = await apiClient.get('/api/analytics/tire-strategies', {
      params: { session_id: sessionId }
    });
    return response.data;
  },

  async getSectorAnalysis(sessionId: number): Promise<SectorAnalysis[]> {
    const response = await apiClient.get('/api/analytics/sector-times', {
      params: { session_id: sessionId }
    });
    return response.data;
  },

  // Standings
  async getDriverStandings(year: number, round?: number): Promise<DriverStanding[]> {
    const params = round ? { round } : {};
    const response = await apiClient.get(`/api/standings/${year}/drivers`, { params });
    return response.data.drivers;
  },

  async getConstructorStandings(year: number, round?: number): Promise<ConstructorStanding[]> {
    const params = round ? { round } : {};
    const response = await apiClient.get(`/api/standings/${year}/constructors`, { params });
    return response.data.constructors;
  },

  // Calendar
  async getCalendar(year: number): Promise<CalendarRound[]> {
    const response = await apiClient.get(`/api/races/calendar/${year}`);
    return response.data;
  },

  // Constructors
  async getConstructors(): Promise<{ id: number; name: string; nationality?: string }[]> {
    const response = await apiClient.get('/api/constructors');
    return response.data;
  },

  async getConstructorDetail(teamId: number, season?: number): Promise<ConstructorDetail> {
    const params = season ? { season } : {};
    const response = await apiClient.get(`/api/constructors/${teamId}`, { params });
    return response.data;
  },

  // Head-to-Head
  async getH2H(driverId1: number, driverId2: number, season?: number): Promise<H2HResponse> {
    const params = season ? { season } : {};
    const response = await apiClient.get(`/api/h2h/${driverId1}/${driverId2}`, { params });
    return response.data;
  },

  // Predictions
  async getPredictableRaces(): Promise<any[]> {
    const response = await apiClient.get('/api/predictions/races');
    return response.data;
  },

  async predictRace(raceId: number, modelType = 'gb'): Promise<any> {
    const response = await apiClient.get(`/api/predictions/race/${raceId}`, {
      params: { model_type: modelType },
      timeout: 60000, // model training can take up to ~30s on first run
    });
    return response.data;
  },

  // Circuit Guide
  async getCircuitGuide(circuitId: number): Promise<CircuitGuide> {
    const response = await apiClient.get(`/api/circuits/${circuitId}`);
    return response.data;
  },

  async getAllCircuits(): Promise<CircuitGuide[]> {
    const response = await apiClient.get('/api/circuits');
    return response.data;
  },

  async getCircuitDetail(circuitId: number): Promise<CircuitGuide> {
    const response = await apiClient.get(`/api/circuits/${circuitId}`);
    return response.data;
  },

  async getCircuitHistory(circuitId: number): Promise<unknown[]> {
    const response = await apiClient.get(`/api/circuits/${circuitId}/history`);
    return response.data;
  },

  async getWeatherSummary(sessionId: number): Promise<any> {
    const response = await apiClient.get(`/api/weather/${sessionId}/summary`);
    return response.data;
  },

  async getDataVersion(): Promise<{ version: number }> {
    const response = await apiClient.get('/api/races/data-version');
    return response.data;
  },
};

export default api;
