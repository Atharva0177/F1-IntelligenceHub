'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { useDataVersion } from '@/lib/useDataVersion';
import type { Race, DriverStanding, ConstructorStanding, PaceAnalysis, TireStrategy, SectorAnalysis } from '@/types';

/* ── Team colours ──────────────────────────────────────────────── */
const TEAM_COLORS: Record<string, string> = {
  'Red Bull Racing': '#1B1F5F', 'Mercedes': '#00857C', 'Ferrari': '#DC0000',
  'McLaren': '#E8610D', 'Aston Martin': '#006F62', 'Alpine': '#E4006D',
  'Williams': '#005AFF', 'AlphaTauri': '#2B4562', 'RB': '#1435A0',
  'Racing Bulls': '#1435A0', 'Alfa Romeo': '#9B0000', 'Sauber': '#00CF74',
  'Kick Sauber': '#00CF74', 'Haas F1 Team': '#3D3D3D', 'Haas': '#3D3D3D',
  'Toro Rosso': '#2B4562', 'Force India': '#FF80C7', 'Racing Point': '#F596C8',
  'Renault': '#FFD700',
};
function getTeamColor(name?: string): string {
  if (!name) return '#dc0000';
  for (const [k, v] of Object.entries(TEAM_COLORS))
    if (name.toLowerCase().includes(k.toLowerCase())) return v;
  return '#dc0000';
}

/* ── Tyre colours ──────────────────────────────────────────────── */
const COMPOUND_COLOR: Record<string, string> = {
  SOFT: '#e8002d', MEDIUM: '#ffd700', HARD: '#d0d0d0',
  INTERMEDIATE: '#39b54a', WET: '#0067ff',
};
function compoundColor(c: string): string {
  return COMPOUND_COLOR[c?.toUpperCase()] ?? '#888';
}
function compoundLabel(c: string): string {
  if (!c) return '?';
  return c.charAt(0).toUpperCase() + c.slice(1).toLowerCase();
}

