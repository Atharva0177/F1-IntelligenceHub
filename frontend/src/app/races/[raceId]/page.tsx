"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { useDataVersion } from "@/lib/useDataVersion";
import type { RaceDetail, Session, LapTime } from "@/types";
import RaceReplay from './RaceReplay';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
  BarChart,
  Bar,
  Cell,
  AreaChart,
  Area,
} from "recharts";

export default function RaceDetailPage() {
  const params = useParams();
  const raceId = Number(params.raceId);

  const [race, setRace] = useState<RaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("results");
  const [positionsSubTab, setPositionsSubTab] = useState("chart");
  const [selectedDriversForChart, setSelectedDriversForChart] = useState<
    string[]
  >([]);
  const [positionData, setPositionData] = useState<any[]>([]);
  const [loadingPositions, setLoadingPositions] = useState(false);
  const [replayLaps, setReplayLaps] = useState<any[]>([]);
  const [replayDrivers, setReplayDrivers] = useState<Record<string, any>>({});
  const [drsTelemetry, setDrsTelemetry] = useState<any | null>(null);
  const [loadingReplay, setLoadingReplay] = useState(false);
  const [strategySubTab, setStrategySubTab] = useState("overview");
  const [strategyData, setStrategyData] = useState<any[]>([]);
  const [loadingStrategy, setLoadingStrategy] = useState(false);
  const [lapTimesData, setLapTimesData] = useState<LapTime[]>([]);
  const [loadingLapTimes, setLoadingLapTimes] = useState(false);
  const [selectedDriversForLaps, setSelectedDriversForLaps] = useState<
    string[]
  >([]);

  // Track Dominance State
  const [telemetryDriver1, setTelemetryDriver1] = useState<string>("");
  const [telemetryDriver2, setTelemetryDriver2] = useState<string>("");
  const [telemetryData1, setTelemetryData1] = useState<any[]>([]);
  const [telemetryData2, setTelemetryData2] = useState<any[]>([]);
  const [loadingTelemetry, setLoadingTelemetry] = useState(false);
  const [selectedTelemetryLap, setSelectedTelemetryLap] = useState<"fastest" | number>("fastest");
  const [circuitCoords, setCircuitCoords] = useState<{ x: number[]; y: number[] } | null>(null);
  const [dominanceSubTab, setDominanceSubTab] = useState<
    "overview" | "speed" | "throttle" | "rpm"
  >("overview");

  // Session Management
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(
    null
  );
  const [sessionResults, setSessionResults] = useState<any[]>([]);
  const [loadingSessionResults, setLoadingSessionResults] = useState(false);
  const [weatherSummary, setWeatherSummary] = useState<any>(null);
  const [expandedDrivers, setExpandedDrivers] = useState<Set<string>>(
    new Set()
  );
  const refreshKey = useDataVersion();

  const toggleDriver = (driverCode: string) => {
    const newExpanded = new Set(expandedDrivers);
    if (newExpanded.has(driverCode)) {
      newExpanded.delete(driverCode);
    } else {
      newExpanded.add(driverCode);
    }
    setExpandedDrivers(newExpanded);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const raceData = await api.getRaceDetail(raceId);
        setRace(raceData);

        // Load pre-generated circuit coordinates from public JSON
        try {
          const circuitFile = raceData.name.toLowerCase().replace(/[\s-]+/g, '_') + '.json';
          const res = await fetch(`/circuits/${circuitFile}`);
          if (res.ok) {
            const circuitData = await res.json();
            setCircuitCoords({ x: circuitData.x, y: circuitData.y });
          }
        } catch (_) { /* silently fall back to telemetry */ }

        // Auto-select top 5 drivers for position chart
        if (raceData.results) {
          const topDrivers = raceData.results
            .slice(0, 5)
            .map((r) => r.driver_code);
          setSelectedDriversForChart(topDrivers);
        }

        // Get all sessions
        const sessionsData = await api.getSessions(raceId);
        setSessions(sessionsData);

        // Default to Race session if available, otherwise the last one
        const raceSession = sessionsData.find((s) => s.session_type === "Race");
        if (raceSession) {
          setSelectedSessionId(raceSession.id);
        } else if (sessionsData.length > 0) {
          setSelectedSessionId(sessionsData[sessionsData.length - 1].id);
        }
      } catch (error) {
        console.error("Error fetching race data:", error);
      } finally {
        setLoading(false);
      }
    };

    if (raceId) {
      fetchData();
    }
  }, [raceId, refreshKey]);

  // Fetch session results when selected session changes
  useEffect(() => {
    const fetchSessionResults = async () => {
      if (!selectedSessionId) return;

      setLoadingSessionResults(true);
      try {
        const results = await api.getSessionResults(selectedSessionId);
        setSessionResults(results);
      } catch (error) {
        console.error("Error fetching session results:", error);
      } finally {
        setLoadingSessionResults(false);
      }
    };

    fetchSessionResults();
  }, [selectedSessionId]);

  // Fetch weather summary when selected session changes
  useEffect(() => {
    if (!selectedSessionId) return;
    setWeatherSummary(null);
    api.getWeatherSummary(selectedSessionId)
      .then((data) => setWeatherSummary(data))
      .catch(() => setWeatherSummary(null));
  }, [selectedSessionId]);

  // Reset all session-dependent analysis data when session changes so that
  // every tab re-fetches fresh data for the newly selected session.
  useEffect(() => {
    setPositionData([]);
    setStrategyData([]);
    setLapTimesData([]);
    setSelectedDriversForLaps([]);
    setTelemetryData1([]);
    setTelemetryData2([]);
    setTelemetryDriver1("");
    setTelemetryDriver2("");
  }, [selectedSessionId]);

  // Fetch position data (lap times for the selected session) when Positions/Dominance/Telemetry tab is active
  useEffect(() => {
    const fetchPositions = async () => {
      if (
        (activeTab !== "positions" && activeTab !== "dominance" && activeTab !== "telemetry" && activeTab !== "replay") ||
        !selectedSessionId ||
        loadingPositions ||
        positionData.length > 0
      )
        return;

      setLoadingPositions(true);
      try {
        const lapTimes = await api.getSessionLapTimes(selectedSessionId);
        setPositionData(lapTimes);
      } catch (error) {
        console.error("Error fetching position data:", error);
      } finally {
        setLoadingPositions(false);
      }
    };

    fetchPositions();
  }, [activeTab, selectedSessionId]);

  // Fetch replay-specific data (Race session only) when Replay tab is active
  useEffect(() => {
    if (activeTab !== "replay" || !raceId || replayLaps.length > 0 || loadingReplay) return;
    setLoadingReplay(true);
    Promise.all([
      api.getReplayData(raceId),
      api.getDrsTelemetry(raceId).catch(() => null),
    ])
      .then(([replayData, drsData]) => {
        setReplayLaps(replayData.laps);
        setReplayDrivers(replayData.drivers);
        if (drsData) setDrsTelemetry(drsData);
      })
      .catch(err => console.error("Error fetching replay data:", err))
      .finally(() => setLoadingReplay(false));
  }, [activeTab, raceId]);

  // Fetch strategy data when Strategy tab is active
  useEffect(() => {
    const fetchStrategy = async () => {
      if (activeTab !== "strategy" || !selectedSessionId || loadingStrategy)
        return;
      setLoadingStrategy(true);
      try {
        const strategies = await api.getTireStrategies(selectedSessionId);
        setStrategyData(strategies);
      } catch (error) {
        console.error("Error fetching strategy data:", error);
      } finally {
        setLoadingStrategy(false);
      }
    };

    fetchStrategy();
  }, [activeTab, selectedSessionId]);

  // Fetch lap times when Lap Times tab is active
  useEffect(() => {
    const fetchLapTimes = async () => {
      if (activeTab !== "laps" || !selectedSessionId || loadingLapTimes) return;
      setLoadingLapTimes(true);
      try {
        const data = await api.getSessionLapTimes(selectedSessionId);
        setLapTimesData(data);

        // Auto-select top 3 drivers if none selected
        if (selectedDriversForLaps.length === 0 && data.length > 0) {
          const uniqueDrivers = Array.from(
            new Set(data.map((d) => d.driver_code))
          ).slice(0, 3);
          setSelectedDriversForLaps(uniqueDrivers);
        }
      } catch (error) {
        console.error("Error fetching lap times:", error);
      } finally {
        setLoadingLapTimes(false);
      }
    };

    fetchLapTimes();
  }, [activeTab, selectedSessionId]);

  // Process lap time data for chart
  const lapTimeChartData = useMemo(() => {
    const groupedByLap: Record<number, any> = {};
    lapTimesData.forEach((lt) => {
      if (!groupedByLap[lt.lap_number]) {
        groupedByLap[lt.lap_number] = { lap: lt.lap_number };
      }
      if (lt.lap_time_seconds) {
        groupedByLap[lt.lap_number][lt.driver_code] = lt.lap_time_seconds;
      }
    });
    return Object.values(groupedByLap).sort((a, b) => a.lap - b.lap);
  }, [lapTimesData]);

  // Fetch telemetry for Track Dominance and Telemetry Tab
  useEffect(() => {
    const fetchTelemetry = async () => {
      if ((activeTab !== "dominance" && activeTab !== "telemetry") || !selectedSessionId || !race) return;

      // Auto-select drivers if not selected (use current session's driver list)
      if (!telemetryDriver1 && sessionResults.length > 0) {
        setTelemetryDriver1(sessionResults[0].driver_code);
      }
      
      // Only auto-select second driver for dominance tab
      if (activeTab === "dominance" && !telemetryDriver2 && sessionResults.length > 1) {
        setTelemetryDriver2(sessionResults[1].driver_code);
      }

      // Validation: Dominance needs both, Telemetry needs only driver 1
      if (!telemetryDriver1 || (activeTab === "dominance" && !telemetryDriver2) || loadingTelemetry) return;

      setLoadingTelemetry(true);
      try {
        if (activeTab === "dominance") {
          // Fetch telemetry for both drivers for comparison
          const lapArg = selectedTelemetryLap === "fastest" ? undefined : selectedTelemetryLap;
          const [data1, data2] = await Promise.all([
            api.getSessionTelemetry(
              selectedSessionId,
              telemetryDriver1,
              lapArg
            ),
            api.getSessionTelemetry(
              selectedSessionId,
              telemetryDriver2,
              lapArg
            ),
          ]);
          setTelemetryData1(data1);
          setTelemetryData2(data2);
        } else {
          // Fetch telemetry for single driver for detailed analysis
          const lapArg = selectedTelemetryLap === "fastest" ? undefined : selectedTelemetryLap;
          const data1 = await api.getSessionTelemetry(
            selectedSessionId,
            telemetryDriver1,
            lapArg
          );
          setTelemetryData1(data1);
          // Clear second driver data to avoid confusion
          setTelemetryData2([]);
        }
      } catch (error) {
        console.error("Error fetching telemetry:", error);
      } finally {
        setLoadingTelemetry(false);
      }
    };

    fetchTelemetry();
  }, [activeTab, selectedSessionId, telemetryDriver1, telemetryDriver2, race, selectedTelemetryLap, sessionResults]);

  // Helper function to format lap time
  const formatLapTime = (seconds: number | undefined) => {
    if (!seconds) return "N/A";
    const minutes = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(3);
    return `${minutes}:${secs.padStart(6, "0")}`;
  };

  // Compute bump chart positions from lap time data
  const bumpChartData = useMemo(() => {
    if (!positionData || positionData.length === 0 || !race) return null;
    const lapTimes = positionData as Array<{ lap_number: number; driver_code: string; lap_time_seconds?: number }>;

    // Build per-driver lookup of actual lap times
    const lapLookup: Record<string, Record<number, number>> = {};
    lapTimes.forEach(lt => {
      if (!lapLookup[lt.driver_code]) lapLookup[lt.driver_code] = {};
      if (lt.lap_time_seconds && lt.lap_time_seconds > 0)
        lapLookup[lt.driver_code][lt.lap_number] = lt.lap_time_seconds;
    });

    const drivers = Array.from(new Set(lapTimes.map(lt => lt.driver_code)));
    const allLapNums = Array.from(new Set(lapTimes.map(lt => lt.lap_number))).sort((a, b) => a - b);
    const totalLaps = allLapNums[allLapNums.length - 1] ?? 1;

    // Grid positions from race results (lap 0 anchor)
    const gridPos: Record<string, number> = {};
    const finalPos: Record<string, number> = {};
    race.results?.forEach(r => {
      if (r.grid_position) gridPos[r.driver_code] = r.grid_position;
      if (r.position) finalPos[r.driver_code] = r.position;
    });

    // Average lap time across all drivers (used as large penalty for missing laps)
    const allTimes = lapTimes.flatMap(lt => lt.lap_time_seconds && lt.lap_time_seconds > 0 ? [lt.lap_time_seconds] : []);
    const avgTime = allTimes.length > 0 ? allTimes.reduce((a, b) => a + b, 0) / allTimes.length : 100;
    const penalty = avgTime * 3; // Missing lap = heavy penalty (DNF / lapped)

    // Cumulative time per driver per lap (missing lap = penalty keeps lagged drivers behind)
    const lapsCompleted: Record<string, number> = {};
    const cumulative: Record<string, Record<number, number>> = {};
    drivers.forEach(d => {
      cumulative[d] = {};
      let total = 0;
      let laps = 0;
      allLapNums.forEach(lap => {
        const t = lapLookup[d]?.[lap];
        if (t) { total += t; laps = lap; }
        else total += penalty; // penalise gap / DNF lap
        cumulative[d][lap] = total;
      });
      lapsCompleted[d] = laps;
    });

    // Rank drivers at each lap:
    // - Primary: number of laps completed desc (leader has most laps)
    // - Secondary: cumulative time asc (faster is better)
    const positions: Record<number, Record<string, number>> = {};

    // Lap 0: grid positions
    const lap0: Record<string, number> = {};
    drivers.forEach(d => { lap0[d] = gridPos[d] ?? 20; });
    positions[0] = lap0;

    allLapNums.forEach(lap => {
      const ranked = [...drivers].sort((a, b) => {
        const lapsA = Object.keys(lapLookup[a] ?? {}).filter(k => Number(k) <= lap).length;
        const lapsB = Object.keys(lapLookup[b] ?? {}).filter(k => Number(k) <= lap).length;
        if (lapsB !== lapsA) return lapsB - lapsA; // more laps = better position
        return cumulative[a][lap] - cumulative[b][lap]; // lower cumulative = better
      });
      positions[lap] = {};
      ranked.forEach((d, i) => { positions[lap][d] = i + 1; });
    });

    // Override final lap with official race finish positions
    const lastLap = allLapNums[allLapNums.length - 1];
    if (lastLap != null) {
      const overrideRanked = [...drivers].sort((a, b) => {
        const pa = finalPos[a] ?? 99;
        const pb = finalPos[b] ?? 99;
        return pa - pb;
      });
      positions[lastLap] = {};
      overrideRanked.forEach((d, i) => { positions[lastLap][d] = i + 1; });
    }

    const lapNumbers = [0, ...allLapNums];
    return { lapNumbers, drivers, positions, totalLaps };
  }, [positionData, race]);

  // Calculate places gained/lost
  const placesGainedLost =
    sessionResults
      .map((result) => ({
        ...result,
        change: (result.grid_position || 0) - (result.position || 0),
        isRookie: false, // You can add this field to your backend if needed
      }))
      .sort((a, b) => (a.position || 999) - (b.position || 999)) || [];

  // Driver colors
  const driverColors: Record<string, string> = {
    // Mercedes
    HAM: "#00D2BE",
    BOT: "#00D2BE",
    RUS: "#00B4D8",
    // Red Bull
    VER: "#3671C6",
    PER: "#5590D9",
    // Ferrari
    VET: "#DC0000",
    RAI: "#DC0000",
    LEC: "#E8002D",
    SAI: "#FF4444",
    // McLaren
    NOR: "#FF8000",
    RIC: "#FF8700",
    PIA: "#F5A623",
    // Alpine / Renault
    ALO: "#0090FF",
    OCO: "#FF87BC",
    GAS: "#4895EF",
    // AlphaTauri / VCARB
    TSU: "#6692FF",
    DEV: "#4477CC",
    LAW: "#5588DD",
    HAD: "#3366BB",
    // Aston Martin / Racing Point / Force India
    STR: "#358C75",
    SIR: "#00665D",
    // Williams
    LAT: "#00A3C8",
    SAR: "#64C4FF",
    ALB: "#005AFF",
    COL: "#00BFFF",
    // Haas
    MSC: "#E8402A",
    MAZ: "#D06030",
    MAG: "#B6503A",
    BEA: "#CC3333",
    // Alfa Romeo / Kick Sauber
    GIO: "#940030",
    ZHO: "#D4006C",
    BOT_ALFA: "#960000",
    // Old Renault / old teams
    HUL: "#FFF500",
    ERI: "#9B0000",
    GRO: "#9B9B9B",
    VAN: "#FF8700",
    HAR: "#469BFF",
    ANT: "#50C8F0",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  if (!race) {
    return (
      <div className="card text-center py-12">
        <div className="text-gray-400 text-lg">Race not found</div>
      </div>
    );
  }

  const winner = race.results.find((r) => r.position === 1);

  return (
    <div className="space-y-6 animate-fade-in max-w-7xl mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-br from-carbon-900 via-carbon-800 to-carbon-900 rounded-xl p-6 border border-carbon-700">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h1 className="text-3xl font-display font-bold text-white mb-1">
              {race.name}
            </h1>
            <div className="text-sm text-gray-400">
              {race.season_year} Season
            </div>
          </div>

          {/* Session Selector */}
          <div className="relative">
            <select
              value={selectedSessionId || ""}
              onChange={(e) => setSelectedSessionId(Number(e.target.value))}
              className="appearance-none bg-carbon-800 rounded-lg border border-carbon-600 pl-10 pr-8 py-2 text-white font-medium focus:outline-none focus:border-red-500 transition-colors cursor-pointer"
            >
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.session_type}
                </option>
              ))}
            </select>
            <div className="absolute left-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
              <svg
                className="w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
              <svg
                className="w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Race Winner */}
        <div className="bg-carbon-800 rounded-lg p-4 border border-carbon-700">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-racing-red-600/20 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-racing-red-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.333c-.275.54-.68 1.025-1.187 1.413A4.001 4.001 0 017.5 18.5a4.001 4.001 0 01-3.646-3.42 3.989 3.989 0 01-1.187-1.413A3.989 3.989 0 010 15a3.989 3.989 0 011.333-2.933 1 1 0 01-.285-1.05l1.738-5.42-1.233-.616a1 1 0 01.894-1.79l1.599.8L8 4.323V3a1 1 0 011-1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
              Race Winner
            </span>
          </div>
          <div className="text-lg font-bold text-white">
            {winner?.driver_name || "N/A"}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {winner?.team_name || ""}
          </div>
        </div>

        {/* Pole Position */}
        <div className="bg-carbon-800 rounded-lg p-4 border border-carbon-700">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
              Pole Position
            </span>
          </div>
          <div className="text-lg font-bold text-white">
            {race.pole_position_driver || "N/A"}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {race.pole_position_team || ""}
          </div>
        </div>

        {/* Fastest Lap */}
        <div className="bg-carbon-800 rounded-lg p-4 border border-carbon-700">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-purple-600/20 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-purple-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold">
              Fastest Lap
            </span>
          </div>
          <div className="text-lg font-bold text-white">
            {race.fastest_lap_driver || "N/A"}
          </div>
          <div className="text-xs text-purple-400 mt-1 font-mono">
            {race.fastest_lap_time ? formatLapTime(race.fastest_lap_time) : "-"}
          </div>
        </div>
      </div>

      {/* Weather Summary */}
      {weatherSummary && (() => {
        const airTemp: number = weatherSummary.avg_air_temp ?? 20;
        const isRain = weatherSummary.rainfall_occurred;
        const isHot = airTemp >= 30;
        const tempPct = Math.min(1, Math.max(0, (airTemp - 5) / 40));
        const sessionName = sessions.find((s) => s.id === selectedSessionId)?.session_type ?? "Session";
        const weatherIcon = isRain ? '🌧' : isHot ? '☀️' : airTemp >= 20 ? '🌤' : '🌥';
        const bgGradient = isRain
          ? 'from-slate-900 via-blue-950/60 to-carbon-900'
          : isHot
          ? 'from-amber-950/70 via-orange-950/30 to-carbon-900'
          : 'from-sky-950/50 via-carbon-900 to-carbon-900';

        return (
          <div className={`relative overflow-hidden rounded-xl border border-carbon-700 bg-gradient-to-br ${bgGradient}`}>
            {/* Decorative blur orb */}
            <div className={`absolute -top-8 -right-8 w-40 h-40 rounded-full blur-3xl opacity-20 pointer-events-none ${
              isRain ? 'bg-blue-500' : isHot ? 'bg-orange-500' : 'bg-sky-400'
            }`} />

            {/* Header */}
            <div className="relative flex items-center justify-between px-5 pt-4 pb-3 border-b border-white/5">
              <div className="flex items-center gap-3">
                <span className="text-3xl leading-none">{weatherIcon}</span>
                <div>
                  <div className="text-[10px] uppercase tracking-widest font-bold text-gray-500">{sessionName} Weather</div>
                  <div className="text-white text-sm font-bold leading-tight">
                    {race.circuit.location ? `${race.circuit.location}, ` : ''}{race.circuit.country ?? ''}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isRain && (
                  <span className="flex items-center gap-1.5 bg-blue-500/20 border border-blue-400/25 text-blue-300 text-[11px] font-bold px-3 py-1 rounded-full">
                    🌧 Rain
                  </span>
                )}
                {isHot && !isRain && (
                  <span className="flex items-center gap-1.5 bg-orange-500/20 border border-orange-400/25 text-orange-300 text-[11px] font-bold px-3 py-1 rounded-full">
                    🌡 Hot
                  </span>
                )}
              </div>
            </div>

            {/* Metrics row */}
            <div className="relative grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/5">
              {/* Air Temp */}
              <div className="px-5 py-4">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1.5">🌡 Air Temp</div>
                <div className="text-3xl font-bold text-white tabular-nums">
                  {weatherSummary.avg_air_temp != null ? `${weatherSummary.avg_air_temp}°` : '—'}
                  <span className="text-sm font-normal text-gray-400 ml-0.5">C</span>
                </div>
                {weatherSummary.min_air_temp != null && (
                  <div className="text-xs text-gray-500 mt-0.5">{weatherSummary.min_air_temp}° – {weatherSummary.max_air_temp}°</div>
                )}
                {/* Temperature bar */}
                <div className="mt-2.5 h-1 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${tempPct * 100}%`, background: 'linear-gradient(90deg,#60a5fa,#34d399,#fbbf24,#f97316,#ef4444)' }}
                  />
                </div>
              </div>

              {/* Track Temp */}
              <div className="px-5 py-4">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1.5">🛣 Track Temp</div>
                <div className="text-3xl font-bold text-orange-300 tabular-nums">
                  {weatherSummary.avg_track_temp != null ? `${weatherSummary.avg_track_temp}°` : '—'}
                  <span className="text-sm font-normal text-orange-400/60 ml-0.5">C</span>
                </div>
                {weatherSummary.max_track_temp != null && (
                  <div className="text-xs text-gray-500 mt-0.5">max {weatherSummary.max_track_temp}°</div>
                )}
                {weatherSummary.avg_track_temp != null && weatherSummary.avg_air_temp != null && (
                  <div className="text-[10px] text-orange-400/60 mt-1">
                    +{(weatherSummary.avg_track_temp - weatherSummary.avg_air_temp).toFixed(1)}° above air
                  </div>
                )}
              </div>

              {/* Humidity */}
              <div className="px-5 py-4">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1.5">💧 Humidity</div>
                <div className="text-3xl font-bold text-sky-300 tabular-nums">
                  {weatherSummary.avg_humidity != null ? `${weatherSummary.avg_humidity}` : '—'}
                  <span className="text-sm font-normal text-sky-400/60 ml-0.5">%</span>
                </div>
                <div className="mt-2.5 h-1 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-sky-400/70"
                    style={{ width: `${Math.min(100, weatherSummary.avg_humidity ?? 0)}%` }}
                  />
                </div>
              </div>

              {/* Wind */}
              <div className="px-5 py-4">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-1.5">💨 Wind</div>
                <div className="text-3xl font-bold text-emerald-300 tabular-nums">
                  {weatherSummary.avg_wind_speed != null ? weatherSummary.avg_wind_speed : '—'}
                  <span className="text-sm font-normal text-emerald-400/60 ml-0.5">m/s</span>
                </div>
                {weatherSummary.max_wind_speed != null && (
                  <div className="text-xs text-gray-500 mt-0.5">max {weatherSummary.max_wind_speed} m/s</div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Navigation Tabs */}
      <div className="bg-carbon-800 rounded-lg border border-carbon-700 p-1 flex gap-1 overflow-x-auto">
        {[
          { id: "results", label: "Results", icon: "📊" },
          { id: "positions", label: "Positions", icon: "📍" },
          { id: "strategy", label: "Strategy", icon: "🎯" },
          { id: "laps", label: "Lap Times", icon: "⏱️" },
          { id: "dominance", label: "Track Dominance", icon: "🏁" },
          { id: "telemetry", label: "Telemetry", icon: "📡" },
          { id: "replay", label: "Race Replay", icon: "🏎" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 rounded-md text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? "bg-racing-red-600 text-white shadow-lg"
                : "text-gray-400 hover:text-white hover:bg-carbon-700"
            }`}
          >
            <span className="mr-2">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === "results" && (() => {
        const sessionType = sessions.find((s) => s.id === selectedSessionId)?.session_type || "Race";
        const isRace = sessionType === "Race";
        const totalPts = sessionResults.reduce((s, r) => s + (r.points || 0), 0);
        const podium = sessionResults.filter(r => r.position && r.position <= 3).sort((a,b) => a.position - b.position);
        return (
          <div className="space-y-4">
            {/* ── Header bar ── */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-display font-black text-white tracking-tight">
                  {sessionType} Results
                </h2>
                <p className="text-gray-500 text-sm mt-0.5">{race.name} · {race.season_year} · {sessionResults.length} classified</p>
              </div>
              {isRace && totalPts > 0 && (
                <div className="text-right text-xs text-gray-600 font-mono">{totalPts} pts distributed</div>
              )}
            </div>

            {/* ── Podium banners (Race only) ── */}
            {isRace && podium.length === 3 && !loadingSessionResults && (() => {
              // order: P2 left, P1 center, P3 right
              const order = [podium[1], podium[0], podium[2]];
              const positions = [2, 1, 3];
              const posLabels = ['P2', 'P1', 'P3'];
              // podium step heights in px — P1 tallest
              const cardHeights = [160, 200, 140];
              const posColors = ['#C0C0C0', '#FFD700', '#CD7F32']; // silver, gold, bronze
              return (
                <div className="flex items-end gap-3">
                  {order.map((r, i) => {
                    const pos = positions[i];
                    const driverCol = driverColors[r.driver_code] || '#888';
                    const posCol = posColors[i];
                    const pts = r.points || 0;
                    const isFirst = pos === 1;
                    return (
                      <div key={r.driver_code} className="flex-1 relative rounded-2xl overflow-hidden"
                        style={{
                          height: cardHeights[i],
                          background: `linear-gradient(135deg, ${driverCol}1a 0%, #08080e 60%, ${driverCol}0d 100%)`,
                          border: `1px solid ${driverCol}40`,
                          boxShadow: isFirst ? `0 0 40px ${driverCol}30, 0 0 0 1px ${posCol}40` : `0 0 20px ${driverCol}18`,
                        }}>
                        {/* top color stripe */}
                        <div className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl"
                          style={{ background: `linear-gradient(90deg, transparent, ${posCol}cc, transparent)` }} />
                        {/* background glow blob */}
                        <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full blur-3xl pointer-events-none"
                          style={{ background: driverCol + '20' }} />

                        <div className="relative flex flex-col justify-between h-full px-5 py-4">
                          {/* top row: position number */}
                          <div className="flex items-start justify-between">
                            <span className="font-black text-4xl leading-none tracking-tighter"
                              style={{ color: posCol, opacity: 0.9 }}>{posLabels[i]}</span>
                            {pts > 0 && (
                              <span className="text-[11px] font-bold px-2 py-1 rounded-lg border"
                                style={{ color: posCol, borderColor: posCol + '50', background: posCol + '18' }}>
                                {pts} pts
                              </span>
                            )}
                          </div>

                          {/* bottom: driver info */}
                          <div>
                            <div className="font-black text-white leading-tight"
                              style={{ fontSize: isFirst ? 18 : 15 }}>{r.driver_name}</div>
                            <div className="text-[11px] font-mono font-bold mt-0.5" style={{ color: driverCol }}>{r.driver_code}</div>
                            <div className="text-gray-600 text-[11px] mt-1 truncate">{r.team_name}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* ── Main results table ── */}
            <div className="rounded-xl border border-white/[0.07] overflow-hidden bg-[#080810]">
              {loadingSessionResults ? (
                <div className="flex items-center justify-center py-16">
                  <div className="loading-spinner" />
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="text-left py-3 pl-5 pr-3 text-[10px] font-bold text-gray-600 uppercase tracking-[0.15em] w-12">POS</th>
                      <th className="text-left py-3 px-3 text-[10px] font-bold text-gray-600 uppercase tracking-[0.15em]">Driver</th>
                      <th className="text-left py-3 px-3 text-[10px] font-bold text-gray-600 uppercase tracking-[0.15em]">Constructor</th>
                      {isRace ? (
                        <>
                          <th className="text-center py-3 px-3 text-[10px] font-bold text-gray-600 uppercase tracking-[0.15em] w-20">Grid</th>
                          <th className="text-center py-3 px-3 text-[10px] font-bold text-gray-600 uppercase tracking-[0.15em] w-16">Δ</th>
                          <th className="text-left py-3 px-3 text-[10px] font-bold text-gray-600 uppercase tracking-[0.15em]">Status</th>
                          <th className="text-right py-3 pl-3 pr-5 text-[10px] font-bold text-gray-600 uppercase tracking-[0.15em] w-20">PTS</th>
                        </>
                      ) : (
                        <>
                          <th className="text-right py-3 px-3 text-[10px] font-bold text-gray-600 uppercase tracking-[0.15em]">Best Lap</th>
                          <th className="text-right py-3 px-3 text-[10px] font-bold text-gray-600 uppercase tracking-[0.15em]">Gap</th>
                          <th className="text-center py-3 pl-3 pr-5 text-[10px] font-bold text-gray-600 uppercase tracking-[0.15em] w-16">Laps</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {sessionResults.map((result, index) => {
                      const driverCol = driverColors[result.driver_code] || '#888';
                      const pos = result.position;
                      const isPodium = pos && pos <= 3;
                      const isWinner = pos === 1;
                      const bestTime = result.best_lap_time || result.fastest_lap_time;
                      const leaderTime = sessionResults[0]?.best_lap_time || sessionResults[0]?.fastest_lap_time;
                      const gap = !isRace && index > 0 && bestTime && leaderTime
                        ? `+${(bestTime - leaderTime).toFixed(3)}s` : null;
                      const gridPos = result.grid_position || 0;
                      const delta = isRace && gridPos > 0 && pos ? gridPos - pos : null;
                      const isFinished = result.status === 'Finished' || result.status?.startsWith('+');
                      const isRetired = isRace && !isFinished;
                      const posLabel = isWinner ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : pos || '-';

                      return (
                        <tr key={result.driver_code || index}
                          className="border-b border-white/[0.04] group transition-colors hover:bg-white/[0.03]">
                          {/* Position */}
                          <td className="py-3.5 pl-5 pr-3">
                            <div className={`font-black tabular-nums text-base ${
                              isWinner ? 'text-yellow-400' : isPodium ? 'text-gray-300' : 'text-gray-500'
                            }`}>{posLabel}</div>
                          </td>

                          {/* Driver */}
                          <td className="py-3.5 px-3">
                            <div className="flex items-center gap-3">
                              {/* Color accent bar */}
                              <div className="w-0.5 h-7 rounded-full shrink-0" style={{ background: driverCol }} />
                              <div>
                                <div className="font-bold text-white text-[13px] leading-tight">{result.driver_name}</div>
                                <div className="text-[10px] font-mono tracking-wider mt-0.5" style={{ color: driverCol + 'cc' }}>{result.driver_code}</div>
                              </div>
                            </div>
                          </td>

                          {/* Team */}
                          <td className="py-3.5 px-3 text-gray-500 text-[12px]">{result.team_name}</td>

                          {isRace ? (
                            <>
                              {/* Grid */}
                              <td className="py-3.5 px-3 text-center">
                                <span className="text-gray-600 font-mono text-[12px]">{gridPos > 0 ? `P${gridPos}` : '—'}</span>
                              </td>
                              {/* Delta */}
                              <td className="py-3.5 px-3 text-center">
                                {delta !== null ? (
                                  <span className={`text-[11px] font-bold font-mono px-1.5 py-0.5 rounded-sm ${
                                    delta > 0 ? 'text-emerald-400 bg-emerald-900/30' :
                                    delta < 0 ? 'text-red-400 bg-red-900/20' :
                                    'text-gray-600 bg-transparent'
                                  }`}>
                                    {delta > 0 ? `▲${delta}` : delta < 0 ? `▼${Math.abs(delta)}` : '—'}
                                  </span>
                                ) : <span className="text-gray-700">—</span>}
                              </td>
                              {/* Status */}
                              <td className="py-3.5 px-3">
                                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                                  isFinished
                                    ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/50'
                                    : 'bg-red-950/40 text-red-400 border border-red-900/40'
                                }`}>
                                  {isFinished ? (
                                    <>{result.status === 'Finished' ? '✓' : ''} {result.status}</>
                                  ) : (
                                    <>{result.status || '—'}</>
                                  )}
                                </span>
                              </td>
                              {/* Points */}
                              <td className="py-3.5 pl-3 pr-5 text-right">
                                {(result.points || 0) > 0 ? (
                                  <span className="font-black text-white text-base">{result.points}</span>
                                ) : (
                                  <span className="text-gray-700 text-[12px] font-mono">—</span>
                                )}
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="py-3.5 px-3 text-right font-mono font-bold text-emerald-400 text-[12px]">
                                {bestTime ? formatLapTime(bestTime) : '—'}
                              </td>
                              <td className="py-3.5 px-3 text-right font-mono text-gray-500 text-[12px]">
                                {index === 0 ? <span className="text-emerald-500 font-bold text-[10px]">LEADER</span> : (gap ?? '—')}
                              </td>
                              <td className="py-3.5 pl-3 pr-5 text-center text-gray-400 text-[12px]">
                                {result.laps_completed || result.total_laps || '—'}
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        );
      })()}

      {/* Positions Tab */}
      {activeTab === "positions" && (
        <div className="space-y-4">
          <div className="bg-carbon-800 rounded-lg border border-carbon-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-carbon-700">
              <h2 className="text-xl font-display font-bold text-white">
                Position Analysis
              </h2>
            </div>

            {/* Sub-tabs */}
            <div className="px-6 py-3 border-b border-carbon-700 flex gap-2">
              <button
                onClick={() => setPositionsSubTab("chart")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  positionsSubTab === "chart"
                    ? "bg-carbon-700 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                📈 Position Chart
              </button>
              <button
                onClick={() => setPositionsSubTab("analysis")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  positionsSubTab === "analysis"
                    ? "bg-carbon-700 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                📋 Analysis
              </button>
            </div>

            {/* Position Chart */}
            {positionsSubTab === "chart" && (() => {
              const selectedSession = sessions.find(s => s.id === selectedSessionId);
              const sessionType = selectedSession?.session_type ?? "";
              const isRaceLike = sessionType === "Race" || sessionType === "Sprint";

              // For non-Race sessions show a classification table instead of bump chart
              if (!isRaceLike) {
                const isQualifying = sessionType === "Qualifying";
                return (
                  <div className="p-6">
                    <div className="mb-4">
                      <h3 className="text-lg font-bold text-white">{sessionType} Classification</h3>
                      <p className="text-sm text-gray-400 mt-1">
                        {isQualifying ? "Q1 / Q2 / Q3 lap times" : "Fastest lap per driver"}
                      </p>
                    </div>
                    {loadingSessionResults ? (
                      <div className="h-40 flex items-center justify-center text-gray-500">Loading…</div>
                    ) : sessionResults.length === 0 ? (
                      <div className="h-40 flex items-center justify-center text-gray-500">No data available for this session.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-carbon-900/50">
                            <tr className="border-b border-carbon-700">
                              <th className="text-left py-3 px-4 text-gray-400 font-semibold uppercase tracking-wider text-xs">Pos</th>
                              <th className="text-left py-3 px-4 text-gray-400 font-semibold uppercase tracking-wider text-xs">Driver</th>
                              <th className="text-left py-3 px-4 text-gray-400 font-semibold uppercase tracking-wider text-xs">Team</th>
                              {isQualifying ? (
                                <>
                                  <th className="text-right py-3 px-4 text-gray-400 font-semibold uppercase tracking-wider text-xs">Q1</th>
                                  <th className="text-right py-3 px-4 text-gray-400 font-semibold uppercase tracking-wider text-xs">Q2</th>
                                  <th className="text-right py-3 px-4 text-gray-400 font-semibold uppercase tracking-wider text-xs">Q3</th>
                                </>
                              ) : (
                                <th className="text-right py-3 px-4 text-gray-400 font-semibold uppercase tracking-wider text-xs">Best Lap</th>
                              )}
                            </tr>
                          </thead>
                          <tbody>
                            {sessionResults.map((r, idx) => (
                              <tr key={r.driver_code} className="border-b border-carbon-700/30 hover:bg-carbon-700/20 transition-colors">
                                <td className="py-3 px-4 font-bold text-white">{r.position ?? idx + 1}</td>
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-2">
                                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-white" style={{ backgroundColor: driverColors[r.driver_code] || '#555' }}>{r.driver_code}</span>
                                    <span className="text-white font-medium">{r.driver_name}</span>
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-gray-400">{r.team_name}</td>
                                {isQualifying ? (
                                  <>
                                    <td className="py-3 px-4 text-right font-mono text-gray-300">{r.q1 ? formatLapTime(r.q1) : "—"}</td>
                                    <td className="py-3 px-4 text-right font-mono text-gray-300">{r.q2 ? formatLapTime(r.q2) : "—"}</td>
                                    <td className="py-3 px-4 text-right font-mono text-purple-400 font-bold">{r.q3 ? formatLapTime(r.q3) : "—"}</td>
                                  </>
                                ) : (
                                  <td className="py-3 px-4 text-right font-mono text-green-400">{r.fastest_lap_time ? formatLapTime(r.fastest_lap_time) : "—"}</td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              }

              return (
              <div className="p-6">
                <div className="mb-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-white">
                      Lap-by-Lap Position Changes
                    </h3>
                    <div className="flex items-center gap-2">
                      <select
                        className="bg-carbon-700 border border-carbon-600 rounded-md px-3 py-1.5 text-sm text-white"
                        value="all"
                      >
                        <option value="all">All Drivers</option>
                      </select>
                      <button className="bg-carbon-700 border border-carbon-600 rounded-md px-3 py-1.5 text-sm text-white hover:bg-carbon-600">
                        ⬇
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-400">
                    Track driver positions throughout the race. Use selector to
                    filter.
                  </p>
                </div>

                {/* Bump Chart */}
                <div className="bg-carbon-900/50 rounded-lg p-2 overflow-x-auto">
                  {loadingPositions ? (
                    <div className="h-[500px] flex items-center justify-center text-gray-500">Loading positions…</div>
                  ) : !bumpChartData ? (
                    <div className="h-[500px] flex items-center justify-center text-gray-500">No lap time data available</div>
                  ) : (() => {
                    const { lapNumbers, drivers, positions } = bumpChartData;
                    const visDrivers = selectedDriversForChart.length > 0
                      ? drivers.filter(d => selectedDriversForChart.includes(d))
                      : drivers;
                    const maxPos = Math.min(20, drivers.length);
                    const padL = 30, padR = 42, padT = 20, padB = 32;
                    const W = Math.max(900, lapNumbers.length * 18 + padL + padR);
                    const H = 520;
                    const innerW = W - padL - padR;
                    const innerH = H - padT - padB;
                    const xOf = (lapIdx: number) => padL + (lapIdx / Math.max(lapNumbers.length - 1, 1)) * innerW;
                    const yOf = (pos: number) => padT + ((pos - 1) / Math.max(maxPos - 1, 1)) * innerH;
                    const step = Math.max(1, Math.ceil(lapNumbers.length / 25));
                    return (
                      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', minWidth: 640 }}>
                        {/* Horizontal position grid lines */}
                        {Array.from({ length: maxPos }, (_, i) => i + 1).map(pos => (
                          <line key={pos} x1={padL} y1={yOf(pos)} x2={W - padR} y2={yOf(pos)}
                            stroke={pos === 1 ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.04)'} strokeWidth={pos === 1 ? 1 : 0.5} />
                        ))}
                        {/* Vertical lap lines */}
                        {lapNumbers.map((lap, i) => i % step === 0 && (
                          <line key={lap} x1={xOf(i)} y1={padT} x2={xOf(i)} y2={H - padB}
                            stroke="rgba(255,255,255,0.04)" strokeWidth={1} />
                        ))}
                        {/* Y axis — P1…P20 on the LEFT */}
                        {Array.from({ length: maxPos }, (_, i) => i + 1).map(pos => (
                          <text key={pos} x={padL - 6} y={yOf(pos) + 4}
                            fill={pos === 1 ? '#ffd700' : 'rgba(255,255,255,0.3)'}
                            fontSize={9} textAnchor="end" fontFamily="monospace" fontWeight={pos === 1 ? 'bold' : 'normal'}>
                            P{pos}
                          </text>
                        ))}
                        {/* Driver paths */}
                        {visDrivers.map(driver => {
                          const color = driverColors[driver] || '#888';
                          const pts = lapNumbers
                            .map((lap, i) => positions[lap]?.[driver] != null
                              ? { x: xOf(i), y: yOf(positions[lap][driver]), lap, pos: positions[lap][driver] }
                              : null)
                            .filter(Boolean) as { x: number; y: number; lap: number; pos: number }[];
                          if (pts.length < 2) return null;
                          // Cubic bezier S-curve path
                          let d = `M ${pts[0].x} ${pts[0].y}`;
                          for (let i = 1; i < pts.length; i++) {
                            const mx = (pts[i].x + pts[i-1].x) / 2;
                            d += ` C ${mx},${pts[i-1].y} ${mx},${pts[i].y} ${pts[i].x},${pts[i].y}`;
                          }
                          const isSelected = selectedDriversForChart.includes(driver);
                          const last = pts[pts.length - 1];
                          return (
                            <g key={driver} opacity={isSelected || selectedDriversForChart.length === 0 ? 1 : 0.1}>
                              <path d={d} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth={5} strokeLinejoin="round" />
                              <path d={d} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" />
                              {/* Driver name on the RIGHT end only */}
                              <text x={last.x + 5} y={last.y + 4} fill={color} fontSize={9}
                                fontFamily="monospace" fontWeight="bold" textAnchor="start">{driver}</text>
                            </g>
                          );
                        })}
                        {/* X axis — lap labels */}
                        {lapNumbers.map((lap, i) => i % step === 0 && (
                          <text key={lap} x={xOf(i)} y={H - padB + 14} fill="rgba(255,255,255,0.3)" fontSize={9} textAnchor="middle" fontFamily="monospace">{lap}</text>
                        ))}
                        {/* X axis title */}
                        <text x={padL + innerW / 2} y={H - 4} fill="rgba(255,255,255,0.2)" fontSize={9} textAnchor="middle" fontFamily="monospace">LAP</text>
                      </svg>
                    );
                  })()}
                </div>

                {/* Legend */}
                <div className="mt-4 flex flex-wrap gap-3">
                  {race.results.map((driver) => (
                    <button
                      key={driver.driver_code}
                      onClick={() => {
                        setSelectedDriversForChart((prev) =>
                          prev.includes(driver.driver_code)
                            ? prev.filter((d) => d !== driver.driver_code)
                            : [...prev, driver.driver_code]
                        );
                      }}
                      className={`text-xs px-2 py-1 rounded transition-all ${
                        selectedDriversForChart.includes(driver.driver_code)
                          ? "bg-opacity-100 font-bold"
                          : "bg-opacity-30 opacity-50"
                      }`}
                      style={{
                        backgroundColor:
                          driverColors[driver.driver_code] || "#999",
                        color: "#000",
                      }}
                    >
                      {driver.driver_code}
                    </button>
                  ))}
                </div>
              </div>
              );
            })()}

            {/* Analysis Table */}
            {positionsSubTab === "analysis" && (() => {
              const selectedSession = sessions.find(s => s.id === selectedSessionId);
              const sessionType = selectedSession?.session_type ?? "";
              const isRaceLike = sessionType === "Race" || sessionType === "Sprint";
              const isQualifying = sessionType === "Qualifying";

              // ── Qualifying: Q1/Q2/Q3 knockout analysis ──────────────────
              if (isQualifying) {
                const sorted = [...sessionResults].sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
                const leaderTime = sorted[0]?.best_lap_time ?? sorted[0]?.q3 ?? sorted[0]?.q2 ?? sorted[0]?.q1;
                const zones = [
                  { label: "Q3 Qualifiers", color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-700/40", rows: sorted.slice(0, 10) },
                  { label: "Q2 Eliminated", color: "text-gray-300", bg: "bg-carbon-900/30 border-carbon-700/40", rows: sorted.slice(10, 15) },
                  { label: "Q1 Eliminated", color: "text-gray-500", bg: "bg-carbon-900/20 border-carbon-700/30", rows: sorted.slice(15) },
                ];
                return (
                  <div className="p-6 space-y-6">
                    <div>
                      <h3 className="text-lg font-bold text-white mb-1">Qualifying Knockout Analysis</h3>
                      <p className="text-sm text-gray-400">Drivers grouped by the qualifying stage they were eliminated in.</p>
                    </div>
                    {loadingSessionResults ? (
                      <div className="h-40 flex items-center justify-center text-gray-500">Loading…</div>
                    ) : sorted.length === 0 ? (
                      <div className="h-40 flex items-center justify-center text-gray-500">No qualifying data available.</div>
                    ) : zones.map(zone => zone.rows.length > 0 && (
                      <div key={zone.label} className={`rounded-lg border overflow-hidden ${zone.bg}`}>
                        <div className={`px-4 py-2 text-xs font-bold uppercase tracking-widest ${zone.color}`}>{zone.label}</div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-t border-carbon-700/30">
                              <th className="text-left py-2 px-4 text-gray-500 text-xs font-semibold uppercase tracking-wider w-12">Pos</th>
                              <th className="text-left py-2 px-4 text-gray-500 text-xs font-semibold uppercase tracking-wider">Driver</th>
                              <th className="text-left py-2 px-4 text-gray-500 text-xs font-semibold uppercase tracking-wider">Team</th>
                              <th className="text-right py-2 px-4 text-gray-500 text-xs font-semibold uppercase tracking-wider">Q1</th>
                              <th className="text-right py-2 px-4 text-gray-500 text-xs font-semibold uppercase tracking-wider">Q2</th>
                              <th className="text-right py-2 px-4 text-gray-500 text-xs font-semibold uppercase tracking-wider">Q3</th>
                              <th className="text-right py-2 px-4 text-gray-500 text-xs font-semibold uppercase tracking-wider">Gap</th>
                            </tr>
                          </thead>
                          <tbody>
                            {zone.rows.map((r) => {
                              const best = r.best_lap_time ?? r.q3 ?? r.q2 ?? r.q1;
                              const gap = best && leaderTime ? best - leaderTime : null;
                              return (
                                <tr key={r.driver_code} className="border-t border-carbon-700/20 hover:bg-carbon-700/20 transition-colors">
                                  <td className="py-2.5 px-4 font-bold text-white">{r.position ?? "—"}</td>
                                  <td className="py-2.5 px-4">
                                    <div className="flex items-center gap-2">
                                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-white" style={{ backgroundColor: driverColors[r.driver_code] || '#555' }}>{r.driver_code}</span>
                                      <span className="text-white font-medium">{r.driver_name}</span>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-4 text-gray-400">{r.team_name}</td>
                                  <td className="py-2.5 px-4 text-right font-mono text-gray-400 text-xs">{r.q1 ? formatLapTime(r.q1) : "—"}</td>
                                  <td className="py-2.5 px-4 text-right font-mono text-gray-400 text-xs">{r.q2 ? formatLapTime(r.q2) : "—"}</td>
                                  <td className="py-2.5 px-4 text-right font-mono text-purple-400 text-xs font-bold">{r.q3 ? formatLapTime(r.q3) : "—"}</td>
                                  <td className="py-2.5 px-4 text-right font-mono text-xs">
                                    {gap === null ? "—" : gap === 0 ? <span className="text-yellow-400 font-bold">Pole</span> : <span className="text-gray-400">+{gap.toFixed(3)}</span>}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                );
              }

              // ── Practice: fastest lap ranking with gap ───────────────────
              if (!isRaceLike) {
                const sorted = [...sessionResults].sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
                const leaderTime = sorted[0]?.fastest_lap_time ?? sorted[0]?.best_lap_time;
                return (
                  <div className="p-6">
                    <div className="mb-4">
                      <h3 className="text-lg font-bold text-white mb-1">{sessionType} — Fastest Lap Ranking</h3>
                      <p className="text-sm text-gray-400">Fastest lap per driver ranked by time.</p>
                    </div>
                    {loadingSessionResults ? (
                      <div className="h-40 flex items-center justify-center text-gray-500">Loading…</div>
                    ) : sorted.length === 0 ? (
                      <div className="h-40 flex items-center justify-center text-gray-500">No data available for this session.</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-carbon-900/50">
                            <tr className="border-b border-carbon-700">
                              <th className="text-left py-3 px-4 text-gray-400 font-semibold uppercase tracking-wider text-xs">Pos</th>
                              <th className="text-left py-3 px-4 text-gray-400 font-semibold uppercase tracking-wider text-xs">Driver</th>
                              <th className="text-left py-3 px-4 text-gray-400 font-semibold uppercase tracking-wider text-xs">Team</th>
                              <th className="text-right py-3 px-4 text-gray-400 font-semibold uppercase tracking-wider text-xs">Best Lap</th>
                              <th className="text-right py-3 px-4 text-gray-400 font-semibold uppercase tracking-wider text-xs">Gap</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sorted.map((r, idx) => {
                              const best = r.fastest_lap_time ?? r.best_lap_time;
                              const gap = best && leaderTime ? best - leaderTime : null;
                              return (
                                <tr key={r.driver_code} className="border-b border-carbon-700/30 hover:bg-carbon-700/20 transition-colors">
                                  <td className="py-3 px-4 font-bold text-white">{r.position ?? idx + 1}</td>
                                  <td className="py-3 px-4">
                                    <div className="flex items-center gap-2">
                                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold text-white" style={{ backgroundColor: driverColors[r.driver_code] || '#555' }}>{r.driver_code}</span>
                                      <span className="text-white font-medium">{r.driver_name}</span>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-gray-400">{r.team_name}</td>
                                  <td className="py-3 px-4 text-right font-mono text-green-400">{best ? formatLapTime(best) : "—"}</td>
                                  <td className="py-3 px-4 text-right font-mono text-gray-400 text-xs">
                                    {gap === null ? "—" : gap === 0 ? <span className="text-green-400 font-bold">Leader</span> : `+${gap.toFixed(3)}`}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              }

              // ── Race / Sprint: original places gained/lost ───────────────
              return (
              <div className="p-6">
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-white mb-2">
                    Places Gained/Lost Summary
                  </h3>
                  <p className="text-sm text-gray-400">
                    Comparison between starting grid and final position. P1 line
                    starts indicated.
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-carbon-900/50">
                      <tr className="border-b border-carbon-700">
                        <th className="text-left py-3 px-4 font-semibold text-gray-400 text-sm uppercase tracking-wider">
                          Pos
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-400 text-sm uppercase tracking-wider">
                          Driver
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-400 text-sm uppercase tracking-wider">
                          Team
                        </th>
                        <th className="text-center py-3 px-4 font-semibold text-gray-400 text-sm uppercase tracking-wider">
                          Grid
                        </th>
                        <th className="text-center py-3 px-4 font-semibold text-gray-400 text-sm uppercase tracking-wider">
                          Change
                        </th>
                        <th className="text-left py-3 px-4 font-semibold text-gray-400 text-sm uppercase tracking-wider">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {placesGainedLost.map((result) => (
                        <tr
                          key={result.driver_code}
                          className="border-b border-carbon-700/30 hover:bg-carbon-700/20 transition-colors"
                        >
                          <td className="py-3 px-4">
                            <span className="font-bold text-white">
                              {result.position || "-"}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white">
                                {result.driver_name}
                              </span>
                              {result.isRookie && (
                                <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded font-bold">
                                  R
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-gray-300">
                            {result.team_name}
                          </td>
                          <td className="py-3 px-4 text-center text-gray-400">
                            {result.grid_position || "-"}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {result.change !== 0 ? (
                              <span
                                className={`font-bold ${
                                  result.change > 0
                                    ? "text-green-400"
                                    : "text-red-400"
                                }`}
                              >
                                {result.change > 0 ? "+" : ""}
                                {result.change}
                              </span>
                            ) : (
                              <span className="text-gray-500">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm text-gray-300">
                              {result.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Strategy Tab */}
      {activeTab === "strategy" && (
        <div className="space-y-4">
          <div className="bg-carbon-800 rounded-lg border border-carbon-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-carbon-700">
              <h2 className="text-xl font-display font-bold text-white">
                Strategy Analysis
              </h2>
            </div>

            {/* Sub-tabs */}
            <div className="px-6 py-3 border-b border-carbon-700 flex gap-2">
              <button
                onClick={() => setStrategySubTab("overview")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  strategySubTab === "overview"
                    ? "bg-carbon-700 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                📊 Overview
              </button>
              <button
                onClick={() => setStrategySubTab("stints")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                  strategySubTab === "stints"
                    ? "bg-carbon-700 text-white"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                📋 Stint Detail
              </button>
            </div>

            {/* Overview - Tire Strategy Visualization */}
            {strategySubTab === "overview" && (
              <div className="p-6">
                {/* Legend */}
                <div className="flex items-center gap-5 mb-5">
                  {[
                    { label: "Soft", color: "#ef4444" },
                    { label: "Medium", color: "#eab308" },
                    { label: "Hard", color: "#d1d5db" },
                    { label: "Inter", color: "#22c55e" },
                    { label: "Wet", color: "#3b82f6" },
                  ].map(({ label, color }) => (
                    <div key={label} className="flex items-center gap-1.5">
                      <div
                        className="w-3 h-3 rounded-sm"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-xs text-gray-400">{label}</span>
                    </div>
                  ))}
                </div>

                {/* Strategy Chart */}
                {loadingStrategy ? (
                  <div className="text-center py-8 text-gray-400">
                    Loading strategy data...
                  </div>
                ) : strategyData.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    No strategy data available
                  </div>
                ) : (
                  (() => {
                    const totalLaps = Math.max(
                      ...strategyData.map((s: any) => s.stint_end),
                      1
                    );
                    const tickStep = totalLaps > 40 ? 10 : 5;
                    const ticks = Array.from(
                      { length: Math.floor(totalLaps / tickStep) },
                      (_, i) => (i + 1) * tickStep
                    );
                    const CS: Record<
                      string,
                      { bg: string; text: string; abbr: string }
                    > = {
                      SOFT: { bg: "#ef4444", text: "#111", abbr: "S" },
                      MEDIUM: { bg: "#eab308", text: "#111", abbr: "M" },
                      HARD: { bg: "#d1d5db", text: "#111", abbr: "H" },
                      INTERMEDIATE: {
                        bg: "#22c55e",
                        text: "#111",
                        abbr: "I",
                      },
                      WET: { bg: "#3b82f6", text: "#fff", abbr: "W" },
                    };
                    const getCS = (c: string) =>
                      CS[c?.toUpperCase()] ?? {
                        bg: "#6b7280",
                        text: "#fff",
                        abbr: "?",
                      };

                    return (
                      <div>
                        {/* Lap ruler */}
                        <div className="flex items-end gap-3 mb-2 select-none">
                          <div className="w-16 flex-shrink-0" />
                          <div className="flex-1 relative h-5">
                            {ticks.map((lap) => (
                              <div
                                key={lap}
                                className="absolute bottom-0 flex flex-col items-center gap-0.5"
                                style={{
                                  left: `${((lap - 1) / totalLaps) * 100}%`,
                                  transform: "translateX(-50%)",
                                }}
                              >
                                <span className="text-[9px] text-gray-500 font-mono">
                                  {lap}
                                </span>
                                <div className="w-px h-1.5 bg-zinc-600" />
                              </div>
                            ))}
                            <div
                              className="absolute bottom-0 flex flex-col items-end gap-0.5"
                              style={{ right: 0 }}
                            >
                              <span className="text-[9px] text-gray-500 font-mono">
                                {totalLaps}
                              </span>
                              <div className="w-px h-1.5 bg-zinc-600" />
                            </div>
                          </div>
                        </div>

                        {/* Driver rows */}
                        <div className="space-y-1">
                          {race?.results.slice(0, 20).map((driver, index) => {
                            const driverStints = strategyData
                              .filter(
                                (s: any) =>
                                  s.driver_code === driver.driver_code
                              )
                              .sort(
                                (a: any, b: any) =>
                                  a.stint_start - b.stint_start
                              );
                            return (
                              <div
                                key={driver.driver_code}
                                className="flex items-center gap-3"
                              >
                                {/* Driver label */}
                                <div className="w-16 flex-shrink-0 flex items-center justify-end gap-1">
                                  <span className="text-[10px] text-gray-600 font-mono">
                                    P{index + 1}
                                  </span>
                                  <span className="text-sm font-bold text-white font-mono">
                                    {driver.driver_code}
                                  </span>
                                </div>
                                {/* Stint bar */}
                                <div className="flex-1 h-8 relative">
                                  <div className="absolute inset-0 bg-zinc-900 rounded" />
                                  {driverStints.length > 0 ? (
                                    driverStints.map(
                                      (stint: any, i: number) => {
                                        const lapCount =
                                          stint.stint_end -
                                          stint.stint_start +
                                          1;
                                        const leftPct =
                                          ((stint.stint_start - 1) /
                                            totalLaps) *
                                          100;
                                        const widthPct =
                                          (lapCount / totalLaps) * 100;
                                        const cs = getCS(stint.compound);
                                        const showText = widthPct > 5;
                                        return (
                                          <div
                                            key={i}
                                            className="absolute inset-y-0 group"
                                            style={{
                                              left: `${leftPct}%`,
                                              width: `${widthPct}%`,
                                              paddingLeft: i > 0 ? "2px" : 0,
                                            }}
                                          >
                                            <div
                                              className="h-full flex items-center justify-center rounded-sm"
                                              style={{
                                                backgroundColor: cs.bg,
                                              }}
                                            >
                                              {showText && (
                                                <span
                                                  className="text-[11px] font-black select-none tracking-tight"
                                                  style={{ color: cs.text }}
                                                >
                                                  {cs.abbr}
                                                </span>
                                              )}
                                            </div>
                                            {/* Rich tooltip */}
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl text-xs px-3 py-2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none">
                                              <div
                                                className="font-bold text-sm mb-0.5"
                                                style={{ color: cs.bg }}
                                              >
                                                {stint.compound}
                                              </div>
                                              <div className="text-gray-300">
                                                Laps {stint.stint_start}–
                                                {stint.stint_end}
                                              </div>
                                              <div className="text-gray-500">
                                                {lapCount} laps
                                              </div>
                                              {stint.avg_lap_time > 0 && (
                                                <div className="text-gray-400 mt-1">
                                                  Avg:{" "}
                                                  {formatLapTime(
                                                    stint.avg_lap_time
                                                  )}
                                                </div>
                                              )}
                                              {stint.fastest_lap_time > 0 && (
                                                <div className="text-green-400">
                                                  Best:{" "}
                                                  {formatLapTime(
                                                    stint.fastest_lap_time
                                                  )}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      }
                                    )
                                  ) : (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                      <span className="text-xs text-gray-600">
                                        No data
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Bottom axis */}
                        <div className="flex items-center gap-3 mt-2 select-none">
                          <div className="w-16 flex-shrink-0" />
                          <div className="flex-1 relative">
                            <div className="h-px bg-zinc-700 w-full" />
                            <span className="absolute left-0 top-1 text-[9px] text-gray-600 font-mono">
                              Lap 1
                            </span>
                            <span className="absolute right-0 top-1 text-[9px] text-gray-600 font-mono">
                              Lap {totalLaps}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>
            )}

            {/* Stint Detail Table */}
            {strategySubTab === "stints" && (
              <div className="p-6">
                <div className="mb-4">
                  <h3 className="text-lg font-bold text-white mb-2">
                    Stint Performance Analysis
                  </h3>
                  <p className="text-sm text-gray-400">
                    Detailed stint information with lap times and performance
                    metrics
                  </p>
                </div>

                <div className="overflow-x-auto">
                  {loadingStrategy ? (
                    <div className="text-center py-8 text-gray-400">
                      Loading stint data...
                    </div>
                  ) : strategyData.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      No stint data available
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead className="bg-carbon-900/50">
                        <tr className="border-b border-carbon-700">
                          <th className="text-left py-3 px-4 font-semibold text-gray-400 text-xs uppercase tracking-wider w-12"></th>
                          <th className="text-left py-3 px-4 font-semibold text-gray-400 text-xs uppercase tracking-wider">
                            Driver
                          </th>
                          <th className="text-center py-3 px-4 font-semibold text-gray-400 text-xs uppercase tracking-wider">
                            Stints
                          </th>
                          <th className="text-center py-3 px-4 font-semibold text-gray-400 text-xs uppercase tracking-wider">
                            Total Laps
                          </th>
                          <th className="text-center py-3 px-4 font-semibold text-gray-400 text-xs uppercase tracking-wider">
                            Best Stint Avg
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from(
                          new Set(strategyData.map((s) => s.driver_code))
                        ).map((driverCode) => {
                          const driverStints = strategyData
                            .filter((s) => s.driver_code === driverCode)
                            .sort((a, b) => a.stint_start - b.stint_start);

                          const totalLaps = driverStints.reduce(
                            (sum, s) => sum + (s.stint_end - s.stint_start + 1),
                            0
                          );
                          const bestAvg = Math.min(
                            ...driverStints.map(
                              (s) => s.avg_lap_time || Infinity
                            )
                          );
                          const isExpanded = expandedDrivers.has(driverCode);

                          return (
                            <>
                              {/* Driver Summary Row */}
                              <tr
                                key={driverCode}
                                className="border-b border-carbon-700/30 hover:bg-carbon-700/20 transition-colors cursor-pointer"
                                onClick={() => toggleDriver(driverCode)}
                              >
                                <td className="py-3 px-4 text-center">
                                  <svg
                                    className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${
                                      isExpanded ? "rotate-90" : ""
                                    }`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M9 5l7 7-7 7"
                                    />
                                  </svg>
                                </td>
                                <td className="py-3 px-4">
                                  <span className="font-bold text-racing-red-500 font-mono text-lg">
                                    {driverCode}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-center text-white font-bold">
                                  {driverStints.length}
                                </td>
                                <td className="py-3 px-4 text-center text-gray-300">
                                  {totalLaps}
                                </td>
                                <td className="py-3 px-4 text-center text-track-green font-mono">
                                  {bestAvg !== Infinity
                                    ? formatLapTime(bestAvg)
                                    : "-"}
                                </td>
                              </tr>

                              {/* Expanded Details Row */}
                              {isExpanded && (
                                <tr className="bg-carbon-800/30">
                                  <td
                                    colSpan={5}
                                    className="p-4 border-b border-carbon-700/30"
                                  >
                                    <table className="w-full text-sm">
                                      <thead className="bg-carbon-900/30">
                                        <tr>
                                          <th className="text-left py-2 px-4 text-gray-500 text-xs uppercase">
                                            Stint
                                          </th>
                                          <th className="text-left py-2 px-4 text-gray-500 text-xs uppercase">
                                            Compound
                                          </th>
                                          <th className="text-center py-2 px-4 text-gray-500 text-xs uppercase">
                                            Start
                                          </th>
                                          <th className="text-center py-2 px-4 text-gray-500 text-xs uppercase">
                                            End
                                          </th>
                                          <th className="text-center py-2 px-4 text-gray-500 text-xs uppercase">
                                            Laps
                                          </th>
                                          <th className="text-right py-2 px-4 text-gray-500 text-xs uppercase">
                                            Avg Time
                                          </th>
                                          <th className="text-right py-2 px-4 text-gray-500 text-xs uppercase">
                                            Fastest
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {driverStints.map((stint, idx) => {
                                          const getCompoundColor = (
                                            compound: string
                                          ) => {
                                            const compoundUpper =
                                              compound?.toUpperCase();
                                            switch (compoundUpper) {
                                              case "SOFT":
                                                return "text-red-400";
                                              case "MEDIUM":
                                                return "text-yellow-400";
                                              case "HARD":
                                                return "text-gray-300";
                                              case "INTERMEDIATE":
                                                return "text-green-400";
                                              default:
                                                return "text-gray-400";
                                            }
                                          };

                                          const getBgColor = (
                                            compound: string
                                          ) => {
                                            const compoundUpper =
                                              compound?.toUpperCase();
                                            switch (compoundUpper) {
                                              case "SOFT":
                                                return "bg-red-500";
                                              case "MEDIUM":
                                                return "bg-yellow-500";
                                              case "HARD":
                                                return "bg-gray-300";
                                              case "INTERMEDIATE":
                                                return "bg-green-500";
                                              default:
                                                return "bg-gray-500";
                                            }
                                          };

                                          const fastestLapTime =
                                            stint.fastest_lap_time || null;

                                          return (
                                            <tr
                                              key={idx}
                                              className="border-b border-carbon-700/10 hover:bg-carbon-700/10"
                                            >
                                              <td className="py-2 px-4 text-gray-400 font-mono">
                                                #{idx + 1}
                                              </td>
                                              <td className="py-2 px-4">
                                                <div className="flex items-center gap-2">
                                                  <div
                                                    className={`w-2 h-2 rounded-full ${getBgColor(
                                                      stint.compound
                                                    )}`}
                                                  ></div>
                                                  <span
                                                    className={`font-semibold ${getCompoundColor(
                                                      stint.compound
                                                    )}`}
                                                  >
                                                    {stint.compound?.toUpperCase()}
                                                  </span>
                                                </div>
                                              </td>
                                              <td className="py-2 px-4 text-center text-gray-400 font-mono">
                                                {stint.stint_start}
                                              </td>
                                              <td className="py-2 px-4 text-center text-gray-400 font-mono">
                                                {stint.stint_end}
                                              </td>
                                              <td className="py-2 px-4 text-center text-white font-mono">
                                                {stint.stint_end -
                                                  stint.stint_start +
                                                  1}
                                              </td>
                                              <td className="py-2 px-4 text-right text-white font-mono">
                                                {stint.avg_lap_time
                                                  ? formatLapTime(
                                                      stint.avg_lap_time
                                                    )
                                                  : "-"}
                                              </td>
                                              <td className="py-2 px-4 text-right text-track-green font-bold font-mono">
                                                {fastestLapTime
                                                  ? formatLapTime(
                                                      fastestLapTime
                                                    )
                                                  : "-"}
                                              </td>
                                            </tr>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </td>
                                </tr>
                              )}
                            </>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lap Times Tab */}
      {activeTab === "laps" && (
        <div className="space-y-4">
          <div className="bg-carbon-800 rounded-lg border border-carbon-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-carbon-700 flex justify-between items-center">
              <h2 className="text-xl font-display font-bold text-white">
                Lap Time Comparison
              </h2>
              <div className="flex gap-2">
                {/* Driver Selector Chips */}
                <div className="flex flex-wrap gap-2 justify-end">
                  {race.results.map((driver) => (
                    <button
                      key={driver.driver_code}
                      onClick={() => {
                        setSelectedDriversForLaps((prev) =>
                          prev.includes(driver.driver_code)
                            ? prev.filter((d) => d !== driver.driver_code)
                            : [...prev, driver.driver_code]
                        );
                      }}
                      className={`text-xs px-3 py-1.5 rounded-full transition-all border ${
                        selectedDriversForLaps.includes(driver.driver_code)
                          ? "bg-opacity-20 border-opacity-50"
                          : "bg-transparent border-carbon-600 text-gray-500 opacity-70 hover:opacity-100"
                      }`}
                      style={{
                        borderColor: selectedDriversForLaps.includes(
                          driver.driver_code
                        )
                          ? driverColors[driver.driver_code] || "#999"
                          : undefined,
                        color: selectedDriversForLaps.includes(
                          driver.driver_code
                        )
                          ? driverColors[driver.driver_code] || "#fff"
                          : undefined,
                        backgroundColor: selectedDriversForLaps.includes(
                          driver.driver_code
                        )
                          ? `${driverColors[driver.driver_code]}33`
                          : undefined,
                      }}
                    >
                      {selectedDriversForLaps.includes(driver.driver_code) && (
                        <span className="mr-1">●</span>
                      )}
                      {driver.driver_code}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6">
              {loadingLapTimes ? (
                <div className="flex items-center justify-center py-12">
                  <div className="loading-spinner"></div>
                </div>
              ) : lapTimesData.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  No lap time data available for this session.
                </div>
              ) : (
                <div className="bg-carbon-900/50 rounded-lg p-4">
                  <ResponsiveContainer width="100%" height={500}>
                    <LineChart data={lapTimeChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis
                        dataKey="lap"
                        stroke="#888"
                        label={{
                          value: "Lap Number",
                          position: "insideBottom",
                          offset: -5,
                          fill: "#888",
                        }}
                      />
                      <YAxis
                        stroke="#888"
                        domain={["auto", "auto"]}
                        tickFormatter={(val) => formatLapTime(val)}
                        width={80}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1a1a1a",
                          border: "1px solid #333",
                        }}
                        labelStyle={{ color: "#fff" }}
                        formatter={(value: number) => [
                          formatLapTime(value),
                          "Lap Time",
                        ]}
                      />
                      <Legend />
                      {selectedDriversForLaps.map((driverCode) => (
                        <Line
                          key={driverCode}
                          type="monotone"
                          dataKey={driverCode}
                          stroke={driverColors[driverCode] || "#999"}
                          dot={false}
                          strokeWidth={2}
                          connectNulls
                          name={driverCode}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="mt-4 flex justify-end">
                <button className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  Download Chart
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Track Dominance Tab */}
      {activeTab === "dominance" && (
        <div className="space-y-4">
          {/* Driver Selection */}
          <div className="bg-carbon-800 rounded-lg border border-carbon-700 p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Driver 1
                </label>
                <select
                  value={telemetryDriver1}
                  onChange={(e) => setTelemetryDriver1(e.target.value)}
                  className="w-full bg-carbon-900 border border-carbon-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-racing-red-500"
                >
                  {sessionResults.map((driver) => (
                    <option key={driver.driver_code} value={driver.driver_code}>
                      {driver.driver_code} - {driver.driver_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Driver 2
                </label>
                <select
                  value={telemetryDriver2}
                  onChange={(e) => setTelemetryDriver2(e.target.value)}
                  className="w-full bg-carbon-900 border border-carbon-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-racing-red-500"
                >
                  {sessionResults.map((driver) => (
                    <option key={driver.driver_code} value={driver.driver_code}>
                      {driver.driver_code} - {driver.driver_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {loadingTelemetry ? (
            <div className="bg-carbon-800 rounded-lg border border-carbon-700 p-12">
              <div className="flex items-center justify-center">
                <div className="loading-spinner"></div>
              </div>
            </div>
          ) : telemetryData1.length === 0 || telemetryData2.length === 0 ? (
            <div className="bg-carbon-800 rounded-lg border border-carbon-700 p-12">
              <div className="text-center text-gray-400">
                No telemetry data available for selected drivers.
              </div>
            </div>
          ) : (
            <>
              {/* Track Map with Speed Comparison */}
              <div className="bg-carbon-800 rounded-lg border border-carbon-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-carbon-700">
                  <h3 className="text-xl font-display font-bold text-white">
                    Track Dominance by Lap with Speed Trace
                  </h3>
                  <p className="text-sm text-gray-400 mt-1">
                    Comparing {telemetryDriver1} vs {telemetryDriver2}
                  </p>
                </div>
                <div className="p-6 space-y-6">
                  {/* Two speed maps side by side — shared color scale for direct comparison */}
                  {(() => {
                    // plasma colormap (mpl.cm.plasma)
                    const PLASMA: [number, number, number][] = [
                      [0x0d, 0x08, 0x87],
                      [0x6a, 0x00, 0xa8],
                      [0x7e, 0x03, 0xa8],
                      [0xb1, 0x2a, 0x90],
                      [0xcc, 0x47, 0x78],
                      [0xe1, 0x64, 0x62],
                      [0xf8, 0x95, 0x40],
                      [0xfc, 0xc4, 0x25],
                      [0xf0, 0xf9, 0x21],
                    ];
                    const plasmaColor = (t: number): string => {
                      const clamped = Math.max(0, Math.min(1, t));
                      const idx = clamped * (PLASMA.length - 1);
                      const lo = Math.floor(idx), hi = Math.min(lo + 1, PLASMA.length - 1);
                      const f = idx - lo;
                      const r = Math.round(PLASMA[lo][0] + f * (PLASMA[hi][0] - PLASMA[lo][0]));
                      const g = Math.round(PLASMA[lo][1] + f * (PLASMA[hi][1] - PLASMA[lo][1]));
                      const b = Math.round(PLASMA[lo][2] + f * (PLASMA[hi][2] - PLASMA[lo][2]));
                      return `rgb(${r},${g},${b})`;
                    };

                    type SPt = { x: number; y: number; speed: number };

                    const mapTelToCircuit = (telData: any[]): SPt[] => {
                      if (circuitCoords && circuitCoords.x.length > 2) {
                        const cirPts = circuitCoords.x.map((x, i) => ({ x, y: circuitCoords!.y[i] }));
                        const cirDist: number[] = [0];
                        for (let i = 1; i < cirPts.length; i++) {
                          const dx = cirPts[i].x - cirPts[i-1].x, dy = cirPts[i].y - cirPts[i-1].y;
                          cirDist.push(cirDist[i-1] + Math.sqrt(dx*dx + dy*dy));
                        }
                        const totalCirDist = cirDist[cirDist.length - 1] || 1;
                        const tel = telData.filter(p => p.distance != null && p.speed != null);
                        const maxTelDist = tel.length > 0 ? Math.max(...tel.map(p => p.distance as number)) : 1;
                        return cirPts.map((cp, i) => {
                          const frac = cirDist[i] / totalCirDist;
                          const targetDist = frac * maxTelDist;
                          let lo = 0, hi = tel.length - 1, best = 0;
                          while (lo <= hi) {
                            const mid = (lo + hi) >> 1;
                            if ((tel[mid].distance as number) < targetDist) { best = mid; lo = mid + 1; }
                            else hi = mid - 1;
                          }
                          return { x: cp.x, y: cp.y, speed: (tel[best]?.speed as number) ?? 0 };
                        });
                      }
                      return telData
                        .filter(p => p.x != null && p.y != null && p.speed != null)
                        .map(p => ({ x: p.x as number, y: p.y as number, speed: p.speed as number }));
                    };

                    const pts1 = mapTelToCircuit(telemetryData1);
                    const pts2 = mapTelToCircuit(telemetryData2);

                    if (pts1.length < 2 && pts2.length < 2) {
                      return <div className="h-[320px] flex items-center justify-center text-gray-500 text-sm">No telemetry data</div>;
                    }

                    // Shared speed scale across both drivers for fair colour comparison
                    const allSpeeds = [...pts1, ...pts2].map(p => p.speed);
                    const globalMin = allSpeeds.length > 0 ? Math.min(...allSpeeds) : 0;
                    const globalMax = allSpeeds.length > 0 ? Math.max(...allSpeeds) : 1;
                    const speedRange = globalMax - globalMin || 1;

                    // Shared spatial bounds so both maps have same orientation/scale
                    const allPts = [...pts1, ...pts2];
                    const minX = allPts.reduce((m, p) => Math.min(m, p.x), Infinity);
                    const maxX = allPts.reduce((m, p) => Math.max(m, p.x), -Infinity);
                    const minY = allPts.reduce((m, p) => Math.min(m, p.y), Infinity);
                    const maxY = allPts.reduce((m, p) => Math.max(m, p.y), -Infinity);

                    const cbH = 12, cbMarginBottom = 30;
                    const pad = 20, W = 520, H = 360;
                    const trackH = H - cbH - cbMarginBottom;
                    const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
                    const scale = Math.min((W - 2*pad) / rangeX, (trackH - 2*pad) / rangeY);
                    const offX = pad + ((W - 2*pad) - rangeX * scale) / 2;
                    const offY = pad + ((trackH - 2*pad) - rangeY * scale) / 2;
                    const sx = (x: number) => offX + (x - minX) * scale;
                    const sy = (y: number) => trackH - offY - (y - minY) * scale;

                    const cbPadX = 50;
                    const cbY = trackH + 10;

                    const renderMap = (pts: SPt[], gradId: string, label: string) => (
                      <div className="bg-carbon-900/50 rounded-lg p-3">
                        <div className="text-xs font-bold text-gray-300 mb-2 font-mono">{label}</div>
                        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', background: '#0d1117', borderRadius: 6 }}>
                          <defs>
                            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
                              {Array.from({ length: 20 }, (_, i) => {
                                const t = i / 19;
                                return <stop key={i} offset={`${(t*100).toFixed(1)}%`} stopColor={plasmaColor(t)} />;
                              })}
                            </linearGradient>
                          </defs>
                          {/* Background track */}
                          {pts.slice(1).map((pt, i) => (
                            <line key={`bg-${i}`}
                              x1={sx(pts[i].x)} y1={sy(pts[i].y)}
                              x2={sx(pt.x)}     y2={sy(pt.y)}
                              stroke="#1a1a2e" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round"
                            />
                          ))}
                          {/* Speed segments */}
                          {pts.slice(1).map((pt, i) => {
                            const t = (pts[i].speed - globalMin) / speedRange;
                            return (
                              <line key={`sp-${i}`}
                                x1={sx(pts[i].x)} y1={sy(pts[i].y)}
                                x2={sx(pt.x)}     y2={sy(pt.y)}
                                stroke={plasmaColor(t)} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round"
                              />
                            );
                          })}
                          {/* Colorbar */}
                          <rect x={cbPadX} y={cbY} width={W - cbPadX*2} height={cbH} fill={`url(#${gradId})`} rx={3} />
                          <rect x={cbPadX} y={cbY} width={W - cbPadX*2} height={cbH} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={0.5} rx={3} />
                          <text x={cbPadX} y={cbY + cbH + 14} fill="rgba(255,255,255,0.6)" fontSize={9} fontFamily="monospace" textAnchor="middle">{Math.round(globalMin)} km/h</text>
                          <text x={W - cbPadX} y={cbY + cbH + 14} fill="rgba(255,255,255,0.6)" fontSize={9} fontFamily="monospace" textAnchor="middle">{Math.round(globalMax)} km/h</text>
                          <text x={W/2} y={cbY + cbH + 14} fill="rgba(255,255,255,0.35)" fontSize={8} fontFamily="monospace" textAnchor="middle">Speed (shared scale)</text>
                        </svg>
                      </div>
                    );

                    return (
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {renderMap(pts1, "plasmaGrad1", `${telemetryDriver1} — Speed on Track`)}
                        {renderMap(pts2, "plasmaGrad2", `${telemetryDriver2} — Speed on Track`)}
                      </div>
                    );
                  })()}

                  {/* Speed Trace chart — full width */}
                  <div className="bg-carbon-900/50 rounded-lg p-4">
                    <h4 className="text-sm font-bold text-gray-400 mb-4">Speed Comparison</h4>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis
                          dataKey="distance"
                          stroke="#888"
                          label={{ value: "Distance (m)", position: "insideBottom", offset: -5, fill: "#888" }}
                          domain={[0, Math.max(...telemetryData1.map((d) => d.distance || 0))]}
                          type="number"
                        />
                        <YAxis
                          stroke="#888"
                          label={{ value: "Speed (km/h)", angle: -90, position: "insideLeft", fill: "#888" }}
                        />
                        <Tooltip contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid #333" }} labelStyle={{ color: "#fff" }} />
                        <Legend />
                        <Line data={telemetryData1} type="monotone" dataKey="speed"
                          stroke={driverColors[telemetryDriver1] || "#00D9FF"} name={telemetryDriver1}
                          dot={false} strokeWidth={2} isAnimationActive={false} />
                        <Line data={telemetryData2} type="monotone" dataKey="speed"
                          stroke={driverColors[telemetryDriver2] || "#FF1E1E"} name={telemetryDriver2}
                          dot={false} strokeWidth={2} isAnimationActive={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Additional Telemetry Comparison */}
              <div className="bg-carbon-800 rounded-lg border border-carbon-700 overflow-hidden">
                <div className="px-6 py-4 border-b border-carbon-700">
                  <h3 className="text-xl font-display font-bold text-white">
                    Additional Telemetry Comparison
                  </h3>
                </div>
                <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Throttle Comparison */}
                  <div className="bg-carbon-900/50 rounded-lg p-4">
                    <h4 className="text-sm font-bold text-gray-400 mb-4 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500"></span>
                      Throttle Comparison
                    </h4>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis
                          dataKey="distance"
                          stroke="#888"
                          type="number"
                          hide
                        />
                        <YAxis
                          stroke="#888"
                          domain={[0, 100]}
                          label={{
                            value: "Throttle %",
                            angle: -90,
                            position: "insideLeft",
                            fill: "#888",
                          }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1a1a1a",
                            border: "1px solid #333",
                          }}
                          labelStyle={{ color: "#fff" }}
                        />
                        <Legend />
                        <Line
                          data={telemetryData1}
                          type="monotone"
                          dataKey="throttle"
                          stroke={driverColors[telemetryDriver1] || "#00D9FF"}
                          name={telemetryDriver1}
                          dot={false}
                          strokeWidth={2}
                          isAnimationActive={false}
                        />
                        <Line
                          data={telemetryData2}
                          type="monotone"
                          dataKey="throttle"
                          stroke={driverColors[telemetryDriver2] || "#FF1E1E"}
                          name={telemetryDriver2}
                          dot={false}
                          strokeWidth={2}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Brake Input Comparison */}
                  <div className="bg-carbon-900/50 rounded-lg p-4">
                    <h4 className="text-sm font-bold text-gray-400 mb-4 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500"></span>
                      Brake Input Comparison
                    </h4>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis
                          dataKey="distance"
                          stroke="#888"
                          type="number"
                          hide
                        />
                        <YAxis
                          stroke="#888"
                          domain={[0, 1]}
                          label={{
                            value: "Brake Applied",
                            angle: -90,
                            position: "insideLeft",
                            fill: "#888",
                          }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1a1a1a",
                            border: "1px solid #333",
                          }}
                          labelStyle={{ color: "#fff" }}
                          formatter={(value: any) => [
                            value ? "ON" : "OFF",
                            "Brake",
                          ]}
                        />
                        <Legend />
                        <Line
                          data={telemetryData1.map((d) => ({
                            ...d,
                            brakeValue: d.brake ? 1 : 0,
                          }))}
                          type="stepAfter"
                          dataKey="brakeValue"
                          stroke={driverColors[telemetryDriver1] || "#00D9FF"}
                          name={telemetryDriver1}
                          dot={false}
                          strokeWidth={2}
                          isAnimationActive={false}
                        />
                        <Line
                          data={telemetryData2.map((d) => ({
                            ...d,
                            brakeValue: d.brake ? 1 : 0,
                          }))}
                          type="stepAfter"
                          dataKey="brakeValue"
                          stroke={driverColors[telemetryDriver2] || "#FF1E1E"}
                          name={telemetryDriver2}
                          dot={false}
                          strokeWidth={2}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* RPM Comparison */}
                  <div className="bg-carbon-900/50 rounded-lg p-4">
                    <h4 className="text-sm font-bold text-gray-400 mb-4 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                      RPM Comparison
                    </h4>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis
                          dataKey="distance"
                          stroke="#888"
                          type="number"
                          hide
                        />
                        <YAxis
                          stroke="#888"
                          label={{
                            value: "Gear",
                            angle: -90,
                            position: "insideLeft",
                            fill: "#888",
                          }}
                          domain={[0, 8]}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1a1a1a",
                            border: "1px solid #333",
                          }}
                          labelStyle={{ color: "#fff" }}
                        />
                        <Legend />
                        <Line
                          data={telemetryData1}
                          type="stepAfter"
                          dataKey="gear"
                          stroke={driverColors[telemetryDriver1] || "#00D9FF"}
                          name={telemetryDriver1}
                          dot={false}
                          strokeWidth={2}
                          isAnimationActive={false}
                        />
                        <Line
                          data={telemetryData2}
                          type="stepAfter"
                          dataKey="gear"
                          stroke={driverColors[telemetryDriver2] || "#FF1E1E"}
                          name={telemetryDriver2}
                          dot={false}
                          strokeWidth={2}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* DRS Usage Comparison */}
                  <div className="bg-carbon-900/50 rounded-lg p-4">
                    <h4 className="text-sm font-bold text-gray-400 mb-4 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                      DRS Usage Comparison
                    </h4>
                    <ResponsiveContainer width="100%" height={300}>
                      <LineChart>
                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                        <XAxis
                          dataKey="distance"
                          stroke="#888"
                          label={{
                            value: "Distance (m)",
                            position: "insideBottom",
                            offset: -5,
                            fill: "#888",
                          }}
                          type="number"
                        />
                        <YAxis
                          stroke="#888"
                          domain={[0, 200]}
                          label={{
                            value: "Delta Speed (km/h)",
                            angle: -90,
                            position: "insideLeft",
                            fill: "#888",
                          }}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1a1a1a",
                            border: "1px solid #333",
                          }}
                          labelStyle={{ color: "#fff" }}
                          formatter={(value: any) => [
                            value.toFixed(2),
                            "Speed",
                          ]}
                        />
                        <Legend />
                        <Line
                          data={telemetryData1.map((d, i) => ({
                            ...d,
                            delta:
                              d.speed && telemetryData2[i]?.speed
                                ? Math.abs(d.speed - telemetryData2[i].speed)
                                : 0,
                          }))}
                          type="monotone"
                          dataKey="speed"
                          stroke="#FFD700"
                          name="Speed Delta"
                          dot={false}
                          strokeWidth={2}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Telemetry Tab */}
      {activeTab === "telemetry" && (
        <div className="space-y-4">
          {/* Driver Selection */}
          <div className="bg-carbon-800 rounded-lg border border-carbon-700 p-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-400">
                  Select Driver:
                </label>
                <select
                  value={telemetryDriver1}
                  onChange={(e) => setTelemetryDriver1(e.target.value)}
                  className="bg-carbon-900 border border-carbon-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-racing-red-500"
                >
                  {sessionResults.map((driver) => (
                    <option key={driver.driver_code} value={driver.driver_code}>
                      {driver.driver_code} - {driver.driver_name}
                    </option>
                  ))}
                </select>
              </div>

            </div>
          </div>

          {loadingTelemetry ? (
            <div className="bg-carbon-800 rounded-lg border border-carbon-700 p-12">
              <div className="flex items-center justify-center">
                <div className="loading-spinner"></div>
              </div>
            </div>
          ) : telemetryData1.length === 0 ? (
            <div className="bg-carbon-800 rounded-lg border border-carbon-700 p-12">
              <div className="text-center text-gray-400">
                No telemetry data available for {telemetryDriver1}.
              </div>
            </div>
          ) : (
            <>
              {/* Title */}
              <div className="bg-carbon-800 rounded-lg border border-carbon-700 p-4">
                <h3 className="text-xl font-display font-bold text-white">
                  {telemetryDriver1}'s {selectedTelemetryLap === "fastest" ? "Fastest Lap" : `Lap ${selectedTelemetryLap}`} Analysis
                </h3>
                <p className="text-sm text-gray-400 mt-1">
                  Detailed telemetry breakdown for lap {telemetryData1[0]?.lap_number || 'N/A'}
                </p>
              </div>

              {/* Top Row - Speed and Gear Shifts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Speed Trace */}
                <div className="bg-carbon-800 rounded-lg border border-carbon-700 p-4">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-sm font-bold text-gray-400 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-cyan-500"></span>
                      {telemetryDriver1}'s {selectedTelemetryLap === "fastest" ? "Fastest Lap" : `Lap ${selectedTelemetryLap}`} Speed Trace
                    </h4>
                    <div className="flex gap-2">
                      <select 
                        className="bg-carbon-900 border border-carbon-700 rounded px-2 py-1 text-xs text-white"
                        defaultValue="ALO"
                      >
                        <option value={telemetryDriver1}>{telemetryDriver1}</option>
                      </select>
                      <button className="bg-carbon-900 border border-carbon-700 rounded px-2 py-1 text-xs text-white flex items-center gap-1">
                        <span>⏱️</span> Fastest
                      </button>
                    </div>
                  </div>

                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis
                        dataKey="distance"
                        stroke="#888"
                        type="number"
                        label={{
                          value: "Distance (m)",
                          position: "insideBottom",
                          offset: -5,
                          fill: "#888",
                        }}
                      />
                      <YAxis
                        stroke="#888"
                        label={{
                          value: "Speed (km/h)",
                          angle: -90,
                          position: "insideLeft",
                          fill: "#888",
                        }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1a1a1a",
                          border: "1px solid #333",
                        }}
                        labelStyle={{ color: "#fff" }}
                      />
                      <Line
                        data={telemetryData1}
                        type="monotone"
                        dataKey="speed"
                        stroke="#00D9FF"
                        name="Speed"
                        dot={false}
                        strokeWidth={2}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>

                  <div className="flex justify-end mt-2">
                     <button className="flex items-center gap-1 text-xs text-gray-400 hover:text-white border border-carbon-600 rounded px-2 py-1 transition-colors">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download Chart
                    </button>
                  </div>
                </div>

                {/* Gear Shifts on Track Map */}
                <div className="bg-carbon-800 rounded-lg border border-carbon-700 p-4">
                  <h4 className="text-sm font-bold text-gray-300 mb-1">
                    {telemetryDriver1} — {selectedTelemetryLap === "fastest" ? "Fastest Lap" : `Lap ${selectedTelemetryLap}`} Gear Shift Visualization
                  </h4>
                  <p className="text-xs text-gray-500 mb-3">Gear used at each point on track</p>

                  {(() => {
                    // matplotlib "Paired" colormap — same as FastF1 example
                    const GEAR_COLORS: Record<number, string> = {
                      1: "#a6cee3",
                      2: "#1f78b4",
                      3: "#b2df8a",
                      4: "#33a02c",
                      5: "#fb9a99",
                      6: "#e31a1c",
                      7: "#fdbf6f",
                      8: "#ff7f00",
                    };

                    type GPt = { x: number; y: number; gear: number };
                    let pts: GPt[] = [];

                    if (circuitCoords && circuitCoords.x.length > 2) {
                      const cirPts = circuitCoords.x.map((x, i) => ({ x, y: circuitCoords!.y[i] }));

                      const cirDist: number[] = [0];
                      for (let i = 1; i < cirPts.length; i++) {
                        const dx = cirPts[i].x - cirPts[i-1].x, dy = cirPts[i].y - cirPts[i-1].y;
                        cirDist.push(cirDist[i-1] + Math.sqrt(dx*dx + dy*dy));
                      }
                      const totalCirDist = cirDist[cirDist.length - 1] || 1;

                      const tel = telemetryData1.filter(p => p.distance != null && p.gear != null);
                      const maxTelDist = tel.length > 0 ? Math.max(...tel.map(p => p.distance as number)) : 1;

                      pts = cirPts.map((cp, i) => {
                        const frac = cirDist[i] / totalCirDist;
                        const targetDist = frac * maxTelDist;
                        let lo = 0, hi = tel.length - 1, best = 0;
                        while (lo <= hi) {
                          const mid = (lo + hi) >> 1;
                          if ((tel[mid].distance as number) < targetDist) { best = mid; lo = mid + 1; }
                          else hi = mid - 1;
                        }
                        return { x: cp.x, y: cp.y, gear: (tel[best]?.gear as number) ?? 1 };
                      });
                    } else {
                      pts = telemetryData1
                        .filter((p) => p.x != null && p.y != null)
                        .map(p => ({ x: p.x as number, y: p.y as number, gear: (p.gear as number) ?? 1 }));
                    }

                    if (pts.length < 2) {
                      return <div className="h-[320px] flex items-center justify-center text-gray-500 text-sm">No telemetry data</div>;
                    }

                    const minX = pts.reduce((m, p) => Math.min(m, p.x), Infinity);
                    const maxX = pts.reduce((m, p) => Math.max(m, p.x), -Infinity);
                    const minY = pts.reduce((m, p) => Math.min(m, p.y), Infinity);
                    const maxY = pts.reduce((m, p) => Math.max(m, p.y), -Infinity);

                    // Reserve right side for colorbar
                    const cbW = 48;  // colorbar column width
                    const pad = 20, W = 580, H = 320;
                    const trackW = W - cbW - pad;
                    const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
                    const scale = Math.min((trackW - 2*pad) / rangeX, (H - 2*pad) / rangeY);
                    const offX = pad + ((trackW - 2*pad) - rangeX * scale) / 2;
                    const offY = pad + ((H - 2*pad) - rangeY * scale) / 2;
                    const sx = (x: number) => offX + (x - minX) * scale;
                    const sy = (y: number) => H - offY - (y - minY) * scale;

                    // Colorbar geometry
                    const cbX = trackW + 8;
                    const cbBarW = 14;
                    const cbTop = 20, cbBottom = H - 20;
                    const cbHeight = cbBottom - cbTop;
                    const gears = [8, 7, 6, 5, 4, 3, 2, 1];
                    const segH = cbHeight / gears.length;

                    return (
                      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", background: "#0d1117", borderRadius: 8 }}>
                        {/* Track segments colored by gear */}
                        {pts.slice(1).map((pt, i) => {
                          const prev = pts[i];
                          return (
                            <line
                              key={i}
                              x1={sx(prev.x)} y1={sy(prev.y)}
                              x2={sx(pt.x)}   y2={sy(pt.y)}
                              stroke={GEAR_COLORS[pt.gear] ?? "#888"}
                              strokeWidth={4}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          );
                        })}

                        {/* Colorbar */}
                        {gears.map((g, idx) => (
                          <rect
                            key={g}
                            x={cbX}
                            y={cbTop + idx * segH}
                            width={cbBarW}
                            height={segH}
                            fill={GEAR_COLORS[g] ?? "#888"}
                          />
                        ))}
                        {/* Colorbar border */}
                        <rect x={cbX} y={cbTop} width={cbBarW} height={cbHeight} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={0.5} />

                        {/* Colorbar tick labels */}
                        {gears.map((g, idx) => (
                          <text
                            key={g}
                            x={cbX + cbBarW + 5}
                            y={cbTop + (idx + 0.5) * segH + 4}
                            fill="rgba(255,255,255,0.7)"
                            fontSize={9}
                            fontFamily="monospace"
                          >{g}</text>
                        ))}
                        {/* Colorbar label */}
                        <text
                          x={cbX + cbBarW / 2}
                          y={cbTop - 6}
                          fill="rgba(255,255,255,0.5)"
                          fontSize={8}
                          fontFamily="monospace"
                          textAnchor="middle"
                        >Gear</text>
                      </svg>
                    );
                  })()}
                </div>
              </div>

              {/* Middle Row - Throttle and Brake */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Throttle Input */}
                <div className="bg-carbon-800 rounded-lg border border-carbon-700 p-4">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-sm font-bold text-gray-400 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-green-500"></span>
                      {telemetryDriver1}'s {selectedTelemetryLap === "fastest" ? "Fastest Lap" : `Lap ${selectedTelemetryLap}`} Throttle Input
                    </h4>
                    <div className="flex gap-2">
                      <select 
                        className="bg-carbon-900 border border-carbon-700 rounded px-2 py-1 text-xs text-white"
                        defaultValue="ALO"
                      >
                        <option value={telemetryDriver1}>{telemetryDriver1}</option>
                      </select>
                      <button className="bg-carbon-900 border border-carbon-700 rounded px-2 py-1 text-xs text-white flex items-center gap-1">
                        <span>⏱️</span> Fastest
                      </button>
                    </div>
                  </div>

                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={telemetryData1}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis
                        dataKey="distance"
                        stroke="#888"
                        type="number"
                        hide
                      />
                      <YAxis
                        stroke="#888"
                        domain={[0, 100]}
                        label={{
                          value: "Throttle %",
                          angle: -90,
                          position: "insideLeft",
                          fill: "#888",
                        }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1a1a1a",
                          border: "1px solid #333",
                        }}
                        labelStyle={{ color: "#fff" }}
                      />
                      <Area
                        type="monotone"
                        dataKey="throttle"
                        stroke="#22c55e"
                        fill="#22c55e"
                        fillOpacity={0.3}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>

                  <div className="flex justify-end mt-2">
                     <button className="flex items-center gap-1 text-xs text-gray-400 hover:text-white border border-carbon-600 rounded px-2 py-1 transition-colors">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download Chart
                    </button>
                  </div>
                </div>

                {/* Brake Input */}
                <div className="bg-carbon-800 rounded-lg border border-carbon-700 p-4">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-sm font-bold text-gray-400 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-red-500"></span>
                      {telemetryDriver1}'s {selectedTelemetryLap === "fastest" ? "Fastest Lap" : `Lap ${selectedTelemetryLap}`} Brake Input
                    </h4>
                    <div className="flex gap-2">
                      <select 
                        className="bg-carbon-900 border border-carbon-700 rounded px-2 py-1 text-xs text-white"
                        defaultValue="ALO"
                      >
                        <option value={telemetryDriver1}>{telemetryDriver1}</option>
                      </select>
                      <button className="bg-carbon-900 border border-carbon-700 rounded px-2 py-1 text-xs text-white flex items-center gap-1">
                        <span>⏱️</span> Fastest
                      </button>
                    </div>
                  </div>

                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={telemetryData1.map(d => ({ ...d, brakeValue: d.brake ? 100 : 0 }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                      <XAxis
                        dataKey="distance"
                        stroke="#888"
                        type="number"
                        hide
                      />
                      <YAxis
                        stroke="#888"
                        domain={[0, 100]}
                        label={{
                          value: "Brake",
                          angle: -90,
                          position: "insideLeft",
                          fill: "#888",
                        }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1a1a1a",
                          border: "1px solid #333",
                        }}
                        labelStyle={{ color: "#fff" }}
                        formatter={(value: any) => [value ? "ON" : "OFF", "Brake"]}
                      />
                      <Area
                        type="step"
                        dataKey="brakeValue"
                        stroke="#ef4444"
                        fill="#ef4444"
                        fillOpacity={0.3}
                        isAnimationActive={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>

                  <div className="flex justify-end mt-2">
                     <button className="flex items-center gap-1 text-xs text-gray-400 hover:text-white border border-carbon-600 rounded px-2 py-1 transition-colors">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download Chart
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Race Replay Tab */}
      {activeTab === "replay" && (
        <div className="space-y-4">
          {loadingReplay ? (
            <div className="bg-carbon-800 rounded-lg border border-carbon-700 p-12">
              <div className="flex items-center justify-center">
                <div className="loading-spinner"></div>
              </div>
            </div>
          ) : (
            <RaceReplay
              race={race}
              positionData={replayLaps}
              driverColors={driverColors}
              weatherSummary={weatherSummary}
              driverInfo={replayDrivers}
              drsTelemetry={drsTelemetry}
            />
          )}
        </div>
      )}

      {/* Placeholder for other tabs */}
      {!["results", "positions", "strategy", "laps", "dominance", "telemetry", "replay"].includes(
        activeTab
      ) && (
        <div className="bg-carbon-800 rounded-lg border border-carbon-700 p-12">
          <div className="text-center">
            <div className="text-6xl mb-4">🚧</div>
            <h3 className="text-xl font-bold text-white mb-2">Coming Soon</h3>
            <p className="text-gray-400">
              The {activeTab} tab is currently under development.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
