'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { useDataVersion } from '@/lib/useDataVersion';
import { getDriverImageUrls } from '@/lib/driverImages';
import { getCarImage } from '@/lib/carImages';
import type { Driver } from '@/types';

/* ── Static maps ────────────────────────────────────────────────── */
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

interface TeamProfile {
  fullName: string;
  base: string;
  teamChief: string;
  technicalChief: string;
  chassis: string;
  powerUnit: string;
  firstEntry: number;
}

const TEAM_PROFILES: Record<string, TeamProfile> = {
  'Mercedes': {
    fullName: 'Mercedes-AMG PETRONAS Formula One Team',
    base: 'Brackley, United Kingdom',
    teamChief: 'Toto Wolff',
    technicalChief: 'James Allison',
    chassis: 'W16',
    powerUnit: 'Mercedes',
    firstEntry: 1954,
  },
  'Ferrari': {
    fullName: 'Scuderia Ferrari HP',
    base: 'Maranello, Italy',
    teamChief: 'Frédéric Vasseur',
    technicalChief: 'Loïc Serra',
    chassis: 'SF-25',
    powerUnit: 'Ferrari',
    firstEntry: 1950,
  },
  'Red Bull Racing': {
    fullName: 'Oracle Red Bull Racing',
    base: 'Milton Keynes, United Kingdom',
    teamChief: 'Christian Horner',
    technicalChief: 'Pierre Waché',
    chassis: 'RB21',
    powerUnit: 'Honda RBPT',
    firstEntry: 2005,
  },
  'McLaren': {
    fullName: 'McLaren Formula 1 Team',
    base: 'Woking, United Kingdom',
    teamChief: 'Andrea Stella',
    technicalChief: 'Neil Houldey',
    chassis: 'MCL39',
    powerUnit: 'Mercedes',
    firstEntry: 1966,
  },
  'Aston Martin': {
    fullName: 'Aston Martin Aramco Formula One Team',
    base: 'Silverstone, United Kingdom',
    teamChief: 'Andy Cowell',
    technicalChief: 'Enrico Cardile',
    chassis: 'AMR25',
    powerUnit: 'Mercedes',
    firstEntry: 2018,
  },
  'Alpine': {
    fullName: 'BWT Alpine Formula One Team',
    base: 'Enstone, United Kingdom',
    teamChief: 'Oliver Oakes',
    technicalChief: 'David Sanchez',
    chassis: 'A525',
    powerUnit: 'Renault',
    firstEntry: 1977,
  },
  'Williams': {
    fullName: 'Williams Racing',
    base: 'Grove, United Kingdom',
    teamChief: 'James Vowles',
    technicalChief: 'Pat Fry',
    chassis: 'FW47',
    powerUnit: 'Mercedes',
    firstEntry: 1977,
  },
  'RB': {
    fullName: 'Visa Cash App RB Formula One Team',
    base: 'Faenza, Italy',
    teamChief: 'Laurent Mekies',
    technicalChief: 'Jody Egginton',
    chassis: 'VCARB 02',
    powerUnit: 'Honda RBPT',
    firstEntry: 1985,
  },
  'Racing Bulls': {
    fullName: 'Visa Cash App RB Formula One Team',
    base: 'Faenza, Italy',
    teamChief: 'Laurent Mekies',
    technicalChief: 'Jody Egginton',
    chassis: 'VCARB 02',
    powerUnit: 'Honda RBPT',
    firstEntry: 1985,
  },
  'Haas F1 Team': {
    fullName: 'MoneyGram Haas F1 Team',
    base: 'Kannapolis, United States',
    teamChief: 'Ayao Komatsu',
    technicalChief: 'Andrea De Zordo',
    chassis: 'VF-25',
    powerUnit: 'Ferrari',
    firstEntry: 2016,
  },
  'Haas': {
    fullName: 'MoneyGram Haas F1 Team',
    base: 'Kannapolis, United States',
    teamChief: 'Ayao Komatsu',
    technicalChief: 'Andrea De Zordo',
    chassis: 'VF-25',
    powerUnit: 'Ferrari',
    firstEntry: 2016,
  },
  'Sauber': {
    fullName: 'Stake F1 Team Kick Sauber',
    base: 'Hinwil, Switzerland',
    teamChief: 'Mattia Binotto',
    technicalChief: 'Jan Monchaux',
    chassis: 'C45',
    powerUnit: 'Ferrari',
    firstEntry: 1993,
  },
  'Kick Sauber': {
    fullName: 'Stake F1 Team Kick Sauber',
    base: 'Hinwil, Switzerland',
    teamChief: 'Mattia Binotto',
    technicalChief: 'Jan Monchaux',
    chassis: 'C45',
    powerUnit: 'Ferrari',
    firstEntry: 1993,
  },
  'Alfa Romeo': {
    fullName: 'Alfa Romeo F1 Team ORLEN',
    base: 'Hinwil, Switzerland',
    teamChief: 'Frédéric Vasseur',
    technicalChief: 'Jan Monchaux',
    chassis: 'C43',
    powerUnit: 'Ferrari',
    firstEntry: 1993,
  },
  'AlphaTauri': {
    fullName: 'Scuderia AlphaTauri Honda RBPT',
    base: 'Faenza, Italy',
    teamChief: 'Franz Tost',
    technicalChief: 'Jody Egginton',
    chassis: 'AT04',
    powerUnit: 'Honda RBPT',
    firstEntry: 1985,
  },
};

