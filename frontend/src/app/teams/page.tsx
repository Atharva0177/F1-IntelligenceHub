'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { useDataVersion } from '@/lib/useDataVersion';
import { getCarImage } from '@/lib/carImages';
import type { Driver, ConstructorStanding } from '@/types';

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

/** Championship stats panel — shows P{n}, points, wins */
function TeamStatsPanel({ standing }: { standing?: ConstructorStanding }) {
  if (!standing) {
    return (
      <div className="absolute inset-0 opacity-[0.06] pointer-events-none" style={{
        backgroundImage: 'repeating-linear-gradient(70deg, transparent 0, transparent 14px, rgba(255,255,255,1) 14px, rgba(255,255,255,1) 16px)',
      }} />
    );
  }
  return (
    <div className="flex flex-col items-center justify-center w-full h-full pointer-events-none select-none">
      <div
        className="font-black text-white leading-none"
        style={{ fontSize: '5rem', opacity: 0.18, letterSpacing: '-0.04em', lineHeight: 1 }}
      >
        P{standing.position}
      </div>
      <div className="flex items-stretch gap-3 mt-1.5" style={{ opacity: 0.55 }}>
        <div className="text-center">
          <div className="text-white font-black text-lg leading-none">{standing.points}</div>
          <div className="text-white/60 text-[0.58rem] font-bold uppercase tracking-widest mt-0.5">pts</div>
        </div>
        {standing.wins > 0 && (
          <>
            <div className="w-px bg-white/25 self-stretch" />
            <div className="text-center">
              <div className="text-white font-black text-lg leading-none">{standing.wins}</div>
              <div className="text-white/60 text-[0.58rem] font-bold uppercase tracking-widest mt-0.5">wins</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Interfaces ─────────────────────────────────────────────────── */
interface TeamEntry {
  id: number;
  name: string;
  drivers: Driver[];
  image_url?: string;
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
  team, season, constructorId, standing,
}: {
  team: TeamEntry; season: number; constructorId: number; standing?: ConstructorStanding;
}) {
  const tc = getTeamColor(team.name);
  const carImg = getCarImage(team.name, season);

  return (
    <Link
      href={`/teams/${constructorId}?season=${season}`}
      className="group relative overflow-hidden rounded-xl block hover:-translate-y-1 hover:shadow-2xl transition-all duration-300"
      style={{ background: tc, height: 'clamp(160px,30vw,200px)' }}
    >
      {/* Subtle halftone/dot pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-10"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '16px 16px',
        }}
      />

      {/* Car livery image — right side, bottom-anchored */}
      {carImg ? (
        <div className="absolute right-0 bottom-0 top-0 w-[65%] overflow-hidden">
          <img
            src={carImg}
            alt={`${team.name} car`}
            className="absolute bottom-0 right-0 w-full h-full object-contain object-right-bottom"
            style={{
              filter: 'drop-shadow(-12px 0 28px rgba(0,0,0,0.55))',
              transform: 'scale(1.06)',
              transformOrigin: 'right bottom',
            }}
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      ) : (
        /* Fallback: championship stats watermark when no car image */
        <div className="absolute right-0 top-0 bottom-0 w-[48%]">
          <TeamStatsPanel standing={standing} />
        </div>
      )}

      {/* Left-to-right fade so text stays readable */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.12) 50%, transparent 75%)' }}
      />

      {/* Top-left: team name + drivers */}
      <div className="absolute top-0 left-0 p-4 z-10">
        <div className="text-white font-black text-lg sm:text-xl leading-none uppercase tracking-tight mb-3">
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

      {/* Championship position badge — bottom-left, over the car */}
      {standing && (
        <div className="absolute bottom-3 left-4 z-10 flex items-baseline gap-2">
          <span
            className="font-black text-white leading-none text-3xl sm:text-[2rem]"
            style={{ opacity: 0.85, letterSpacing: '-0.03em' }}
          >
            P{standing.position}
          </span>
          <span className="text-white/55 text-xs font-bold uppercase tracking-widest">
            {standing.points} pts
            {standing.wins > 0 && ` · ${standing.wins}W`}
          </span>
        </div>
      )}

      {/* Top-right: shield badge */}
      <div className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-white/15 flex items-center justify-center backdrop-blur-sm border border-white/20">
        {team.image_url ? (
          <img
            src={team.image_url}
            alt=""
            className="w-6 h-6 object-contain"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <TeamBadge />
        )}
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
  const [constructorMap, setConstructorMap]   = useState<Record<string, { id: number; image_url?: string }>>({});
  const [standingsMap, setStandingsMap]       = useState<Record<string, ConstructorStanding>>({});
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
      api.getConstructors(selectedSeason),
      api.getConstructorStandings(selectedSeason).catch(() => [] as ConstructorStanding[]),
    ]).then(([drivers, constructors, standings]) => {
      /* Build constructor ID map */
      const cMap: Record<string, { id: number; image_url?: string }> = {};
      constructors.forEach((c) => { cMap[c.name] = { id: c.id, image_url: c.image_url }; });
      setConstructorMap(cMap);

      /* Build standings map */
      const sMap: Record<string, ConstructorStanding> = {};
      standings.forEach((s) => { sMap[s.team_name] = s; });
      setStandingsMap(sMap);

      /* Group drivers by team */
      const byTeam: Record<string, Driver[]> = {};
      drivers.forEach((d) => {
        const tn = d.team_name || 'Unknown';
        if (!byTeam[tn]) byTeam[tn] = [];
        byTeam[tn].push(d);
      });

      /* Build ordered team list */
      const orderedTeams: TeamEntry[] = [];

      /* Exact DB name match first, then fuzzy — avoids picking wrong team */
      const findMeta = (teamName: string) =>
        cMap[teamName]
        ?? Object.entries(cMap).find(([k]) =>
            k.toLowerCase().includes(teamName.toLowerCase()) ||
            teamName.toLowerCase().includes(k.toLowerCase())
          )?.[1]
        ?? { id: 0 };

      /* Add all teams */
      Object.entries(byTeam).forEach(([teamName, teamDrivers]) => {
        const meta = findMeta(teamName);
        orderedTeams.push({ id: meta.id, name: teamName, drivers: teamDrivers, image_url: meta.image_url });
      });

      /* Sort by championship position if available, else keep insertion order */
      orderedTeams.sort((a, b) => {
        const sA = sMap[a.name]
          ?? Object.values(sMap).find(s =>
              s.team_name.toLowerCase().includes(a.name.toLowerCase()) ||
              a.name.toLowerCase().includes(s.team_name.toLowerCase()));
        const sB = sMap[b.name]
          ?? Object.values(sMap).find(s =>
              s.team_name.toLowerCase().includes(b.name.toLowerCase()) ||
              b.name.toLowerCase().includes(s.team_name.toLowerCase()));
        if (sA && sB) return sA.position - sB.position;
        if (sA) return -1;
        if (sB) return 1;
        return 0;
      });

      setTeams(orderedTeams);
    }).catch(console.error).finally(() => setLoading(false));
  }, [selectedSeason, refreshKey]);

  const totalTeams = teams.length;

  return (
    <div className="space-y-6 animate-fade-in pb-10">

      {/* Header */}
      <div className="pt-2">
        <div className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-display font-black text-white leading-none uppercase tracking-tight">
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
          {teams.map((team) => {
            const standing = standingsMap[team.name]
              ?? Object.values(standingsMap).find(s =>
                  s.team_name.toLowerCase().includes(team.name.toLowerCase()) ||
                  team.name.toLowerCase().includes(s.team_name.toLowerCase())
                );
            return (
              <TeamCard
                key={team.name}
                team={team}
                season={selectedSeason}
                constructorId={team.id}
                standing={standing}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
