'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { getDriverImageUrls } from '@/lib/driverImages';
import type { Driver } from '@/types';

interface DriverResult {
  race_name: string;
  race_date: string;
  position: number;
  points: number;
  grid_position?: number;
  status?: string;
}

const TEAM_COLORS: Record<string, string> = {
  'Red Bull Racing': '#3671C6', 'Mercedes': '#27F4D2', 'Ferrari': '#E8002D',
  'McLaren': '#FF8000',         'Aston Martin': '#229971', 'Alpine': '#FF87BC',
  'Williams': '#64C4FF',        'AlphaTauri': '#6692FF',   'RB': '#6692FF',
  'Alfa Romeo': '#C92D4B',      'Sauber': '#C92D4B',       'Haas F1 Team': '#B6BABD',
};
function teamColor(name?: string): string {
  if (!name) return '#E8002D';
  for (const [k, v] of Object.entries(TEAM_COLORS)) {
    if (name.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return '#6b7280';
}

export default function DriverDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const driverId = Number(params.driverId);

  const seasonFromUrl = searchParams.get('season');
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedSeason, setSelectedSeason] = useState(seasonFromUrl ? Number(seasonFromUrl) : 0);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [results, setResults] = useState<DriverResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingResults, setLoadingResults] = useState(false);
  const [imgUrlIdx, setImgUrlIdx] = useState(0);
  // Reset image when driver or season changes (must be before any early returns)
  useEffect(() => setImgUrlIdx(0), [selectedSeason, driverId]);

  useEffect(() => {
    api.getSeasons().then(years => {
      setAvailableYears(years);
      if (!seasonFromUrl && years.length > 0) setSelectedSeason(years[0]);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!driverId) return;
    const seasonNum = selectedSeason || undefined;
    api.getDriverDetail(driverId, seasonNum).then(setDriver).catch(console.error).finally(() => setLoading(false));
  }, [driverId, selectedSeason]);

  useEffect(() => {
    if (!driverId || !selectedSeason) return;
    router.replace(`/drivers/${driverId}?season=${selectedSeason}`, { scroll: false });
    setLoadingResults(true);
    api.getDriverResults(driverId, selectedSeason).then(setResults).catch(console.error).finally(() => setLoadingResults(false));
  }, [driverId, selectedSeason]);

  if (loading) return <div className="flex items-center justify-center min-h-[60vh]"><div className="loading-spinner" /></div>;
  if (!driver) return (
    <div className="card text-center py-12">
      <h2 className="text-2xl font-bold text-white mb-2">Driver Not Found</h2>
      <Link href="/drivers" className="btn-primary">Back to Drivers</Link>
    </div>
  );

  const finishedResults  = results.filter(r => r.position > 0);
  const wins             = finishedResults.filter(r => r.position === 1).length;
  const podiums          = finishedResults.filter(r => r.position <= 3).length;
  const totalPoints      = results.reduce((s, r) => s + (r.points || 0), 0);
  const avgFinish        = finishedResults.length > 0 ? finishedResults.reduce((s, r) => s + r.position, 0) / finishedResults.length : 0;
  const bestResult       = finishedResults.length > 0 ? Math.min(...finishedResults.map(r => r.position)) : null;
  const pointsPerRace    = results.length > 0 ? totalPoints / results.length : 0;

  const tc      = teamColor(driver.team_name);
  const autoUrls = getDriverImageUrls(driver.first_name, driver.last_name, selectedSeason, 800);
  const imgUrls = driver.image_url ? [driver.image_url, ...autoUrls] : autoUrls;
  const imgSrc  = imgUrlIdx < imgUrls.length ? imgUrls[imgUrlIdx] : '';

  // running points tally
  let cumPoints = 0;
  const enriched = results.map(r => { cumPoints += r.points || 0; return { ...r, cumPoints }; });

  return (
    <div className="space-y-5 animate-fade-in pb-10">

      {/* ── Hero Header ── */}
      <div className="relative overflow-hidden rounded-3xl" style={{ background: `linear-gradient(135deg, ${tc}18 0%, #07070f 55%)`, border: `1px solid ${tc}40`, minHeight: 'clamp(220px, 60vw, 320px)' }}>
        {/* top accent */}
        <div className="h-[3px]" style={{ background: `linear-gradient(90deg, transparent, ${tc}, transparent)` }} />
        {/* ambient glow */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse 60% 80% at 75% 50%, ${tc}22, transparent)` }} />

        {/* Driver photo */}
        {imgSrc && (
          <img
            src={imgSrc}
            alt={`${driver.first_name} ${driver.last_name}`}
            onError={() => setImgUrlIdx(i => i + 1)}
            className="absolute right-0 bottom-0 object-contain object-bottom pointer-events-none select-none"
            style={{ height: '100%', maxWidth: '40%' }}
          />
        )}
        {/* right scrim over photo */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(90deg, rgba(7,7,15,0.0) 45%, rgba(7,7,15,0.7) 100%)' }} />

        <div className="relative z-10 p-5 sm:p-7 md:p-10 flex flex-col justify-between" style={{ minHeight: 'clamp(220px, 60vw, 320px)' }}>
          {/* top row */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4">
            <Link href={`/drivers?season=${selectedSeason}`} className="text-sm text-gray-500 hover:text-white transition-colors flex items-center gap-1 shrink-0">
              ← Drivers
            </Link>
            {/* Season selector — horizontal scroll on mobile, wraps on desktop */}
            <div className="flex gap-1.5 sm:gap-2 overflow-x-auto sm:overflow-visible sm:flex-wrap sm:justify-end pb-0.5 sm:pb-0">
              {[...availableYears].reverse().map(yr => (
                <button key={yr} onClick={() => setSelectedSeason(yr)}
                  className="shrink-0 px-3 py-1 rounded-lg text-xs font-bold transition-all"
                  style={selectedSeason === yr
                    ? { background: tc, color: '#000', boxShadow: `0 0 14px ${tc}66` }
                    : { background: 'rgba(255,255,255,0.06)', color: '#9ca3af', border: '1px solid rgba(255,255,255,0.1)' }
                  }>{yr}</button>
              ))}
            </div>
          </div>

          {/* bottom identity block */}
          <div className="mt-3 sm:mt-8">
            <div className="text-xs font-bold tracking-[0.2em] mb-1 uppercase" style={{ color: tc }}>
              {driver.team_name}
            </div>
            <div className="flex items-baseline gap-2 sm:gap-4">
              <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-white leading-none tracking-tight">
                {driver.first_name}<br />
                <span className="uppercase">{driver.last_name}</span>
              </h1>
              {(driver.driver_number ?? driver.number) && (
                <span className="hidden sm:inline text-6xl font-black leading-none" style={{ color: tc, opacity: 0.6 }}>
                  #{driver.driver_number ?? driver.number}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 sm:gap-5 mt-3 sm:mt-4 text-xs sm:text-sm text-gray-400">
              {driver.nationality && <span>🌍 {driver.nationality}</span>}
              {driver.date_of_birth && <span className="hidden sm:inline">📅 {new Date(driver.date_of_birth).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
              {driver.code && <span className="font-mono font-bold px-2 py-0.5 rounded" style={{ background: `${tc}20`, color: tc }}>{driver.code}</span>}
            </div>

            {/* inline key stats */}
            <div className="flex gap-4 sm:gap-6 mt-4 sm:mt-6">
              {[
                { label: 'Points', value: totalPoints, color: tc },
                { label: 'Wins',   value: wins,        color: '#FFD700' },
                { label: 'Podiums',value: podiums,      color: '#C0C0C0' },
                { label: 'Races',  value: results.length, color: '#9ca3af' },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div className="text-2xl font-black text-white">{value}</div>
                  <div className="text-[10px] uppercase tracking-widest font-semibold mt-0.5" style={{ color }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Extra Stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Avg Finish',     value: finishedResults.length > 0 ? `P${avgFinish.toFixed(1)}` : '—', color: tc },
          { label: 'Best Finish',    value: bestResult !== null ? `P${bestResult}` : '—',                   color: '#FFD700' },
          { label: 'Points / Race',  value: results.length > 0 ? pointsPerRace.toFixed(1) : '—',           color: '#22c55e' },
          { label: 'DNFs',           value: results.filter(r => r.position <= 0).length,                   color: '#E8002D' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl p-4 relative overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${color}10, var(--theme-surface-0))`, border: `1px solid ${color}20` }}>
            <div className="text-[9px] uppercase tracking-widest text-gray-500 font-semibold mb-1">{label}</div>
            <div className="text-2xl font-black text-white">{value}</div>
          </div>
        ))}
      </div>

      {/* ── Race Results Table ── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--theme-surface-0)', border: '1px solid var(--theme-border-strong)' }}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--theme-border-strong)' }}>
          <h2 className="font-display font-bold text-white">{selectedSeason} Race Results</h2>
          <span className="text-[11px] text-gray-500 uppercase tracking-wider">{results.length} races</span>
        </div>

        {loadingResults ? (
          <div className="flex items-center justify-center py-12"><div className="loading-spinner" /></div>
        ) : results.length === 0 ? (
          <div className="text-center py-12 text-gray-500">No results for {selectedSeason}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[9px] text-gray-600 uppercase tracking-widest" style={{ borderBottom: '1px solid var(--theme-border-strong)' }}>
                  <th className="pl-5 pr-2 py-3 text-left w-6">#</th>
                  <th className="px-3 py-3 text-left">Race</th>
                  <th className="px-3 py-3 text-center hidden sm:table-cell">Date</th>
                  <th className="px-3 py-3 text-center">Grid</th>
                  <th className="px-3 py-3 text-center">Finish</th>
                  <th className="px-3 py-3 text-center hidden sm:table-cell">Δ Pos</th>
                  <th className="px-3 py-3 text-right">Pts</th>
                  <th className="pr-5 pl-3 py-3 text-right hidden md:table-cell">Total</th>
                </tr>
              </thead>
              <tbody>
                {enriched.map((result, i) => {
                  const posDelta  = (result.grid_position && result.position > 0)
                    ? result.grid_position - result.position : null;
                  const isFinish  = result.position > 0;
                  const finishCol = result.position === 1 ? '#FFD700'
                    : result.position <= 3 ? '#C0C0C0'
                    : result.position <= 10 ? '#22c55e'
                    : '#9ca3af';
                  return (
                    <tr key={i}
                      className="transition-colors"
                      style={{ borderBottom: '1px solid var(--theme-border-soft)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = `${tc}0a`)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td className="pl-5 pr-2 py-3 text-gray-600 text-[11px] tabular-nums">{i + 1}</td>
                      <td className="px-3 py-3">
                        <div className="font-bold text-white text-sm leading-tight">{result.race_name.replace(' Grand Prix', ' GP')}</div>
                        {result.status && result.status !== 'Finished' && (
                          <div className="text-[10px] text-red-400 mt-0.5">{result.status}</div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center text-gray-500 text-xs hidden sm:table-cell">
                        {result.race_date ? new Date(result.race_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
                      </td>
                      <td className="px-3 py-3 text-center text-gray-400">
                        {result.grid_position ? `P${result.grid_position}` : '—'}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="font-black text-sm" style={{ color: isFinish ? finishCol : '#ef4444' }}>
                          {isFinish ? `P${result.position}` : 'DNF'}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center text-xs font-bold hidden sm:table-cell">
                        {posDelta !== null ? (
                          <span style={{ color: posDelta > 0 ? '#22c55e' : posDelta < 0 ? '#ef4444' : '#6b7280' }}>
                            {posDelta > 0 ? `▲${posDelta}` : posDelta < 0 ? `▼${Math.abs(posDelta)}` : '—'}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-3 text-right font-black text-sm" style={{ color: tc }}>
                        {result.points > 0 ? result.points : <span className="text-gray-600">—</span>}
                      </td>
                      <td className="pr-5 pl-3 py-3 text-right text-gray-500 text-xs tabular-nums hidden md:table-cell">
                        {result.cumPoints}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
