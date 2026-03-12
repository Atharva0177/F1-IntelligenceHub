'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';

// ─── Driver colour map (matches race page) ───────────────────────────────────
const DRIVER_COLORS: Record<string, string> = {
  HAM: '#00D2BE', RUS: '#00B4D8', BOT: '#00D2BE',
  VER: '#3671C6', PER: '#5590D9',
  LEC: '#E8002D', SAI: '#FF4444',
  NOR: '#FF8000', PIA: '#F5A623', RIC: '#FF8700',
  ALO: '#0090FF', STR: '#358C75',
  OCO: '#FF87BC', GAS: '#4895EF',
  TSU: '#6692FF', LAW: '#5588DD', HAD: '#3366BB',
  ALB: '#005AFF', COL: '#00BFFF', SAR: '#64C4FF',
  MAG: '#B6503A', BEA: '#CC3333', HUL: '#FFF500',
  ZHO: '#D4006C', ANT: '#50C8F0', DOO: '#3399FF',
};
const driverColor = (code: string) => DRIVER_COLORS[code] ?? '#888';

// ─── Medal colours ────────────────────────────────────────────────────────────
const MEDAL = ['#FFD700', '#C0C0C0', '#CD7F32'];

// ─── Model definitions ────────────────────────────────────────────────────────
const MODELS = [
  {
    id: 'gb',
    label: 'Gradient Boosting',
    badge: 'ML',
    badgeColor: '#3671C6',
    icon: '🌲',
  },
  {
    id: 'rf',
    label: 'Random Forest',
    badge: 'ML',
    badgeColor: '#358C75',
    icon: '🌳',
  },
  {
    id: 'nn',
    label: 'Neural Network',
    badge: 'DL',
    badgeColor: '#E8002D',
    icon: '🧠',
  },
  {
    id: 'xgb',
    label: 'XGBoost',
    badge: 'ML',
    badgeColor: '#FF6B00',
    icon: '⚡',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

function flag(country: string) {
  const map: Record<string, string> = {
    'Australia': '🇦🇺', 'Bahrain': '🇧🇭', 'Saudi Arabia': '🇸🇦',
    'Japan': '🇯🇵', 'China': '🇨🇳', 'USA': '🇺🇸', 'United States': '🇺🇸',
    'Italy': '🇮🇹', 'Monaco': '🇲🇨', 'Canada': '🇨🇦', 'Spain': '🇪🇸',
    'Austria': '🇦🇹', 'UK': '🇬🇧', 'United Kingdom': '🇬🇧', 'Hungary': '🇭🇺',
    'Belgium': '🇧🇪', 'Netherlands': '🇳🇱', 'Singapore': '🇸🇬',
    'Azerbaijan': '🇦🇿', 'Mexico': '🇲🇽', 'Brazil': '🇧🇷',
    'Las Vegas': '🇺🇸', 'Qatar': '🇶🇦', 'Abu Dhabi': '🇦🇪',
    'UAE': '🇦🇪', 'France': '🇫🇷', 'Germany': '🇩🇪',
    'Russia': '🇷🇺', 'Turkey': '🇹🇷', 'Portugal': '🇵🇹',
  };
  return map[country] ?? '🏁';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PodiumCard({
  rank,
  driver,
}: {
  rank: number;
  driver: any;
}) {
  const col = driverColor(driver.driver_code);
  const medal = MEDAL[rank - 1];
  const winPct = Math.round(driver.win_probability * 100);
  const podPct = Math.round(driver.podium_probability * 100);
  const isCorrect =
    driver.actual_position != null && driver.actual_position === rank;
  const isWrong =
    driver.actual_position != null && driver.actual_position !== rank;

  return (
    <div
      className={`relative rounded-xl border p-4 flex flex-col items-center gap-2 transition-all ${
        rank === 1 ? 'scale-105 z-10' : ''
      }`}
      style={{
        borderColor: medal,
        background: `linear-gradient(135deg, ${col}22 0%, #15151e 100%)`,
        boxShadow: rank === 1 ? `0 0 24px ${medal}44` : undefined,
      }}
    >
      {/* Position badge */}
      <span
        className="text-xs font-black tracking-widest uppercase mb-1"
        style={{ color: medal }}
      >
        P{rank}
      </span>

      {/* Driver code */}
      <div
        className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-black text-white shadow-lg"
        style={{ background: col }}
      >
        {driver.driver_code}
      </div>

      {/* Win probability */}
      <div className="text-center mt-1">
        <div className="text-2xl font-black text-white">{pct(driver.win_probability)}</div>
        <div className="text-[10px] text-gray-500 uppercase tracking-widest">Win chance</div>
      </div>

      {/* Podium probability bar */}
      <div className="w-full mt-1">
        <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
          <span>Podium</span>
          <span>{pct(driver.podium_probability)}</span>
        </div>
        <div className="h-1.5 rounded-full bg-carbon-700 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${podPct}%`, background: col }}
          />
        </div>
      </div>

      {/* Grid position */}
      {driver.grid_position && (
        <div className="text-xs text-gray-500">
          Grid: <span className="text-gray-300 font-bold">P{driver.grid_position}</span>
        </div>
      )}

      {/* Actual result badge */}
      {driver.actual_position != null && (
        <span
          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            isCorrect
              ? 'bg-green-500/20 text-green-400 border border-green-500/40'
              : 'bg-red-500/10 text-red-400 border border-red-500/30'
          }`}
        >
          {isCorrect ? '✓ Correct' : `Actual P${driver.actual_position}`}
        </span>
      )}
    </div>
  );
}

function ProbabilityBar({ driver, maxProb }: { driver: any; maxProb: number }) {
  const col = driverColor(driver.driver_code);
  const width = maxProb > 0 ? (driver.win_probability / maxProb) * 100 : 0;
  const isTop3 = driver.predicted_position <= 3;

  return (
    <div className="flex items-center gap-3 py-1.5">
      {/* Predicted pos */}
      <span className="text-xs text-gray-500 w-5 text-right font-mono">
        {driver.predicted_position}
      </span>

      {/* Driver chip */}
      <span
        className="text-[11px] font-black text-white px-2 py-0.5 rounded w-12 text-center shrink-0"
        style={{ background: col }}
      >
        {driver.driver_code}
      </span>

      {/* Bar */}
      <div className="flex-1 h-5 bg-carbon-700/60 rounded overflow-hidden">
        <div
          className="h-full rounded flex items-center pl-2 transition-all duration-700"
          style={{ width: `${Math.max(width, 4)}%`, background: `${col}cc` }}
        >
          {isTop3 && (
            <span className="text-[9px] font-black text-white/80 whitespace-nowrap">
              {pct(driver.win_probability)}
            </span>
          )}
        </div>
      </div>

      {/* Value label */}
      <span className="text-xs font-mono text-gray-400 w-12 text-right">
        {pct(driver.win_probability)}
      </span>

      {/* Actual result */}
      {driver.actual_position != null && (
        <span
          className={`text-[10px] font-bold w-14 text-right ${
            driver.actual_position === driver.predicted_position
              ? 'text-green-400'
              : driver.actual_position <= 3
              ? 'text-yellow-400'
              : 'text-gray-600'
          }`}
        >
          {driver.actual_position <= 3
            ? `✓ P${driver.actual_position}`
            : `P${driver.actual_position}`}
        </span>
      )}
    </div>
  );
}

function FeatureImportanceBar({
  feature,
  importance,
  maxImp,
}: {
  feature: string;
  importance: number;
  maxImp: number;
}) {
  const width = maxImp > 0 ? (importance / maxImp) * 100 : 0;
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="text-xs text-gray-400 w-44 shrink-0 truncate">{feature}</span>
      <div className="flex-1 h-3 bg-carbon-700/60 rounded overflow-hidden">
        <div
          className="h-full rounded bg-racing-red-500/70 transition-all duration-700"
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="text-xs font-mono text-gray-400 w-12 text-right">
        {(importance * 100).toFixed(1)}%
      </span>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PredictionsPage() {
  const [races, setRaces] = useState<any[]>([]);
  const [loadingRaces, setLoadingRaces] = useState(true);
  const [selectedRaceId, setSelectedRaceId] = useState<number | null>(null);
  const [modelType, setModelType] = useState('gb');
  const [prediction, setPrediction] = useState<any | null>(null);
  const [loadingPrediction, setLoadingPrediction] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  // Load race list
  useEffect(() => {
    api
      .getPredictableRaces()
      .then((data) => {
        setRaces(data);
        if (data.length > 0) {
          setSelectedYear(data[0].year);
        }
      })
      .catch(() => setError('Failed to load race list'))
      .finally(() => setLoadingRaces(false));
  }, []);

  // Fetch prediction when race or model changes
  const fetchPrediction = useCallback(async () => {
    if (!selectedRaceId) return;
    setLoadingPrediction(true);
    setError(null);
    setPrediction(null);
    try {
      const data = await api.predictRace(selectedRaceId, modelType);
      setPrediction(data);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Prediction failed. Try another race.');
    } finally {
      setLoadingPrediction(false);
    }
  }, [selectedRaceId, modelType]);

  useEffect(() => {
    fetchPrediction();
  }, [fetchPrediction]);

  const years = [...new Set(races.map((r) => r.year))].sort((a, b) => b - a);
  const filteredRaces = selectedYear ? races.filter((r) => r.year === selectedYear) : races;

  const maxWinProb = prediction
    ? Math.max(...prediction.drivers.map((d: any) => d.win_probability))
    : 1;
  const maxImp = prediction?.feature_importance?.length
    ? Math.max(...prediction.feature_importance.map((f: any) => f.importance))
    : 1;

  const hasActualResults = prediction?.drivers?.some((d: any) => d.actual_position != null);

  // Prediction accuracy (how many predicted finishes match actuals in top 5)
  const predAcc = (() => {
    if (!prediction || !hasActualResults) return null;
    const correct = prediction.drivers.filter(
      (d: any) => d.actual_position != null && d.predicted_position === d.actual_position
    ).length;
    const total = prediction.drivers.filter((d: any) => d.actual_position != null).length;
    return total > 0 ? Math.round((correct / total) * 100) : null;
  })();

  return (
    <div className="space-y-6 pb-12">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="relative overflow-hidden bg-carbon-800 rounded-2xl border border-carbon-700 p-6">
        <div className="absolute inset-0 bg-gradient-to-r from-racing-red-900/20 via-transparent to-transparent" />
        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-3xl">🔮</span>
              <h1 className="text-3xl font-display font-black text-white uppercase tracking-wider">
                Race Predictions
              </h1>
            </div>
            <p className="text-gray-400 text-sm max-w-xl">
              Machine learning models trained on all historical race data predict
              podium probabilities. Select a race and a model to see the prediction —
              or validate against races that already happened.
            </p>
          </div>
          {prediction && (
            <div className="shrink-0 text-right">
              <div className="text-xs text-gray-500 uppercase tracking-widest mb-1">Trained on</div>
              <div className="text-2xl font-black text-white">
                {prediction.training_samples.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500">race entries</div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        {/* ── Left panel: race + model selectors ─────────────────── */}
        <div className="space-y-4">
          {/* Model selector */}
          <div className="bg-carbon-800 rounded-xl border border-carbon-700 p-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">
              Select Model
            </h3>
            <div className="space-y-2">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setModelType(m.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-left ${
                    modelType === m.id
                      ? 'border-racing-red-500/50 bg-racing-red-500/10 text-white'
                      : 'border-carbon-600 text-gray-400 hover:text-white hover:border-carbon-500'
                  }`}
                >
                  <span className="text-lg">{m.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate">{m.label}</div>
                  </div>
                  <span
                    className="text-[10px] font-black px-1.5 py-0.5 rounded text-white shrink-0"
                    style={{ background: m.badgeColor }}
                  >
                    {m.badge}
                  </span>
                  {modelType === m.id && (
                    <span className="text-racing-red-400 shrink-0">●</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Race selector */}
          <div className="bg-carbon-800 rounded-xl border border-carbon-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500">
                Select Race
              </h3>
              {/* Year filter */}
              <div className="flex gap-1">
                {years.slice(0, 5).map((yr) => (
                  <button
                    key={yr}
                    onClick={() => setSelectedYear(yr)}
                    className={`text-xs px-2 py-0.5 rounded transition-all ${
                      selectedYear === yr
                        ? 'bg-racing-red-600 text-white font-bold'
                        : 'bg-carbon-700 text-gray-400 hover:text-white'
                    }`}
                  >
                    {yr}
                  </button>
                ))}
              </div>
            </div>

            {loadingRaces ? (
              <div className="h-32 flex items-center justify-center text-gray-500 text-sm">
                Loading races…
              </div>
            ) : (
              <div className="space-y-1 max-h-[420px] overflow-y-auto pr-1">
                {filteredRaces.map((race) => (
                  <button
                    key={race.id}
                    onClick={() => setSelectedRaceId(race.id)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-left ${
                      selectedRaceId === race.id
                        ? 'border-racing-red-500/60 bg-racing-red-500/10 text-white'
                        : 'border-transparent text-gray-400 hover:bg-carbon-700/50 hover:text-white'
                    }`}
                  >
                    <span className="text-lg shrink-0">{flag(race.country)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold truncate">
                        {race.name.replace(' Grand Prix', ' GP')}
                      </div>
                      <div className="text-[10px] text-gray-600">
                        Rd {race.round} · {race.date?.slice(0, 10)}
                      </div>
                    </div>
                    {selectedRaceId === race.id && (
                      <span className="text-racing-red-400 text-xs">●</span>
                    )}
                  </button>
                ))}
                {filteredRaces.length === 0 && (
                  <div className="text-center py-4 text-gray-600 text-sm">
                    No races for {selectedYear}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Right panel: prediction results ──────────────────────── */}
        <div className="space-y-4">

          {/* Empty state */}
          {!selectedRaceId && !loadingPrediction && (
            <div className="bg-carbon-800 rounded-xl border border-carbon-700 p-12 flex flex-col items-center justify-center gap-3 text-center">
              <span className="text-5xl">🏎️</span>
              <p className="text-gray-400">Select a race on the left to generate predictions</p>
            </div>
          )}

          {/* Loading */}
          {loadingPrediction && (
            <div className="bg-carbon-800 rounded-xl border border-carbon-700 p-12 flex flex-col items-center justify-center gap-4">
              <div className="w-12 h-12 rounded-full border-4 border-racing-red-500/30 border-t-racing-red-500 animate-spin" />
              <div className="text-gray-400 text-sm">Training model on historical data…</div>
              <div className="text-xs text-gray-600">This takes ~5–15 seconds</div>
            </div>
          )}

          {/* Error */}
          {error && !loadingPrediction && (
            <div className="bg-red-950/40 border border-red-700/40 rounded-xl p-6 text-red-400 text-sm">
              ⚠️ {error}
            </div>
          )}

          {/* Results */}
          {prediction && !loadingPrediction && (
            <>
              {/* Race + model info bar */}
              <div className="bg-carbon-800 rounded-xl border border-carbon-700 px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-2">
                <div>
                  <div className="text-white font-bold text-sm">{prediction.race_name}</div>
                  <div className="text-xs text-gray-500">{prediction.race_date}</div>
                </div>
                <div className="h-8 w-px bg-carbon-600 hidden sm:block" />
                <div>
                  <div className="text-[11px] text-gray-500 uppercase tracking-widest">Model</div>
                  <div className="text-sm font-bold text-white">{prediction.model?.label}</div>
                </div>
                <div className="h-8 w-px bg-carbon-600 hidden sm:block" />
                <div>
                  <div className="text-[11px] text-gray-500 uppercase tracking-widest">Train accuracy</div>
                  <div className="text-sm font-bold text-white">
                    {(prediction.backtest_accuracy * 100).toFixed(1)}%
                  </div>
                </div>
                {hasActualResults && predAcc !== null && (
                  <>
                    <div className="h-8 w-px bg-carbon-600 hidden sm:block" />
                    <div>
                      <div className="text-[11px] text-gray-500 uppercase tracking-widest">
                        Exact match (vs actual)
                      </div>
                      <div
                        className={`text-sm font-bold ${
                          predAcc > 20 ? 'text-green-400' : 'text-yellow-400'
                        }`}
                      >
                        {predAcc}%
                      </div>
                    </div>
                  </>
                )}
                {hasActualResults && (
                  <span className="ml-auto text-[10px] bg-green-500/15 border border-green-600/30 text-green-400 px-2 py-0.5 rounded-full font-bold">
                    ✓ Results available — validation mode
                  </span>
                )}
              </div>

              {/* Model description */}
              <div className="bg-carbon-800/50 border border-carbon-700/50 rounded-xl px-5 py-3">
                <p className="text-xs text-gray-400 leading-relaxed">
                  <span className="font-bold text-white">{prediction.model?.name}: </span>
                  {prediction.model?.description}
                </p>
              </div>

              {/* Podium prediction */}
              <div className="bg-carbon-800 rounded-xl border border-carbon-700 p-5">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">
                  Podium Prediction
                </h3>
                <div className="grid grid-cols-3 gap-3 items-end">
                  {/* P2 left, P1 centre elevated, P3 right */}
                  {prediction.podium_prediction[1] && (
                    <PodiumCard rank={2} driver={prediction.podium_prediction[1]} />
                  )}
                  {prediction.podium_prediction[0] && (
                    <PodiumCard rank={1} driver={prediction.podium_prediction[0]} />
                  )}
                  {prediction.podium_prediction[2] && (
                    <PodiumCard rank={3} driver={prediction.podium_prediction[2]} />
                  )}
                </div>
              </div>

              {/* Full grid — win probability bars */}
              <div className="bg-carbon-800 rounded-xl border border-carbon-700 p-5">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">
                  Win Probability — All Drivers
                  {hasActualResults && (
                    <span className="ml-2 normal-case text-gray-600 font-normal">
                      (coloured actual results shown on right)
                    </span>
                  )}
                </h3>
                <div className="space-y-0.5">
                  {prediction.drivers.map((d: any) => (
                    <ProbabilityBar key={d.driver_code} driver={d} maxProb={maxWinProb} />
                  ))}
                </div>
              </div>

              {/* Feature importance */}
              {prediction.feature_importance?.length > 0 && (
                <div className="bg-carbon-800 rounded-xl border border-carbon-700 p-5">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">
                    Feature Importance
                    <span className="ml-2 normal-case text-gray-600 font-normal">
                      — what the model relies on most
                    </span>
                  </h3>
                  <div className="space-y-1">
                    {prediction.feature_importance.map((f: any) => (
                      <FeatureImportanceBar
                        key={f.feature}
                        feature={f.feature}
                        importance={f.importance}
                        maxImp={maxImp}
                      />
                    ))}
                  </div>
                  <p className="mt-4 text-[11px] text-gray-600 leading-relaxed">
                    Feature importance measures how much each input contributes to the model's
                    decisions (fraction of total information gain across all trees).
                  </p>
                </div>
              )}

              {/* Feature details table */}
              <div className="bg-carbon-800 rounded-xl border border-carbon-700 p-5">
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">
                  Driver Feature Breakdown
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-carbon-700 text-gray-500 uppercase tracking-wider">
                        <th className="text-left py-2 px-2">Driver</th>
                        <th className="text-right py-2 px-2">Grid</th>
                        <th className="text-right py-2 px-2">Qual Pos</th>
                        <th className="text-right py-2 px-2">Gap Pole</th>
                        <th className="text-right py-2 px-2">FP2 Gap</th>
                        <th className="text-right py-2 px-2">Recent Avg</th>
                        <th className="text-right py-2 px-2">Circuit Avg</th>
                        <th className="text-right py-2 px-2">Circ Wins</th>
                        <th className="text-right py-2 px-2">Podium%</th>
                        <th className="text-right py-2 px-2">Team Avg</th>
                        <th className="text-right py-2 px-2">DNF%</th>
                        <th className="text-right py-2 px-2">Pit Avg</th>
                        <th className="text-right py-2 px-2">Win %</th>
                        {hasActualResults && (
                          <th className="text-right py-2 px-2">Actual</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {prediction.drivers.map((d: any) => {
                        const col = driverColor(d.driver_code);
                        return (
                          <tr
                            key={d.driver_code}
                            className="border-b border-carbon-700/30 hover:bg-carbon-700/20"
                          >
                            <td className="py-2 px-2">
                              <span
                                className="inline-block px-1.5 py-0.5 rounded text-white font-black text-[10px]"
                                style={{ background: col }}
                              >
                                {d.driver_code}
                              </span>
                            </td>
                            <td className="py-2 px-2 text-right text-gray-300 font-mono">
                              {d.grid_position ?? '—'}
                            </td>
                            <td className="py-2 px-2 text-right text-gray-300 font-mono">
                              {d.qual_position != null ? `P${d.qual_position}` : '—'}
                            </td>
                            <td className="py-2 px-2 text-right text-gray-300 font-mono">
                              {d.gap_to_pole != null ? `+${d.gap_to_pole.toFixed(3)}s` : '—'}
                            </td>
                            <td className="py-2 px-2 text-right font-mono"
                              title="FP2 pace gap to session fastest"
                              style={{
                                color: d.features.fp2_pace_gap != null
                                  ? d.features.fp2_pace_gap < 0.5 ? '#4ade80'
                                  : d.features.fp2_pace_gap < 1.5 ? '#fbbf24'
                                  : '#f87171'
                                  : '#6b7280'
                              }}>
                              {d.features.fp2_pace_gap != null ? `+${d.features.fp2_pace_gap.toFixed(2)}s` : '—'}
                            </td>
                            <td className="py-2 px-2 text-right text-gray-300 font-mono">
                              {d.features.recent_avg.toFixed(1)}
                            </td>
                            <td className="py-2 px-2 text-right text-gray-300 font-mono">
                              {d.features.circuit_avg.toFixed(1)}
                            </td>
                            <td className="py-2 px-2 text-right text-gray-300 font-mono">
                              {d.features.circuit_wins}
                            </td>
                            <td className="py-2 px-2 text-right text-gray-300 font-mono">
                              {(d.features.podium_rate_5 * 100).toFixed(0)}%
                            </td>
                            <td className="py-2 px-2 text-right text-gray-300 font-mono">
                              {d.features.recent_team_avg.toFixed(1)}
                            </td>
                            <td className="py-2 px-2 text-right font-mono"
                              title="Historical DNF rate"
                              style={{ color: d.features.dnf_rate > 0.15 ? '#f87171' : d.features.dnf_rate > 0.08 ? '#fbbf24' : '#9ca3af' }}>
                              {d.features.dnf_rate != null ? `${(d.features.dnf_rate * 100).toFixed(0)}%` : '—'}
                            </td>
                            <td className="py-2 px-2 text-right text-gray-300 font-mono">
                              {d.features.avg_pit_stops != null ? d.features.avg_pit_stops.toFixed(1) : '—'}
                            </td>
                            <td className="py-2 px-2 text-right font-bold font-mono" style={{ color: col }}>
                              {pct(d.win_probability)}
                            </td>
                            {hasActualResults && (
                              <td className="py-2 px-2 text-right font-mono">
                                {d.actual_position != null ? (
                                  <span
                                    className={
                                      d.actual_position === d.predicted_position
                                        ? 'text-green-400 font-bold'
                                        : d.actual_position <= 3
                                        ? 'text-yellow-400'
                                        : 'text-gray-600'
                                    }
                                  >
                                    P{d.actual_position}
                                  </span>
                                ) : (
                                  '—'
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Methodology note */}
              <div className="bg-carbon-900/50 border border-carbon-700/40 rounded-xl p-4 text-xs text-gray-500 leading-relaxed">
                <span className="font-bold text-gray-400">Methodology: </span>
                The model is trained on{' '}
                <span className="text-white">{prediction.training_samples}</span> historical race
                entries using strictly prior data (no future leakage). Features include grid
                position, driver recent form, season standing, circuit-specific history, and
                constructor strength. Win probabilities are normalised across all drivers in the
                field to sum to 100%.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