const DRIVER_FLAGS: Record<string, string> = {
  HAM: '🇬🇧', VER: '🇳🇱', NOR: '🇬🇧', ALO: '🇪🇸', SAI: '🇪🇸',
  LEC: '🇲🇨', GAS: '🇫🇷', OCO: '🇫🇷', PER: '🇲🇽', BOT: '🇫🇮',
  RUS: '🇬🇧', STR: '🇨🇦', RIC: '🇦🇺', MAG: '🇩🇰', TSU: '🇯🇵',
  ALB: '🇹🇭', HAD: '🇫🇷', LAW: '🇳🇿', ANT: '🇮🇹', BEA: '🇬🇧',
  PIA: '🇦🇺', LIN: '🇸🇪', ZHO: '🇨🇳', HUL: '🇩🇪', COL: '🇦🇷',
  VET: '🇩🇪', RAI: '🇫🇮', GIO: '🇮🇹', MSC: '🇩🇪', MAZ: '🇷🇺',
  LAT: '🇨🇦', SAR: '🇺🇸', DEV: '🇳🇱',
};

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

function getTeamProfile(name?: string): TeamProfile | null {
  if (!name) return null;
  if (TEAM_PROFILES[name]) return TEAM_PROFILES[name];
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(TEAM_PROFILES)) {
    if (lower.includes(k.toLowerCase()) || k.toLowerCase().includes(lower)) return v;
  }
  return null;
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
  if (lower.includes('red bull'))     return [CDN('Red_Bull'), CDN('red_bull_racing')];
  if (lower.includes('mercedes'))     return [CDN('Mercedes')];
  if (lower.includes('ferrari'))      return [CDN('Ferrari')];
  if (lower.includes('mclaren'))      return [CDN('McLaren')];
  if (lower.includes('alpine'))       return [CDN('Alpine')];
  if (lower.includes('aston martin')) return [CDN('Aston_Martin')];
  if (lower.includes('williams'))     return [CDN('Williams')];
  if (lower.includes('alphatauri') || lower.includes('alpha tauri')) return [CDN('AlphaTauri')];
  if (lower.includes('toro rosso'))   return [CDN('Toro_Rosso')];
  if (lower.trim() === 'rb' || lower.includes('racing bulls') || lower.includes('visa cash'))
    return [CDN('RB'), CDN('AlphaTauri')];
  if (lower.includes('alfa romeo'))   return [CDN('Alfa_Romeo')];
  if (lower.includes('haas'))         return [CDN('Haas')];
  if (lower.includes('kick') || (lower.includes('sauber') && season >= 2024))
    return [CDN('Kick_Sauber'), CDN('Sauber')];
  if (lower.includes('sauber'))       return [CDN('Sauber')];
  if (lower.includes('force india'))  return [CDN('Force_India')];
  if (lower.includes('racing point')) return [CDN('Racing_Point')];
  if (lower.includes('renault'))      return [CDN('Renault')];
  return [];
}

