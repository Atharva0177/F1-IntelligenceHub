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
  AdminRace,
  AdminRacePayload,
  AdminImageEntry,
  AdminStats,
  AdminSession,
  AdminSessionUpsertPayload,
  AdminSyncStatus,
  AdminSeasonSummary,
  SeasonalDriverProfile,
  SeasonalTeamProfile,
} from '@/types';

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: '',  // relative — proxied through Next.js rewrites to backend
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    // Required for ngrok-hosted sites so API requests bypass the browser warning interstitial.
    'ngrok-skip-browser-warning': '1',
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
      driver_code?: string | null;
      driver_name?: string | null;
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

  async getDriverDetail(driverId: number, season?: number): Promise<Driver> {
    const params = season ? { season } : {};
    const response = await apiClient.get(`/api/drivers/${driverId}`, { params });
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

  async getNextSession(): Promise<{ race_id?: number | null; race_name: string; session_type: string; session_date: string; session_end?: string; is_live?: boolean; source?: string } | null> {
    const response = await apiClient.get('/api/races/next-session');
    const data = response.data;
    if (!data || typeof data !== 'object') {
      return null;
    }

    if (typeof data.session_date !== 'string' || typeof data.session_type !== 'string' || typeof data.race_name !== 'string') {
      return null;
    }

    return data;
  },

  // Constructors
  async getConstructors(season?: number): Promise<{ id: number; name: string; nationality?: string; image_url?: string }[]> {
    const params = season ? { season } : {};
    const response = await apiClient.get('/api/constructors', { params });
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

  async simulateRaceOutcome(raceId: number, modelType = 'gb', iterations = 3000): Promise<any> {
    const response = await apiClient.get(`/api/predictions/race/${raceId}/simulate`, {
      params: { model_type: modelType, iterations },
      timeout: 60000,
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

  // Admin
  async getAdminAuthStatus(): Promise<{ authenticated: boolean }> {
    const response = await apiClient.get('/api/admin/auth/status');
    return response.data;
  },

  async adminLogin(password: string): Promise<{ authenticated: boolean }> {
    const response = await apiClient.post('/api/admin/auth/login', { password });
    return response.data;
  },

  async adminLogout(): Promise<{ authenticated: boolean }> {
    const response = await apiClient.post('/api/admin/auth/logout');
    return response.data;
  },

  async getAdminStats(): Promise<AdminStats> {
    const response = await apiClient.get('/api/admin/stats');
    return response.data;
  },

  async getAdminRaces(season?: number): Promise<AdminRace[]> {
    const params = season ? { season } : {};
    const response = await apiClient.get('/api/admin/races', { params });
    return response.data;
  },

  async createAdminRace(payload: AdminRacePayload): Promise<AdminRace> {
    const response = await apiClient.post('/api/admin/races', payload);
    return response.data;
  },

  async updateAdminRace(raceId: number, payload: Partial<AdminRacePayload>): Promise<AdminRace> {
    const response = await apiClient.patch(`/api/admin/races/${raceId}`, payload);
    return response.data;
  },

  async deleteAdminRace(raceId: number, force = false): Promise<{ deleted: boolean; race_id: number; force?: boolean }> {
    const response = await apiClient.delete(`/api/admin/races/${raceId}`, { params: { force } });
    return response.data;
  },

  async getAdminSeasons(): Promise<AdminSeasonSummary[]> {
    const response = await apiClient.get('/api/admin/seasons');
    return response.data;
  },

  async deleteAdminSeason(seasonYear: number, force = false): Promise<{ deleted: boolean; season_year: number; force?: boolean }> {
    const response = await apiClient.delete(`/api/admin/seasons/${seasonYear}`, { params: { force } });
    return response.data;
  },

  async getAdminSessions(season?: number, raceId?: number): Promise<AdminSession[]> {
    const params: Record<string, number> = {};
    if (season) params.season = season;
    if (raceId) params.race_id = raceId;
    const response = await apiClient.get('/api/admin/sessions', { params });
    return response.data;
  },

  async deleteAdminSession(sessionId: number, force = false): Promise<{ deleted: boolean; session_id: number; force?: boolean }> {
    const response = await apiClient.delete(`/api/admin/sessions/${sessionId}`, { params: { force } });
    return response.data;
  },

  async upsertAdminSession(payload: AdminSessionUpsertPayload): Promise<AdminSession> {
    const response = await apiClient.post('/api/admin/sessions/upsert', payload);
    return response.data;
  },

  async getAdminSyncStatus(): Promise<AdminSyncStatus> {
    const response = await apiClient.get('/api/admin/sync/status');
    return response.data;
  },

  async startAdminSync(season_year?: number): Promise<AdminSyncStatus> {
    const response = await apiClient.post('/api/admin/sync/start', { season_year });
    return response.data;
  },

  async getAdminDriverImages(): Promise<AdminImageEntry[]> {
    const response = await apiClient.get('/api/admin/drivers/images');
    return response.data;
  },

  async updateAdminDriverImage(driverId: number, image_url?: string): Promise<AdminImageEntry> {
    const response = await apiClient.patch(`/api/admin/drivers/${driverId}/image`, {
      image_url: image_url ?? null,
    });
    return response.data;
  },

  async getAdminTeamImages(): Promise<AdminImageEntry[]> {
    const response = await apiClient.get('/api/admin/teams/images');
    return response.data;
  },

  async updateAdminTeamImage(teamId: number, image_url?: string): Promise<AdminImageEntry> {
    const response = await apiClient.patch(`/api/admin/teams/${teamId}/image`, {
      image_url: image_url ?? null,
    });
    return response.data;
  },

  async getSeasonalDriverProfiles(season: number): Promise<SeasonalDriverProfile[]> {
    const response = await apiClient.get('/api/admin/seasonal/drivers', { params: { season } });
    return response.data;
  },

  async updateSeasonalDriverProfile(driverId: number, season_year: number, payload: { driver_number?: number; image_url?: string }): Promise<any> {
    const response = await apiClient.patch(`/api/admin/seasonal/drivers/${driverId}`, {
      season_year,
      driver_number: payload.driver_number,
      image_url: payload.image_url ?? null,
    });
    return response.data;
  },

  async getSeasonalTeamProfiles(season: number): Promise<SeasonalTeamProfile[]> {
    const response = await apiClient.get('/api/admin/seasonal/teams', { params: { season } });
    return response.data;
  },

  async updateSeasonalTeamProfile(teamId: number, season_year: number, payload: { image_url?: string }): Promise<any> {
    const response = await apiClient.patch(`/api/admin/seasonal/teams/${teamId}`, {
      season_year,
      image_url: payload.image_url ?? null,
    });
    return response.data;
  },
};

export default api;
