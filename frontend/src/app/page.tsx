"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { useDataVersion } from "@/lib/useDataVersion";
import type { Race, Driver } from "@/types";

/* ── Animated counter ─────────────────────────────────────────── */
function useCounter(target: number, duration = 1500, initDelay = 0) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!target) { setCount(0); return; }
    const tid = setTimeout(() => {
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min((now - t0) / duration, 1);
        setCount(Math.round(target * (1 - (1 - p) ** 4)));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, initDelay);
    return () => clearTimeout(tid);
  }, [target, duration, initDelay]);
  return count;
}

/* ── Scroll reveal ────────────────────────────────────────────── */
function useInView(threshold = 0.1) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const rect = el.getBoundingClientRect();
      if (rect.top < window.innerHeight * (1 + threshold) && rect.bottom > 0) {
        setVisible(true);
        window.removeEventListener("scroll", check);
      }
    };
    check(); // fire immediately in case already in viewport
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, [threshold]);
  return { ref, visible };
}

/* ── Constants ────────────────────────────────────────────────── */
const TEL_BARS = [42, 68, 55, 91, 73, 84, 47, 96, 62, 78, 53, 89, 71, 65, 88, 44, 94, 58];

const FEATURE_CARDS = [
  {
    href: "/races",
    label: "Race Analysis",
    cta: "Explore Races",
    desc: "Lap times, pit strategies, race progression — every Grand Prix in detail.",
    color: "#e10600",
    gradFrom: "#1c0500",
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 10V3L4 14h7v7l9-11h-7z" />,
  },
  {
    href: "/drivers",
    label: "Driver Profiles",
    cta: "View Drivers",
    desc: "Career stats, head-to-head comparisons, and championship journeys.",
    color: "#00b8ff",
    gradFrom: "#001018",
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />,
  },
  {
    href: "/analytics",
    label: "Advanced Analytics",
    cta: "Open Dashboard",
    desc: "Team performance, sector analysis, and tire strategy insights.",
    color: "#a855f7",
    gradFrom: "#0e001a",
    icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
  },
];

const STAT_DEFS = [
  { key: "races",   label: "Races Analyzed",  color: "#e10600" },
  { key: "drivers", label: "Drivers Tracked",  color: "#00b8ff" },
  { key: "seasons", label: "Seasons",           color: "#f97316" },
  { key: "data",    label: "Data Points",       color: "#00d94f" },
];

const CHECKLIST = [
  "Sector-by-sector lap analysis",
  "Tire degradation modeling",
  "Weather impact correlation",
  "Pit stop strategy optimizer",
];