/** Fallback: styled team abbreviation when no logo URL loads */
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

/* ── Team narrative descriptions ──────────────────────────────────── */
const TEAM_DESCRIPTIONS: Record<string, string> = {
  'Red Bull Racing': `Red Bull Racing burst onto the Formula 1 grid in 2005 after Dietrich Mateschitz purchased the Jaguar outfit. Under the design genius of Adrian Newey, the team forged a dynasty — Sebastian Vettel delivered four consecutive Drivers\u2019 and Constructors\u2019 Championships from 2010 to 2013. After a lean period, the team rebuilt around Max Verstappen, who seized the 2021 title in a dramatic Abu Dhabi finale. Verstappen has since become one of the sport\u2019s most decorated champions, backed by Newey\u2019s brilliantly-conceived machinery and one of F1\u2019s finest operations.`,
  'Mercedes': `Mercedes-AMG PETRONAS Formula One Team returned as a works constructor in 2010. The Silver Arrows truly hit their stride with turbohybrid power in 2014, beginning one of the sport\u2019s most dominant eras \u2014 six consecutive Constructors\u2019 titles and Lewis Hamilton breaking virtually every significant record in the books. After Red Bull reclaimed supremacy from 2021, Mercedes set about a focused rebuild. George Russell leads the charge alongside rising star Kimi Antonelli as the Brackley outfit hunts a return to championship glory.`,
  'Ferrari': `Scuderia Ferrari is Formula 1\u2019s oldest and most iconic constructor, having competed in every World Championship season since 1950. The Prancing Horse has claimed 16 Constructors\u2019 titles and 15 Drivers\u2019 crowns, highlighted by Michael Schumacher\u2019s five consecutive championships from 2000 to 2004. Ferrari commands an unmatched global fanbase. After a difficult decade, Charles Leclerc brought renewed momentum, with the arrival of seven-time champion Lewis Hamilton for 2025 igniting excitement about a new golden era at Maranello.`,
  'McLaren': `McLaren is one of Formula 1\u2019s most celebrated names, founded in 1963 by New Zealand ace Bruce McLaren. The Woking team\u2019s glory era under Ron Dennis delivered eight Constructors\u2019 titles and nine Drivers\u2019 crowns and produced legendary battles between Senna and Prost. After a prolonged rebuilding period, McLaren regained footing under CEO Zak Brown and team principal Andrea Stella. Lando Norris emerged as a genuine title contender and McLaren claimed the 2024 Constructors\u2019 Championship \u2014 their first in 26 years.`,
  'Aston Martin': `Aston Martin Aramco Formula One Team traces its lineage through Jordan, BAR, Honda, Brawn, Force India and Racing Point before Lawrence Stroll transformed it when he acquired the storied British marque. The Silverstone campus was completely rebuilt under unprecedented investment. Fernando Alonso\u2019s signing for 2023 delivered immediate podium results. New team principal Andy Cowell, architect of Mercedes\u2019 dominant turbo-hybrid era, leads Aston Martin\u2019s methodical charge towards a World Championship.`,
  'Alpine': `BWT Alpine Formula One Team is the successor to the Renault factory squad, which has a distinguished F1 history stretching to 1977. Fernando Alonso delivered back-to-back Constructors\u2019 and Drivers\u2019 titles under the Renault banner in 2005\u201306. Rebranded as Alpine in 2021 to spotlight the French performance car marque, the Enstone team continues developing talent and rebuilding its technical foundations for a push back to the front.`,
  'Williams': `Williams Racing is among Formula 1\u2019s most storied constructors, founded in 1977 by Sir Frank Williams and Patrick Head. The Grove team dominated the 1980s and \u201990s, delivering nine Constructors\u2019 Championships and seven Drivers\u2019 titles \u2014 producing greats like Mansell, Prost, Damon Hill and Jacques Villeneuve. Energetic team boss James Vowles has been systematically rebuilding the operation and the iconic blue and white cars race on as Williams strives to restore past glories.`,
  'AlphaTauri': `Scuderia AlphaTauri \u2014 now Visa Cash App RB \u2014 has operated as Red Bull\u2019s sister outfit since the Minardi era. Sebastian Vettel scored the team\u2019s sole victory in wet Monza conditions in 2008. Ricciardo, Sainz, Verstappen, Gasly and Tsunoda all launched their careers from Faenza. The Italian-based squad remains a crucial cradle for F1 talent feeding into the broader Red Bull family.`,
  'RB': `Visa Cash App RB Formula One Team \u2014 previously AlphaTauri and Toro Rosso \u2014 serves as the Red Bull organisation\u2019s driver development programme. The Faenza, Italy-based squad gives promising young drivers the chance to prove themselves before being elevated to the senior Red Bull Racing team. Many of the sport\u2019s greatest recent talents have passed through its doors.`,
  'Racing Bulls': `Visa Cash App RB Formula One Team \u2014 previously AlphaTauri and Toro Rosso \u2014 serves as the Red Bull organisation\u2019s driver development programme. The Faenza, Italy-based squad gives promising young drivers the chance to prove themselves before elevation to the senior Red Bull Racing team.`,
  'Toro Rosso': `Scuderia Toro Rosso raced under the Italian brand of Red Bull\u2019s premium energy drink from 2006 to 2019 as the Red Bull family\u2019s driver development team. Based in Faenza, the team launched the careers of Vettel, Ricciardo, Sainz, Verstappen and many more. Their sole race victory came in monsoon conditions at the 2008 Italian Grand Prix with a 21-year-old Sebastian Vettel. Rebranded as AlphaTauri from 2020, the legacy of unearthing future champions continues.`,
  'Haas': `Haas F1 Team made history in 2016 as the first American constructor on the Formula 1 grid since 1986. Named after machining tool entrepreneur Gene Haas, the team is headquartered in Kannapolis, North Carolina, with European operations in Banbury, England. Working in technical partnership with Ferrari, Haas stunned the paddock by scoring points on their very debut. The team remains a proud American flag-bearer as Formula 1 expands its US presence.`,
  'Sauber': `Sauber Motorsport has been a constant on the Formula 1 grid since 1993, competing under many guises: Sauber, BMW Sauber (2006\u201309), back to Sauber, then Alfa Romeo Racing, and now Kick Sauber. The Hinwil-based Swiss team is renowned for engineering precision and consistently punching above its weight. From 2026 Sauber becomes the Audi factory team \u2014 heralding unprecedented ambition and resources.`,
  'Kick Sauber': `Stake F1 Team Kick Sauber is the current identity of one of Formula 1\u2019s most resilient operations. The Hinwil-based Swiss team has raced since 1993 under various commercial partnerships. Transitioning to become the Audi factory team from 2026, the Swiss squad enters its most transformative chapter in three decades of competition.`,
  'Alfa Romeo': `Alfa Romeo Racing ORLEN was the identity used by the Sauber organisation from 2019 to 2023 following a partnership with the legendary Italian carmaker. Running Ferrari power from Hinwil, the team made consistent points finishes their hallmark. Kimi R\u00e4ikk\u00f6nen, the 2007 World Champion, made his home there for three final seasons. Valtteri Bottas and Guanyu Zhou continued the team\u2019s respectable form before the Alfa Romeo branding gave way to Kick Sauber.`,
  'Force India': `Force India was the modern era\u2019s great overachiever \u2014 operating on a fraction of the top teams\u2019 budgets yet consistently outperforming expectations. Sergio P\u00e9rez and Nico H\u00fclkenberg delivered the team 4th in the Constructors\u2019 Championship in both 2016 and 2017. Financial difficulties led to administration in 2018, but the team was reborn as Racing Point before its full transformation into today\u2019s Aston Martin operation.`,
  'Racing Point': `Racing Point was the brief identity used by today\u2019s Aston Martin team following Lawrence Stroll\u2019s consortium purchase from Force India\u2019s administration in 2018. The team caused controversy in 2020 with their RP20 \u2014 nicknamed the \u201cPink Mercedes\u201d \u2014 earning Sergio P\u00e9rez a remarkable win at the Sakhir Grand Prix. The name changed to Aston Martin for 2021 as Stroll\u2019s long-term vision came into focus.`,
  'Renault': `Renault returned as a full Formula 1 constructor in 2016 when it acquired the struggling Lotus outfit. The French manufacturer won back-to-back Constructors\u2019 and Drivers\u2019 titles with Fernando Alonso in 2005 and 2006. Under Cyril Abiteboul, the team rebuilt with Daniel Ricciardo and Esteban Ocon carrying the fight before the team was rebranded as Alpine in 2021.`,
};

