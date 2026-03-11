'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { useDataVersion } from '@/lib/useDataVersion';
import type { Race } from '@/types';

// Same-track events that use a different name — map to the canonical JSON slug.
const CIRCUIT_ALIAS: Record<string, string> = {
  '70th_anniversary_grand_prix': 'british_grand_prix',
  'styrian_grand_prix':          'austrian_grand_prix',
  'tuscan_grand_prix':           'italian_grand_prix',
  'eifel_grand_prix':            'eifel_grand_prix',        // has its own file
  'mexican_grand_prix':          'mexico_city_grand_prix',
  'brazilian_grand_prix':        'sao_paulo_grand_prix',
};

function circuitSlug(raceName: string): string {
  // Strip diacritics (ã→a, é→e, …) then lower-case and collapse non-alphanum to _
  const base = raceName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return CIRCUIT_ALIAS[base] ?? base;
}

// Renders the circuit outline as a subtle SVG background element
const CircuitSilhouette = ({ raceName }: { raceName: string }) => {
  const [pathD, setPathD] = useState<string | null>(null);
  const W = 260, H = 160, PAD = 12;
  useEffect(() => {
    const slug = circuitSlug(raceName);
    fetch(`/circuits/${slug}.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.x?.length) return;
        const xs: number[] = data.x;
        const ys: number[] = data.y;
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
        const scale = Math.min((W - 2 * PAD) / rangeX, (H - 2 * PAD) / rangeY);
        const offX = PAD + ((W - 2 * PAD) - rangeX * scale) / 2;
        const offY = PAD + ((H - 2 * PAD) - rangeY * scale) / 2;
        const sx = (x: number) => offX + (x - minX) * scale;
        const sy = (y: number) => H - offY - (y - minY) * scale;
        const d = xs
          .map((x, i) => `${i === 0 ? 'M' : 'L'}${sx(x).toFixed(1)},${sy(ys[i]).toFixed(1)}`)
          .join(' ') + ' Z';
        setPathD(d);
      })
      .catch(() => {});
  }, [raceName]);

  if (!pathD) return null;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="absolute bottom-0 right-0 w-[70%] h-[55%] opacity-[0.08] pointer-events-none"
      preserveAspectRatio="xMaxYMax meet"
      aria-hidden
    >
      <path d={pathD} fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

// Country → ISO 3166-1 alpha-2 for flag CDN
// Keys are what FastF1/Ergast actually stores in the DB — include all known variants.
const COUNTRY_CODE: Record<string, string> = {
  // FastF1 canonical names
  Australia: 'au', Bahrain: 'bh', China: 'cn', Azerbaijan: 'az',
  Spain: 'es', Monaco: 'mc', Canada: 'ca', France: 'fr', Austria: 'at',
  Germany: 'de', Hungary: 'hu', Belgium: 'be', Italy: 'it',
  Singapore: 'sg', Russia: 'ru', Japan: 'jp', Mexico: 'mx',
  Brazil: 'br', Netherlands: 'nl', Portugal: 'pt', Turkey: 'tr',
  Qatar: 'qa', Sweden: 'se',
  // UK — FastF1/Ergast returns "Great Britain" for Silverstone events
  'Great Britain': 'gb', UK: 'gb', 'United Kingdom': 'gb',
  // UAE — FastF1/Ergast returns "Abu Dhabi" as the country for Yas Marina
  'Abu Dhabi': 'ae', UAE: 'ae', 'United Arab Emirates': 'ae',
  // USA — FastF1 uses "United States" for COTA/Miami/Las Vegas
  'United States': 'us', USA: 'us', 'United States of America': 'us',
  // Saudi Arabia
  'Saudi Arabia': 'sa',
  // Korean GP (historical)
  Korea: 'kr', 'South Korea': 'kr',
  // Indian GP (historical)
  India: 'in',
  // Bahrain outer loop (Sakhir GP 2020) — same country
  Sakhir: 'bh',
};

// Per-round accent gradients cycling through 8 palettes
const ACCENT = [
  { bg: 'from-red-950/70 via-carbon-900', border: 'border-red-900/40',     dot: 'bg-red-500',     txt: 'text-red-400' },
  { bg: 'from-blue-950/70 via-carbon-900', border: 'border-blue-900/40',   dot: 'bg-blue-500',    txt: 'text-blue-400' },
  { bg: 'from-emerald-950/70 via-carbon-900', border: 'border-emerald-900/40', dot: 'bg-emerald-500', txt: 'text-emerald-400' },
  { bg: 'from-amber-950/70 via-carbon-900', border: 'border-amber-900/40', dot: 'bg-amber-500',   txt: 'text-amber-400' },
  { bg: 'from-purple-950/70 via-carbon-900', border: 'border-purple-900/40', dot: 'bg-purple-500', txt: 'text-purple-400' },
  { bg: 'from-cyan-950/70 via-carbon-900', border: 'border-cyan-900/40',   dot: 'bg-cyan-500',    txt: 'text-cyan-400' },
  { bg: 'from-orange-950/70 via-carbon-900', border: 'border-orange-900/40', dot: 'bg-orange-500', txt: 'text-orange-400' },
  { bg: 'from-pink-950/70 via-carbon-900', border: 'border-pink-900/40',   dot: 'bg-pink-500',    txt: 'text-pink-400' },
] as const;

const STAGGER = ['stagger-1','stagger-2','stagger-3','stagger-4','stagger-5','stagger-6','stagger-7','stagger-8'];

const RaceCard = ({ race, index }: { race: Race; index: number }) => {
  const ac = ACCENT[index % ACCENT.length];
  const countryCode = COUNTRY_CODE[race.circuit.country ?? ''] ?? 'xx';

  return (
    <Link
      href={`/races/${race.id}`}
      className={`group relative overflow-hidden rounded-2xl bg-gradient-to-b ${ac.bg} to-carbon-900
        border ${ac.border} hover:border-racing-red-500/40
        shadow-card hover:shadow-card-hover hover:-translate-y-1
        transition-all duration-300 flex flex-col animate-fade-in-up ${STAGGER[index % 8]}`}
    >
      <CircuitSilhouette raceName={race.name} />
      {/* Round badge */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-carbon-950/70 backdrop-blur-sm border border-carbon-700 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
        <span className={`w-1.5 h-1.5 rounded-full ${race.status === 'COMPLETED' ? 'bg-track-green' : 'bg-gray-600'}`} />
        R{race.round_number}
      </div>

      {/* Header strip with flag */}
      <div className="relative px-5 pt-5 pb-4 flex items-center gap-3 border-b border-carbon-800">
        <div className="w-10 h-7 rounded overflow-hidden shadow-md border border-carbon-700 shrink-0">
          <img
            src={`https://flagcdn.com/w40/${countryCode}.png`}
            alt={race.circuit.country ?? ''}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-display font-bold text-white truncate leading-tight group-hover:text-racing-red-400 transition-colors">
            {race.name}
          </h2>
          <p className="text-[11px] text-gray-500 truncate mt-0.5">{race.circuit.location}</p>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4 flex-1 flex flex-col gap-3">
        {/* Date + status */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-gray-400 text-xs">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {race.date
              ? new Date(race.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
              : 'TBD'}
          </div>
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
            race.status === 'COMPLETED'
              ? 'bg-track-green/10 text-track-green border-track-green/20'
              : 'bg-carbon-800 text-gray-500 border-carbon-700'
          }`}>
            {race.status ?? 'Upcoming'}
          </span>
        </div>

        {/* Winner */}
        {race.winner_name ? (
          <div className="mt-auto flex items-center gap-2.5 bg-carbon-950/50 rounded-xl px-3 py-2.5 border border-carbon-800">
            <svg className="w-4 h-4 text-yellow-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h1l1 4h4l1-4h1a2 2 0 002-2V5a2 2 0 00-2-2H5z" />
            </svg>
            <div className="min-w-0">
              <div className="text-white text-sm font-bold truncate">{race.winner_name}</div>
              <div className="text-gray-500 text-[11px] truncate">{race.winner_team}</div>
            </div>
          </div>
        ) : (
          <div className="mt-auto text-[11px] text-gray-600 italic">Results pending</div>
        )}
      </div>

      {/* Bottom CTA */}
      <div className={`px-5 py-3 border-t border-carbon-800 flex items-center justify-between ${ac.txt} text-xs font-bold`}>
        <span>View Race Details</span>
        <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4-4 4M6 12h12" />
        </svg>
      </div>
    </Link>
  );
};

export default function RacesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);
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
    router.push(`/races?season=${selectedSeason}`, { scroll: false });
  }, [selectedSeason, router]);

  useEffect(() => {
    if (!selectedSeason) return;
    setLoading(true);
    api.getRaces(selectedSeason)
      .then(setRaces)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedSeason, refreshKey]);

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      {/* Page header */}
      <section className="relative overflow-hidden rounded-3xl bg-carbon-900 border border-carbon-800 p-5 sm:p-7 md:p-10">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_30%_50%,rgba(225,6,0,0.07),transparent)]" />
        <div className="relative flex flex-col sm:flex-row sm:items-end justify-between gap-5">
          <div>
            <div className="text-xs text-racing-red-400 font-bold uppercase tracking-widest mb-2">Season Archive</div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-display font-bold text-white leading-none">
              {selectedSeason}{' '}
              <span className="text-gradient-red">F1 Season</span>
            </h1>
            <div className="text-gray-500 text-sm mt-2">
              {loading ? 'Loadingâ€¦' : `${races.length} Grands Prix`}
            </div>
          </div>
          {/* Season pills */}
          <div className="flex flex-wrap gap-2">
            {[...availableYears].reverse().map((yr) => (
              <button key={yr} onClick={() => setSelectedSeason(yr)}
                className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                  selectedSeason === yr
                    ? 'bg-racing-red-500 text-white shadow-red-glow'
                    : 'bg-carbon-800 text-gray-400 hover:text-white border border-carbon-700 hover:border-carbon-600'
                }`}>
                {yr}
              </button>
            ))}
          </div>
        </div>
      </section>

      {loading ? (
        <div className="flex items-center justify-center min-h-[30vh]">
          <div className="loading-spinner" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
            {races.map((race, i) => <RaceCard key={race.id} race={race} index={i} />)}
          </div>
          {races.length === 0 && (
            <div className="card text-center py-16 text-gray-500">No races found for this season.</div>
          )}
        </>
      )}
    </div>
  );
}
