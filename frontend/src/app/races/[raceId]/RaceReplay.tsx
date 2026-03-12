'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RaceDetail } from '@/types';

interface LapRow {
  lap_number: number;
  driver_code: string;
  lap_time_seconds?: number;
  tire_compound?: string;
  is_pit_in_lap?: boolean;
  is_pit_out_lap?: boolean;
  track_status?: string;
}

/** Classify a FastF1 track_status string into a display category */
function classifyTrackStatus(s?: string): 'sc' | 'vsc' | 'yellow' | 'red' | null {
  if (!s) return null;
  if (s.includes('5')) return 'red';
  if (s.includes('4')) return 'sc';
  if (s.includes('6')) return 'vsc';
  if (s.includes('2')) return 'yellow';
  return null;
}

const STATUS_COLORS: Record<string, string> = {
  sc:     'rgba(249,115,22,0.65)',   // orange
  vsc:    'rgba(168,85,247,0.65)',   // purple
  yellow: 'rgba(234,179,8,0.65)',    // yellow
  red:    'rgba(239,68,68,0.65)',    // red
};

const STATUS_LABELS: Record<string, { label: string; sub: string; icon: string }> = {
  sc:     { label: 'SAFETY CAR',         sub: 'Safety Car deployed on track',         icon: '🚗' },
  vsc:    { label: 'VIRTUAL SAFETY CAR', sub: 'VSC — reduced speed limit in effect',  icon: '🚔' },
  yellow: { label: 'YELLOW FLAG',        sub: 'Caution — hazard on track',            icon: '🟡' },
  red:    { label: 'RED FLAG',           sub: 'Race suspended',                       icon: '🚩' },
};

interface DriverInfo {
  full_name?: string;
  team?: string;
  final_position?: number;
  grid_position?: number;
  laps_completed?: number;
  status?: string;
}

interface RcMsg {
  timestamp: string | null;
  category: string;
  message: string;
  flag: string | null;
  status: string | null;
  scope: string | null;
}

/** Map a race control message to the same kind codes used by track status */
function classifyRcMessage(msg: RcMsg): 'sc' | 'vsc' | 'yellow' | 'red' | null {
  const cat = (msg.category || '').toLowerCase();
  const flag = (msg.flag || '').toUpperCase();
  const status = (msg.status || '').toUpperCase();
  if (cat === 'safetycar') {
    if (status.includes('VIRTUAL') || status.includes('VSC') || flag.includes('VSC')) return 'vsc';
    return 'sc';
  }
  if (cat === 'flag') {
    if (flag === 'RED') return 'red';
    if (flag === 'YELLOW' || flag.includes('YELLOW')) return 'yellow';
  }
  return null;
}

/**
 * Parse a race control message timestamp as elapsed seconds since the session start.
 * Both timestamps must be ISO strings. Returns -1 if unavailable.
 */
function rcMsgElapsed(msgTimestamp: string | null, sessionStart: string | null): number {
  if (!msgTimestamp || !sessionStart) return -1;
  const msgMs = new Date(msgTimestamp).getTime();
  const startMs = new Date(sessionStart).getTime();
  if (isNaN(msgMs) || isNaN(startMs)) return -1;
  return (msgMs - startMs) / 1000;
}

interface Props {
  race: RaceDetail;
  positionData: LapRow[];
  driverColors: Record<string, string>;
  weatherSummary?: any;
  driverInfo?: Record<string, DriverInfo>;
  raceControlMessages?: RcMsg[];
  sessionStart?: string | null;
  drsTelemetry?: {
    drs_zones: { start: number; end: number }[];
    zone_count: number;
    /** 200 samples per driver: [speed, throttle, brake(0|1), drs, gear] */
    driver_telemetry: Record<string, number[][]>;
    circuit_length: number;
  } | null;
}

const TIRE_COLORS: Record<string, string> = {
  SOFT: '#ef4444',
  MEDIUM: '#eab308',
  HARD: '#d1d5db',
  INTERMEDIATE: '#22c55e',
  WET: '#3b82f6',
};
function tireColor(compound?: string): string {
  return TIRE_COLORS[(compound ?? '').toUpperCase()] ?? '#6b7280';
}

const SPEEDS = [0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8, 16] as const;
const TICK_MS = 80;
const SVG_W = 720;
const SVG_H = 480;
const PAD = 32;

