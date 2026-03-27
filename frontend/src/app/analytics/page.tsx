'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { useDataVersion } from '@/lib/useDataVersion';
import type { Race, DriverStanding, ConstructorStanding, PaceAnalysis, TireStrategy, SectorAnalysis } from '@/types';

const TEAM_COLORS: Record<string, string> = {
  'Red Bull Racing': '#1B1F5F', 'Mercedes': '#00857C', 'Ferrari': '#DC0000',
  'McLaren': '#E8610D', 'Aston Martin': '#006F62', 'Alpine': '#E4006D',
  'Williams': '#005AFF', 'AlphaTauri': '#2B4562', 'RB': '#1435A0',
  'Racing Bulls': '#1435A0', 'Alfa Romeo': '#9B0000', 'Sauber': '#00CF74',
  'Kick Sauber': '#00CF74', 'Haas F1 Team': '#3D3D3D', 'Haas': '#3D3D3D',
  'Toro Rosso': '#2B4562', 'Force India': '#FF80C7', 'Racing Point': '#F596C8',
  'Renault': '#FFD700',
};

const COMPOUND_COLOR: Record<string, string> = {
  SOFT: '#e8002d', MEDIUM: '#ffd700', HARD: '#d0d0d0',
  INTERMEDIATE: '#39b54a', WET: '#0067ff',
};

