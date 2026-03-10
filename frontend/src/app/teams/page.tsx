'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { useDataVersion } from '@/lib/useDataVersion';
import type { Driver } from '@/types';

/* ── Constants ─────────────────────────────────────────────────── */
const TEAM_COLORS: Record<string, string> = {
  'Red Bull Racing': '#1B1F5F',
  'Mercedes':        '#00857C',
  'Ferrari':         '#DC0000',
  'McLaren':         '#E8610D',
  'Aston Martin':    '#006F62',
  'Alpine':          '#E4006D',
  'Williams':        '#005AFF',
  'AlphaTauri':      '#2B4562',
  'RB':              '#1435A0',
  'Racing Bulls':    '#1435A0',
  'Alfa Romeo':      '#9B0000',
  'Sauber':          '#00CF74',
  'Kick Sauber':     '#00CF74',
  'Haas F1 Team':    '#3D3D3D',
  'Haas':            '#3D3D3D',
};

const TEAM_CDN_REF: Record<string, string> = {
  'Red Bull Racing': 'red_bull_racing',
  'Mercedes':        'mercedes',
  'Ferrari':         'ferrari',
  'McLaren':         'mclaren',
  'Aston Martin':    'aston_martin',
  'Alpine':          'alpine',
  'Williams':        'williams',
  'AlphaTauri':      'alphatauri',
  'RB':              'rb',
  'Racing Bulls':    'rb',
  'Alfa Romeo':      'alfa_romeo',
  'Sauber':          'sauber',
  'Kick Sauber':     'kick_sauber',
  'Haas F1 Team':    'haas',
  'Haas':            'haas',
};

// Preferred order for display
const TEAM_ORDER = [
  'Red Bull Racing', 'Ferrari', 'Mercedes', 'McLaren',
  'Aston Martin', 'Alpine', 'Williams', 'RB', 'Racing Bulls',
  'Haas F1 Team', 'Haas', 'Sauber', 'Kick Sauber', 'Alfa Romeo', 'AlphaTauri',
];