function getTeamDescription(name?: string): string | null {
  if (!name) return null;
  if (TEAM_DESCRIPTIONS[name]) return TEAM_DESCRIPTIONS[name];
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(TEAM_DESCRIPTIONS)) {
    if (lower.includes(k.toLowerCase()) || k.toLowerCase().includes(lower)) return v;
  }
  return null;
}

/* ── Driver card (mini, for DRIVERS section) ─────────────────────── */
function DriverCard({
  driver, season, teamColor,
}: {
  driver: Driver; season: number; teamColor: string;
}) {
  const code    = driver.code?.toUpperCase() ?? '';
  const imgUrls = getDriverImageUrls(driver.first_name, driver.last_name, season, 500);
  const [urlIdx, setUrlIdx] = useState(0);
  useEffect(() => setUrlIdx(0), [driver.code, season]);
  const imgSrc = urlIdx < imgUrls.length ? imgUrls[urlIdx] : '';
  const flag = DRIVER_FLAGS[code] ?? '';
  const num  = driver.driver_number ?? driver.number;

  return (
    <Link
      href={`/drivers/${driver.id}?season=${season}`}
      className="group relative overflow-hidden rounded-xl block transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
      style={{ background: teamColor, height: 'clamp(160px,30vw,200px)' }}
    >
      {/* Halftone pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-10"
        style={{
          backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)',
          backgroundSize: '14px 14px',
        }}
      />
      {/* Left text zone */}
      <div className="absolute inset-0 z-10 p-4 flex flex-col justify-between" style={{ width: '55%' }}>
        <div>
          <div className="text-white/70 text-sm leading-none">{driver.first_name}</div>
          <div className="text-white font-black text-xl leading-tight uppercase tracking-tight">{driver.last_name}</div>
          <div className="text-white/50 text-[11px] mt-1 font-medium">{driver.team_name}</div>
        </div>
        <div>
          <div className="text-white font-black leading-none mb-1 text-4xl sm:text-5xl opacity-90">
            {num}
          </div>
          {flag && <div className="text-xl">{flag}</div>}
        </div>
      </div>
      {/* Driver photo */}
      {imgSrc && (
        <img
          src={imgSrc}
          alt=""
          onError={() => setUrlIdx(i => i + 1)}
          className="absolute right-0 bottom-0 h-[95%] object-contain object-bottom pointer-events-none select-none transition-transform duration-500 group-hover:scale-105"
          style={{ maxWidth: '60%' }}
        />
      )}
      {/* Left scrim */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'linear-gradient(90deg, rgba(0,0,0,0.18) 0%, transparent 55%)' }} />
      <div className="absolute inset-0 bg-white/0 group-hover:bg-white/[0.07] transition-colors duration-300 pointer-events-none rounded-xl" />
    </Link>
  );
}

