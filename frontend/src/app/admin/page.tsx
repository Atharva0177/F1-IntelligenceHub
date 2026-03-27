'use client';

import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';
import type {
  AdminRace,
  AdminSeasonSummary,
  AdminSession,
  AdminStats,
  AdminSyncStatus,
  SeasonalDriverProfile,
  SeasonalTeamProfile,
} from '@/types';

function StatCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="rounded-xl border border-carbon-700 bg-carbon-900/70 p-4">
      <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">{label}</div>
      <div className="text-2xl font-black text-white leading-none" style={{ color: accent }}>{value}</div>
    </div>
  );
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [syncStatus, setSyncStatus] = useState<AdminSyncStatus | null>(null);

  const [seasons, setSeasons] = useState<AdminSeasonSummary[]>([]);
  const [races, setRaces] = useState<AdminRace[]>([]);
  const [sessions, setSessions] = useState<AdminSession[]>([]);

  const [selectedSeasonYear, setSelectedSeasonYear] = useState<number>(new Date().getFullYear());
  const [deleteSeasonYear, setDeleteSeasonYear] = useState<string>('');
  const [deleteRaceId, setDeleteRaceId] = useState<string>('');
  const [deleteSessionId, setDeleteSessionId] = useState<string>('');

  const [seasonalDrivers, setSeasonalDrivers] = useState<SeasonalDriverProfile[]>([]);
  const [seasonalTeams, setSeasonalTeams] = useState<SeasonalTeamProfile[]>([]);
  const [driverFilter, setDriverFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');

  const [driverImageDrafts, setDriverImageDrafts] = useState<Record<number, string>>({});
  const [driverNumberDrafts, setDriverNumberDrafts] = useState<Record<number, string>>({});
  const [teamImageDrafts, setTeamImageDrafts] = useState<Record<number, string>>({});

  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  const loadCore = async () => {
    const [statsRes, syncRes, seasonRes, raceRes, sessionRes] = await Promise.all([
      api.getAdminStats(),
      api.getAdminSyncStatus(),
      api.getAdminSeasons(),
      api.getAdminRaces(),
      api.getAdminSessions(),
    ]);
    setStats(statsRes);
    setSyncStatus(syncRes);
    setSeasons(seasonRes);
    setRaces(raceRes);
    setSessions(sessionRes);

    if (seasonRes.length > 0) {
      const latest = seasonRes[0].year;
      setSelectedSeasonYear((prev) => (seasonRes.some((s) => s.year === prev) ? prev : latest));
      setDeleteSeasonYear((prev) => (prev || String(latest)));
    }
  };

  const loadSeasonalAssets = async (seasonYear: number) => {
    const [driversRes, teamsRes] = await Promise.all([
      api.getSeasonalDriverProfiles(seasonYear),
      api.getSeasonalTeamProfiles(seasonYear),
    ]);

    setSeasonalDrivers(driversRes);
    setSeasonalTeams(teamsRes);
    setDriverImageDrafts(Object.fromEntries(driversRes.map((d) => [d.id, d.season_image_url || ''])));
    setDriverNumberDrafts(Object.fromEntries(driversRes.map((d) => [d.id, d.season_number !== undefined && d.season_number !== null ? String(d.season_number) : ''])));
    setTeamImageDrafts(Object.fromEntries(teamsRes.map((t) => [t.id, t.season_image_url || ''])));
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      await loadCore();
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Failed to load admin data.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      setLoading(true);
      try {
        const status = await api.getAdminAuthStatus();
        if (status.authenticated) {
          setIsAuthenticated(true);
          await loadCore();
        }
      } catch (err) {
        console.error(err);
      } finally {
        setAuthChecked(true);
        setLoading(false);
      }
    };

    initAuth();
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !selectedSeasonYear) return;
    loadSeasonalAssets(selectedSeasonYear).catch((err) => {
      console.error(err);
      setMessage({ type: 'error', text: 'Failed to load seasonal driver/team data.' });
    });
  }, [isAuthenticated, selectedSeasonYear]);

  useEffect(() => {
    if (!isAuthenticated || !syncStatus?.running) return;

    const pollId = window.setInterval(async () => {
      try {
        const status = await api.getAdminSyncStatus();
        setSyncStatus(status);
        if (!status.running) {
          await loadCore();
          if (status.status === 'completed') {
            setMessage({ type: 'ok', text: `Race data update completed for ${status.season_year}.` });
          } else {
            setMessage({ type: 'error', text: `Race data update failed${status.exit_code !== undefined ? ` (exit code ${status.exit_code})` : ''}.` });
          }
        }
      } catch (err) {
        console.error(err);
      }
    }, 5000);

    return () => window.clearInterval(pollId);
  }, [isAuthenticated, syncStatus?.running]);

  const loginAdmin = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setBusy(true);
    setAuthError(null);

    try {
      const result = await api.adminLogin(password);
      if (result.authenticated) {
        setIsAuthenticated(true);
        await loadAll();
      }
    } catch (err: any) {
      setAuthError(err?.response?.data?.detail || 'Invalid password.');
    } finally {
      setBusy(false);
    }
  };

  const logoutAdmin = async () => {
    setBusy(true);
    try {
      await api.adminLogout();
      setIsAuthenticated(false);
      setStats(null);
      setSyncStatus(null);
      setSeasons([]);
      setRaces([]);
      setSessions([]);
      setSeasonalDrivers([]);
      setSeasonalTeams([]);
      setMessage(null);
    } finally {
      setBusy(false);
    }
  };

  const runRaceDataSync = async () => {
    const latestSeason = seasons.length > 0 ? seasons[0].year : new Date().getFullYear();
    setBusy(true);
    setMessage(null);
    try {
      const started = await api.startAdminSync(latestSeason);
      setSyncStatus(started);
      setMessage({ type: 'ok', text: `Race data update started for ${latestSeason}.` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.response?.data?.detail || 'Could not start race data update.' });
    } finally {
      setBusy(false);
    }
  };

  const deleteSeason = async () => {
    if (!deleteSeasonYear) return;
    const year = Number(deleteSeasonYear);
    const ok = window.confirm(`Delete season ${year} and all linked races/sessions/results?`);
    if (!ok) return;

    setBusy(true);
    setMessage(null);
    try {
      await api.deleteAdminSeason(year, true);
      await loadAll();
      setMessage({ type: 'ok', text: `Season ${year} deleted.` });
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const text = typeof detail === 'string' ? detail : detail?.message || 'Failed to delete season.';
      setMessage({ type: 'error', text });
    } finally {
      setBusy(false);
    }
  };

  const deleteRace = async () => {
    if (!deleteRaceId) return;
    const race = races.find((r) => r.id === Number(deleteRaceId));
    const ok = window.confirm(`Delete race ${race?.name || deleteRaceId} and linked data?`);
    if (!ok) return;

    setBusy(true);
    setMessage(null);
    try {
      await api.deleteAdminRace(Number(deleteRaceId), true);
      await loadCore();
      setDeleteRaceId('');
      setMessage({ type: 'ok', text: 'Race deleted.' });
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const text = typeof detail === 'string' ? detail : detail?.message || 'Failed to delete race.';
      setMessage({ type: 'error', text });
    } finally {
      setBusy(false);
    }
  };

  const deleteSession = async () => {
    if (!deleteSessionId) return;
    const session = sessions.find((s) => s.id === Number(deleteSessionId));
    const ok = window.confirm(`Delete session ${session?.session_type || deleteSessionId} for ${session?.race_name || ''}?`);
    if (!ok) return;

    setBusy(true);
    setMessage(null);
    try {
      await api.deleteAdminSession(Number(deleteSessionId), true);
      await loadCore();
      setDeleteSessionId('');
      setMessage({ type: 'ok', text: 'Session deleted.' });
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const text = typeof detail === 'string' ? detail : detail?.message || 'Failed to delete session.';
      setMessage({ type: 'error', text });
    } finally {
      setBusy(false);
    }
  };

  const saveSeasonalDriver = async (driverId: number) => {
    setBusy(true);
    setMessage(null);
    try {
      const numberText = (driverNumberDrafts[driverId] || '').trim();
      await api.updateSeasonalDriverProfile(driverId, selectedSeasonYear, {
        driver_number: numberText ? Number(numberText) : undefined,
        image_url: (driverImageDrafts[driverId] || '').trim() || undefined,
      });
      await loadSeasonalAssets(selectedSeasonYear);
      setMessage({ type: 'ok', text: 'Seasonal driver profile saved.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.response?.data?.detail || 'Failed to save driver profile.' });
    } finally {
      setBusy(false);
    }
  };

  const saveSeasonalTeam = async (teamId: number) => {
    setBusy(true);
    setMessage(null);
    try {
      await api.updateSeasonalTeamProfile(teamId, selectedSeasonYear, {
        image_url: (teamImageDrafts[teamId] || '').trim() || undefined,
      });
      await loadSeasonalAssets(selectedSeasonYear);
      setMessage({ type: 'ok', text: 'Seasonal team profile saved.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.response?.data?.detail || 'Failed to save team profile.' });
    } finally {
      setBusy(false);
    }
  };

  const filteredDrivers = useMemo(() => {
    const q = driverFilter.trim().toLowerCase();
    if (!q) return seasonalDrivers;
    return seasonalDrivers.filter((d) => `${d.code || ''} ${d.first_name || ''} ${d.last_name || ''}`.toLowerCase().includes(q));
  }, [seasonalDrivers, driverFilter]);

  const filteredTeams = useMemo(() => {
    const q = teamFilter.trim().toLowerCase();
    if (!q) return seasonalTeams;
    return seasonalTeams.filter((t) => (t.name || '').toLowerCase().includes(q));
  }, [seasonalTeams, teamFilter]);

  const pct = (value: number | undefined) => `${Math.round((value || 0) * 100)}%`;

  if (!authChecked || loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto mt-12 rounded-2xl border border-carbon-700 bg-carbon-900 p-6 space-y-4">
        <div>
          <h1 className="text-2xl font-black text-white">Admin Login</h1>
          <p className="text-sm text-gray-400 mt-1">Enter the admin password to access management tools.</p>
        </div>

        <form onSubmit={loginAdmin} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Admin password"
            className="w-full bg-carbon-950 border border-carbon-700 rounded-lg px-3 py-2 text-sm text-white"
            autoFocus
          />
          {authError && <div className="text-sm text-red-400">{authError}</div>}
          <button
            type="submit"
            disabled={busy || !password}
            className="w-full px-3 py-2 rounded-lg bg-racing-red-600 text-white text-sm font-bold disabled:opacity-50"
          >
            {busy ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12 animate-fade-in">
      <section className="rounded-2xl border border-carbon-700 overflow-hidden bg-carbon-900">
        <div className="px-6 py-5 border-b border-carbon-700 bg-gradient-to-r from-racing-red-900/30 via-carbon-900 to-carbon-900">
          <div className="text-[11px] uppercase tracking-widest text-racing-red-400 font-bold">Admin Console</div>
          <h1 className="text-3xl sm:text-4xl font-black text-white leading-none mt-2">Data Management</h1>
          <p className="text-sm text-gray-400 mt-2">Delete season/race/session data and edit driver/team assets per season.</p>
        </div>

        {message && (
          <div className={`mx-6 mt-5 rounded-lg border px-4 py-3 text-sm ${message.type === 'ok' ? 'bg-green-900/20 border-green-700 text-green-300' : 'bg-red-900/20 border-red-700 text-red-300'}`}>
            {message.text}
          </div>
        )}

        <div className="p-6 space-y-8">
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-white">Analytics + Update</h2>
              <div className="flex items-center gap-2">
                <button onClick={logoutAdmin} disabled={busy} className="px-3 py-2 rounded-lg bg-carbon-800 text-gray-300 text-xs font-bold uppercase tracking-wider hover:text-white border border-carbon-700 disabled:opacity-50">Logout</button>
                <button onClick={runRaceDataSync} disabled={busy || !!syncStatus?.running} className="px-3 py-2 rounded-lg bg-racing-red-600 text-white text-xs font-bold uppercase tracking-wider hover:bg-racing-red-500 disabled:opacity-50">
                  {syncStatus?.running ? 'Updating...' : 'Update Race Data'}
                </button>
                <button onClick={loadAll} disabled={busy} className="px-3 py-2 rounded-lg bg-carbon-800 text-gray-300 text-xs font-bold uppercase tracking-wider hover:text-white border border-carbon-700 disabled:opacity-50">Refresh</button>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard label="Seasons" value={stats?.entity_counts.seasons ?? 0} accent="#f97316" />
              <StatCard label="Races" value={stats?.entity_counts.races ?? 0} accent="#e10600" />
              <StatCard label="Sessions" value={stats?.entity_counts.sessions ?? 0} accent="#facc15" />
              <StatCard label="Drivers" value={stats?.entity_counts.drivers ?? 0} accent="#38bdf8" />
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard label="Race Completion" value={pct(stats?.coverage.completion_ratio)} accent="#22c55e" />
              <StatCard label="Sessions With Laps" value={pct((stats?.coverage.sessions_with_laps || 0) / Math.max(stats?.entity_counts.sessions || 1, 1))} accent="#f59e0b" />
              <StatCard label="Sessions With Telemetry" value={pct((stats?.coverage.sessions_with_telemetry || 0) / Math.max(stats?.entity_counts.sessions || 1, 1))} accent="#3b82f6" />
              <StatCard label="Races With Results" value={pct((stats?.coverage.races_with_results || 0) / Math.max(stats?.entity_counts.races || 1, 1))} accent="#a78bfa" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="rounded-xl border border-carbon-700 bg-carbon-950 p-4">
                <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">Session Type Mix</div>
                <div className="space-y-2">
                  {(stats?.session_type_breakdown || []).map((row) => (
                    <div key={row.session_type} className="flex items-center justify-between text-sm">
                      <span className="text-gray-300">{row.session_type}</span>
                      <span className="text-white font-semibold">{row.count} ({pct(row.ratio)})</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-carbon-700 bg-carbon-950 p-4">
                <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">Data Density</div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between"><span className="text-gray-300">Avg laps/session</span><span className="text-white font-semibold">{stats?.data_density.avg_laps_per_session ?? 0}</span></div>
                  <div className="flex items-center justify-between"><span className="text-gray-300">Avg telemetry/session</span><span className="text-white font-semibold">{stats?.data_density.avg_telemetry_points_per_session ?? 0}</span></div>
                  <div className="flex items-center justify-between"><span className="text-gray-300">Qualifying rows</span><span className="text-white font-semibold">{stats?.data_density.qualifying_rows ?? 0}</span></div>
                </div>
              </div>

              <div className="rounded-xl border border-carbon-700 bg-carbon-950 p-4">
                <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">Recent Races</div>
                <div className="space-y-2">
                  {(stats?.recent_races || []).slice(0, 6).map((race) => (
                    <div key={race.race_id} className="text-sm">
                      <div className="text-white font-semibold">{race.season_year} R{race.round_number ?? '-'} {race.race_name}</div>
                      <div className="text-gray-400 text-xs">{race.circuit_name || 'Unknown circuit'} {race.race_date ? `• ${race.race_date}` : ''}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-xl border border-carbon-700 bg-carbon-950 p-4">
                <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">Top Drivers</div>
                <div className="space-y-2">
                  {(stats?.top_lists.drivers || []).map((driver, idx) => (
                    <div key={driver.id} className="grid grid-cols-12 gap-2 text-sm">
                      <div className="col-span-1 text-gray-500">{idx + 1}</div>
                      <div className="col-span-6 text-white truncate">{driver.code ? `${driver.code} ` : ''}{driver.name}</div>
                      <div className="col-span-3 text-gray-300 text-right">{driver.points.toFixed(1)} pts</div>
                      <div className="col-span-2 text-gray-400 text-right">W {driver.wins}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-carbon-700 bg-carbon-950 p-4">
                <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">Top Teams</div>
                <div className="space-y-2">
                  {(stats?.top_lists.teams || []).map((team, idx) => (
                    <div key={team.id} className="grid grid-cols-12 gap-2 text-sm">
                      <div className="col-span-1 text-gray-500">{idx + 1}</div>
                      <div className="col-span-6 text-white truncate">{team.name}</div>
                      <div className="col-span-3 text-gray-300 text-right">{team.points.toFixed(1)} pts</div>
                      <div className="col-span-2 text-gray-400 text-right">W {team.wins}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-carbon-700 bg-carbon-950 p-4">
              <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">Season Breakdown</div>
              <div className="max-h-56 overflow-auto pr-1 space-y-2">
                {(stats?.season_breakdown || []).map((row) => (
                  <div key={row.season_year} className="grid grid-cols-12 gap-2 text-xs md:text-sm">
                    <div className="col-span-2 text-white font-semibold">{row.season_year}</div>
                    <div className="col-span-2 text-gray-300">R {row.race_count}</div>
                    <div className="col-span-2 text-gray-300">S {row.session_count}</div>
                    <div className="col-span-3 text-gray-300">Res {row.result_rows}</div>
                    <div className="col-span-3 text-right text-gray-200">{row.completed_races}/{row.race_count} ({pct(row.completion_ratio)})</div>
                  </div>
                ))}
              </div>
            </div>

            {syncStatus && syncStatus.status !== 'idle' && (
              <div className="rounded-xl border border-carbon-700 bg-carbon-950 p-3 text-xs text-gray-300 space-y-1">
                <div><span className="text-gray-500 uppercase tracking-widest">Status:</span> {syncStatus.status}</div>
                {syncStatus.season_year && <div><span className="text-gray-500 uppercase tracking-widest">Season:</span> {syncStatus.season_year}</div>}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="text-xl font-bold text-white">Delete Data</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-carbon-700 bg-carbon-950 p-4 space-y-3">
                <div className="text-sm font-bold text-white">Delete Season</div>
                <select value={deleteSeasonYear} onChange={(e) => setDeleteSeasonYear(e.target.value)} className="w-full bg-carbon-900 border border-carbon-700 rounded-lg px-3 py-2 text-sm text-white">
                  <option value="">Select season</option>
                  {seasons.map((s) => <option key={s.year} value={String(s.year)}>{s.year} ({s.race_count} races)</option>)}
                </select>
                <button onClick={deleteSeason} disabled={busy || !deleteSeasonYear} className="w-full px-3 py-2 rounded-lg bg-red-700 text-white text-sm font-bold disabled:opacity-50">Delete Season</button>
              </div>

              <div className="rounded-xl border border-carbon-700 bg-carbon-950 p-4 space-y-3">
                <div className="text-sm font-bold text-white">Delete Race</div>
                <select value={deleteRaceId} onChange={(e) => setDeleteRaceId(e.target.value)} className="w-full bg-carbon-900 border border-carbon-700 rounded-lg px-3 py-2 text-sm text-white">
                  <option value="">Select race</option>
                  {races.map((r) => <option key={r.id} value={String(r.id)}>{r.season_year} R{r.round_number ?? '-'} - {r.name}</option>)}
                </select>
                <button onClick={deleteRace} disabled={busy || !deleteRaceId} className="w-full px-3 py-2 rounded-lg bg-red-700 text-white text-sm font-bold disabled:opacity-50">Delete Race</button>
              </div>

              <div className="rounded-xl border border-carbon-700 bg-carbon-950 p-4 space-y-3">
                <div className="text-sm font-bold text-white">Delete Session</div>
                <select value={deleteSessionId} onChange={(e) => setDeleteSessionId(e.target.value)} className="w-full bg-carbon-900 border border-carbon-700 rounded-lg px-3 py-2 text-sm text-white">
                  <option value="">Select session</option>
                  {sessions.map((s) => <option key={s.id} value={String(s.id)}>{s.season_year} - {s.race_name} - {s.session_type}</option>)}
                </select>
                <button onClick={deleteSession} disabled={busy || !deleteSessionId} className="w-full px-3 py-2 rounded-lg bg-red-700 text-white text-sm font-bold disabled:opacity-50">Delete Session</button>
              </div>
            </div>
          </section>

          <section className="space-y-5">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-bold text-white">Seasonal Driver & Team Overrides</h2>
              <select value={String(selectedSeasonYear)} onChange={(e) => setSelectedSeasonYear(Number(e.target.value))} className="bg-carbon-900 border border-carbon-700 rounded-lg px-3 py-2 text-sm text-white">
                {seasons.map((s) => <option key={s.year} value={String(s.year)}>{s.year}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
              <div className="rounded-xl border border-carbon-700 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-white font-bold">Drivers (Image + Number)</h3>
                  <input value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)} placeholder="Filter drivers" className="bg-carbon-950 border border-carbon-700 rounded-lg px-3 py-1.5 text-xs text-white w-44" />
                </div>
                <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
                  {filteredDrivers.map((driver) => {
                    const label = `${driver.code || ''} ${driver.first_name || ''} ${driver.last_name || ''}`.trim();
                    return (
                      <div key={driver.id} className="rounded-lg border border-carbon-800 bg-carbon-950/60 p-2.5 space-y-2">
                        <div className="text-xs font-bold text-white">{label}</div>
                        <div className="grid grid-cols-5 gap-2">
                          <input value={driverNumberDrafts[driver.id] ?? ''} onChange={(e) => setDriverNumberDrafts((prev) => ({ ...prev, [driver.id]: e.target.value }))} placeholder={`No. (default ${driver.default_number ?? '-'})`} className="col-span-1 bg-carbon-950 border border-carbon-700 rounded-md px-2.5 py-1.5 text-xs text-gray-200" />
                          <input value={driverImageDrafts[driver.id] ?? ''} onChange={(e) => setDriverImageDrafts((prev) => ({ ...prev, [driver.id]: e.target.value }))} placeholder="Season image URL" className="col-span-3 bg-carbon-950 border border-carbon-700 rounded-md px-2.5 py-1.5 text-xs text-gray-200" />
                          <button onClick={() => saveSeasonalDriver(driver.id)} disabled={busy} className="col-span-1 px-2.5 py-1.5 rounded-md bg-racing-red-600 text-white text-xs font-bold disabled:opacity-50">Save</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-carbon-700 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-white font-bold">Teams (Image)</h3>
                  <input value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} placeholder="Filter teams" className="bg-carbon-950 border border-carbon-700 rounded-lg px-3 py-1.5 text-xs text-white w-44" />
                </div>
                <div className="space-y-2 max-h-[420px] overflow-auto pr-1">
                  {filteredTeams.map((team) => (
                    <div key={team.id} className="rounded-lg border border-carbon-800 bg-carbon-950/60 p-2.5">
                      <div className="text-xs font-bold text-white mb-2">{team.name}</div>
                      <div className="flex gap-2">
                        <input value={teamImageDrafts[team.id] ?? ''} onChange={(e) => setTeamImageDrafts((prev) => ({ ...prev, [team.id]: e.target.value }))} placeholder="Season image URL" className="flex-1 bg-carbon-950 border border-carbon-700 rounded-md px-2.5 py-1.5 text-xs text-gray-200" />
                        <button onClick={() => saveSeasonalTeam(team.id)} disabled={busy} className="px-2.5 py-1.5 rounded-md bg-racing-red-600 text-white text-xs font-bold disabled:opacity-50">Save</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