function getTeamColor(name?: string): string {
  if (!name) return '#dc0000';
  for (const [k, v] of Object.entries(TEAM_COLORS)) {
    if (name.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return '#dc0000';
}

function compoundColor(c: string): string {
  return COMPOUND_COLOR[c?.toUpperCase()] ?? '#888';
}

function compoundLabel(c: string): string {
  if (!c) return '?';
  return c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
}

function fmtTime(sec?: number): string {
  if (!sec || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(3).padStart(6, '0');
  return m > 0 ? `${m}:${s}` : s;
}

function shortRaceName(name: string): string {
  return name.replace(' Grand Prix', ' GP').replace('Grand Prix', 'GP');
}

function metricLabel(metric: 'points' | 'wins' | 'podiums'): string {
  if (metric === 'wins') return 'Wins';
  if (metric === 'podiums') return 'Podiums';
  return 'Points';
}

export default function AnalyticsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const refreshKey = useDataVersion();

  const seasonFromUrl = searchParams.get('season');
  const [selectedSeason, setSelectedSeason] = useState(seasonFromUrl ? Number(seasonFromUrl) : 2021);

  const [availableSeasons, setAvailableSeasons] = useState<number[]>([]);
  const [races, setRaces] = useState<Race[]>([]);
  const [driverStandings, setDriverStandings] = useState<DriverStanding[]>([]);
  const [constructorStandings, setConstructorStandings] = useState<ConstructorStanding[]>([]);
  const [selectedRaceId, setSelectedRaceId] = useState<number | null>(null);
  const [paceAnalysis, setPaceAnalysis] = useState<PaceAnalysis[]>([]);
  const [tireStrategies, setTireStrategies] = useState<TireStrategy[]>([]);
  const [sectorAnalysis, setSectorAnalysis] = useState<SectorAnalysis[]>([]);
  const [raceDetailLoading, setRaceDetailLoading] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<'points' | 'wins' | 'podiums'>('points');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    router.push(`/analytics?season=${selectedSeason}`, { scroll: false });
  }, [selectedSeason, router]);

  useEffect(() => {
    api.getSeasons().then(years => {
      setAvailableSeasons(years);
      if (!seasonFromUrl) setSelectedSeason(years[0] ?? 2021);
    }).catch(() => {});
  }, [refreshKey, seasonFromUrl]);

  useEffect(() => {
    if (!selectedSeason) return;
    setLoading(true);
    setPaceAnalysis([]);
    setSectorAnalysis([]);
    setTireStrategies([]);

    Promise.all([
      api.getRaces(selectedSeason),
      api.getDriverStandings(selectedSeason).catch(() => [] as DriverStanding[]),
      api.getConstructorStandings(selectedSeason).catch(() => [] as ConstructorStanding[]),
    ])
      .then(([racesData, driverData, constructorData]) => {
        setRaces(racesData);
        setDriverStandings(driverData);
        setConstructorStandings(constructorData);
        const firstCompleted = racesData.find(r => r.winner_name);
        setSelectedRaceId(firstCompleted?.id ?? racesData[0]?.id ?? null);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedSeason, refreshKey]);

  useEffect(() => {
    if (!selectedRaceId) return;
    setRaceDetailLoading(true);
    setPaceAnalysis([]);
    setSectorAnalysis([]);
    setTireStrategies([]);

    api.getSessions(selectedRaceId)
      .then(sessions => {
        const raceSession = sessions.find(s => s.session_type === 'Race');
        if (!raceSession) return null;

        return Promise.all([
          api.getPaceAnalysis(raceSession.id).catch(() => [] as PaceAnalysis[]),
          api.getTireStrategies(raceSession.id).catch(() => [] as TireStrategy[]),
          api.getSectorAnalysis(raceSession.id).catch(() => [] as SectorAnalysis[]),
        ]);
      })
      .then(results => {
        if (!results) return;
        setPaceAnalysis(results[0]);
        setTireStrategies(results[1]);
        setSectorAnalysis(results[2]);
      })
      .catch(console.error)
      .finally(() => setRaceDetailLoading(false));
  }, [selectedRaceId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="loading-spinner" />
      </div>
    );
  }

  const selectedRace = races.find(r => r.id === selectedRaceId);
  const completedRaces = races.filter(r => r.winner_name);
  const completionRate = races.length ? Math.round((completedRaces.length / races.length) * 100) : 0;
  const uniqueWinners = new Set(completedRaces.map(r => r.winner_name)).size;
  const champion = driverStandings[0];
  const constructorChampion = constructorStandings[0];
  const top10 = driverStandings.slice(0, 10);
  const avgTop10Points = top10.length ? (top10.reduce((sum, d) => sum + d.points, 0) / top10.length).toFixed(1) : '0.0';

  const driverMetricValue = (d: DriverStanding) =>
    selectedMetric === 'wins' ? d.wins : selectedMetric === 'podiums' ? d.podiums : d.points;
  const driverMetricMax = Math.max(...driverStandings.map(driverMetricValue), 1);
  const metricColor = selectedMetric === 'wins' ? '#facc15' : selectedMetric === 'podiums' ? '#60a5fa' : '#4ade80';

  const stratByDriver = tireStrategies.reduce<Record<string, TireStrategy[]>>((acc, s) => {
    (acc[s.driver_code] ??= []).push(s);
    return acc;
  }, {});
  const totalLaps = tireStrategies.length > 0 ? Math.max(...tireStrategies.map(s => s.stint_end)) : 0;

  const validS1 = sectorAnalysis.filter(s => s.sector1_best && s.sector1_best > 0).map(s => s.sector1_best!);
  const validS2 = sectorAnalysis.filter(s => s.sector2_best && s.sector2_best > 0).map(s => s.sector2_best!);
  const validS3 = sectorAnalysis.filter(s => s.sector3_best && s.sector3_best > 0).map(s => s.sector3_best!);
  const bestS1 = validS1.length ? Math.min(...validS1) : Infinity;
  const bestS2 = validS2.length ? Math.min(...validS2) : Infinity;
  const bestS3 = validS3.length ? Math.min(...validS3) : Infinity;

  const sortedPace = [...paceAnalysis].sort((a, b) => (a.best_lap_time ?? 999) - (b.best_lap_time ?? 999));
  const fastestLap = sortedPace[0]?.best_lap_time ?? 0;
  const slowestLap = sortedPace[sortedPace.length - 1]?.best_lap_time ?? fastestLap;
  const paceSpan = Math.max(0.001, slowestLap - fastestLap);
  const paceTicks = Array.from({ length: 6 }, (_, i) => fastestLap + (paceSpan * i) / 5);
  const sortedSector = [...sectorAnalysis].sort((a, b) => (a.sector1_best ?? 999) - (b.sector1_best ?? 999));

  return (
    <div className="space-y-7 animate-fade-in pb-10">
      <section className="relative overflow-hidden rounded-3xl border border-carbon-700 bg-carbon-900 p-6 md:p-8">
        <div className="pointer-events-none absolute -top-16 -right-16 h-56 w-56 rounded-full bg-racing-red-700/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-sky-500/10 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3 max-w-2xl">
            <div className="text-[11px] uppercase tracking-[0.2em] text-racing-red-300 font-bold">Intelligence Center</div>
            <h1 className="text-4xl md:text-5xl font-black leading-none text-white">Season Analytics</h1>
            <p className="text-sm md:text-base text-gray-300">
              Championship momentum, race pace trends, compound usage, and sector-level performance for the {selectedSeason} campaign.
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
              <span className="rounded-full border border-carbon-600 bg-carbon-950/60 px-3 py-1">{races.length} races on calendar</span>
              <span className="rounded-full border border-carbon-600 bg-carbon-950/60 px-3 py-1">{completedRaces.length} completed</span>
              <span className="rounded-full border border-carbon-600 bg-carbon-950/60 px-3 py-1">{uniqueWinners} unique winners</span>
            </div>
          </div>

          <div className="rounded-2xl border border-carbon-600 bg-carbon-950/80 p-3.5 w-full lg:w-auto">
            <div className="mb-2 text-[10px] uppercase tracking-widest text-gray-500">Season Filter</div>
            <div className="flex flex-wrap gap-2 max-w-[380px]">
              {[...availableSeasons].reverse().map(yr => (
                <button
                  key={yr}
                  onClick={() => setSelectedSeason(yr)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                    selectedSeason === yr
                      ? 'bg-racing-red-600 text-white shadow-[0_0_14px_rgba(225,6,0,0.38)]'
                      : 'border border-carbon-600 bg-carbon-800 text-gray-300 hover:border-carbon-500 hover:text-white'
                  }`}
                >
                  {yr}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <div className="rounded-2xl border border-carbon-700 bg-gradient-to-br from-carbon-900 via-carbon-900 to-carbon-800 p-4">
          <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Drivers Champion</div>
          <div className="text-xl font-black text-white truncate">{champion ? champion.driver_name : '—'}</div>
          <div className="text-xs mt-1 truncate" style={{ color: champion ? getTeamColor(champion.team_name) : '#9ca3af' }}>
            {champion?.team_name ?? 'No team data'}
          </div>
          <div className="mt-2 text-2xl font-black text-track-green">{champion?.points ?? '—'}<span className="ml-1 text-xs text-gray-500 font-normal">pts</span></div>
        </div>

        <div className="rounded-2xl border border-carbon-700 bg-gradient-to-br from-carbon-900 via-carbon-900 to-carbon-800 p-4">
          <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Constructors Champion</div>
          <div className="text-xl font-black text-white truncate">{constructorChampion?.team_name ?? '—'}</div>
          <div className="text-xs text-gray-400 mt-1">{constructorChampion?.wins ?? 0} wins this season</div>
          <div className="mt-2 text-2xl font-black text-yellow-400">{constructorChampion?.points ?? '—'}<span className="ml-1 text-xs text-gray-500 font-normal">pts</span></div>
        </div>

        <div className="rounded-2xl border border-carbon-700 bg-gradient-to-br from-carbon-900 via-carbon-900 to-carbon-800 p-4">
          <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Calendar Completion</div>
          <div className="text-3xl font-black text-white">{completionRate}%</div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-carbon-700">
            <div className="h-full rounded-full bg-gradient-to-r from-racing-red-500 to-orange-400" style={{ width: `${completionRate}%` }} />
          </div>
          <div className="mt-1 text-xs text-gray-400">{completedRaces.length} of {races.length} rounds</div>
        </div>

        <div className="rounded-2xl border border-carbon-700 bg-gradient-to-br from-carbon-900 via-carbon-900 to-carbon-800 p-4">
          <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Top-10 Avg Points</div>
          <div className="text-3xl font-black text-white">{avgTop10Points}</div>
          <div className="text-xs text-gray-400 mt-1">Competitive depth snapshot</div>
        </div>

        <div className="rounded-2xl border border-carbon-700 bg-gradient-to-br from-carbon-900 via-carbon-900 to-carbon-800 p-4">
          <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">Race Winner Variety</div>
          <div className="text-3xl font-black text-white">{uniqueWinners}</div>
          <div className="text-xs text-gray-400 mt-1">Unique winning drivers this year</div>
        </div>
      </section>

      <section className="grid grid-cols-1 xl:grid-cols-5 gap-5">
        <div className="xl:col-span-2 rounded-2xl border border-carbon-700 bg-carbon-900 p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-black text-white">Constructor Battle</h2>
            <span className="text-xs text-gray-500">Vertical points chart</span>
          </div>
          {constructorStandings.length === 0 ? (
            <div className="text-center text-sm text-gray-500 py-10">No standings data for this season.</div>
          ) : (
            <div className="overflow-x-auto pb-1 custom-scrollbar">
              <div className="min-w-[620px]">
                <div className="h-64 rounded-xl border border-carbon-700 bg-carbon-950/70 p-3">
                  <div className="flex h-full items-end gap-2.5">
                    {constructorStandings.map((team, i) => {
                      const leaderPoints = constructorStandings[0]?.points || 1;
                      const pct = (team.points / leaderPoints) * 100;
                      const tc = getTeamColor(team.team_name);
                      return (
                        <div key={team.team_name} className="flex min-w-[46px] flex-1 flex-col items-center justify-end">
                          <div className="mb-1 text-[10px] font-bold text-track-green">{team.points}</div>
                          <div className="relative h-44 w-full overflow-hidden rounded-t-md bg-carbon-800">
                            <div
                              className="absolute bottom-0 w-full rounded-t-md"
                              style={{ height: `${Math.max(4, pct)}%`, background: tc, opacity: 0.9 }}
                            />
                          </div>
                          <div className="mt-1 text-[10px] text-gray-500">#{i + 1}</div>
                          <div className="w-full truncate text-center text-[10px] font-semibold text-gray-300" title={team.team_name}>
                            {team.team_name.replace(' Racing', '').replace(' F1 Team', '')}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="xl:col-span-3 rounded-2xl border border-carbon-700 bg-carbon-900 p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-black text-white">Driver Championship Matrix</h2>
            <div className="flex gap-2">
              {(['points', 'wins', 'podiums'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setSelectedMetric(m)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                    selectedMetric === m
                      ? 'bg-racing-red-600 text-white'
                      : 'border border-carbon-600 bg-carbon-800 text-gray-300 hover:text-white'
                  }`}
                >
                  {metricLabel(m)}
                </button>
              ))}
            </div>
          </div>

          {driverStandings.length === 0 ? (
            <div className="text-center text-sm text-gray-500 py-10">No standings data for this season.</div>
          ) : (
            <div className="overflow-x-auto pb-1 custom-scrollbar">
              <div className="min-w-[980px]">
                <div className="h-72 rounded-xl border border-carbon-700 bg-carbon-950/70 p-3">
                  <div className="flex h-full items-end gap-2">
                    {driverStandings.map((driver, i) => {
                      const val = driverMetricValue(driver);
                      const pct = driverMetricMax > 0 ? (val / driverMetricMax) * 100 : 0;
                      const tc = getTeamColor(driver.team_name);
                      return (
                        <div key={driver.driver_code} className="flex w-[36px] shrink-0 flex-col items-center justify-end">
                          <div className="mb-1 text-[10px] font-bold" style={{ color: metricColor }}>{val}</div>
                          <div className="relative h-52 w-full overflow-hidden rounded-t-sm bg-carbon-800">
                            <div
                              className="absolute bottom-0 w-full rounded-t-sm"
                              style={{ height: `${Math.max(2, pct)}%`, background: tc, opacity: 0.86 }}
                            />
                          </div>
                          <div className="mt-1 text-[10px] text-gray-500">{i + 1}</div>
                          <div className="text-[10px] font-mono font-bold" style={{ color: tc }}>{driver.driver_code}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-carbon-700 bg-carbon-900 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-white">Race Analysis Control</h2>
            <p className="text-xs text-gray-400 mt-1">Select a round to render pace, tyre and sector intelligence below.</p>
          </div>
          <div className="rounded-lg border border-carbon-700 bg-carbon-950/80 px-3 py-2 text-xs text-gray-300">
            {selectedRace
              ? `${shortRaceName(selectedRace.name)} • ${selectedRace.winner_name ? `Winner: ${selectedRace.winner_name}` : 'No winner recorded yet'}`
              : 'No race selected'}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 gap-2.5">
          {races.map(race => (
            <button
              key={race.id}
              onClick={() => setSelectedRaceId(race.id)}
              className={`rounded-xl border px-3 py-2.5 text-left transition-all ${
                selectedRaceId === race.id
                  ? 'border-racing-red-500 bg-racing-red-500/10 shadow-[0_0_0_1px_rgba(225,6,0,0.25)_inset]'
                  : 'border-carbon-700 bg-carbon-950/60 hover:border-carbon-600'
              }`}
            >
              <div className="text-[10px] text-gray-500">Round {race.round_number}</div>
              <div className="mt-0.5 truncate text-xs font-semibold text-white">{shortRaceName(race.name)}</div>
              <div className="mt-1 truncate text-[10px]" style={{ color: race.winner_team ? getTeamColor(race.winner_team) : '#9ca3af' }}>
                {race.winner_name ? race.winner_name : 'Pending'}
              </div>
            </button>
          ))}
        </div>
      </section>

      {selectedRaceId && (
        raceDetailLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="loading-spinner" />
          </div>
        ) : (
          <section className="space-y-5">
            <div className="rounded-2xl border border-carbon-700 bg-carbon-900 p-5">
              <h3 className="text-2xl font-black text-white">
                Pace Gradient
                <span className="ml-2 text-base font-medium text-racing-red-400">{selectedRace?.name}</span>
              </h3>
              <p className="mt-1 text-xs text-gray-400">Technical interval plot: colored dot = best lap, gray square = average lap, connector shows consistency spread.</p>

              {sortedPace.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-500">No pace data available for this race.</div>
              ) : (
                <div className="mt-5 rounded-xl border border-carbon-700 bg-carbon-950/55 p-3">
                  <div className="hidden sm:block pl-[74px] pr-[170px] mb-2">
                    <div className="relative h-5">
                      {paceTicks.map((tick, idx) => {
                        const left = `${(idx / (paceTicks.length - 1)) * 100}%`;
                        return (
                          <div key={idx} className="absolute -translate-x-1/2" style={{ left }}>
                            <div className="h-2.5 w-px bg-carbon-500 mx-auto" />
                            <div className="text-[10px] text-gray-500 font-mono mt-0.5 whitespace-nowrap">{fmtTime(tick)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {sortedPace.map((d, i) => {
                      const stand = driverStandings.find(s => s.driver_code === d.driver_code);
                      const tc = getTeamColor(stand?.team_name);
                      const gapToFastest = d.best_lap_time - fastestLap;
                      const bestPos = ((d.best_lap_time - fastestLap) / paceSpan) * 100;
                      const avgLap = d.avg_lap_time ?? d.best_lap_time;
                      const avgPos = ((avgLap - fastestLap) / paceSpan) * 100;
                      const leftPos = Math.min(bestPos, avgPos);
                      const widthPos = Math.max(1, Math.abs(avgPos - bestPos));

                      return (
                        <div key={d.driver_code} className="grid grid-cols-[20px_42px_1fr_158px] items-center gap-3">
                          <span className="text-right text-xs text-gray-500">{i + 1}</span>
                          <span className="font-mono text-xs font-black" style={{ color: tc }}>{d.driver_code}</span>

                          <div className="relative h-8 rounded-md border border-carbon-700 bg-carbon-900/80 overflow-hidden">
                            {Array.from({ length: 6 }).map((_, gi) => (
                              <div
                                key={gi}
                                className="absolute top-0 h-full w-px bg-carbon-700/70"
                                style={{ left: `${(gi / 5) * 100}%` }}
                              />
                            ))}

                            <div
                              className="absolute top-1/2 -translate-y-1/2 h-[2px] bg-slate-300/70"
                              style={{ left: `${leftPos}%`, width: `${widthPos}%` }}
                            />

                            <div
                              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border border-white/70"
                              style={{ left: `calc(${bestPos}% - 5px)`, background: tc }}
                              title={`Best: ${fmtTime(d.best_lap_time)}`}
                            />

                            <div
                              className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-[2px] border border-slate-300/90 bg-slate-300"
                              style={{ left: `calc(${avgPos}% - 5px)` }}
                              title={`Average: ${fmtTime(avgLap)}`}
                            />
                          </div>

                          <div className="text-right">
                            <div className="font-mono text-[11px] text-white">{fmtTime(d.best_lap_time)}</div>
                            <div className="font-mono text-[10px] text-gray-500">avg {fmtTime(avgLap)}</div>
                            <div className="font-mono text-[10px]" style={{ color: i === 0 ? '#facc15' : '#9ca3af' }}>
                              {i === 0 ? 'fastest' : `+${gapToFastest.toFixed(3)}`}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-4 text-[10px] text-gray-400">
                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-track-blue border border-white/70" /> Best lap</div>
                    <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[2px] bg-slate-300 border border-slate-200" /> Average lap</div>
                    <div className="flex items-center gap-1.5"><span className="w-4 h-[2px] bg-slate-300/70" /> Consistency spread</div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-carbon-700 bg-carbon-900 p-5">
              <h3 className="text-2xl font-black text-white">
                Tyre Storyline
                <span className="ml-2 text-base font-medium text-racing-red-400">{selectedRace?.name}</span>
              </h3>
              <p className="mt-1 text-xs text-gray-400">Compound sequence and stint length across the race distance ({totalLaps} laps).</p>

              <div className="mt-3 flex flex-wrap gap-3">
                {Object.entries(COMPOUND_COLOR).map(([name, color]) => (
                  <div key={name} className="flex items-center gap-1.5 text-xs text-gray-400">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
                    {compoundLabel(name)}
                  </div>
                ))}
              </div>

              {Object.keys(stratByDriver).length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-500">No strategy data available for this race.</div>
              ) : (
                <div className="mt-4 space-y-2.5">
                  {Object.entries(stratByDriver).map(([code, stints]) => {
                    const stand = driverStandings.find(s => s.driver_code === code);
                    const tc = getTeamColor(stand?.team_name);
                    const sorted = [...stints].sort((a, b) => a.stint_start - b.stint_start);
                    return (
                      <div key={code} className="grid grid-cols-[40px_1fr_102px] items-center gap-2.5">
                        <span className="font-mono text-xs font-black" style={{ color: tc }}>{code}</span>
                        <div className="flex h-6 gap-px overflow-hidden rounded bg-carbon-800">
                          {sorted.map((stint, si) => {
                            const lapWidth = totalLaps > 0 ? ((stint.stint_end - stint.stint_start + 1) / totalLaps) * 100 : 0;
                            return (
                              <div
                                key={si}
                                className="h-full"
                                style={{ width: `${lapWidth}%`, background: compoundColor(stint.compound), opacity: 0.9 }}
                                title={`${compoundLabel(stint.compound)}: L${stint.stint_start}–${stint.stint_end} | avg ${fmtTime(stint.avg_lap_time)}`}
                              />
                            );
                          })}
                        </div>
                        <span className="text-right text-[11px] text-gray-500">{sorted.map(s => compoundLabel(s.compound).charAt(0)).join(' → ')}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-carbon-700 bg-carbon-900 p-5">
              <h3 className="text-2xl font-black text-white">
                Sector Intelligence
                <span className="ml-2 text-base font-medium text-racing-red-400">{selectedRace?.name}</span>
              </h3>
              <p className="mt-1 text-xs text-gray-400">Purple values mark absolute best sectors of the selected race.</p>

              {sortedSector.length === 0 ? (
                <div className="py-10 text-center text-sm text-gray-500">No sector data available for this race.</div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-carbon-700">
                        <th className="px-2 py-2 text-left font-semibold text-gray-400">Driver</th>
                        <th className="px-2 py-2 text-right font-semibold text-blue-400">S1 Best</th>
                        <th className="px-2 py-2 text-right font-semibold text-blue-300/60">S1 Avg</th>
                        <th className="px-2 py-2 text-right font-semibold text-yellow-400">S2 Best</th>
                        <th className="px-2 py-2 text-right font-semibold text-yellow-300/60">S2 Avg</th>
                        <th className="px-2 py-2 text-right font-semibold text-green-400">S3 Best</th>
                        <th className="px-2 py-2 text-right font-semibold text-green-300/60">S3 Avg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedSector.map(s => {
                        const stand = driverStandings.find(ds => ds.driver_code === s.driver_code);
                        const tc = getTeamColor(stand?.team_name);
                        return (
                          <tr key={s.driver_code} className="border-b border-carbon-700/35 hover:bg-carbon-800/45">
                            <td className="px-2 py-2"><span className="font-mono font-bold" style={{ color: tc }}>{s.driver_code}</span></td>
                            <td className={`px-2 py-2 text-right font-mono ${s.sector1_best === bestS1 ? 'font-bold text-purple-400' : 'text-blue-400'}`}>{fmtTime(s.sector1_best)}</td>
                            <td className="px-2 py-2 text-right font-mono text-blue-300/60">{fmtTime(s.sector1_avg)}</td>
                            <td className={`px-2 py-2 text-right font-mono ${s.sector2_best === bestS2 ? 'font-bold text-purple-400' : 'text-yellow-400'}`}>{fmtTime(s.sector2_best)}</td>
                            <td className="px-2 py-2 text-right font-mono text-yellow-300/60">{fmtTime(s.sector2_avg)}</td>
                            <td className={`px-2 py-2 text-right font-mono ${s.sector3_best === bestS3 ? 'font-bold text-purple-400' : 'text-green-400'}`}>{fmtTime(s.sector3_best)}</td>
                            <td className="px-2 py-2 text-right font-mono text-green-300/60">{fmtTime(s.sector3_avg)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-carbon-600 bg-carbon-950/60">
                        <td className="px-2 py-2 font-bold text-purple-400">Best</td>
                        <td className="px-2 py-2 text-right font-mono font-bold text-purple-400">{fmtTime(bestS1 === Infinity ? undefined : bestS1)}</td>
                        <td />
                        <td className="px-2 py-2 text-right font-mono font-bold text-purple-400">{fmtTime(bestS2 === Infinity ? undefined : bestS2)}</td>
                        <td />
                        <td className="px-2 py-2 text-right font-mono font-bold text-purple-400">{fmtTime(bestS3 === Infinity ? undefined : bestS3)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </section>
        )
      )}

      <section className="rounded-2xl border border-carbon-700 bg-carbon-900/70 p-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Active Metric</div>
        <div className="mt-1 text-sm text-gray-300">
          Driver chart currently compares <span style={{ color: metricColor }} className="font-bold">{metricLabel(selectedMetric)}</span> across all classified drivers.
        </div>
      </section>
    </div>
  );
}
