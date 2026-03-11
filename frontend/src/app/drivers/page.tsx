'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { useDataVersion } from '@/lib/useDataVersion';
import { getDriverImageUrls } from '@/lib/driverImages';
import type { Driver } from '@/types';

const TEAM_COLORS: Record<string, string> = {
  'Red Bull Racing': '#1B1F5F',
  'Mercedes':        '#00857C',
  'Ferrari':         '#DC0000',
  'McLaren':         '#E8610D',
  'Aston Martin':    '#006F62',
  'Alpine':          '#E4006D',
  'Williams':        '#005AFF',
  'AlphaTauri':      '#2B4562',
  'RB':              '#1E3A5F',
  'Racing Bulls':    '#1E3A5F',
  'Alfa Romeo':      '#9B0000',
  'Sauber':          '#52E253',
  'Haas F1 Team':    '#3D3D3D',
  'Haas':            '#3D3D3D',
};
function getTeamColor(teamName?: string): string {
  if (!teamName) return '#1a1a2e';
  for (const [k, v] of Object.entries(TEAM_COLORS)) {
    if (teamName.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return '#1a1a2e';
}

const NAT_FLAGS: Record<string, string> = {
  british: 'gb',      dutch: 'nl',         german: 'de',       spanish: 'es',
  finnish: 'fi',      french: 'fr',        australian: 'au',   mexican: 'mx',
  canadian: 'ca',     monegasque: 'mc',    italian: 'it',      thai: 'th',
  japanese: 'jp',     chinese: 'cn',       danish: 'dk',       american: 'us',
  brazilian: 'br',    austrian: 'at',      swiss: 'ch',        swedish: 'se',
  belgian: 'be',      'new zealander': 'nz', argentine: 'ar',  estonian: 'ee',
  polish: 'pl',       russian: 'ru',       venezuelan: 've',
};
// Returns a flag emoji via unicode regional indicator letters
function getFlag(nat?: string): string {
  if (!nat) return '';
  const code = NAT_FLAGS[nat.toLowerCase()];
  if (!code) return '';
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => 0x1F1E6 - 65 + c.charCodeAt(0)));
}

function DriverCard({ driver, index, selectedSeason }: { driver: Driver; index: number; selectedSeason: number }) {
  const imgUrls = getDriverImageUrls(driver.first_name, driver.last_name, selectedSeason, 500);
  const [urlIdx, setUrlIdx] = useState(0);
  useEffect(() => setUrlIdx(0), [driver.code, selectedSeason]);
  const imgSrc = urlIdx < imgUrls.length ? imgUrls[urlIdx] : '';
  const tc          = getTeamColor(driver.team_name);
  const isFerrari   = driver.team_name?.toLowerCase().includes('ferrari');
  const driverNum   = driver.driver_number ?? driver.number;

  return (
    <Link
      href={`/drivers/${driver.id}?season=${selectedSeason}`}
      className="group relative overflow-hidden rounded-xl block hover:-translate-y-1 hover:shadow-2xl transition-all duration-300"
      style={{ background: tc, height: 'clamp(170px,35vw,220px)' }}
    >
      {/* Left text zone */}
      <div className="absolute inset-0 z-10 p-4 flex flex-col justify-between" style={{ width: '58%' }}>
        <div>
          <div className="text-white/70 text-sm font-normal leading-none">{driver.first_name}</div>
          <div className="text-white font-black text-xl leading-tight uppercase tracking-tight">
            {driver.last_name}
          </div>
          <div className="text-white/55 text-[11px] mt-1 font-medium">{driver.team_name}</div>
        </div>

        {/* Driver number */}
        <div
          className={`text-white font-black leading-none text-4xl sm:text-5xl opacity-90 ${isFerrari ? 'italic' : ''}`}
        >
          {driverNum}
        </div>

        {/* Nationality flag */}
        {getFlag(driver.nationality) && (
          <div className="text-xl leading-none">{getFlag(driver.nationality)}</div>
        )}
      </div>

      {/* Driver photo — right side, bottom-aligned */}
      {imgSrc ? (
        <img
          src={imgSrc}
          alt=""
          onError={() => setUrlIdx(i => i + 1)}
          className="absolute right-0 bottom-0 h-[95%] object-contain object-bottom pointer-events-none select-none transition-transform duration-500 group-hover:scale-105"
          style={{ maxWidth: '65%' }}
        />
      ) : (
        <div className="absolute right-4 bottom-4 w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
          <span className="text-sm font-bold text-white">{driver.first_name?.[0]}{driver.last_name?.[0]}</span>
        </div>
      )}

      {/* Subtle dark scrim on left so text is readable */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.18) 0%, transparent 55%)' }} />

      {/* Hover brightness overlay */}
      <div className="absolute inset-0 bg-white/0 group-hover:bg-white/[0.07] transition-colors duration-300 pointer-events-none rounded-xl" />
    </Link>
  );
}