function getTeamColor(name?: string): string {
  if (!name) return '#1a1a2e';
  for (const [k, v] of Object.entries(TEAM_COLORS)) {
    if (name.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return '#1a1a2e';
}

function getTeamRef(name?: string): string {
  if (!name) return '';
  for (const [k, v] of Object.entries(TEAM_CDN_REF)) {
    if (name.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

/* ── Team short codes (logo fallback text) ─────────────────────── */
const TEAM_SHORT: Record<string, string> = {
  'Red Bull Racing': 'RBR',  'Mercedes':        'AMG',  'Ferrari':         'SF',
  'McLaren':         'MCL',  'Aston Martin':    'AMF1', 'Alpine':          'ALP',
  'Williams':        'WFR',  'AlphaTauri':      'AT',   'RB':              'RB',
  'Racing Bulls':    'RB',   'Haas F1 Team':    'HAS',  'Haas':            'HAS',
  'Kick Sauber':     'KS',   'Sauber':          'SAU',  'Alfa Romeo':      'AR',
  'Toro Rosso':      'STR',  'Force India':     'FI',   'Racing Point':    'RP',
  'Renault':         'REN',
};
function getTeamShort(name?: string): string {
  if (!name) return '?';
  if (TEAM_SHORT[name]) return TEAM_SHORT[name];
  for (const [k, v] of Object.entries(TEAM_SHORT)) {
    if (name.toLowerCase().includes(k.toLowerCase())) return v;
  }
  return name.replace(/[^A-Z]/g, '').slice(0, 3) || name.slice(0, 3).toUpperCase();
}

/** Returns F1 CDN logo URLs for a team/season */
function getLogoUrls(teamName: string, season: number): string[] {
  const CDN = (slug: string) =>
    `https://media.formula1.com/image/upload/f_auto,c_limit,q_auto,w_320/content/dam/fom-website/2018-redesign-assets/team%20logos/${season}/${slug}.png`;
  const lower = teamName.toLowerCase();
  if (lower.includes('red bull'))    return [CDN('Red_Bull'), CDN('red_bull_racing')];
  if (lower.includes('mercedes'))    return [CDN('Mercedes')];
  if (lower.includes('ferrari'))     return [CDN('Ferrari')];
  if (lower.includes('mclaren'))     return [CDN('McLaren')];
  if (lower.includes('alpine'))      return [CDN('Alpine')];
  if (lower.includes('aston martin'))return [CDN('Aston_Martin')];
  if (lower.includes('williams'))    return [CDN('Williams')];
  if (lower.includes('alphatauri') || lower.includes('alpha tauri')) return [CDN('AlphaTauri')];
  if (lower.includes('toro rosso'))  return [CDN('Toro_Rosso')];
  if (lower.trim() === 'rb' || lower.includes('racing bulls') || lower.includes('visa cash'))
    return [CDN('RB'), CDN('AlphaTauri')];
  if (lower.includes('alfa romeo'))  return [CDN('Alfa_Romeo')];
  if (lower.includes('haas'))        return [CDN('Haas')];
  if (lower.includes('kick') || (lower.includes('sauber') && season >= 2024))
    return [CDN('Kick_Sauber'), CDN('Sauber')];
  if (lower.includes('sauber'))      return [CDN('Sauber')];
  if (lower.includes('force india')) return [CDN('Force_India')];
  if (lower.includes('racing point'))return [CDN('Racing_Point')];
  if (lower.includes('renault'))     return [CDN('Renault')];
  return [];
}

/** Fallback: large styled team abbreviation when no logo URL loads */
function TeamLogoFallback({ name, large = false }: { name: string; large?: boolean }) {
  return (
    <div className="flex items-center justify-center w-full h-full">
      <span
        className="font-black text-white uppercase tracking-widest leading-none select-none"
        style={{ fontSize: large ? '5rem' : '2.8rem', opacity: 0.28, letterSpacing: '0.18em' }}
      >
        {getTeamShort(name)}
      </span>
    </div>
  );
}

/** TeamLogo — tries F1 CDN logo URLs, falls back to abbreviation badge */
function TeamLogo({
  teamName, season, className, style, fallbackLarge,
}: {
  teamName: string; season: number;
  className?: string; style?: React.CSSProperties;
  fallbackLarge?: boolean;
}) {
  const urls = getLogoUrls(teamName, season);
  const [failedSet, setFailedSet] = useState<Set<string>>(new Set());
  useEffect(() => setFailedSet(new Set()), [teamName, season]);
  const currentUrl = urls.find(u => !failedSet.has(u));
  if (!currentUrl) return <TeamLogoFallback name={teamName} large={fallbackLarge} />;
  return (
    <img
      key={currentUrl}
      src={currentUrl}
      alt=""
      onError={() => setFailedSet(prev => new Set([...prev, currentUrl!]))}
      className={className}
      style={style}
    />
  );
}

/* ── Interfaces ─────────────────────────────────────────────────── */
interface TeamEntry {
  id: number;
  name: string;
  drivers: Driver[];
}

/* ── Team badge icon (SVG fallback) ─────────────────────────────── */
function TeamBadge() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white/70">
      <path d="M12 2L3 7v5c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7L12 2z" />
    </svg>
  );
}

/* ── TeamCard component ─────────────────────────────────────────── */
function TeamCard({
  team, season, constructorId,
}: {
  team: TeamEntry; season: number; constructorId: number;
}) {
  const tc = getTeamColor(team.name);

  return (
    <Link
      href={`/teams/${constructorId}?season=${season}`}
      className="group relative overflow-hidden rounded-xl block hover:-translate-y-1 hover:shadow-2xl transition-all duration-300"
      style={{ background: tc, height: 200 }}
    >
      {/* Subtle halftone/dot pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-10"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '16px 16px',
        }}
      />

      {/* Team logo — right half, vertically centred */}
      <div className="absolute right-0 top-0 bottom-0 w-[48%] flex items-center justify-center pointer-events-none select-none">
        <TeamLogo
          teamName={team.name}
          season={season}
          className="h-[88px] w-auto max-w-[170px] object-contain transition-transform duration-500 group-hover:scale-105"
          style={{ filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.5)) brightness(1.05)' }}
        />
      </div>

      {/* Left-to-right fade so text stays readable */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.28) 0%, rgba(0,0,0,0.06) 50%, transparent 72%)' }}
      />

      {/* Top-left: team name + drivers */}
      <div className="absolute top-0 left-0 p-4 z-10">
        <div className="text-white font-black text-xl leading-none uppercase tracking-tight mb-3">
          {team.name}
        </div>
        <div className="space-y-1">
          {team.drivers.slice(0, 2).map((d) => (
            <div key={d.id} className="flex items-center gap-1.5">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-white/60 shrink-0">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
              <span className="text-white/85 text-xs font-semibold">
                {d.first_name}{' '}
                <span className="font-black uppercase">{d.last_name}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Top-right: shield badge */}
      <div className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-white/15 flex items-center justify-center backdrop-blur-sm border border-white/20">
        <TeamBadge />
      </div>

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-white/0 group-hover:bg-white/[0.06] transition-colors duration-300 pointer-events-none rounded-xl" />
    </Link>
  );
}

/* ── Page ────────────────────────────────────────────────────────── */
export default function TeamsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [availableYears, setAvailableYears]   = useState<number[]>([]);
  const [selectedSeason, setSelectedSeason]   = useState<number>(0);
  const [teams, setTeams]                     = useState<TeamEntry[]>([]);
  const [constructorMap, setConstructorMap]   = useState<Record<string, number>>({});
  const [loading, setLoading]                 = useState(true);

  const seasonFromUrl = searchParams.get('season');
  const refreshKey = useDataVersion();

  /* Load seasons */
  useEffect(() => {
    api.getSeasons().then(years => {
      setAvailableYears(years);
      const init = seasonFromUrl ? Number(seasonFromUrl) : years[0];
      setSelectedSeason(init);
    }).catch(() => {});
  }, [refreshKey]);

  /* Sync URL */
  useEffect(() => {
    if (!selectedSeason) return;
    router.push(`/teams?season=${selectedSeason}`, { scroll: false });
  }, [selectedSeason, router]);

  /* Load teams + drivers for selected season */
  useEffect(() => {
    if (!selectedSeason) return;
    setLoading(true);

    Promise.all([
      api.getDrivers(selectedSeason),
      api.getConstructors(),
    ]).then(([drivers, constructors]) => {
      /* Build constructor ID map */
      const cMap: Record<string, number> = {};
      constructors.forEach((c) => { cMap[c.name] = c.id; });
      setConstructorMap(cMap);

      /* Group drivers by team */
      const byTeam: Record<string, Driver[]> = {};
      drivers.forEach((d) => {
        const tn = d.team_name || 'Unknown';
        if (!byTeam[tn]) byTeam[tn] = [];
        byTeam[tn].push(d);
      });

      /* Build ordered team list */
      const orderedTeams: TeamEntry[] = [];
      const seen = new Set<string>();

      /* Exact DB name match first, then fuzzy — avoids picking wrong team */
      const findId = (teamName: string) =>
        cMap[teamName]
        ?? Object.entries(cMap).find(([k]) =>
            k.toLowerCase().includes(teamName.toLowerCase()) ||
            teamName.toLowerCase().includes(k.toLowerCase())
          )?.[1]
        ?? 0;

      /* First add teams in preferred order */
      TEAM_ORDER.forEach((preferred) => {
        for (const [teamName, teamDrivers] of Object.entries(byTeam)) {
          if (seen.has(teamName)) continue;
          if (teamName.toLowerCase().includes(preferred.toLowerCase()) ||
              preferred.toLowerCase().includes(teamName.toLowerCase())) {
            orderedTeams.push({ id: findId(teamName), name: teamName, drivers: teamDrivers });
            seen.add(teamName);
          }
        }
      });

      /* Add any remaining teams */
      Object.entries(byTeam).forEach(([teamName, teamDrivers]) => {
        if (!seen.has(teamName)) {
          orderedTeams.push({ id: findId(teamName), name: teamName, drivers: teamDrivers });
        }
      });

      setTeams(orderedTeams);
    }).catch(console.error).finally(() => setLoading(false));
  }, [selectedSeason, refreshKey]);

  const totalTeams = teams.length;

  return (
    <div className="space-y-6 animate-fade-in pb-10">

      {/* Header */}
      <div className="pt-2">
        <div className="text-4xl md:text-5xl font-display font-black text-white leading-none uppercase tracking-tight">
          F1 TEAMS{selectedSeason ? ` ${selectedSeason}` : ''}
        </div>
        <div className="text-sm mt-1 font-medium" style={{ color: '#00d2be' }}>
          {selectedSeason
            ? `Find the current Formula 1 teams for the ${selectedSeason} season`
            : 'Loading…'}
        </div>
      </div>

      {/* Season selector */}
      <div className="flex flex-wrap gap-2">
        {[...availableYears].reverse().map((yr) => (
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

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[300px]">
          <div className="loading-spinner" />
        </div>
      ) : totalTeams === 0 ? (
        <div className="text-center text-gray-500 py-20">No team data for this season.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {teams.map((team) => (
            <TeamCard
              key={team.name}
              team={team}
              season={selectedSeason}
              constructorId={team.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
