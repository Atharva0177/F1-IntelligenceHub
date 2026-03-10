'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { useDataVersion } from '@/lib/useDataVersion';
import { getDriverImageUrls } from '@/lib/driverImages';
import type { DriverStanding, ConstructorStanding } from '@/types';

const TEAM_COLORS: Record<string, string> = {
  'Mercedes':        '#27F4D2',
  'Red Bull Racing': '#3671C6',
  'Ferrari':         '#E8002D',
  'McLaren':         '#FF8000',
  'Alpine F1 Team':  '#FF87BC',
  'Alpine':          '#FF87BC',
  'Aston Martin':    '#229971',
  'Williams':        '#64C4FF',
  'AlphaTauri':      '#6692FF',
  'RB':              '#6692FF',
  'Alfa Romeo':      '#C92D4B',
  'Sauber':          '#C92D4B',
  'Haas F1 Team':    '#B6BABD',
  'Haas':            '#B6BABD',
};

function teamColor(name: string): string {
  if (!name) return '#E8002D';
  for (const [k, v] of Object.entries(TEAM_COLORS)) {
    if (name.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return '#6b7280';
}

function DriverAvatar({ code, driverName = '', teamName, year, size = 28 }: { code: string; driverName?: string; teamName: string; year: number; size?: number }) {
  const parts = driverName ? driverName.split(' ') : [];
  const firstName = parts[0] || '';
  const lastName  = parts.slice(1).join(' ') || code;
  const urls = getDriverImageUrls(firstName, lastName, year, 160);
  const [urlIdx, setUrlIdx] = useState(0);
  useEffect(() => setUrlIdx(0), [code, year]);
  const src = urlIdx < urls.length ? urls[urlIdx] : '';
  const tc = teamColor(teamName);
  return (
    <div className="rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
      style={{ width: size, height: size, background: `${tc}33`, border: `2px solid ${tc}55` }}>
      {src
        ? <img src={src} className="w-full h-full object-cover object-top" onError={() => setUrlIdx(i => i + 1)} alt={code} />
        : <span className="font-bold text-white" style={{ fontSize: size * 0.32 }}>{code?.slice(0, 2)}</span>
      }
    </div>
  );
}

function PodiumDriverImg({ driverName, season }: { driverName: string; season: number }) {
  const parts = driverName.split(' ');
  const urls = getDriverImageUrls(parts[0] || '', parts.slice(1).join(' ') || '', season, 800);
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [driverName, season]);
  const src = idx < urls.length ? urls[idx] : '';
  if (!src) return null;
  return (
    <img
      src={src}
      alt={driverName}
      onError={() => setIdx(i => i + 1)}
      className="absolute bottom-0 left-1/2 -translate-x-1/2 object-contain object-bottom pointer-events-none select-none"
      style={{ height: '88%' }}
    />
  );
}

export default function StandingsPage() {
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [season, setSeason] = useState<number>(0);
  const [tab, setTab] = useState<'drivers' | 'constructors'>('drivers');
  const [drivers, setDrivers] = useState<DriverStanding[]>([]);
  const [constructors, setConstructors] = useState<ConstructorStanding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refreshKey = useDataVersion();

  useEffect(() => {
    api.getSeasons().then(years => {
      setAvailableYears(years);
      if (years.length > 0) setSeason(years[0]);
    }).catch(() => setSeason(2021));
  }, [refreshKey]);

  useEffect(() => {
    if (!season) return;
    setLoading(true);
    setError(null);
    Promise.all([api.getDriverStandings(season), api.getConstructorStandings(season)])
      .then(([d, c]) => { setDrivers(d); setConstructors(c); })
      .catch(() => setError('Failed to load standings. Make sure data is loaded for this season.'))
      .finally(() => setLoading(false));
  }, [season, refreshKey]);

  const leaderPts  = drivers[0]?.points ?? 1;
  const csLeaderPts = constructors[0]?.points ?? 1;

  const isDrivers = tab === 'drivers';
  const podiumOrder = [1, 0, 2]; // P2 left, P1 center, P3 right
  const metalColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
  const podiumD = drivers.slice(0, 3);
  const podiumC = constructors.slice(0, 3);

  const maxDriverWins   = drivers.length   ? Math.max(...drivers.map(d => d.wins))         : 0;
  const maxDriverPodiums = drivers.length  ? Math.max(...drivers.map(d => d.podiums))       : 0;
  const mostWinsDriver   = drivers.find(d => d.wins === maxDriverWins);
  const mostPodiumsDriver = drivers.find(d => d.podiums === maxDriverPodiums);

  return (
    <div className="space-y-6 animate-fade-in pb-10">

      {/* Header */}
      <section className="relative overflow-hidden rounded-3xl bg-carbon-900 border border-carbon-800 p-7 md:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_80%_50%,rgba(225,6,0,0.08),transparent)]" />
        {[20, 40, 60, 80].map((t, i) => (
          <div key={i} className="absolute right-0 h-px bg-gradient-to-l from-racing-red-500/20 to-transparent"
            style={{ top: `${t}%`, width: `${20 + i * 10}%` }} />
        ))}
        <div className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-5">
          <div>
            <div className="text-xs text-racing-red-400 font-bold uppercase tracking-widest mb-2">Championship Standings</div>
            <h1 className="text-4xl md:text-5xl font-display font-bold text-white leading-none">
              {season} <span className="text-gradient-red">Season</span>
            </h1>
            <p className="text-gray-500 text-sm mt-2">Driver &amp; Constructor championship points</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {[...availableYears].reverse().map(yr => (
              <button key={yr} onClick={() => setSeason(yr)}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
                  season === yr ? 'bg-racing-red-500 text-white shadow-red-glow' : 'bg-carbon-800 text-gray-400 hover:text-white border border-carbon-700'
                }`}>{yr}</button>
            ))}
          </div>
        </div>
      </section>

      {/* Segmented control */}
      <div className="flex bg-[#0d0d16] border border-carbon-800 rounded-xl p-1 w-fit">
        {(['drivers', 'constructors'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-7 py-2 rounded-lg text-sm font-bold capitalize transition-all ${
              tab === t
                ? 'bg-racing-red-500 text-white shadow-[0_2px_14px_rgba(225,6,0,0.4)]'
                : 'text-gray-500 hover:text-white'
            }`}>{t}</button>
        ))}
      </div>

      {loading && <div className="flex items-center justify-center min-h-[30vh]"><div className="loading-spinner" /></div>}
      {error   && <div className="bg-racing-red-900/20 border border-racing-red-500/30 rounded-xl p-4 text-racing-red-400 text-sm">{error}</div>}

      {!loading && !error && (
        <>
          {/* ── Podium trio ── */}
          <div className="flex items-end gap-3" style={{ height: 320 }}>
            {podiumOrder.map(pi => {
              const item = isDrivers ? podiumD[pi] : podiumC[pi];
              if (!item) return <div key={pi} className="flex-1" />;
              const tc      = teamColor(isDrivers ? (item as DriverStanding).team_name : (item as ConstructorStanding).team_name);
              const metalC  = metalColors[pi];
              const h       = [295, 240, 210][pi];
              const pos     = pi + 1;
              const code    = isDrivers ? (item as DriverStanding).driver_code : '';
              const name    = isDrivers ? (item as DriverStanding).driver_code     : (item as ConstructorStanding).team_name.replace(' F1 Team','').replace(' Racing','');
              const nameB   = isDrivers ? (item as DriverStanding).driver_name     : '';
              const sub     = isDrivers ? (item as DriverStanding).team_name.replace(' F1 Team','').replace(' Racing','') : `${(item as ConstructorStanding).wins} wins`;
              return (
                <div key={pos} className="flex-1 relative rounded-2xl overflow-hidden flex flex-col"
                  style={{ height: h, background: `linear-gradient(155deg, ${tc}22 0%, #07070f 65%)`, border: `1px solid ${tc}50`, boxShadow: `0 8px 48px ${tc}35`, alignSelf: 'flex-end' }}>
                  {/* metallic top stripe */}
                  <div className="h-[2px] flex-shrink-0" style={{ background: `linear-gradient(90deg, transparent, ${metalC}, transparent)` }} />
                  {/* ambient glow */}
                  <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(ellipse at 50% 0%, ${tc}30, transparent 60%)` }} />
                  {/* large driver photo — centred */}
                  {isDrivers && nameB && <PodiumDriverImg driverName={nameB} season={season} />}
                  {/* bottom scrim so text stays readable */}
                  <div className="absolute inset-0 pointer-events-none"
                    style={{ background: 'linear-gradient(to top, rgba(7,7,15,0.95) 0%, rgba(7,7,15,0.5) 35%, transparent 65%)' }} />
                  {/* watermark pos */}
                  <div className="absolute right-3 bottom-2 font-black leading-none pointer-events-none" style={{ color: metalC, opacity: 0.07, fontSize: 96 }}>P{pos}</div>
                  {/* points badge */}
                  <div className="absolute top-3 right-3 text-[11px] font-black px-2.5 py-1 rounded-full" style={{ background: `${tc}22`, color: tc, border: `1px solid ${tc}55` }}>
                    {item.points} pts
                  </div>
                  {/* bottom content */}
                  <div className="mt-auto p-4 pt-0 relative z-10">
                    <div className="text-[11px] font-black tracking-[0.15em] mb-1" style={{ color: metalC }}>P{pos}</div>
                    <div className="text-white font-black text-2xl leading-none">{name}</div>
                    {isDrivers && <div className="text-sm text-gray-300 mt-0.5 leading-tight">{nameB}</div>}
                    <div className="text-xs mt-1.5 font-semibold" style={{ color: tc }}>{sub}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── Quick stats strip ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(isDrivers ? [
              { label: 'Championship Leader',  value: drivers[0]?.driver_code  ?? '—', sub: `${drivers[0]?.points ?? 0} points`,          color: '#FFD700' },
              { label: 'Gap P1 → P2',          value: `−${(drivers[0]?.points ?? 0) - (drivers[1]?.points ?? 0)}`, sub: 'pts behind leader', color: '#E8002D' },
              { label: 'Most Race Wins',        value: mostWinsDriver?.driver_code ?? '—',   sub: `${maxDriverWins} wins`,                  color: '#22c55e' },
              { label: 'Most Podiums',          value: mostPodiumsDriver?.driver_code ?? '—', sub: `${maxDriverPodiums} podiums`,            color: '#A78BFA' },
            ] : [
              { label: 'Constructor Leader',   value: constructors[0]?.team_name.split(' ')[0] ?? '—', sub: `${constructors[0]?.points ?? 0} points`, color: teamColor(constructors[0]?.team_name ?? '') },
              { label: 'Gap P1 → P2',          value: `−${(constructors[0]?.points ?? 0) - (constructors[1]?.points ?? 0)}`, sub: 'pts behind leader', color: '#E8002D' },
              { label: 'Most Wins (Team)',      value: constructors[0]?.team_name.split(' ')[0] ?? '—', sub: `${constructors[0]?.wins ?? 0} wins`,      color: '#22c55e' },
              { label: 'Teams Competing',      value: String(constructors.length),                      sub: `${season} season`,                       color: '#60A5FA' },
            ]).map(({ label, value, sub, color }) => (
              <div key={label} className="relative rounded-xl p-4 overflow-hidden"
                style={{ background: `linear-gradient(135deg, ${color}12, #090910)`, border: `1px solid ${color}22` }}>
                <div className="text-[9px] text-gray-500 uppercase tracking-widest font-semibold mb-1">{label}</div>
                <div className="text-xl font-black text-white">{value}</div>
                <div className="text-xs mt-0.5 font-semibold" style={{ color }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* ── Table ── */}
          <div className="rounded-2xl overflow-hidden" style={{ background: '#080810', border: '1px solid #16162a' }}>
              <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #16162a' }}>
                <h2 className="font-display font-bold text-white">{isDrivers ? 'Driver' : 'Constructor'} Championship</h2>
                <span className="text-[11px] text-gray-500 uppercase tracking-wider">
                  {isDrivers ? `${drivers.length} drivers` : `${constructors.length} teams`}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[9px] text-gray-600 uppercase tracking-widest" style={{ borderBottom: '1px solid #16162a' }}>
                      <th className="pl-4 pr-2 py-3 text-left w-10">Pos</th>
                      <th className="px-2 py-3 text-left">{isDrivers ? 'Driver' : 'Constructor'}</th>
                      <th className="px-2 py-3 text-left hidden md:table-cell">{isDrivers ? 'Team' : 'Drivers'}</th>
                      <th className="px-2 py-3 text-right">Points</th>
                      <th className="px-2 py-3 text-right hidden sm:table-cell">Gap</th>
                      <th className="px-2 py-3 text-right hidden sm:table-cell">W</th>
                      {isDrivers && <th className="pr-4 pl-2 py-3 text-right hidden sm:table-cell">Pdm</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {(isDrivers ? drivers : constructors).map((item) => {
                      const tc   = teamColor(isDrivers ? (item as DriverStanding).team_name : (item as ConstructorStanding).team_name);
                      const pts  = item.points;
                      const maxP = isDrivers ? leaderPts : csLeaderPts;
                      const gap  = maxP - pts;
                      const pct  = maxP > 0 ? (pts / maxP) * 100 : 0;
                      const pos  = item.position;
                      const rowId = isDrivers ? (item as DriverStanding).driver_id : (item as ConstructorStanding).team_id;
                      return (
                        <tr key={rowId}
                          className="group transition-colors cursor-default"
                          style={{ borderBottom: '1px solid #12121e' }}
                          onMouseEnter={e => (e.currentTarget.style.background = `${tc}0e`)}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          {/* Position */}
                          <td className="pl-4 pr-2 py-3 relative">
                            <div className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full transition-opacity"
                              style={{ background: tc, opacity: pos <= 3 ? 1 : 0.25 }} />
                            <span className="text-sm font-black" style={{
                              color: pos === 1 ? '#FFD700' : pos === 2 ? '#C0C0C0' : pos === 3 ? '#CD7F32' : '#6b7280'
                            }}>
                              {pos <= 3 ? ['🥇','🥈','🥉'][pos - 1] : pos}
                            </span>
                          </td>
                          {/* Name */}
                          <td className="px-2 py-3">
                            {isDrivers ? (
                              <div className="flex items-center gap-2.5">
                                <DriverAvatar code={(item as DriverStanding).driver_code} driverName={(item as DriverStanding).driver_name} teamName={(item as DriverStanding).team_name} year={season} size={30} />
                                <div>
                                  <div className="font-black text-white text-sm leading-tight">{(item as DriverStanding).driver_code}</div>
                                  <div className="text-[10px] text-gray-500">{(item as DriverStanding).driver_name.split(' ').slice(-1)[0]}</div>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <div className="w-1 h-8 rounded-full flex-shrink-0" style={{ background: tc }} />
                                <div className="font-bold text-white text-sm">{(item as ConstructorStanding).team_name}</div>
                              </div>
                            )}
                          </td>
                          {/* Team / Drivers */}
                          <td className="px-2 py-3 hidden md:table-cell">
                            {isDrivers ? (
                              <span className="text-[11px] font-semibold" style={{ color: tc }}>
                                {(item as DriverStanding).team_name.replace(' F1 Team','').replace(' Racing','')}
                              </span>
                            ) : (
                              <div className="flex gap-1 flex-wrap">
                                {(item as ConstructorStanding).drivers.map(code => (
                                  <DriverAvatar key={code} code={code} teamName={(item as ConstructorStanding).team_name} year={season} size={22} />
                                ))}
                              </div>
                            )}
                          </td>
                          {/* Points + bar */}
                          <td className="px-2 py-3 text-right">
                            <div className="flex flex-col items-end gap-1">
                              <span className="font-black text-white tabular-nums">{pts}</span>
                              <div className="w-16 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: tc }} />
                              </div>
                            </div>
                          </td>
                          {/* Gap */}
                          <td className="px-2 py-3 text-right hidden sm:table-cell">
                            <span className="text-xs font-mono font-bold" style={{ color: gap === 0 ? '#22c55e' : '#6b7280' }}>
                              {gap === 0 ? 'LEADER' : `−${gap}`}
                            </span>
                          </td>
                          {/* Wins */}
                          <td className="px-2 py-3 text-right text-white font-bold text-sm hidden sm:table-cell">
                            {item.wins || <span className="text-gray-600">—</span>}
                          </td>
                          {/* Podiums (drivers) */}
                          {isDrivers && (
                            <td className="pr-4 pl-2 py-3 text-right text-gray-500 text-sm hidden sm:table-cell">
                              {(item as DriverStanding).podiums || <span className="text-gray-700">—</span>}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
          </div>
        </>
      )}
    </div>
  );
}