export default function DriversPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const seasonFromUrl = searchParams.get('season');
  const [selectedSeason, setSelectedSeason] = useState<number>(seasonFromUrl ? Number(seasonFromUrl) : 0);
  const refreshKey = useDataVersion();

  useEffect(() => {
    api.getSeasons().then(years => {
      setAvailableYears(years);
      if (!seasonFromUrl && years.length > 0) setSelectedSeason(years[0]);
    }).catch(() => {});
  }, [refreshKey]);

  useEffect(() => {
    if (!selectedSeason) return;
    router.push(`/drivers?season=${selectedSeason}`, { scroll: false });
  }, [selectedSeason, router]);

  useEffect(() => {
    if (!selectedSeason) return;
    setLoading(true);
    api.getDrivers(selectedSeason)
      .then((data) => setDrivers([...data].sort((a, b) => (b.total_points ?? 0) - (a.total_points ?? 0))))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedSeason, refreshKey]);

  const filtered = drivers.filter((d) =>
    `${d.first_name} ${d.last_name}`.toLowerCase().includes(search.toLowerCase()) ||
    (d.code ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-fade-in pb-10">

      {/* Header */}
      <section className="relative overflow-hidden rounded-2xl bg-carbon-900 border border-carbon-800 p-4 sm:p-6 md:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_70%_50%,rgba(59,130,246,0.06),transparent)]" />
        <div className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <div className="text-xs text-blue-400 font-bold uppercase tracking-widest mb-2">Driver Profiles</div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-display font-bold text-white leading-none">
              {selectedSeason}{' '}
              <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">Drivers</span>
            </h1>
            <div className="text-gray-500 text-sm mt-2">
              {loading ? 'Loading…' : `${drivers.length} drivers ranked by points`}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {[...availableYears].reverse().map((yr) => (
              <button key={yr} onClick={() => setSelectedSeason(yr)}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                  selectedSeason === yr
                    ? 'bg-blue-600 text-white shadow-[0_0_16px_rgba(59,130,246,0.4)]'
                    : 'bg-carbon-800 text-gray-400 hover:text-white border border-carbon-700'
                }`}>
                {yr}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Search */}
      <div className="relative">
        <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search drivers…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-carbon-900 border border-carbon-700 rounded-xl pl-10 pr-4 py-2.5 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/60 transition-colors text-sm"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[30vh]">
          <div className="loading-spinner" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map((driver, index) => (
              <DriverCard key={driver.id} driver={driver} index={index} selectedSeason={selectedSeason} />
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="card text-center py-16 text-gray-500">
              No drivers match &ldquo;{search}&rdquo;
            </div>
          )}

          {/* Summary strip */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="stat-card racing-stripe pl-4 sm:pl-6">
              <div className="text-3xl font-display font-bold text-white">{drivers.length}</div>
              <div className="text-track-green text-xs mt-1">{selectedSeason} Season</div>
            </div>
            <div className="stat-card racing-stripe pl-4 sm:pl-6">
              <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Championship Leader</div>
              <div className="text-xl font-display font-bold text-white">
                {drivers[0]?.first_name} <span className="uppercase">{drivers[0]?.last_name}</span>
              </div>
              <div className="text-yellow-400 text-xs mt-1">{Math.round(drivers[0]?.total_points ?? 0)} pts</div>
            </div>
            <div className="stat-card racing-stripe pl-4 sm:pl-6">
              <div className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">Total Points Scored</div>
              <div className="text-3xl font-display font-bold text-white">
                {Math.round(drivers.reduce((s, d) => s + (d.total_points ?? 0), 0)).toLocaleString()}
              </div>
              <div className="text-track-blue text-xs mt-1">Across all drivers</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