/* ── Stat pill ───────────────────────────────────────────────────── */
function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-carbon-800/60 border border-carbon-700 rounded-xl p-4 min-w-0">
      <div className="text-gray-400 text-[11px] uppercase tracking-widest mb-1">{label}</div>
      <div className="text-white font-black text-2xl leading-none">{value ?? '—'}</div>
    </div>
  );
}

/* ── Profile row ─────────────────────────────────────────────────── */
function ProfileRow({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="min-w-0">
      <div className="text-gray-500 text-[10px] uppercase tracking-widest mb-1.5 font-medium">{label}</div>
      <div className="text-white font-black text-base md:text-lg leading-tight">{value ? String(value) : '—'}</div>
    </div>
  );
}

/* ── interfaces ──────────────────────────────────────────────────── */
interface ConstructorDetail {
  id: number;
  name: string;
  nationality?: string;
  season: number;
  total_points: number;
  wins: number;
  podiums: number;
  drivers: {
    driver_id: number;
    driver_code: string;
    driver_name: string;
    points: number;
    wins: number;
  }[];
  race_results: {
    round_number: number;
    race_name: string;
    race_date?: string;
    driver_code: string;
    position?: number;
    points: number;
  }[];
}

/* ── Page ────────────────────────────────────────────────────────── */
export default function TeamDetailPage() {
  const params        = useParams();
  const searchParams  = useSearchParams();
  const router        = useRouter();
  const teamId        = Number(params.teamId);

  const seasonFromUrl = searchParams.get('season');
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [selectedSeason, setSelectedSeason] = useState(seasonFromUrl ? Number(seasonFromUrl) : 0);
  const [detail, setDetail]                 = useState<ConstructorDetail | null>(null);
  const [seasonDrivers, setSeasonDrivers]   = useState<Driver[]>([]);
  const [loading, setLoading]               = useState(true);
  const refreshKey = useDataVersion();

  /* Load seasons */
  useEffect(() => {
    api.getSeasons().then(years => {
      setAvailableYears(years);
      if (!seasonFromUrl && years.length > 0) setSelectedSeason(years[0]);
    }).catch(() => {});
  }, [refreshKey]);

  /* Sync URL */
  useEffect(() => {
    if (!selectedSeason || !teamId) return;
    router.replace(`/teams/${teamId}?season=${selectedSeason}`, { scroll: false });
  }, [selectedSeason, teamId, router]);

  /* Load constructor detail + all season drivers */
  useEffect(() => {
    if (!selectedSeason || !teamId) return;
    setLoading(true);

    Promise.all([
      api.getConstructorDetail(teamId, selectedSeason),
      api.getDrivers(selectedSeason),
    ]).then(([det, allDrivers]) => {
      setDetail(det);
      // Filter drivers that belong to this team
      const teamName = det.name;
      const tDrivers = allDrivers.filter(
        (d) => d.team_name && (
          d.team_name.toLowerCase() === teamName.toLowerCase() ||
          d.team_name.toLowerCase().includes(teamName.toLowerCase()) ||
          teamName.toLowerCase().includes(d.team_name.toLowerCase())
        )
      );
      setSeasonDrivers(tDrivers);
    }).catch(console.error).finally(() => setLoading(false));
  }, [selectedSeason, teamId, refreshKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="card text-center py-16">
        <h2 className="text-2xl font-bold text-white mb-2">Team Not Found</h2>
        <Link href="/teams" className="text-blue-400 hover:text-blue-300 text-sm">← Back to Teams</Link>
      </div>
    );
  }

  const tc      = getTeamColor(detail.name);
  const carImg  = getCarImage(detail.name, selectedSeason);
  const profile = getTeamProfile(detail.name);

  /* Average finish — from race_results filtered to positions */
  const finishes = detail.race_results.filter(r => r.position && r.position > 0).map(r => r.position!);
  const avgFinish = finishes.length ? (finishes.reduce((a, b) => a + b, 0) / finishes.length).toFixed(1) : '—';

  /* Best finish */
  const bestFinish = finishes.length ? Math.min(...finishes) : null;

  /* Races counted */
  const uniqueRaces = new Set(detail.race_results.map(r => r.round_number)).size;

  return (
    <div className="space-y-0 animate-fade-in pb-12">

      {/* ── Back link + Season selector ─────────────────────────── */}
      <div className="flex items-center justify-between mb-4">
        <Link href={`/teams?season=${selectedSeason}`} className="flex items-center gap-1.5 text-gray-400 hover:text-white text-sm transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          All Teams
        </Link>
        <div className="flex gap-2">
          {[...availableYears].reverse().map(yr => (
            <button
              key={yr}
              onClick={() => setSelectedSeason(yr)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                selectedSeason === yr
                  ? 'bg-racing-red-600 text-white'
                  : 'bg-carbon-800 text-gray-400 hover:text-white border border-carbon-700'
              }`}
            >
              {yr}
            </button>
          ))}
        </div>
      </div>

      {/* ── Hero section ────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden" style={{ background: tc }}>
        {/* Top: car image area */}
        <div className="relative flex items-center justify-center" style={{ minHeight: 'clamp(180px,35vw,260px)' }}>
          {/* Halftone pattern */}
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)',
              backgroundSize: '18px 18px',
            }}
          />
          {/* Radial glow center */}
          <div
            className="absolute inset-0"
            style={{ background: `radial-gradient(ellipse 70% 60% at 50% 50%, rgba(255,255,255,0.08), transparent)` }}
          />
          {/* Car livery image — right-anchored */}
          {carImg && (
            <div className="absolute right-0 bottom-0 top-0 w-[62%] overflow-hidden pointer-events-none">
              <img
                src={carImg}
                alt=""
                className="absolute bottom-0 right-0 w-full h-full object-contain object-right-bottom"
                style={{
                  filter: 'drop-shadow(-16px 0 32px rgba(0,0,0,0.65))',
                  transform: 'scale(1.06)',
                  transformOrigin: 'right bottom',
                  opacity: 0.92,
                }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          )}
          {/* Team logo — centred, large */}
          <div className="relative z-10 flex items-center justify-center w-full" style={{ minHeight: 220 }}>
            <span className="text-white/[0.06] text-[9rem] font-black uppercase absolute select-none pointer-events-none tracking-tight leading-none">
              {detail.name.split(' ').slice(0, 2).join(' ')}
            </span>
            <TeamLogo
              teamName={detail.name}
              season={selectedSeason}
              className="relative z-10 object-contain"
              style={{ maxHeight: 160, maxWidth: '55%', filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.5)) brightness(1.08)' }}
              fallbackLarge
            />
          </div>
        </div>

        {/* Team name stripe */}
        <div className="bg-white/5 border-t border-white/10 py-5 px-6 text-center">
          <div className="flex items-center justify-center gap-4">
            {/* Left slashes */}
            <div className="hidden sm:flex gap-1">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="w-[3px] h-10 bg-white/30 rotate-[20deg]" />
              ))}
            </div>
            <h1 className="text-2xl sm:text-4xl md:text-6xl font-display font-black text-white uppercase tracking-tight leading-none">
              {detail.name}
            </h1>
            {/* Right slashes */}
            <div className="hidden sm:flex gap-1">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="w-[3px] h-10 bg-white/30 rotate-[20deg]" />
              ))}
            </div>
          </div>

          {/* Driver names */}
          {detail.drivers.length > 0 && (
            <div className="mt-3 flex items-center justify-center gap-3 flex-wrap">
              {detail.drivers.map((d, i) => (
                <span key={d.driver_id} className="flex items-center gap-2">
                  {i > 0 && <span className="text-white/30 hidden sm:inline">|</span>}
                  <span className="text-white/80 font-semibold text-sm">{d.driver_name}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Season stats strip ──────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        <StatPill label="Points" value={detail.total_points.toFixed(0)} />
        <StatPill label="Wins" value={detail.wins} />
        <StatPill label="Podiums" value={detail.podiums} />
        <StatPill label="Avg. Finish" value={avgFinish} />
      </div>

      {/* ── DRIVERS section ─────────────────────────────────────── */}
      {seasonDrivers.length > 0 && (
        <div className="pt-8">
          <h2 className="text-2xl font-display font-black text-white uppercase tracking-widest mb-4">
            DRIVERS
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {seasonDrivers.map((d) => (
              <DriverCard key={d.id} driver={d} season={selectedSeason} teamColor={tc} />
            ))}
          </div>
        </div>
      )}

      {/* ── TEAM PROFILE section ─────────────────────────────────── */}
      <div className="pt-8">
        <h2 className="text-2xl font-display font-black text-white uppercase tracking-widest mb-4">
          TEAM PROFILE
        </h2>
        <div className="bg-carbon-900 border border-carbon-700 rounded-2xl p-6">
          {/* Profile grid — 2 rows × 4 cols matching F1 official site */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-8">
            <ProfileRow label="Full Team Name" value={profile?.fullName ?? detail.name} />
            <ProfileRow label="Base" value={profile?.base} />
            <ProfileRow label="Team Chief" value={profile?.teamChief} />
            <ProfileRow label="Technical Chief" value={profile?.technicalChief} />
            <ProfileRow label="First Team Entry" value={profile?.firstEntry} />
          </div>
          {/* Team description narrative */}
          {getTeamDescription(detail.name) && (
            <div className="mt-8 pt-6 border-t border-carbon-700">
              <p className="text-gray-300 text-sm md:text-base leading-relaxed">
                {getTeamDescription(detail.name)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Race results table ─────────────────────────────────── */}
      {detail.race_results.length > 0 && (
        <div className="pt-8">
          <h2 className="text-2xl font-display font-black text-white uppercase tracking-widest mb-4">
            {selectedSeason} SEASON RESULTS
          </h2>
          <div className="rounded-2xl overflow-hidden border border-carbon-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-carbon-800 text-gray-400 text-xs uppercase tracking-wider">
                  <th className="hidden sm:table-cell px-3 sm:px-4 py-3 text-left w-12">Round</th>
                  <th className="px-3 sm:px-4 py-3 text-left">Race</th>
                  <th className="px-2 sm:px-4 py-3 text-left">Driver</th>
                  <th className="px-2 sm:px-4 py-3 text-center">Pos</th>
                  <th className="px-2 sm:px-4 py-3 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {detail.race_results.map((r, i) => (
                  <tr
                    key={`${r.round_number}-${r.driver_code}`}
                    className="border-t border-carbon-800 hover:bg-carbon-800/40 transition-colors"
                    style={i % 2 === 0 ? {} : { background: 'rgba(255,255,255,0.015)' }}
                  >
                    <td className="hidden sm:table-cell px-3 sm:px-4 py-2.5 text-gray-500 font-mono text-xs">{r.round_number}</td>
                    <td className="px-3 sm:px-4 py-2.5 text-white font-medium text-xs sm:text-sm leading-tight">
                      {r.race_name.replace(' Grand Prix', ' GP')}
                    </td>
                    <td className="px-2 sm:px-4 py-2.5">
                      <span
                        className="inline-block px-1.5 sm:px-2 py-0.5 rounded text-xs font-black text-white"
                        style={{ background: tc }}
                      >
                        {r.driver_code}
                      </span>
                    </td>
                    <td className="px-2 sm:px-4 py-2.5 text-center">
                      {r.position === 1   ? <span className="text-yellow-400 font-black text-xs sm:text-sm">🥇 P1</span>
                      : r.position === 2  ? <span className="text-gray-300 font-black text-xs sm:text-sm">🥈 P2</span>
                      : r.position === 3  ? <span className="text-orange-400 font-black text-xs sm:text-sm">🥉 P3</span>
                      : r.position        ? <span className="text-gray-300 font-semibold text-xs sm:text-sm">P{r.position}</span>
                      : <span className="text-gray-500">—</span>}
                    </td>
                    <td className="px-2 sm:px-4 py-2.5 text-right text-white font-bold text-xs sm:text-sm">
                      {r.points > 0 ? r.points : <span className="text-gray-600">0</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