function bsearch(arr: number[], target: number): number {
  let lo = 0, hi = arr.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (arr[mid] <= target) lo = mid; else hi = mid - 1;
  }
  return lo;
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m.toString().padStart(2, '0')}:${sec}`;
}

function fmtLap(s: number): string {
  const m = Math.floor(s / 60);
  const sec = (s % 60).toFixed(3).padStart(6, '0');
  return `${m}:${sec}`;
}

export default function RaceReplay({ race, positionData, driverColors, weatherSummary, driverInfo, drsTelemetry, raceControlMessages = [], sessionStart = null }: Props) {
  const [circuitPts, setCircuitPts] = useState<{ x: number; y: number }[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [speedIdx, setSpeedIdx] = useState(4); // default 1x
  const [featuredDrivers, setFeaturedDrivers] = useState<string[]>([]);
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initializedRef = useRef(false);

  const speed = SPEEDS[speedIdx];

  /* ── Lap time maps ─────────────────────────────────────────────────── */
  const driverLapTimes = useMemo(() => {
    const map: Record<string, Record<number, number>> = {};
    for (const d of positionData) {
      if (!d.lap_time_seconds || d.lap_time_seconds < 15) continue;
      if (!map[d.driver_code]) map[d.driver_code] = {};
      map[d.driver_code][d.lap_number] = d.lap_time_seconds;
    }
    return map;
  }, [positionData]);

  const totalLaps = useMemo(
    () => positionData.reduce((m, d) => Math.max(m, d.lap_number), 0),
    [positionData]
  );

  /* ── Tire compound per driver per lap ─────────────────────────────── */
  const driverTireByLap = useMemo(() => {
    const map: Record<string, Record<number, string | undefined>> = {};
    for (const d of positionData) {
      if (!map[d.driver_code]) map[d.driver_code] = {};
      if (d.tire_compound) map[d.driver_code][d.lap_number] = d.tire_compound;
    }
    return map;
  }, [positionData]);


  /* ── Cumulative timelines ──────────────────────────────────────────── */
  const cumulativeTimelines = useMemo(() => {
    const res: Record<string, { lapNums: number[]; cum: number[] }> = {};
    for (const [driver, laps] of Object.entries(driverLapTimes)) {
      const lapNums = Object.keys(laps).map(Number).sort((a, b) => a - b);
      const cum = [0];
      for (const n of lapNums) cum.push(cum[cum.length - 1] + laps[n]);
      res[driver] = { lapNums, cum };
    }
    return res;
  }, [driverLapTimes]);

  const maxTime = useMemo(
    () => Object.values(cumulativeTimelines).reduce((m, { cum }) => Math.max(m, cum[cum.length - 1] ?? 0), 0),
    [cumulativeTimelines]
  );

  /* Leader timeline for progress bar ticks */
  const leaderTimeline = useMemo(() => {
    let best: { lapNums: number[]; cum: number[] } | null = null;
    for (const tl of Object.values(cumulativeTimelines)) {
      if (!best || tl.lapNums.length > best.lapNums.length) best = tl;
    }
    return best;
  }, [cumulativeTimelines]);

  /* ── Status intervals: contiguous runs of same flag/SC/VSC ─────────── */
  const lapStatusIntervals = useMemo(() => {
    if (!leaderTimeline || maxTime <= 0) return [];
    const lapStatus: Record<number, string> = {};
    for (const d of positionData) {
      if (d.track_status && d.lap_number !== undefined)
        lapStatus[d.lap_number] = d.track_status;
    }
    const { lapNums, cum } = leaderTimeline;
    const intervals: { kind: string; start: number; end: number }[] = [];
    for (let i = 0; i < lapNums.length; i++) {
      const kind = classifyTrackStatus(lapStatus[lapNums[i]]);
      if (!kind) continue;
      const start = cum[i];
      const end = cum[i + 1] ?? maxTime;
      const last = intervals[intervals.length - 1];
      if (last && last.kind === kind && Math.abs(last.end - start) < 1) {
        last.end = end; // merge contiguous same-status laps
      } else {
        intervals.push({ kind, start, end });
      }
    }
    return intervals;
  }, [leaderTimeline, positionData, maxTime]);

  /* Active track status at current replay time (drives the pop-up banner) */
  const activeTrackStatus = useMemo(() => {
    for (const iv of lapStatusIntervals) {
      if (currentTime >= iv.start && currentTime < iv.end) return iv.kind;
    }
    return null;
  }, [lapStatusIntervals, currentTime]);

  /* Index of the currently active interval within lapStatusIntervals (-1 if none) */
  const activeIntervalIndex = useMemo(() => {
    if (!activeTrackStatus) return -1;
    for (let i = 0; i < lapStatusIntervals.length; i++) {
      const iv = lapStatusIntervals[i];
      if (currentTime >= iv.start && currentTime < iv.end) return i;
    }
    return -1;
  }, [lapStatusIntervals, currentTime, activeTrackStatus]);

  /* Race control messages grouped by their nearest lapStatusInterval index.
   * Uses absolute timestamps: elapsed = (msgTimestamp - sessionStart) seconds,
   * which aligns with the cumulative lap time scale. Tolerance ±120s to handle
   * messages that arrive slightly before or after the lap-data status change. */
  const rcMessagesByInterval = useMemo(() => {
    const result: Record<number, RcMsg[]> = {};
    if (!raceControlMessages.length || !lapStatusIntervals.length) return result;
    for (const msg of raceControlMessages) {
      const kind = classifyRcMessage(msg);
      if (!kind) continue;
      const elapsed = rcMsgElapsed(msg.timestamp, sessionStart);
      let best = -1;
      let bestDist = Infinity;
      for (let i = 0; i < lapStatusIntervals.length; i++) {
        const iv = lapStatusIntervals[i];
        if (iv.kind !== kind) continue;
        if (elapsed >= 0) {
          // Match to interval by elapsed time with ±120s tolerance
          if (elapsed >= iv.start - 120 && elapsed < iv.end + 120) {
            best = i; break;
          }
          const dist = Math.min(Math.abs(elapsed - iv.start), Math.abs(elapsed - iv.end));
          if (dist < bestDist) { bestDist = dist; best = i; }
        } else {
          // No usable timestamp — append to first matching-kind interval
          if (best < 0) best = i;
          break;
        }
      }
      if (best >= 0) {
        if (!result[best]) result[best] = [];
        result[best].push(msg);
      }
    }
    return result;
  }, [raceControlMessages, lapStatusIntervals, sessionStart]);
  /* ── Circuit load ─────────────────────────────────────────────────── */
  useEffect(() => {
    const slug = race.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    fetch(`/circuits/${slug}.json`)
      .then(r => (r.ok ? r.json() : null))
      .then((data: { x: number[]; y: number[] } | null) => {
        if (data?.x?.length) setCircuitPts(data.x.map((x, i) => ({ x, y: data.y[i] })));
      })
      .catch(() => {});
  }, [race.name]);

  /* ── SVG transform ────────────────────────────────────────────────── */
  const transform = useMemo(() => {
    if (!circuitPts.length) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const { x, y } of circuitPts) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    const rangeX = maxX - minX || 1, rangeY = maxY - minY || 1;
    const scale = Math.min((SVG_W - 2 * PAD) / rangeX, (SVG_H - 2 * PAD) / rangeY);
    const oX = PAD + ((SVG_W - 2 * PAD) - rangeX * scale) / 2;
    const oY = PAD + ((SVG_H - 2 * PAD) - rangeY * scale) / 2;
    return {
      sx: (x: number) => oX + (x - minX) * scale,
      sy: (y: number) => SVG_H - oY - (y - minY) * scale,
    };
  }, [circuitPts]);

  /* Track path */
  const trackPath = useMemo(() => {
    if (!circuitPts.length || !transform) return '';
    const { sx, sy } = transform;
    return (
      circuitPts.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ') + ' Z'
    );
  }, [circuitPts, transform]);

  /* ── DRS zone paths ──────────────────────────────────────────────── */
  const drsZonePaths = useMemo(() => {
    if (!circuitPts.length || !transform || !drsTelemetry?.drs_zones?.length) return [];
    const { sx, sy } = transform;
    const N = circuitPts.length;
    return drsTelemetry.drs_zones.map(zone => {
      const s = Math.max(0, Math.floor(zone.start * N));
      const e = Math.min(N - 1, Math.ceil(zone.end * N));
      if (e <= s) return '';
      return circuitPts
        .slice(s, e + 1)
        .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`)
        .join(' ');
    }).filter(Boolean);
  }, [circuitPts, transform, drsTelemetry]);

  /* ── Pit-in/out lap sets per driver ──────────────────────────────── */
  const driverPitInLaps = useMemo(() => {
    const map: Record<string, Set<number>> = {};
    for (const d of positionData) {
      if (d.is_pit_in_lap) {
        if (!map[d.driver_code]) map[d.driver_code] = new Set();
        map[d.driver_code].add(d.lap_number);
      }
    }
    return map;
  }, [positionData]);

  const driverPitOutLaps = useMemo(() => {
    const map: Record<string, Set<number>> = {};
    for (const d of positionData) {
      if (d.is_pit_out_lap) {
        if (!map[d.driver_code]) map[d.driver_code] = new Set();
        map[d.driver_code].add(d.lap_number);
      }
    }
    return map;
  }, [positionData]);

  /* ── Dynamic pit-exit fraction per driver per pit-out lap ────────────
   * A pit-out lap's time = racing lap time + pit stop time.
   * We estimate the pit stop fraction as (pit_out_time - ref_time) / pit_out_time
   * where ref_time is the driver's 25th-percentile clean lap time.
   * This avoids the fixed-20% assumption failing for long/short stops.
   */
  const driverPitExitFracs = useMemo(() => {
    const result: Record<string, Record<number, number>> = {};
    for (const [driver, pitOutLapSet] of Object.entries(driverPitOutLaps)) {
      result[driver] = {};
      const lapTimes = driverLapTimes[driver] ?? {};
      // Clean laps = laps that are neither pit-in nor pit-out
      const cleanTimes = (Object.entries(lapTimes) as [string, number][])
        .filter(([n]) => {
          const lapNum = Number(n);
          return !driverPitInLaps[driver]?.has(lapNum) && !pitOutLapSet.has(lapNum);
        })
        .map(([, t]) => t)
        .filter(t => t > 20)
        .sort((a, b) => a - b);
      // 25th-percentile as reference (faster than median, avoids SC laps bloating ref)
      const refIdx = Math.floor(cleanTimes.length * 0.25);
      const refLapTime = cleanTimes.length > 0 ? cleanTimes[refIdx] : 90;
      pitOutLapSet.forEach(pitOutLap => {
        const lapTime = lapTimes[pitOutLap];
        if (!lapTime || lapTime <= refLapTime) {
          result[driver][pitOutLap] = 0.18; // fallback ~18%
          return;
        }
        // Fraction of the pit-out lap driven in the pit lane
        const pitFrac = (lapTime - refLapTime) / lapTime;
        result[driver][pitOutLap] = Math.min(0.80, Math.max(0.10, pitFrac));
      });
    }
    return result;
  }, [driverPitOutLaps, driverPitInLaps, driverLapTimes]);

  /* ── Driver positions ─────────────────────────────────────────────── */
  const driverPositions = useMemo(() => {
    const N = circuitPts.length;
    const res: Record<string, {
      sx: number; sy: number; lap: number; effLap: number; frac: number;
      finished: boolean; lastLapTime?: number; isInPit: boolean;
    }> = {};
    if (!N || !transform) return res;
    const { sx, sy } = transform;

    for (const [driver, { lapNums, cum }] of Object.entries(cumulativeTimelines)) {
      const totalDriverTime = cum[cum.length - 1];

      if (currentTime <= 0) {
        const pt = circuitPts[0];
        res[driver] = { sx: sx(pt.x), sy: sy(pt.y), lap: 0, effLap: 0, frac: 0, finished: false, isInPit: false };
        continue;
      }
      if (currentTime >= totalDriverTime) {
        const pt = circuitPts[0];
        const ll = driverLapTimes[driver]?.[lapNums[lapNums.length - 1]];
        res[driver] = { sx: sx(pt.x), sy: sy(pt.y), lap: lapNums.length, effLap: lapNums.length, frac: 0, finished: true, lastLapTime: ll, isInPit: false };
        continue;
      }

      const lo = bsearch(cum, currentTime);
      const frac = (currentTime - cum[lo]) / (cum[lo + 1] - cum[lo] || 1);
      const currentLapNum = lapNums[lo] ?? lo + 1;

      const PIT_ENTRY_FRAC = 0.88; // last ~12% of pit-in lap = entering pit lane

      const isPitInLap  = !!(driverPitInLaps[driver]?.has(currentLapNum));
      const isPitOutLap = !!(driverPitOutLaps[driver]?.has(currentLapNum));
      // Use lap-number arithmetic (currentLapNum - 1) rather than lapNums[lo-1]
      // so detection still works when the pit-in lap is missing from the timeline.
      const prevWasPitIn = !!(driverPitInLaps[driver]?.has(currentLapNum - 1));

      // Dynamic pit-exit fraction from pre-computed table; fallback to 18%
      const pitExitFrac = (isPitOutLap && prevWasPitIn)
        ? (driverPitExitFracs[driver]?.[currentLapNum] ?? 0.18)
        : 0.18;

      // Driver is in pit when:
      // • current lap is a pit-in lap AND they've reached the pit lane entry (~12% before end)
      // • OR current lap is pit-out AND pit stop time hasn't elapsed yet
      const isInPit =
        (isPitInLap  && frac >= PIT_ENTRY_FRAC) ||
        (isPitOutLap && prevWasPitIn && frac < pitExitFrac);

      let ptIdx: number;
      if (isInPit) {
        // Park at the start/finish area (index 0) which is near the pit exit on most circuits
        ptIdx = 0;
      } else if (isPitOutLap && prevWasPitIn) {
        // Remap frac from [pitExitFrac … 1] → [0 … N-1] so the driver emerges
        // smoothly from the pit exit with no position jump.
        const remapped = (frac - pitExitFrac) / Math.max(0.001, 1 - pitExitFrac);
        ptIdx = Math.min(Math.floor(Math.max(0, remapped) * N), N - 1);
      } else {
        ptIdx = Math.min(Math.floor(frac * N), N - 1);
      }
      const pt = circuitPts[ptIdx];
      const lastLapTime = lo > 0 ? driverLapTimes[driver]?.[lapNums[lo - 1]] : undefined;
      res[driver] = { sx: sx(pt.x), sy: sy(pt.y), lap: currentLapNum, effLap: lo + frac, frac, finished: false, lastLapTime, isInPit };
    }
    return res;
  }, [currentTime, cumulativeTimelines, circuitPts, transform, driverLapTimes, driverPitInLaps, driverPitOutLaps, driverPitExitFracs]);

  const leaderboard = useMemo(() => {
    const entries = Object.entries(driverPositions);
    const allAtStart = entries.every(([, d]) => d.effLap <= 0);
    const allFinished = entries.length > 0 && entries.every(([, d]) => d.finished);

    const sorted = [...entries].sort((a, b) => {
      if (allAtStart) {
        // Before race starts: show qualifying / grid order
        // grid_position == 0 means pit lane start — sort to the back
        const rawA = driverInfo?.[a[0]]?.grid_position ?? 0;
        const rawB = driverInfo?.[b[0]]?.grid_position ?? 0;
        const gA = rawA > 0 ? rawA : 99;
        const gB = rawB > 0 ? rawB : 99;
        return gA - gB;
      }
      if (allFinished) {
        // After race ends: show official final positions
        const fA = driverInfo?.[a[0]]?.final_position ?? 99;
        const fB = driverInfo?.[b[0]]?.final_position ?? 99;
        return fA - fB;
      }
      // During race: most laps / furthest through lap wins.
      // For finished drivers use laps_completed from official results — their
      // effLap is only lapNums.length (count of *recorded* laps) which can be
      // lower than actual laps if any lap times were null/invalid in the DB.
      const lapA = a[1].finished ? (driverInfo?.[a[0]]?.laps_completed ?? a[1].effLap) : a[1].effLap;
      const lapB = b[1].finished ? (driverInfo?.[b[0]]?.laps_completed ?? b[1].effLap) : b[1].effLap;
      const lapDiff = lapB - lapA;
      if (Math.abs(lapDiff) < 0.001) {
        // Both finished → use official results
        if (a[1].finished && b[1].finished) {
          const fA = driverInfo?.[a[0]]?.final_position ?? 99;
          const fB = driverInfo?.[b[0]]?.final_position ?? 99;
          return fA - fB;
        }
        const rawA = driverInfo?.[a[0]]?.grid_position ?? 0;
        const rawB = driverInfo?.[b[0]]?.grid_position ?? 0;
        const gA = rawA > 0 ? rawA : 99;
        const gB = rawB > 0 ? rawB : 99;
        return gA - gB;
      }
      return lapDiff;
    });

    return sorted.map(([driver, data], idx) => ({ driver, ...data, position: idx + 1 }));
  }, [driverPositions, driverInfo]);

  /* Seed featured drivers once */
  useEffect(() => {
    if (!initializedRef.current && leaderboard.length > 0) {
      initializedRef.current = true;
      setFeaturedDrivers(leaderboard.slice(0, 3).map(d => d.driver));
    }
  }, [leaderboard]);

  const currentLap = leaderboard[0]?.lap ?? 0;

  /* Leader green trail — track portion traversed in current lap */
  const leaderGreenPath = useMemo(() => {
    if (!circuitPts.length || !transform || !leaderboard.length) return '';
    const { sx, sy } = transform;
    const leader = leaderboard[0];
    if (!leader || leader.frac <= 0) return '';
    const N = circuitPts.length;
    const endIdx = Math.min(Math.floor(leader.frac * N), N - 1);
    if (endIdx < 2) return '';
    return circuitPts
      .slice(0, endIdx + 1)
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`)
      .join(' ');
  }, [circuitPts, transform, leaderboard]);

  /* ── Animation loop ───────────────────────────────────────────────── */
  useEffect(() => {
    if (animRef.current) clearInterval(animRef.current);
    if (isPlaying && maxTime > 0) {
      animRef.current = setInterval(() => {
        setCurrentTime(t => {
          const inc = speed * (TICK_MS / 1000) * 60;
          const next = t + inc;
          if (next >= maxTime) { setIsPlaying(false); return maxTime; }
          return next;
        });
      }, TICK_MS);
    }
    return () => { if (animRef.current) clearInterval(animRef.current); };
  }, [isPlaying, speed, maxTime]);

  /* ── Keyboard shortcuts ───────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.code === 'Space') {
        e.preventDefault();
        if (currentTime >= maxTime) setCurrentTime(0);
        setIsPlaying(v => !v);
      } else if (e.code === 'ArrowRight') {
        setCurrentTime(t => Math.min(t + speed * 60 * 5, maxTime));
      } else if (e.code === 'ArrowLeft') {
        setCurrentTime(t => Math.max(t - speed * 60 * 5, 0));
      } else if (e.code === 'ArrowUp') {
        setSpeedIdx(i => Math.min(i + 1, SPEEDS.length - 1));
      } else if (e.code === 'ArrowDown') {
        setSpeedIdx(i => Math.max(i - 1, 0));
      } else if (e.key === 'r' || e.key === 'R') {
        setCurrentTime(0); setIsPlaying(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [maxTime, speed]);

  /* ── Gap calculation (seconds) ────────────────────────────────────── */
  const computeGapSeconds = useCallback((aheadDriver: string, behindDriver: string): number => {
    const ahead = driverPositions[aheadDriver];
    const behind = driverPositions[behindDriver];
    if (!ahead || !behind) return 0;
    const lapDiff = ahead.effLap - behind.effLap;
    const behindTimes = Object.values(driverLapTimes[behindDriver] ?? {}).filter(t => t > 20);
    const avgLapTime = behindTimes.length ? behindTimes.reduce((a, b) => a + b, 0) / behindTimes.length : 90;
    return lapDiff * avgLapTime;
  }, [driverPositions, driverLapTimes]);

  /* ── Progress bar ─────────────────────────────────────────────────── */
  const progressPct = maxTime > 0 ? (currentTime / maxTime) * 100 : 0;

  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setCurrentTime(pct * maxTime);
  }, [maxTime]);

  const toggleFeatured = (driver: string) => {
    setFeaturedDrivers(prev => {
      if (prev.includes(driver)) return prev.filter(d => d !== driver);
      if (prev.length >= 3) return [...prev.slice(1), driver];
      return [...prev, driver];
    });
  };

  /* ── Empty state ──────────────────────────────────────────────────── */
  if (positionData.length === 0) {
    return (
      <div className="bg-[#050508] rounded-xl border border-carbon-700 p-16 text-center text-gray-600 font-mono">
        No lap time data available for replay.
      </div>
    );
  }

  const featuredEntries = featuredDrivers
    .map(d => leaderboard.find(l => l.driver === d))
    .filter(Boolean) as typeof leaderboard;

  /* ── Render ───────────────────────────────────────────────────────── */
  return (
    <div className="bg-[#050508] rounded-xl border border-gray-900 overflow-hidden font-mono select-none">

      {/* ── TOP INFO BAR ── */}
      <div className="bg-black px-3 sm:px-5 py-2 sm:py-2.5 flex items-center gap-3 sm:gap-6 border-b border-gray-900">
        <div>
          <div className="text-white font-bold text-sm sm:text-lg leading-none">
            Lap: {currentLap}<span className="text-gray-600 font-normal">/{totalLaps}</span>
          </div>
          <div className="text-gray-400 text-xs sm:text-sm mt-0.5">
            Race Time: <span className="text-white">{fmtTime(currentTime)}</span>{' '}
            <span className="text-gray-600">(x{speed})</span>
          </div>
        </div>
        {/* DRS zone legend pill */}
        {drsTelemetry?.drs_zones?.length ? (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded border border-emerald-900/60 bg-emerald-950/30">
            <svg width="22" height="5" viewBox="0 0 22 5">
              <line x1="0" y1="2.5" x2="22" y2="2.5" stroke="rgba(0,220,120,0.35)" strokeWidth={9} strokeLinecap="round" />
              <line x1="0" y1="2.5" x2="22" y2="2.5" stroke="rgba(100,255,160,0.9)" strokeWidth={2} strokeLinecap="round" />
            </svg>
            <span className="text-emerald-400 text-[11px] font-medium tracking-wide">DRS Zone</span>
            <span className="text-emerald-700 text-[10px]">({drsTelemetry.zone_count ?? drsTelemetry.drs_zones.length})</span>
          </div>
        ) : null}
        <div className="hidden sm:block ml-auto text-gray-700 text-xs">{race.name} · {race.season_year}</div>
      </div>

      {/* ── MAIN AREA ── */}
      <div className="flex flex-row" style={{ minHeight: 'clamp(300px, 55vw, 520px)' }}>

        {/* LEFT PANEL — hidden on mobile, full panel on sm+ */}
        <div className="hidden sm:block w-[210px] shrink-0 bg-black/50 border-r border-gray-900 overflow-y-auto">

          {/* Weather block */}
          {weatherSummary && (
            <div className="px-3 py-2.5 border-b border-gray-900">
              <div className="text-white text-[11px] font-bold uppercase tracking-widest mb-2">Weather</div>
              <div className="text-gray-400 text-[11px] space-y-0.5">
                {weatherSummary.avg_track_temp != null && (
                  <div className="flex items-center gap-1.5">
                    <span>🌡</span>
                    Track: <span className="text-gray-200">{weatherSummary.avg_track_temp}°C</span>
                  </div>
                )}
                {weatherSummary.avg_air_temp != null && (
                  <div className="flex items-center gap-1.5">
                    <span>🌡</span>
                    Air: <span className="text-gray-200">{weatherSummary.avg_air_temp}°C</span>
                  </div>
                )}
                {weatherSummary.avg_humidity != null && (
                  <div className="flex items-center gap-1.5">
                    <span>💧</span>
                    Humidity: <span className="text-gray-200">{weatherSummary.avg_humidity}%</span>
                  </div>
                )}
                {weatherSummary.avg_wind_speed != null && (
                  <div className="flex items-center gap-1.5">
                    <span>💨</span>
                    Wind: <span className="text-gray-200">{weatherSummary.avg_wind_speed} m/s</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <span>🌧</span>
                  Rain: <span className={weatherSummary.rainfall_occurred ? 'text-blue-400' : 'text-gray-200'}>
                    {weatherSummary.rainfall_occurred ? 'WET' : 'DRY'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Featured driver cards */}
          {featuredEntries.map(entry => {
            const color = driverColors[entry.driver] || '#888';
            const pos = entry.position;
            const carAhead = pos > 1 ? leaderboard[pos - 2] : null;
            const carBehind = pos <= leaderboard.length - 1 ? leaderboard[pos] : null;
            const currentTire = driverTireByLap[entry.driver]?.[entry.lap];
            const isPitting = entry.lap > 0 &&
              positionData.some(d => d.driver_code === entry.driver && d.lap_number === entry.lap && d.is_pit_in_lap);
            const info = driverInfo?.[entry.driver];
            const isRetired = info?.status && info.status !== 'Finished' && !info.status.startsWith('+');

            // Live telemetry sample — look up by frac (0-1) within current lap
            // Freeze telemetry to zero when driver is in the pit
            const telemSamples = drsTelemetry?.driver_telemetry?.[entry.driver];
            const isInPit = driverPositions[entry.driver]?.isInPit ?? false;
            const telemIdx = (!isInPit && telemSamples) ? Math.min(Math.floor(entry.frac * (telemSamples.length - 1)), telemSamples.length - 1) : -1;
            const telem = telemIdx >= 0 ? telemSamples![telemIdx] : null;
            const telSpeed  = isInPit ? 0 : (telem?.[0] ?? null);
            const telThrottle = isInPit ? 0 : (telem?.[1] ?? null);
            const telBrake  = isInPit ? false : (telem ? telem[2] === 1 : false);
            const telDrs    = isInPit ? 0 : (telem?.[3] ?? 0);
            const telGear   = isInPit ? '-' : (telem?.[4] ?? null);
            const drsActive = !isInPit && telDrs >= 10;

            return (
              <div key={entry.driver} className="border-b border-gray-900">
                {/* Header */}
                <div
                  className="px-3 py-1.5 flex items-center justify-between text-white text-[11px] font-bold"
                  style={{ backgroundColor: color + 'bb' }}
                >
                  <span>{entry.driver}</span>
                  <span className="text-[10px] opacity-80 font-normal">P{pos}</span>
                </div>
                {/* Stats */}
                <div className="px-3 py-2 text-[11px] space-y-1 bg-black/40">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Lap:</span>
                    <span className="text-white">{entry.lap} / {totalLaps}</span>
                  </div>
                  {currentTire && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">Tyre:</span>
                      <span className="font-bold text-[10px] px-1.5 py-0.5 rounded"
                        style={{ color: tireColor(currentTire), border: `1px solid ${tireColor(currentTire)}44` }}>
                        {isPitting ? '🔧 PIT' : currentTire}
                      </span>
                    </div>
                  )}
                  {entry.lastLapTime != null && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Last:</span>
                      <span className="text-white">{fmtLap(entry.lastLapTime)}</span>
                    </div>
                  )}

                  {/* ── Live telemetry ── */}
                  {telem && (
                    <div className="mt-1.5 pt-1.5 border-t border-gray-800 space-y-1.5">
                      {/* Gear + Speed row */}
                      <div className="flex items-center justify-between gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-gray-600 text-[9px]">Gear</span>
                          <span className="font-black text-white text-sm w-3 text-center">{telGear}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-white tabular-nums">{telSpeed}</span>
                          <span className="text-gray-600 text-[9px]">km/h</span>
                        </div>
                      </div>
                      {/* Speed bar */}
                      <div>
                        <div className="flex justify-between text-[9px] text-gray-600 mb-0.5">
                          <span>Speed</span><span style={{ color: '#60a5fa' }}>{telSpeed} km/h</span>
                        </div>
                        <div className="h-1.5 bg-gray-900 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-75"
                            style={{ width: `${Math.min(100, (telSpeed ?? 0) / 350 * 100).toFixed(1)}%`, background: '#3b82f6' }} />
                        </div>
                      </div>
                      {/* Throttle bar */}
                      <div>
                        <div className="flex justify-between text-[9px] text-gray-600 mb-0.5">
                          <span>Throttle</span><span style={{ color: '#22c55e' }}>{telThrottle}%</span>
                        </div>
                        <div className="h-1.5 bg-gray-900 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-75"
                            style={{ width: `${telThrottle ?? 0}%`, background: '#22c55e' }} />
                        </div>
                      </div>
                      {/* Brake + DRS badges */}
                      <div className="flex items-center gap-1.5">
                        <div className={`flex-1 text-center text-[9px] font-bold py-0.5 rounded ${
                          telBrake ? 'bg-red-600 text-white' : 'bg-gray-900 text-gray-700'
                        }`}>
                          BRAKE
                        </div>
                        <div className={`flex-1 text-center text-[9px] font-bold py-0.5 rounded ${
                          drsActive ? 'bg-emerald-500 text-black' : 'bg-gray-900 text-gray-700'
                        }`}>
                          DRS {drsActive ? 'ON' : 'OFF'}
                        </div>
                      </div>
                    </div>
                  )}

                  {entry.finished && (
                    <div className={`font-bold text-center text-[10px] py-0.5 ${
                      isRetired ? 'text-red-400' : 'text-green-400'
                    }`}>{isRetired ? `❌ ${info?.status ?? 'OUT'}` : `✓ P${info?.final_position ?? ''} FINISHED`}</div>
                  )}
                  {!entry.finished && (
                    <>
                      <div>
                        <span className="text-gray-600">Ahead: </span>
                        {carAhead ? (
                          <span className="text-white">
                            ({carAhead.driver}) +{computeGapSeconds(carAhead.driver, entry.driver).toFixed(3)}s
                          </span>
                        ) : <span className="text-gray-600">N/A</span>}
                      </div>
                      <div>
                        <span className="text-gray-600">Behind: </span>
                        {carBehind ? (
                          <span className="text-gray-300">
                            ({carBehind.driver}) -{computeGapSeconds(entry.driver, carBehind.driver).toFixed(3)}s
                          </span>
                        ) : <span className="text-gray-600">N/A</span>}
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}

          {featuredDrivers.length === 0 && (
            <div className="px-3 py-4 text-[10px] text-gray-700 text-center leading-relaxed">
              Click a driver in the<br />leaderboard to feature them
            </div>
          )}
        </div>

        {/* ── TRACK SVG ── */}
        <div className="flex-1 bg-black relative" style={{ minWidth: 0 }}>
          {/* Track legend overlay — desktop only */}
          <div className="hidden sm:flex absolute bottom-3 right-3 z-10 flex-col gap-1 bg-black/70 border border-gray-800 rounded px-2.5 py-2 text-[10px]">
            <div className="text-gray-500 uppercase tracking-widest font-bold mb-0.5">Legend</div>
            <div className="flex items-center gap-2">
              <svg width="20" height="5" viewBox="0 0 20 5">
                <line x1="0" y1="2.5" x2="20" y2="2.5" stroke="rgba(200,200,220,0.5)" strokeWidth={5} strokeLinecap="round" />
              </svg>
              <span className="text-gray-400">Track</span>
            </div>
            {[{ color: STATUS_COLORS.sc, label: 'Safety Car' }, { color: STATUS_COLORS.vsc, label: 'VSC' }, { color: STATUS_COLORS.yellow, label: 'Yellow' }, { color: STATUS_COLORS.red, label: 'Red Flag' }].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2">
                <div className="w-5 h-2 rounded-sm" style={{ background: color }} />
                <span style={{ color }}>{label}</span>
              </div>
            ))}
          </div>

          {/* ── Track status pop-up — bottom-left, mirroring the legend ── */}
          {activeTrackStatus && (() => {
            const { label, sub, icon } = STATUS_LABELS[activeTrackStatus];
            const col = STATUS_COLORS[activeTrackStatus];
            const rawMsgs = activeIntervalIndex >= 0 ? (rcMessagesByInterval[activeIntervalIndex] ?? []) : [];
            // Deduplicate consecutive identical messages (data pipeline can insert duplicates)
            const msgs = rawMsgs.filter((m, i) => i === 0 || m.message !== rawMsgs[i - 1].message);
            return (
              <div className="absolute bottom-3 left-3 z-20 pointer-events-none hidden sm:flex flex-col gap-1 sm:gap-1.5 px-2.5 py-2 rounded border"
                style={{
                  background: col.replace('0.65', '0.12'),
                  borderColor: col.replace('0.65', '0.50'),
                  boxShadow: `0 4px 20px ${col.replace('0.65', '0.30')}`,
                  maxWidth: '200px',
                }}
              >
                {/* Title row */}
                <div className="flex items-center gap-1.5">
                  <span className="text-base leading-none">{icon}</span>
                  <div>
                    <div className="text-white font-black text-[10px] tracking-[0.12em] leading-tight uppercase">{label}</div>
                    <div className="text-white/50 text-[9px] mt-0.5 tracking-wide">{sub}</div>
                  </div>
                </div>
                {/* Race control messages */}
                {msgs.length > 0 && (
                  <div
                    className="max-h-28 overflow-y-auto space-y-0.5 border-t pt-1"
                    style={{ borderColor: col.replace('0.65', '0.25') }}
                  >
                    {msgs.map((m, i) => (
                      <p key={i} className="text-white/75 text-[9px] leading-snug font-mono">
                        {m.message}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} width="100%" style={{ display: 'block' }}>
            <rect width={SVG_W} height={SVG_H} fill="#000" />

            {trackPath && (
              <>
                {/* Layer 1: outer kerb/edge */}
                <path d={trackPath} fill="none" stroke="#101020" strokeWidth={22} strokeLinecap="round" strokeLinejoin="round" />
                {/* Layer 2: road edge white border */}
                <path d={trackPath} fill="none" stroke="rgba(200,200,220,0.22)" strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" />
                {/* Layer 3: road surface */}
                <path d={trackPath} fill="none" stroke="#0a0a18" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" />
                {/* Layer 4: center line */}
                <path d={trackPath} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              </>
            )}

            {/* ── Green leader progress trail removed ── */}

            {/* ── Start/finish line ── */}
            {circuitPts.length > 6 && transform && (() => {
              const { sx, sy } = transform;
              const p0 = circuitPts[0], p1 = circuitPts[6];
              const dx = sx(p1.x) - sx(p0.x), dy = sy(p1.y) - sy(p0.y);
              const len = Math.sqrt(dx * dx + dy * dy) || 1;
              const nx = -dy / len * 14, ny = dx / len * 14;
              return (
                <>
                  <line x1={sx(p0.x) - nx} y1={sy(p0.y) - ny} x2={sx(p0.x) + nx} y2={sy(p0.y) + ny}
                    stroke="rgba(255,255,255,0.8)" strokeWidth={2.5} />
                  <line x1={sx(p0.x) - nx * 0.5} y1={sy(p0.y) - ny * 0.5} x2={sx(p0.x) + nx * 0.5} y2={sy(p0.y) + ny * 0.5}
                    stroke="#ff3333" strokeWidth={1.5} />
                </>
              );
            })()}

            {/* ── Driver dots ── */}
            {leaderboard.map(({ driver, sx: dsx, sy: dsy, position, finished, isInPit }) => {
              // Never return null for pitting drivers — show a pit indicator instead
              // so the marker is always visible and there's no sudden reappearance.
              const info = driverInfo?.[driver];
              const isRetired = finished && info?.status &&
                info.status !== 'Finished' && !info.status.startsWith('+');
              if (isRetired) return null; // Remove DNF/DNS from track
              const color = finished ? '#555' : (driverColors[driver] || '#888');
              const isLeader = position === 1 && !isInPit;
              const isFeatured = featuredDrivers.includes(driver);
              // Pitting cars: small dashed outline dot near S/F line
              const r = isInPit ? 3.5 : isLeader ? 6.5 : isFeatured ? 5.5 : 4;
              const showLabel = isFeatured && !isInPit;
              return (
                <g key={driver} opacity={isInPit ? 0.6 : 1}>
                  {!isInPit && <circle cx={dsx} cy={dsy} r={r + 6} fill={color} opacity={0.12} />}
                  <circle
                    cx={dsx} cy={dsy} r={r}
                    fill={isInPit ? '#05050f' : finished ? '#1a1a1a' : color}
                    stroke={color}
                    strokeWidth={isInPit ? 1 : isLeader ? 1.8 : 1}
                    strokeDasharray={isInPit ? '2 2' : undefined}
                  />
                  {/* Pit stop indicator: 'P' inside the dashed circle */}
                  {isInPit && (
                    <text x={dsx} y={dsy + 1.8} fill={color} fontSize={4} fontFamily="monospace"
                      fontWeight="bold" textAnchor="middle">
                      P
                    </text>
                  )}
                  {showLabel && !finished && (
                    <text x={dsx} y={dsy - r - 3} fill={color} fontSize={7} fontFamily="monospace" fontWeight="bold"
                      textAnchor="middle" paintOrder="stroke" stroke="#000" strokeWidth={3}>
                      {driver}
                    </text>
                  )}
                </g>
              );
            })}

            {/* No circuit fallback message */}
            {!circuitPts.length && (
              <text x={SVG_W / 2} y={SVG_H / 2} fill="#2a2a3a" fontSize={14} textAnchor="middle" fontFamily="monospace">
                Circuit layout unavailable — leaderboard & controls active
              </text>
            )}
          </svg>
        </div>

        {/* ── RIGHT PANEL – LEADERBOARD — hidden on mobile ── */}
        <div className="hidden sm:flex w-[175px] shrink-0 bg-black/50 border-l border-gray-900 flex-col">
          <div className="px-3 py-2 border-b border-gray-900 bg-black/60 flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-white" />
            <span className="text-white text-[11px] font-bold uppercase tracking-widest">Leaderboard</span>
          </div>
          <div className="overflow-y-auto flex-1">
            {leaderboard.map(({ driver, position, lap, finished, isInPit }) => {
              const color = finished ? '#444' : (driverColors[driver] || '#888');
              const isFeatured = featuredDrivers.includes(driver);
              const leaderLap = leaderboard[0]?.lap ?? 0;
              const lapsDown = !finished && leaderLap > 0 ? leaderLap - lap : 0;
              const info = driverInfo?.[driver];
              const isRetired = finished && info?.status && info.status !== 'Finished' && !info.status.startsWith('+');
              const currentTire = driverTireByLap[driver]?.[lap];
              return (
                <div
                  key={driver}
                  onClick={() => toggleFeatured(driver)}
                  className={`flex items-center gap-2 px-2.5 py-[5px] cursor-pointer transition-all ${isFeatured ? 'bg-white/[0.12]' : 'hover:bg-white/[0.05]'}`}
                >
                  <span className={`text-[10px] font-bold w-4 text-right tabular-nums shrink-0 ${
                    position === 1 ? 'text-yellow-400' : position === 2 ? 'text-gray-300' : position === 3 ? 'text-amber-600' : 'text-gray-600'
                  }`}>
                    {position}.
                  </span>
                  <span className="text-[11px] font-bold flex-1 truncate" style={{ color }}>
                    {driver}
                  </span>
                  {/* Status indicators — only one shown at a time */}
                  {finished ? (
                    isRetired ? (
                      <span className="text-[9px] text-red-500 font-bold shrink-0" title={info?.status}>OUT</span>
                    ) : (
                      <span className="text-[9px] text-gray-500 shrink-0">P{info?.final_position ?? position}</span>
                    )
                  ) : isInPit ? (
                    <span className="text-[9px] text-orange-400 font-bold shrink-0">PIT</span>
                  ) : (
                    <div className="flex items-center gap-1 shrink-0">
                      {currentTire && (
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: tireColor(currentTire) }} title={currentTire} />
                      )}
                      {lapsDown > 0 && (
                        <span className="text-[9px] text-red-400 opacity-70">+{lapsDown}L</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── MOBILE LEADERBOARD — 2-column grid below the track ── */}
      <div className="sm:hidden border-t border-gray-900 bg-black/60 px-2 py-1.5">
        <div className="grid grid-cols-2 gap-x-2 gap-y-0">
          {leaderboard.map(({ driver, position, lap, finished, isInPit }) => {
            const color = finished ? '#555' : (driverColors[driver] || '#888');
            const isFeat = featuredDrivers.includes(driver);
            const info2 = driverInfo?.[driver];
            const isRetired2 = finished && info2?.status && info2.status !== 'Finished' && !info2.status.startsWith('+');
            const currentTire = driverTireByLap[driver]?.[lap];
            const leaderLap = leaderboard[0]?.lap ?? 0;
            const lapsDown = !finished && leaderLap > 0 ? leaderLap - lap : 0;
            return (
              <div key={driver} onClick={() => toggleFeatured(driver)}
                className={`flex items-center gap-1 py-[3px] px-1 rounded cursor-pointer transition-colors ${
                  isFeat ? 'bg-white/10' : ''
                }`}>
                <span className={`text-[9px] font-bold w-4 shrink-0 tabular-nums text-right ${
                  position === 1 ? 'text-yellow-400' : position === 2 ? 'text-gray-300' : position === 3 ? 'text-amber-600' : 'text-gray-600'
                }`}>{position}.</span>
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-[10px] font-bold flex-1 truncate" style={{ color: isRetired2 ? '#ef4444' : color }}>
                  {driver}
                </span>
                {isInPit ? (
                  <span className="text-[8px] text-orange-400 font-bold shrink-0">PIT</span>
                ) : isRetired2 ? (
                  <span className="text-[8px] text-red-500 shrink-0">OUT</span>
                ) : finished ? (
                  <span className="text-[8px] text-gray-600 shrink-0">P{info2?.final_position ?? position}</span>
                ) : currentTire ? (
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: tireColor(currentTire) }} title={currentTire} />
                ) : lapsDown > 0 ? (
                  <span className="text-[8px] text-red-400/70 shrink-0">+{lapsDown}L</span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── BOTTOM CONTROLS ── */}
      <div className="bg-black border-t border-gray-900">
        {/* Keyboard hints — desktop only */}
        <div className="hidden sm:flex px-5 pt-2 pb-1 text-[9px] text-gray-700 flex-wrap gap-x-5 gap-y-0.5">
          <span className="text-gray-600 font-semibold">Controls:</span>
          <span>[SPACE] Pause/Resume</span>
          <span>[←/→] Rewind/FastForward</span>
          <span>[↑/↓] Speed +/-</span>
          <span>[R] Restart</span>
          <span>[Click Driver] Feature Card</span>
        </div>

        {/* Playback row */}
        <div className="px-3 sm:px-5 py-2 sm:pb-2 flex items-center gap-2 sm:gap-3">
          {/* Restart */}
          <button onClick={() => { setCurrentTime(0); setIsPlaying(false); }}
            className="text-gray-600 hover:text-white transition-colors shrink-0" title="Restart">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
            </svg>
          </button>
          {/* Rewind */}
          <button onClick={() => setCurrentTime(t => Math.max(0, t - speed * 60 * 10))}
            className="text-gray-500 hover:text-white transition-colors shrink-0" title="Rewind">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11 18V6l-8.5 6 8.5 6zm.5-6 8.5 6V6l-8.5 6z" />
            </svg>
          </button>
          {/* Play / Pause */}
          <button
            onClick={() => { if (currentTime >= maxTime) setCurrentTime(0); setIsPlaying(v => !v); }}
            className="w-9 h-9 rounded-full border border-gray-700 bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors shrink-0"
          >
            {isPlaying ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
          {/* Fast forward */}
          <button onClick={() => setCurrentTime(t => Math.min(maxTime, t + speed * 60 * 10))}
            className="text-gray-500 hover:text-white transition-colors shrink-0" title="Fast Forward">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
            </svg>
          </button>
          {/* Speed: — X.Xx + */}
          <div className="flex items-center gap-1.5 ml-2">
            <button onClick={() => setSpeedIdx(i => Math.max(0, i - 1))}
              className="text-gray-500 hover:text-white font-bold text-base leading-none w-5 text-center">—</button>
            <span className="text-white text-sm font-bold w-10 text-center tabular-nums">{speed}x</span>
            <button onClick={() => setSpeedIdx(i => Math.min(SPEEDS.length - 1, i + 1))}
              className="text-gray-500 hover:text-white font-bold text-base leading-none w-5 text-center">+</button>
          </div>
          {/* Time readout */}
          <span className="ml-auto text-[11px] text-gray-500 tabular-nums">
            {fmtTime(currentTime)} / {fmtTime(maxTime)}
          </span>
        </div>

        {/* Progress bar + lap ticks */}
        <div className="px-5 pb-3 space-y-1">
          <div className="relative h-3 bg-gray-900 cursor-pointer" onClick={handleProgressClick}>
            {/* Green fill */}
            <div className="h-full bg-green-500 pointer-events-none"
              style={{ width: `${progressPct.toFixed(2)}%` }} />
            {/* Lap boundary ticks */}
            {leaderTimeline && leaderTimeline.cum.slice(1).map((t, i) => {
              const pct = maxTime > 0 ? (t / maxTime) * 100 : 0;
              const isMajor = (i + 1) % 10 === 0;
              return (
                <div key={i}
                  className={`absolute top-0 w-px pointer-events-none ${isMajor ? 'bg-white/30 h-full' : 'bg-white/10 h-1/2'}`}
                  style={{ left: `${pct}%` }} />
              );
            })}
            {/* Track status BANDS (SC / VSC / Yellow / Red) — full-width highlight for each flag/SC period */}
            {lapStatusIntervals.map((iv, i) => {
              const startPct = maxTime > 0 ? (iv.start / maxTime) * 100 : 0;
              const widthPct = maxTime > 0 ? ((iv.end - iv.start) / maxTime) * 100 : 0;
              return (
                <div key={`band-${i}`}
                  className="absolute top-0 h-full pointer-events-none"
                  style={{
                    left: `${startPct.toFixed(2)}%`,
                    width: `${Math.max(widthPct, 0.4).toFixed(2)}%`,
                    background: STATUS_COLORS[iv.kind],
                  }}
                />
              );
            })}
            {/* Progress cursor */}
            <div className="absolute top-0 h-full w-0.5 bg-white/70 pointer-events-none"
              style={{ left: `${progressPct.toFixed(2)}%` }} />
          </div>
          {/* Lap number labels */}
          <div className="relative h-3 pointer-events-none">
            {leaderTimeline && leaderTimeline.lapNums
              .filter(n => n === 1 || n % 10 === 0 || n === leaderTimeline!.lapNums[leaderTimeline!.lapNums.length - 1])
              .map(n => {
                const idx = leaderTimeline.lapNums.indexOf(n);
                const t = leaderTimeline.cum[idx];
                const pct = maxTime > 0 ? (t / maxTime) * 100 : 0;
                return (
                  <span key={n} className="absolute text-[9px] text-gray-600 -translate-x-1/2"
                    style={{ left: `${pct}%` }}>{n}</span>
                );
              })}
          </div>
        </div>
      </div>

      {/* ── MOBILE-ONLY: Weather + Featured Driver strip (scrollable) ── */}
      <div className="sm:hidden border-t border-gray-900 overflow-x-auto bg-black/60">
        <div className="flex gap-2 p-2.5" style={{ minWidth: 'max-content' }}>
          {/* Weather pill */}
          {weatherSummary && (
            <div className="shrink-0 rounded bg-black/80 border border-gray-800 px-2.5 py-2 text-[10px] text-gray-400 space-y-0.5" style={{ minWidth: 100 }}>
              <div className="text-white text-[9px] font-bold uppercase tracking-widest mb-1.5">Weather</div>
              {weatherSummary.avg_track_temp != null && <div>🌡 Track: <span className="text-gray-200">{weatherSummary.avg_track_temp}°C</span></div>}
              {weatherSummary.avg_air_temp != null && <div>🌡 Air: <span className="text-gray-200">{weatherSummary.avg_air_temp}°C</span></div>}
              {weatherSummary.avg_humidity != null && <div>💧 Hum: <span className="text-gray-200">{weatherSummary.avg_humidity}%</span></div>}
              {weatherSummary.avg_wind_speed != null && <div>💨 Wind: <span className="text-gray-200">{weatherSummary.avg_wind_speed} m/s</span></div>}
              <div>🌧 <span className={weatherSummary.rainfall_occurred ? 'text-blue-400' : 'text-gray-200'}>{weatherSummary.rainfall_occurred ? 'WET' : 'DRY'}</span></div>
            </div>
          )}
          {/* Featured driver mini-cards */}
          {featuredEntries.map(entry => {
            const color = driverColors[entry.driver] || '#888';
            const currentTire = driverTireByLap[entry.driver]?.[entry.lap];
            const isInPitM = driverPositions[entry.driver]?.isInPit ?? false;
            const telemSamplesM = drsTelemetry?.driver_telemetry?.[entry.driver];
            const telemIdxM = (!isInPitM && telemSamplesM) ? Math.min(Math.floor(entry.frac * (telemSamplesM.length - 1)), telemSamplesM.length - 1) : -1;
            const telemM = telemIdxM >= 0 ? telemSamplesM![telemIdxM] : null;
            const telSpeedM    = isInPitM ? 0 : (telemM?.[0] ?? null);
            const telThrottleM = isInPitM ? 0 : (telemM?.[1] ?? null);
            const telBrakeM    = isInPitM ? false : (telemM ? telemM[2] === 1 : false);
            const telDrsM      = isInPitM ? 0 : (telemM?.[3] ?? 0);
            const telGearM     = isInPitM ? '-' : (telemM?.[4] ?? null);
            const drsActiveM   = !isInPitM && telDrsM >= 10;
            const carAheadM    = entry.position > 1 ? leaderboard[entry.position - 2] : null;
            const carBehindM   = entry.position < leaderboard.length ? leaderboard[entry.position] : null;
            return (
              <div key={entry.driver} className="shrink-0 rounded overflow-hidden border border-gray-800" style={{ minWidth: 145 }}>
                <div className="px-2.5 py-1 flex justify-between items-center text-white text-[10px] font-bold" style={{ backgroundColor: color + 'bb' }}>
                  <span>{entry.driver}</span>
                  <span className="opacity-80">P{entry.position}</span>
                </div>
                <div className="px-2.5 py-2 bg-black/70 text-[10px] space-y-1">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Lap:</span><span className="text-white">{entry.lap} / {totalLaps}</span>
                  </div>
                  {currentTire && (
                    <div className="flex justify-between items-center">
                      <span className="text-gray-500">Tyre:</span>
                      <span className="font-bold text-[9px]" style={{ color: tireColor(currentTire) }}>{currentTire}</span>
                    </div>
                  )}
                  {telemM ? (
                    <>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-gray-600 text-[9px]">Gear <span className="font-black text-white">{telGearM}</span></span>
                        <span className="font-bold text-white tabular-nums">{telSpeedM} <span className="text-gray-600 text-[8px] font-normal">km/h</span></span>
                      </div>
                      <div className="h-1 bg-gray-900 rounded overflow-hidden">
                        <div className="h-full rounded" style={{ width: `${Math.min(100, (telSpeedM ?? 0) / 350 * 100)}%`, background: '#3b82f6' }} />
                      </div>
                      <div className="flex justify-between text-[9px]"><span className="text-gray-500">Throttle</span><span style={{ color: '#22c55e' }}>{telThrottleM}%</span></div>
                      <div className="h-1 bg-gray-900 rounded overflow-hidden">
                        <div className="h-full rounded" style={{ width: `${telThrottleM ?? 0}%`, background: '#22c55e' }} />
                      </div>
                      <div className="flex gap-1">
                        <div className={`flex-1 text-center text-[8px] font-bold py-0.5 rounded ${telBrakeM ? 'bg-red-600 text-white' : 'bg-gray-900 text-gray-700'}`}>BRAKE</div>
                        <div className={`flex-1 text-center text-[8px] font-bold py-0.5 rounded ${drsActiveM ? 'bg-emerald-500 text-black' : 'bg-gray-900 text-gray-700'}`}>DRS {drsActiveM ? 'ON' : 'OFF'}</div>
                      </div>
                    </>
                  ) : (
                    <>
                      {!entry.finished && carAheadM && (
                        <div className="text-[9px]">
                          <span className="text-gray-600">Ahead: </span>
                          <span className="text-white">({carAheadM.driver}) +{computeGapSeconds(carAheadM.driver, entry.driver).toFixed(1)}s</span>
                        </div>
                      )}
                      {!entry.finished && carBehindM && (
                        <div className="text-[9px]">
                          <span className="text-gray-600">Behind: </span>
                          <span className="text-gray-300">({carBehindM.driver}) -{computeGapSeconds(entry.driver, carBehindM.driver).toFixed(1)}s</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {featuredDrivers.length === 0 && (
            <div className="text-[10px] text-gray-700 px-2 py-4 self-center">
              Tap a driver in the leaderboard to feature them
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