/* ── Component ───────────────────────────────────────────────── */
export default function Home() {
  const [races, setRaces]       = useState<Race[]>([]);
  const [drivers, setDrivers]   = useState<Driver[]>([]);
  const [loading, setLoading]   = useState(true);
  const [availableYears, setYears] = useState<number[]>([]);
  const [selectedYear, setYear]    = useState<number | null>(null);
  const [heroReady, setHeroReady]  = useState(false);
  const [pageEntered, setPageEntered] = useState(false);
  const refreshKey = useDataVersion();

  const statsSection   = useInView();
  const cardsSection   = useInView();
  const telSection     = useInView();

  /* Page + hero entrance */
  useEffect(() => {
    const t1 = setTimeout(() => setPageEntered(true), 20);
    const t2 = setTimeout(() => setHeroReady(true), 80);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  useEffect(() => {
    api.getSeasons()
      .then(yrs => { setYears(yrs); if (yrs.length) setYear(yrs[0]); })
      .catch(() => setYear(2021));
  }, [refreshKey]);

  useEffect(() => {
    if (!selectedYear) return;
    setLoading(true);
    Promise.all([api.getRaces(selectedYear), api.getDrivers(selectedYear)])
      .then(([r, d]) => { setRaces(r); setDrivers(d); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedYear, refreshKey]);

  const raceCount   = useCounter(races.length,   1500, 300);
  const driverCount = useCounter(drivers.length, 1500, 500);
  const recentRaces = races.slice(0, 5);

  const statValues: Record<string, string> = {
    races:   loading ? "…" : String(raceCount),
    drivers: loading ? "…" : String(driverCount),
    seasons: String(availableYears.length || "…"),
    data:    "2.4M+",
  };

  /* ── Hero title lines (data, not JSX, so TS is happy) ───────── */
  const titleLines = [
    { text: "F1",           delay: "140ms", red: false, underline: false },
    { text: "Intelligence", delay: "270ms", red: false, underline: true  },
    { text: "Hub",          delay: "400ms", red: true,  underline: false },
  ] as const;

  return (
    <div className={`space-y-10 pb-16 ${pageEntered ? "page-enter" : "opacity-0"}`}>

      {/* ════════════════════════════ HERO ════════════════════════════ */}
      <section className="relative overflow-hidden rounded-3xl border border-carbon-800 min-h-[320px] sm:min-h-[400px] md:min-h-[440px] flex flex-col justify-center"
        style={{ background: "linear-gradient(160deg,#080810 0%,#07070a 100%)" }}>

        {/* Subtle grid */}
        <div className="absolute inset-0 opacity-[0.028]"
          style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "44px 44px" }} />
        {/* Red radial glow */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_65%_50%_at_63%_47%,rgba(225,6,0,0.10),transparent)]" />
        {/* Speed streaks */}
        {[10, 27, 44, 61, 77].map((top, i) => (
          <div key={i}
            className="absolute h-px bg-gradient-to-l from-racing-red-500/20 via-racing-red-400/6 to-transparent pointer-events-none"
            style={{ top: `${top}%`, right: 0, width: `${30 + i * 9}%` }} />
        ))}
        {/* Bottom accent line */}
        <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-racing-red-500/30 to-transparent" />

        {/* ── Content ── */}
        <div className="relative z-10 px-4 py-6 sm:p-8 md:p-12 lg:p-14 flex flex-col md:flex-row items-start md:items-center gap-6 md:gap-10">

          {/* Left text */}
          <div className="flex-1 max-w-2xl">
            {/* Badge */}
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full bg-racing-red-500/10 border border-racing-red-500/20 text-racing-red-400 text-xs font-bold uppercase tracking-widest mb-6 transition-all duration-700 ${heroReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-racing-red-500 animate-pulse" />
              Live Telemetry · Analytics Platform
            </div>

            {/* Title — staggered line-by-line */}
            <h1 className="font-display font-bold leading-tight md:leading-[0.92] mb-6">
              {titleLines.map(({ text, delay, red, underline }) => (
                <span key={text}
                  className={`relative block text-3xl sm:text-4xl md:text-5xl lg:text-[4.5rem] transition-all duration-700 ${heroReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-7"} ${red ? "text-gradient-red" : "text-white"}`}
                  style={{ transitionDelay: delay }}>
                  {text}
                  {underline && (
                    <span
                      className="absolute -bottom-0.5 left-0 h-[2px] bg-gradient-to-r from-racing-red-500 via-racing-red-400 to-transparent rounded-full transition-all duration-700"
                      style={{ width: heroReady ? "100%" : "0%", transitionDelay: "820ms" }} />
                  )}
                </span>
              ))}
            </h1>

            <p className={`text-lg text-gray-400 mb-8 max-w-md leading-relaxed transition-all duration-700 ${heroReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}
              style={{ transitionDelay: "510ms" }}>
              Advanced race analytics powered by real telemetry. Explore every Grand Prix, driver, and championship battle.
            </p>

            <div className={`flex flex-wrap gap-3 transition-all duration-700 ${heroReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}
              style={{ transitionDelay: "620ms" }}>
              <Link href="/races" className="group btn-primary flex items-center gap-2 text-sm">
                Explore Races
                <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5-5 5M6 12h12" />
                </svg>
              </Link>
              <Link href="/analytics" className="btn-secondary text-sm">Analytics Dashboard</Link>
              <Link href="/standings"
                className="px-5 py-2.5 text-sm font-semibold rounded-xl border border-carbon-600 text-gray-400 hover:text-white hover:border-carbon-500 transition-all duration-200">
                Standings
              </Link>
            </div>
          </div>

          {/* Right: season card */}
          <div className={`w-full md:w-[22rem] shrink-0 transition-all duration-700 ${heroReady ? "opacity-100 translate-x-0" : "opacity-0 translate-x-8"}`}
            style={{ transitionDelay: "255ms" }}>
            <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] h-full"
              style={{ background: "linear-gradient(158deg,#101020 0%,#07070e 100%)", boxShadow: "0 0 70px rgba(225,6,0,0.07), inset 0 1px 0 rgba(255,255,255,0.05)" }}>
              <div className="h-px inset-x-0 bg-gradient-to-r from-transparent via-racing-red-500/60 to-transparent" />
              <div className="p-7 flex flex-col gap-6">

                {/* Year header */}
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-[9px] text-gray-600 uppercase tracking-[0.22em] font-bold mb-2">Season</div>
                    <div className="text-6xl font-black text-white tabular-nums leading-none tracking-tight">{selectedYear ?? "…"}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[9px] text-gray-600 uppercase tracking-[0.22em] font-bold mb-2">Coverage</div>
                    <div className="text-sm font-bold text-gray-400 tabular-nums">
                      {availableYears.length > 1
                        ? `${[...availableYears].at(-1)}–${availableYears[0]}`
                        : (availableYears[0] ?? "—")}
                    </div>
                  </div>
                </div>

                {/* Year pills — abbreviated to 2 digits, wrapping */}
                {availableYears.length === 0 ? (
                  <div className="flex gap-2">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="flex-1 h-9 rounded-lg bg-white/5 animate-pulse" />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {[...availableYears].reverse().map(yr => (
                      <button key={yr} onClick={() => setYear(yr)}
                        className={`px-3 py-2 rounded-lg text-xs font-black tracking-wider transition-all duration-200 min-w-[3rem] ${
                          selectedYear === yr
                            ? "bg-racing-red-500 text-white shadow-[0_0_20px_rgba(225,6,0,0.50)] scale-[1.06]"
                            : "bg-white/[0.05] text-gray-500 hover:text-gray-200 hover:bg-white/[0.10] border border-white/[0.06]"
                        }`}>
                        '{String(yr).slice(2)}
                      </button>
                    ))}
                  </div>
                )}

                {/* Mini stat cards */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Grands Prix", val: loading ? null : raceCount,   color: "#e10600", max: 24 },
                    { label: "Drivers",     val: loading ? null : driverCount, color: "#00b8ff", max: 22 },
                  ].map(({ label, val, color, max }) => (
                    <div key={label} className="rounded-xl p-4 border border-white/[0.05]"
                      style={{ background: `linear-gradient(135deg,${color}12 0%,transparent 100%)` }}>
                      <div className="text-3xl font-black tabular-nums leading-none mb-1" style={{ color }}>{val ?? "…"}</div>
                      <div className="text-[9px] text-gray-600 uppercase tracking-wider mb-3">{label}</div>
                      <div className="h-0.5 bg-white/5 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-1000 ease-out"
                          style={{ width: val ? `${Math.min(100, (val / max) * 100)}%` : "0%", background: color }} />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer */}
                <div className="border-t border-white/[0.05] pt-1 flex items-center justify-between text-[10px]">
                  <span className="text-gray-700 flex items-center gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-track-green" />
                    FastF1 · Ergast
                  </span>
                  <Link href={`/races?season=${selectedYear}`}
                    className="flex items-center gap-1 text-racing-red-400 hover:text-racing-red-300 font-bold transition-colors duration-200">
                    View races
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5-5 5M6 12h12" />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ════════════════════════════ STATS ════════════════════════════ */}
      <section ref={statsSection.ref} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {STAT_DEFS.map(({ key, label, color }, i) => (
          <div key={label}
            className="glass p-5 text-center"
            style={{
              transitionDelay: `${i * 80}ms`,
              opacity: statsSection.visible ? 1 : 0,
              transform: statsSection.visible ? "translateY(0)" : "translateY(24px)",
              transition: `opacity 0.7s ease ${i * 80}ms, transform 0.7s ease ${i * 80}ms, border-top-color 0.5s ease ${i * 80 + 220}ms`,
              borderTop: "2px solid",
              borderTopColor: statsSection.visible ? color : "transparent",
            }}>
            <div className="text-3xl font-display font-black tabular-nums mb-1" style={{ color }}>
              {statValues[key]}
            </div>
            <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">{label}</div>
          </div>
        ))}
      </section>

      {/* ════════════════════════════ FEATURE CARDS ════════════════════ */}
      <section ref={cardsSection.ref}>
        <h2 className="section-title mb-6">Explore the Platform</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {FEATURE_CARDS.map(({ href, label, desc, cta, color, gradFrom, icon }, i) => (
            <div key={href}
              style={{
                opacity: cardsSection.visible ? 1 : 0,
                transform: cardsSection.visible ? "translateY(0)" : "translateY(32px)",
                transition: `opacity 0.7s ease ${cardsSection.visible ? i * 100 : 0}ms, transform 0.7s ease ${cardsSection.visible ? i * 100 : 0}ms`,
              }}>
              <Link href={href}
                className="group relative block overflow-hidden rounded-2xl card-shine border border-white/[0.07] hover:border-white/[0.15] hover:-translate-y-1.5 transition-[transform,border-color,box-shadow] duration-300 h-full"
                style={{ background: `linear-gradient(160deg, ${gradFrom} 0%, #0d0d0d 100%)` }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = `0 24px 60px -12px ${color}28, 0 0 0 1px ${color}18`)}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}>

                {/* Top glow stripe on hover */}
                <div className="absolute top-0 inset-x-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  style={{ background: `linear-gradient(90deg,transparent,${color}55,transparent)` }} />
                {/* Corner glow blob */}
                <div className="absolute -top-16 -right-16 w-52 h-52 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{ background: `radial-gradient(circle,${color}18,transparent)` }} />

                <div className="relative p-7 flex flex-col h-full">
                  {/* Icon */}
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-5 border border-white/[0.07] group-hover:scale-110 group-hover:shadow-lg transition-all duration-300"
                    style={{ background: `linear-gradient(135deg,${color}22,${color}08)` }}>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ color }}>
                      {icon}
                    </svg>
                  </div>
                  <h3 className="text-xl font-display font-bold text-white mb-2">{label}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed flex-1">{desc}</p>
                  <div className="flex items-center gap-2 mt-6 text-sm font-bold group-hover:gap-3 transition-all duration-200" style={{ color }}>
                    {cta}
                    <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4-4 4M6 12h12" />
                    </svg>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ════════════════════════════ RECENT RACES ══════════════════════ */}
      {recentRaces.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-5">
            <h2 className="section-title mb-0">{selectedYear} Season</h2>
            <Link href={`/races?season=${selectedYear}`}
              className="text-sm text-racing-red-400 hover:text-racing-red-300 font-bold flex items-center gap-1.5 transition-colors duration-200">
              All rounds
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5-5 5M6 12h12" />
              </svg>
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {recentRaces.map((race, i) => {
              const date = race.date ? new Date(race.date) : null;
              return (
                <Link key={race.id} href={`/races/${race.id}`}
                  className="group relative overflow-hidden rounded-xl border border-carbon-700 hover:border-carbon-500 bg-carbon-900 p-4 transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover"
                  style={{ animationDelay: `${i * 60}ms` }}>
                  <div className="absolute top-0 inset-x-0 h-px opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-r from-transparent via-racing-red-500/35 to-transparent" />
                  <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-racing-red-500/10 border border-racing-red-500/20 text-racing-red-400 text-xs font-black mb-3">
                    R{race.round_number}
                  </div>
                  <div className="text-sm font-bold text-white leading-tight mb-1 line-clamp-2">
                    {race.name.replace(" Grand Prix", " GP")}
                  </div>
                  {date && (
                    <div className="text-[10px] text-gray-600 tabular-nums">
                      {date.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </div>
                  )}
                  {race.winner_name && (
                    <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-carbon-700">
                      <span className="text-track-green text-[9px] font-black uppercase tracking-wide">P1</span>
                      <span className="text-gray-400 text-[10px] font-semibold truncate">
                        {race.winner_name.split(" ").pop()}
                      </span>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* ════════════════════════════ TELEMETRY ════════════════════════ */}
      <section ref={telSection.ref} className="rounded-3xl border border-carbon-800 overflow-hidden"
        style={{ background: "linear-gradient(160deg,#07070a 0%,#050508 100%)" }}>
        <div className="flex flex-col lg:flex-row">

          {/* Text side */}
          <div className="flex-1 p-8 md:p-12 flex flex-col justify-center">
            <div className="inline-block px-3 py-1 rounded-full bg-track-green/10 border border-track-green/20 text-track-green text-xs font-bold uppercase tracking-widest mb-5">
              Real-Time Telemetry
            </div>
            <h2 className="text-3xl md:text-4xl font-display font-bold text-white mb-4 transition-all duration-700"
              style={{ opacity: telSection.visible ? 1 : 0, transform: telSection.visible ? "translateX(0)" : "translateX(-24px)" }}>
              Precision Data at<br />Your Fingertips
            </h2>
            <p className="text-gray-400 leading-relaxed mb-6 max-w-md transition-all duration-700"
              style={{
                opacity: telSection.visible ? 1 : 0,
                transform: telSection.visible ? "translateX(0)" : "translateX(-24px)",
                transitionDelay: "100ms",
              }}>
              Millions of data points processed: speed traces, brake points, throttle inputs, and DRS deployment — all queryable in seconds.
            </p>
            <ul className="space-y-3">
              {CHECKLIST.map((item, i) => (
                <li key={item}
                  className="flex items-center gap-3 text-gray-300 text-sm transition-all duration-500"
                  style={{
                    opacity: telSection.visible ? 1 : 0,
                    transform: telSection.visible ? "translateX(0)" : "translateX(-16px)",
                    transitionDelay: `${180 + i * 80}ms`,
                  }}>
                  <span className="w-5 h-5 rounded-full bg-track-green/15 flex items-center justify-center shrink-0">
                    <svg className="w-3 h-3 text-track-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Animated bar chart */}
          <div className="flex-1 min-h-[260px] relative border-t lg:border-t-0 lg:border-l border-carbon-800 overflow-hidden p-8 flex items-end bg-carbon-950/50">
            <div className="absolute inset-0 transition-opacity duration-700" style={{ opacity: telSection.visible ? 1 : 0, background: "radial-gradient(ellipse 60% 50% at 50% 85%, rgba(0,217,79,0.05), transparent)" }} />
            {/* Horizontal grid lines */}
            <div className="absolute inset-8 flex flex-col justify-between pointer-events-none">
              {[0, 1, 2, 3].map(i => <div key={i} className="w-full h-px bg-white/[0.03]" />)}
            </div>
            {/* Status badge */}
            <div className="absolute top-4 right-4 flex items-center gap-1.5 text-[10px] text-gray-600 uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-track-green animate-pulse" />
              Live Sampling
            </div>
            {/* Bars — scaleY from bottom, fixed px heights avoid % resolution issues */}
            <div className="relative z-10 w-full flex items-end justify-between gap-0.5 md:gap-1 h-24 md:h-36">
              {TEL_BARS.map((h, i) => (
                <div key={i} className="flex-1 rounded-t-sm"
                  style={{
                    height: `${Math.round(h * 1.44)}px`,
                    background: `linear-gradient(to top,rgba(0,217,79,${0.20 + (h / 100) * 0.55}),rgba(0,217,79,0.06))`,
                    transform: telSection.visible ? "scaleY(1)" : "scaleY(0)",
                    transformOrigin: "bottom",
                    opacity: telSection.visible ? 1 : 0,
                    transition: `transform 0.85s cubic-bezier(0.34,1.3,0.64,1) ${i * 38}ms, opacity 0.4s ease ${i * 38}ms`,
                  }} />
              ))}
            </div>
            <div className="absolute bottom-3 left-8 right-8 h-px bg-gradient-to-r from-transparent via-track-green/15 to-transparent" />
          </div>
        </div>
      </section>

    </div>
  );
}