/* ── Lap-time formatter ────────────────────────────────────────── */
function fmtTime(sec?: number): string {
  if (!sec || sec <= 0) return '—';
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(3).padStart(6, '0');
  return m > 0 ? `${m}:${s}` : s;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const refreshKey = useDataVersion();

  const seasonFromUrl = searchParams.get('season');
  const [selectedSeason, setSelectedSeason] = useState(seasonFromUrl ? Number(seasonFromUrl) : 2021);

  const [availableSeasons, setAvailableSeasons]     = useState<number[]>([]);
  const [races, setRaces]                           = useState<Race[]>([]);
  const [driverStandings, setDriverStandings]       = useState<DriverStanding[]>([]);
  const [constructorStandings, setConstructorStandings] = useState<ConstructorStanding[]>([]);
  const [selectedRaceId, setSelectedRaceId]         = useState<number | null>(null);
  const [paceAnalysis, setPaceAnalysis]             = useState<PaceAnalysis[]>([]);
  const [tireStrategies, setTireStrategies]         = useState<TireStrategy[]>([]);
  const [sectorAnalysis, setSectorAnalysis]         = useState<SectorAnalysis[]>([]);
  const [raceDetailLoading, setRaceDetailLoading]   = useState(false);
  const [selectedMetric, setSelectedMetric]         = useState<'points' | 'wins' | 'podiums'>('points');
  const [loading, setLoading]                       = useState(true);

  /* Sync URL */
  useEffect(() => {
    router.push(`/analytics?season=${selectedSeason}`, { scroll: false });
  }, [selectedSeason, router]);

  /* Load available seasons once */
  useEffect(() => {
    api.getSeasons().then(years => {
      setAvailableSeasons(years);
      if (!seasonFromUrl) setSelectedSeason(years[0] ?? 2021);
    }).catch(() => {});
  }, [refreshKey]);

  /* Load season-level data */
  useEffect(() => {
    if (!selectedSeason) return;
    setLoading(true);
    setPaceAnalysis([]); setSectorAnalysis([]); setTireStrategies([]);
    Promise.all([
      api.getRaces(selectedSeason),
      api.getDriverStandings(selectedSeason).catch(() => [] as DriverStanding[]),
      api.getConstructorStandings(selectedSeason).catch(() => [] as ConstructorStanding[]),
    ]).then(([racesData, driverData, constructorData]) => {
      setRaces(racesData);
      setDriverStandings(driverData);
      setConstructorStandings(constructorData);
      const firstCompleted = racesData.find(r => r.winner_name);
      setSelectedRaceId(firstCompleted?.id ?? racesData[0]?.id ?? null);
    }).catch(console.error).finally(() => setLoading(false));
  }, [selectedSeason, refreshKey]);

  /* Load per-race analytics when a race is selected */
  useEffect(() => {
    if (!selectedRaceId) return;
    setRaceDetailLoading(true);
    setPaceAnalysis([]); setSectorAnalysis([]); setTireStrategies([]);
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

  /* Derived values */
  const selectedRace       = races.find(r => r.id === selectedRaceId);
  const completedRaces     = races.filter(r => r.winner_name);
  const uniqueWinners      = new Set(completedRaces.map(r => r.winner_name)).size;
  const champion           = driverStandings[0];
  const constructorChampion = constructorStandings[0];

  const driverMetricValue = (d: DriverStanding) =>
    selectedMetric === 'wins' ? d.wins : selectedMetric === 'podiums' ? d.podiums : d.points;
  const driverMetricMax = Math.max(...driverStandings.map(driverMetricValue), 1);

  /* Tire strategy grouped by driver */
  const stratByDriver = tireStrategies.reduce<Record<string, TireStrategy[]>>((acc, s) => {
    (acc[s.driver_code] ??= []).push(s);
    return acc;
  }, {});
  const totalLaps = tireStrategies.length > 0 ? Math.max(...tireStrategies.map(s => s.stint_end)) : 0;

  /* Sector bests */
  const validS1 = sectorAnalysis.filter(s => s.sector1_best && s.sector1_best > 0).map(s => s.sector1_best!);
  const validS2 = sectorAnalysis.filter(s => s.sector2_best && s.sector2_best > 0).map(s => s.sector2_best!);
  const validS3 = sectorAnalysis.filter(s => s.sector3_best && s.sector3_best > 0).map(s => s.sector3_best!);
  const bestS1  = validS1.length ? Math.min(...validS1) : Infinity;
  const bestS2  = validS2.length ? Math.min(...validS2) : Infinity;
  const bestS3  = validS3.length ? Math.min(...validS3) : Infinity;

  /* Pace sorted by best lap */
  const sortedPace  = [...paceAnalysis].sort((a, b) => (a.best_lap_time ?? 999) - (b.best_lap_time ?? 999));
  const fastestLap  = sortedPace[0]?.best_lap_time ?? 0;

  /* Sector sorted by S1 best */
  const sortedSector = [...sectorAnalysis].sort((a, b) => (a.sector1_best ?? 999) - (b.sector1_best ?? 999));

  const metricColor = selectedMetric === 'wins' ? '#facc15' : selectedMetric === 'podiums' ? '#60a5fa' : '#4ade80';

  return (
    <div className="space-y-6 animate-fade-in pb-10">

      {/* ── Header + Season selector ──────────────────────────────── */}
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h1 className="page-title">Analytics Dashboard</h1>
          <div className="text-sm text-gray-400">{selectedSeason} Season • Advanced Analysis</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {[...availableSeasons].reverse().map(yr => (
            <button
              key={yr}
              onClick={() => setSelectedSeason(yr)}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
                selectedSeason === yr
                  ? 'bg-racing-red-600 text-white shadow-[0_0_16px_rgba(220,0,0,0.35)]'
                  : 'bg-carbon-800 text-gray-400 hover:text-white border border-carbon-700'
              }`}
            >
              {yr}
            </button>
          ))}
        </div>
      </div>

      {/* ── Season KPI cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card py-4 px-5">
          <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Drivers Champion</div>
          <div className="text-xl font-black text-white truncate">
            {champion ? champion.driver_name.split(' ').pop() : '—'}
          </div>
          <div className="text-xs mt-0.5 truncate" style={{ color: champion ? getTeamColor(champion.team_name) : '#888' }}>
            {champion?.team_name ?? '—'}
          </div>
          <div className="text-2xl font-black text-track-green mt-1">
            {champion?.points ?? '—'} <span className="text-xs text-gray-500 font-normal">pts</span>
          </div>
        </div>

        <div className="card py-4 px-5">
          <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Constructors Champion</div>
          <div className="text-xl font-black text-white truncate">
            {constructorChampion?.team_name.replace(' F1 Team', '').replace(' Racing', '') ?? '—'}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{constructorChampion?.wins ?? 0} wins this season</div>
          <div className="text-2xl font-black text-yellow-400 mt-1">
            {constructorChampion?.points ?? '—'} <span className="text-xs text-gray-500 font-normal">pts</span>
          </div>
        </div>

        <div className="card py-4 px-5">
          <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Races Completed</div>
          <div className="text-4xl font-black text-white">{completedRaces.length}</div>
          <div className="text-xs text-gray-500 mt-0.5">of {races.length} scheduled</div>
        </div>

        <div className="card py-4 px-5">
          <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Unique Race Winners</div>
          <div className="text-4xl font-black text-white">{uniqueWinners}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            {uniqueWinners === 1 ? 'driver won every race' : 'different drivers won'}
          </div>
        </div>
      </div>

      {/* ── Constructor Championship ──────────────────────────────── */}
      <div className="card">
        <h2 className="section-title mb-5">Constructor Championship</h2>
        {constructorStandings.length === 0 ? (
          <div className="text-center text-gray-500 py-6 text-sm">No standings data for this season.</div>
        ) : (
          <div className="space-y-3">
            {constructorStandings.map((team, i) => {
              const pct = (team.points / (constructorStandings[0]?.points || 1)) * 100;
              const tc  = getTeamColor(team.team_name);
              return (
                <div key={team.team_name}>
                  <div className="flex justify-between items-center text-sm mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 w-5 text-right text-xs">{i + 1}</span>
                      <div className="w-2.5 h-4 rounded-sm flex-shrink-0" style={{ background: tc }} />
                      <span className="text-white font-semibold">{team.team_name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      {team.wins > 0 && <span className="text-yellow-400 font-bold">{team.wins}W</span>}
                      <span className="font-bold text-track-green w-16 text-right">{team.points} pts</span>
                    </div>
                  </div>
                  <div className="h-7 bg-carbon-800 rounded overflow-hidden">
                    <div
                      className="h-full flex items-center justify-end px-2 transition-all duration-700"
                      style={{ width: `${Math.max(pct, 1.5)}%`, background: tc, opacity: 0.82 }}
                    >
                      {pct > 10 && <span className="text-white text-xs font-bold opacity-90">{pct.toFixed(1)}%</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Driver Championship ───────────────────────────────────── */}
      <div className="card">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
          <h2 className="section-title">Driver Championship</h2>
          <div className="flex gap-2">
            {(['points', 'wins', 'podiums'] as const).map(m => (
              <button
                key={m}
                onClick={() => setSelectedMetric(m)}
                className={`px-3 py-1 rounded text-xs font-bold capitalize transition-all ${
                  selectedMetric === m
                    ? 'bg-racing-red-600 text-white'
                    : 'bg-carbon-800 text-gray-400 hover:text-white border border-carbon-700'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        {driverStandings.length === 0 ? (
          <div className="text-center text-gray-500 py-6 text-sm">No standings data for this season.</div>
        ) : (
          <div className="space-y-2">
            {driverStandings.map((driver, i) => {
              const val = driverMetricValue(driver);
              const pct = driverMetricMax > 0 ? (val / driverMetricMax) * 100 : 0;
              const tc  = getTeamColor(driver.team_name);
              return (
                <div key={driver.driver_code} className="flex items-center gap-3">
                  <span className="text-gray-500 w-4 text-right text-xs shrink-0">{i + 1}</span>
                  <span className="font-mono font-black text-xs w-8 shrink-0" style={{ color: tc }}>{driver.driver_code}</span>
                  <div className="flex-1 h-5 bg-carbon-800 rounded overflow-hidden">
                    <div
                      className="h-full transition-all duration-700"
                      style={{ width: `${Math.max(pct, 1)}%`, background: tc, opacity: 0.75 }}
                    />
                  </div>
                  <span className="text-xs w-10 text-right shrink-0 font-bold" style={{ color: metricColor }}>{val}</span>
                  <span className="text-xs text-gray-500 w-24 truncate hidden md:block shrink-0">{driver.team_name.replace(' F1 Team','')}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Race selector ─────────────────────────────────────────── */}
      <div className="card">
        <h2 className="section-title mb-2">Race Analysis</h2>
        <div className="text-xs text-gray-400 mb-4">Select a race to view pace, strategy and sector data</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
          {races.map(race => (
            <button
              key={race.id}
              onClick={() => setSelectedRaceId(race.id)}
              className={`p-3 rounded-lg border-2 transition-all text-left ${
                selectedRaceId === race.id
                  ? 'border-racing-red-500 bg-racing-red-500/10'
                  : 'border-carbon-700 bg-carbon-800/50 hover:border-carbon-600'
              }`}
            >
              <div className="text-xs text-gray-500 mb-0.5">Rd {race.round_number}</div>
              <div className="text-xs font-semibold text-white truncate leading-tight">
                {race.name.replace(' Grand Prix', ' GP')}
              </div>
              {race.winner_name && (
                <div className="text-xs text-track-green mt-1 truncate">
                  {race.winner_name.split(' ').slice(-1)[0]}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Per-race analytics ────────────────────────────────────── */}
      {selectedRaceId && (
        raceDetailLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="loading-spinner" />
          </div>
        ) : (
          <div className="space-y-6">

            {/* Pace Analysis */}
            <div className="card">
              <h2 className="section-title mb-1">
                Pace Analysis — <span className="text-racing-red-400 font-normal">{selectedRace?.name}</span>
              </h2>
              <div className="text-xs text-gray-400 mb-5">Best and average lap times, sorted by fastest lap</div>
              {sortedPace.length === 0 ? (
                <div className="text-center text-gray-500 py-8 text-sm">No pace data available for this race.</div>
              ) : (
                <div className="space-y-2.5">
                  {sortedPace.map((d, i) => {
                    const stand    = driverStandings.find(s => s.driver_code === d.driver_code);
                    const tc       = getTeamColor(stand?.team_name);
                    const gapToFastest = d.best_lap_time - fastestLap;
                    const pct      = fastestLap > 0 ? (fastestLap / d.best_lap_time) * 100 : 100;
                    return (
                      <div key={d.driver_code} className="flex items-center gap-3">
                        <span className="text-gray-500 w-4 text-right text-xs shrink-0">{i + 1}</span>
                        <span className="font-mono font-black text-xs w-8 shrink-0" style={{ color: tc }}>{d.driver_code}</span>
                        <div className="flex-1 h-5 bg-carbon-800 rounded overflow-hidden">
                          <div className="h-full transition-all duration-700" style={{ width: `${pct}%`, background: tc, opacity: 0.7 }} />
                        </div>
                        <span className="text-white font-mono text-xs w-16 text-right shrink-0">{fmtTime(d.best_lap_time)}</span>
                        <span className="font-mono text-xs w-14 text-right shrink-0" style={{ color: i === 0 ? '#facc15' : '#6b7280' }}>
                          {i === 0 ? 'fastest' : `+${gapToFastest.toFixed(3)}`}
                        </span>
                        <span className="text-gray-500 font-mono text-xs w-16 text-right shrink-0 hidden sm:block">
                          avg {fmtTime(d.avg_lap_time)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tire Strategy */}
            <div className="card">
              <h2 className="section-title mb-1">
                Tire Strategy — <span className="text-racing-red-400 font-normal">{selectedRace?.name}</span>
              </h2>
              <div className="text-xs text-gray-400 mb-3">
                Stint breakdown by compound across {totalLaps} laps
              </div>
              <div className="flex gap-4 mb-4 flex-wrap">
                {Object.entries(COMPOUND_COLOR).map(([name, color]) => (
                  <div key={name} className="flex items-center gap-1.5 text-xs text-gray-400">
                    <div className="w-3 h-3 rounded-full" style={{ background: color }} />
                    {compoundLabel(name)}
                  </div>
                ))}
              </div>
              {Object.keys(stratByDriver).length === 0 ? (
                <div className="text-center text-gray-500 py-8 text-sm">No strategy data available for this race.</div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(stratByDriver).map(([code, stints]) => {
                    const stand = driverStandings.find(s => s.driver_code === code);
                    const tc    = getTeamColor(stand?.team_name);
                    const sorted = [...stints].sort((a, b) => a.stint_start - b.stint_start);
                    return (
                      <div key={code} className="flex items-center gap-3">
                        <span className="font-mono font-black text-xs w-8 shrink-0" style={{ color: tc }}>{code}</span>
                        <div className="flex-1 h-6 bg-carbon-800 rounded overflow-hidden flex gap-px">
                          {sorted.map((stint, si) => {
                            const lapWidth = ((stint.stint_end - stint.stint_start + 1) / totalLaps) * 100;
                            return (
                              <div
                                key={si}
                                className="h-full relative"
                                style={{ width: `${lapWidth}%`, background: compoundColor(stint.compound), opacity: 0.85 }}
                                title={`${compoundLabel(stint.compound)}: L${stint.stint_start}–${stint.stint_end} | avg ${fmtTime(stint.avg_lap_time)}`}
                              />
                            );
                          })}
                        </div>
                        <div className="text-xs text-gray-500 w-20 text-right shrink-0">
                          {sorted.map(s => compoundLabel(s.compound).charAt(0)).join(' → ')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Sector Analysis */}
            <div className="card">
              <h2 className="section-title mb-1">
                Sector Analysis — <span className="text-racing-red-400 font-normal">{selectedRace?.name}</span>
              </h2>
              <div className="text-xs text-gray-400 mb-4">
                Best and average sector times — <span className="text-purple-400">purple</span> = overall best
              </div>
              {sortedSector.length === 0 ? (
                <div className="text-center text-gray-500 py-8 text-sm">No sector data available for this race.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-carbon-700">
                        <th className="text-left py-2 px-2 text-gray-400 font-semibold">Driver</th>
                        <th className="text-right py-2 px-2 text-blue-400 font-semibold">S1 Best</th>
                        <th className="text-right py-2 px-2 text-blue-300/60 font-semibold">S1 Avg</th>
                        <th className="text-right py-2 px-2 text-yellow-400 font-semibold">S2 Best</th>
                        <th className="text-right py-2 px-2 text-yellow-300/60 font-semibold">S2 Avg</th>
                        <th className="text-right py-2 px-2 text-green-400 font-semibold">S3 Best</th>
                        <th className="text-right py-2 px-2 text-green-300/60 font-semibold">S3 Avg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedSector.map(s => {
                        const stand = driverStandings.find(ds => ds.driver_code === s.driver_code);
                        const tc    = getTeamColor(stand?.team_name);
                        return (
                          <tr key={s.driver_code} className="border-b border-carbon-700/30 hover:bg-carbon-700/20">
                            <td className="py-2 px-2">
                              <span className="font-mono font-bold" style={{ color: tc }}>{s.driver_code}</span>
                            </td>
                            <td className={`text-right py-2 px-2 font-mono ${s.sector1_best === bestS1 ? 'text-purple-400 font-bold' : 'text-blue-400'}`}>
                              {fmtTime(s.sector1_best)}
                            </td>
                            <td className="text-right py-2 px-2 font-mono text-blue-300/60">{fmtTime(s.sector1_avg)}</td>
                            <td className={`text-right py-2 px-2 font-mono ${s.sector2_best === bestS2 ? 'text-purple-400 font-bold' : 'text-yellow-400'}`}>
                              {fmtTime(s.sector2_best)}
                            </td>
                            <td className="text-right py-2 px-2 font-mono text-yellow-300/60">{fmtTime(s.sector2_avg)}</td>
                            <td className={`text-right py-2 px-2 font-mono ${s.sector3_best === bestS3 ? 'text-purple-400 font-bold' : 'text-green-400'}`}>
                              {fmtTime(s.sector3_best)}
                            </td>
                            <td className="text-right py-2 px-2 font-mono text-green-300/60">{fmtTime(s.sector3_avg)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-carbon-600 bg-carbon-800/50">
                        <td className="py-2 px-2 text-purple-400 font-bold">Best</td>
                        <td className="text-right py-2 px-2 font-mono text-purple-400 font-bold">{fmtTime(bestS1 === Infinity ? undefined : bestS1)}</td>
                        <td />
                        <td className="text-right py-2 px-2 font-mono text-purple-400 font-bold">{fmtTime(bestS2 === Infinity ? undefined : bestS2)}</td>
                        <td />
                        <td className="text-right py-2 px-2 font-mono text-purple-400 font-bold">{fmtTime(bestS3 === Infinity ? undefined : bestS3)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

          </div>
        )
      )}
    </div>
  );
}

