'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface NextSession {
  race_id?: number | null;
  race_name: string;
  session_type: string;
  session_date: string; // ISO UTC string
  session_end?: string;
  is_live?: boolean;
  source?: string;
}

function useNextSession() {
  const [data, setData] = useState<NextSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const result = await api.getNextSession();
        if (!cancelled) setData(result);
      } catch {
        // silently ignore
      }
    };
    load();
    // Refresh every minute so live/upcoming state stays current.
    const id = setInterval(load, 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return data;
}

function useCountdown(targetIso: string | undefined) {
  const [diff, setDiff] = useState<number>(-1);

  useEffect(() => {
    if (!targetIso) return;
    const target = new Date(targetIso).getTime();
    const tick = () => setDiff(Math.max(0, target - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);

  return diff;
}

function formatDiff(ms: number) {
  const totalSecs = Math.floor(ms / 1000);
  const days = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  const pad = (n: number) => String(n).padStart(2, '0');

  if (days > 0) {
    return { primary: `${days}d ${pad(hours)}h ${pad(mins)}m`, secondary: null };
  }
  if (hours > 0) {
    return { primary: `${pad(hours)}:${pad(mins)}:${pad(secs)}`, secondary: null };
  }
  return { primary: `${pad(mins)}:${pad(secs)}`, secondary: null };
}

function formatLiveDuration(ms: number) {
  const totalSecs = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hours)}h ${pad(mins)}m ${pad(secs)}s`;
}

// Abbreviate long race names so they fit in the navbar
function shortName(name: string) {
  return name
    .replace(' Grand Prix', ' GP')
    .replace('Grand Prix', 'GP');
}

function countryTag(name: string) {
  return shortName(name)
    .replace(' GP', '')
    .replace('Japanese', 'Japan')
    .replace('Saudi Arabian', 'Saudi Arabia')
    .replace('United States', 'USA')
    .trim()
    .toUpperCase();
}

function countryCode(name: string): string | null {
  const n = (name || '').toLowerCase();
  if (n.includes('japan')) return 'jp';
  if (n.includes('australia')) return 'au';
  if (n.includes('bahrain')) return 'bh';
  if (n.includes('saudi')) return 'sa';
  if (n.includes('china')) return 'cn';
  if (n.includes('miami') || n.includes('united states') || n.includes('las vegas')) return 'us';
  if (n.includes('imola') || n.includes('italy') || n.includes('monza')) return 'it';
  if (n.includes('monaco')) return 'mc';
  if (n.includes('canada')) return 'ca';
  if (n.includes('spain')) return 'es';
  if (n.includes('austria')) return 'at';
  if (n.includes('british') || n.includes('silverstone')) return 'gb';
  if (n.includes('hungary')) return 'hu';
  if (n.includes('belgium')) return 'be';
  if (n.includes('dutch') || n.includes('netherlands')) return 'nl';
  if (n.includes('singapore')) return 'sg';
  if (n.includes('mexico')) return 'mx';
  if (n.includes('brazil') || n.includes('sao paulo')) return 'br';
  if (n.includes('qatar')) return 'qa';
  if (n.includes('abu dhabi')) return 'ae';
  return null;
}

function normalizeSessionLabel(sessionType: string) {
  const t = (sessionType || '').trim().toUpperCase();
  if (t === 'FP1') return 'PRACTICE 1';
  if (t === 'FP2') return 'PRACTICE 2';
  if (t === 'FP3') return 'PRACTICE 3';
  if (t === 'Q') return 'QUALIFYING';
  return t;
}

function formatUpcomingDuration(ms: number) {
  const totalSecs = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(hours)} h ${pad(mins)} m ${pad(secs)} s`;
}

export default function NextSessionCountdown() {
  const next = useNextSession();
  const startDiff = useCountdown(next?.session_date);
  const endDiff = useCountdown(next?.session_end);

  if (!next) {
    return (
      <Link
        href="/races"
        className="hidden md:flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-carbon-800/60 border border-carbon-700 hover:border-carbon-500 transition-colors group"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-gray-500 flex-shrink-0" />
        <div className="flex flex-col leading-none">
          <span className="text-[10px] text-gray-500 font-medium">Next session</span>
          <span className="text-xs font-mono font-bold tabular-nums text-gray-300">Not scheduled in DB</span>
        </div>
      </Link>
    );
  }

  if (startDiff < 0 && endDiff < 0) return null;

  const now = Date.now();
  const startMs = new Date(next.session_date).getTime();
  const endMs = next.session_end ? new Date(next.session_end).getTime() : 0;
  const isLive = Boolean(next.is_live || (endMs > startMs && now >= startMs && now < endMs));

  const { primary } = formatDiff(startDiff);
  const isImminent = startDiff < 60 * 60 * 1000; // < 1 hour
  const sessionLabel = next.session_type;
  const sessionDisplay = normalizeSessionLabel(sessionLabel);
  const hasRaceLink = typeof next.race_id === 'number' && next.race_id > 0;
  const cc = countryCode(next.race_name);

  if (isLive) {
    const liveRemainingMs = next.session_end ? endDiff : 0;
    const liveContent = (
      <>
        <div className="w-5 h-5 rounded-full bg-white/95 flex items-center justify-center shadow-inner">
          <div className="w-3 h-3 rounded-full bg-red-500" />
        </div>

        <div className="flex flex-col leading-none">
          <span className="text-[9px] tracking-wider text-blue-100/90 font-bold">{countryTag(next.race_name)}</span>
          <span className="text-[12px] font-black text-white uppercase tracking-tight">
            {sessionLabel} <span className="text-yellow-300">- Live</span>
          </span>
        </div>

        <div className="h-6 w-px bg-white/30 mx-1" />

        <span className="text-[13px] font-black text-white font-mono tabular-nums tracking-tight">
          {formatLiveDuration(liveRemainingMs)}
        </span>
      </>
    );

    if (hasRaceLink) {
      return (
        <Link
          href={`/races/${next.race_id}`}
          className="hidden md:flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-sky-600 via-blue-500 to-sky-700 border border-sky-300/25 shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset] hover:brightness-110 transition-all"
        >
          {liveContent}
        </Link>
      );
    }

    return (
      <div className="hidden md:flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-sky-600 via-blue-500 to-sky-700 border border-sky-300/25 shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset]">
        {liveContent}
      </div>
    );
  }

  const content = (
    <>
      <div className="w-8 h-5 rounded-full bg-white border border-slate-300/80 overflow-hidden flex items-center justify-center shadow-inner flex-shrink-0">
        {cc ? (
          <img
            src={`https://flagcdn.com/w40/${cc}.png`}
            alt={`${countryTag(next.race_name)} flag`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <span className="text-[11px]">🏁</span>
        )}
      </div>

      <div className="flex flex-col leading-none min-w-[92px]">
        <span className="text-[9px] tracking-wider text-blue-100/85 font-bold uppercase">{countryTag(next.race_name)}</span>
        <span className="text-[12px] font-black text-white uppercase tracking-tight">{sessionDisplay}</span>
      </div>

      <div className="h-6 w-px bg-white/25 mx-1" />

      <span className={`text-[13px] font-black font-mono tabular-nums tracking-tight ${isImminent ? 'text-yellow-300' : 'text-white'}`}>
        {formatUpcomingDuration(startDiff) || primary}
      </span>
    </>
  );

  if (hasRaceLink) {
    return (
      <Link
        href={`/races/${next.race_id}`}
        className="hidden md:flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-slate-800/95 via-slate-900/95 to-slate-800/95 border border-sky-300/20 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset] hover:brightness-110 transition-all group"
      >
        {content}
      </Link>
    );
  }

  return (
    <div className="hidden md:flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-slate-800/95 via-slate-900/95 to-slate-800/95 border border-sky-300/20 shadow-[0_0_0_1px_rgba(255,255,255,0.05)_inset]">
      {content}
    </div>
  );
}
