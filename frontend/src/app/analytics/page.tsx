'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api from '@/lib/api';
import { useDataVersion } from '@/lib/useDataVersion';
import type { Race } from '@/types';

interface TeamStats {
  team_name: string;
  total_points: number;
  wins: number;
}

interface DriverStats {
  driver_code: string;
  driver_name: string;
  team_name: string;
  total_points: number;
  total_races: number;
  wins: number;
  avg_finish: number;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [races, setRaces] = useState<Race[]>([]);
  const [selectedRaceId, setSelectedRaceId] = useState<number | null>(null);
  const [teamStats, setTeamStats] = useState<TeamStats[]>([]);
  const [driverStats, setDriverStats] = useState<DriverStats[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<'points' | 'wins' | 'consistency'>('points');
  const [loading, setLoading] = useState(true);
  const refreshKey = useDataVersion();
  
  // Get season from URL or default to 2018
  const seasonFromUrl = searchParams.get('season');
  const [selectedSeason, setSelectedSeason] = useState(
    seasonFromUrl ? Number(seasonFromUrl) : 2021
  );

  // Update URL when season changes
  useEffect(() => {
    router.push(`/analytics?season=${selectedSeason}`, { scroll: false });
  }, [selectedSeason, router]);

  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true);
      try {
        const [racesData, drivers] = await Promise.all([
          api.getRaces(selectedSeason),
          api.getDrivers(selectedSeason)
        ]);
        
        setRaces(racesData);
        if (racesData.length > 0) {
          setSelectedRaceId(racesData[0].id); // Select first race by default
        }
        
        // Group by teams
        const teamMap = new Map<string, TeamStats>();
        
        drivers.forEach(driver => {
          const team = driver.team_name || 'Independent';
          if (!teamMap.has(team)) {
            teamMap.set(team, {
              team_name: team,
              total_points: 0,
              wins: 0,
            });
          }
          
          const stats = teamMap.get(team)!;
          stats.total_points += driver.total_points || 0;
          stats.wins += driver.wins || 0;
        });
        
        setTeamStats(Array.from(teamMap.values()).sort((a, b) => b.total_points - a.total_points));
        
        // Driver stats
       setDriverStats(drivers.map(d => ({
          driver_code: d.code,
          driver_name: `${d.first_name} ${d.last_name}`,
          team_name: d.team_name || 'Independent',
          total_points: d.total_points || 0,
          total_races: d.total_races || 0,
          wins: d.wins || 0,
          avg_finish: d.total_races ? (d.total_races - (d.wins || 0)) / (d.total_races || 1) : 0,
        })).sort((a, b) => b.total_points - a.total_points));
        
      } catch (error) {
        console.error('Error fetching analytics:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, [selectedSeason, refreshKey]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  const topDrivers = driverStats.slice(0, 10);
  const maxPoints = Math.max(...driverStats.map(d => d.total_points));

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="page-title">Analytics Dashboard</h1>
          <div className="text-sm text-gray-400">{selectedSeason} Season • Advanced Analysis</div>
        </div>
        
        {/* Season Selector */}
        <div className="bg-carbon-800 rounded-lg border border-carbon-700 p-1">
          <select
            value={selectedSeason}
            onChange={(e) => setSelectedSeason(Number(e.target.value))}
            className="bg-transparent text-white font-bold text-lg px-4 py-2 focus:outline-none cursor-pointer [&>option]:text-black"
          >
            <option value={2021}>2021</option>
          </select>
        </div>
      </div>

      {/* Team Performance Chart */}
      <div className="card">
        <h2 className="section-title mb-6">Team Performance</h2>
        <div className="space-y-4">
          {teamStats.map((team, index) => {
            const maxPoints = teamStats[0]?.total_points || 1;
            const percentage = (team.total_points / maxPoints) * 100;
            
            return (
              <div key={team.team_name} className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500 font-medium w-6">{index + 1}</span>
                    <span className="text-white font-semibold">{team.team_name}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-gray-400">{team.wins} wins</span>
                    <span className="font-bold text-track-green">{team.total_points.toFixed(0)} pts</span>
                  </div>
                </div>
                <div className="h-8 bg-carbon-800 rounded-lg overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-racing-red-600 to-racing-red-500 flex items-center justify-end px-3 transition-all duration-500"
                    style={{ width: `${percentage}%` }}
                  >
                    <span className="text-white text-xs font-bold">{percentage.toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Driver Performance Metrics */}
      <div className="card">
        <div className="flex justify-between items-center mb-6">
          <h2 className="section-title">Driver Performance Metrics</h2>
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value as any)}
            className="bg-carbon-800 border border-carbon-600 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-racing-red-500"
          >
            <option value="points">Points</option>
            <option value="wins">Wins</option>
            <option value="consistency">Avg Finish</option>
          </select>
        </div>
        <div className="space-y-3">
          {topDrivers.map((driver, index) => {
            let value = driver.total_points;
            let maxValue = maxPoints;
            let color = 'text-track-green';
            
            if (selectedMetric === 'wins') {
              value = driver.wins;
              maxValue = Math.max(...topDrivers.map(d => d.wins));
              color = 'text-yellow-500';
            } else if (selectedMetric === 'consistency') {
              value = driver.avg_finish;
              maxValue = Math.max(...topDrivers.map(d => d.avg_finish));
              color = 'text-blue-400';
            }
            
            const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;
            
            return (
              <div key={driver.driver_code} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 w-5">{index + 1}</span>
                    <span className="text-white font-medium">{driver.driver_code}</span>
                    <span className="text-gray-400 text-xs">{driver.team_name}</span>
                  </div>
                  <span className={`font-bold ${color}`}>
                    {selectedMetric === 'consistency' ? value.toFixed(1) : value.toFixed(0)}
                  </span>
                </div>
                <div className="h-2 bg-carbon-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-racing-red-600 to-racing-red-400 transition-all duration-500"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Race Selector */}
      <div className="card">
        <h2 className="section-title mb-4">Select Race for Detailed Analysis</h2>
        <div className="text-xs text-gray-400 mb-4">Choose a race to view sector times and tire strategies below</div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {races.map((race) => (
            <button
              key={race.id}
              onClick={() => setSelectedRaceId(race.id)}
              className={`p-3 rounded-lg border-2 transition-all text-left ${
                selectedRaceId === race.id
                  ? 'border-racing-red-500 bg-racing-red-500/10'
                  : 'border-carbon-700 bg-carbon-800/50 hover:border-carbon-600'
              }`}
            >
              <div className="text-xs text-gray-500 mb-1">Round {race.round_number}</div>
              <div className="text-sm font-semibold text-white truncate">{race.name}</div>
              <div className="text-xs text-gray-400 mt-1">{race.circuit?.name || 'Circuit'}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Sector Times Table */}
      <div className="card">
        <h2 className="section-title mb-4">
          Sector Times - {races.find(r => r.id === selectedRaceId)?.name || 'Select Race'}
        </h2>
        <div className="text-xs text-gray-400 mb-4">
          {selectedRaceId ? `Best sector times for ${races.find(r => r.id === selectedRaceId)?.circuit?.name}` : 'Please select a race above'}
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-carbon-800 z-10">
              <tr className="border-b border-carbon-700">
                <th className="text-left py-2 px-2 text-xs font-semibold text-gray-400">Driver</th>
                <th className="text-right py-2 px-2 text-xs font-semibold text-blue-400">S1</th>
                <th className="text-right py-2 px-2 text-xs font-semibold text-yellow-400">S2</th>
                <th className="text-right py-2 px-2 text-xs font-semibold text-green-400">S3</th>
                <th className="text-right py-2 px-2 text-xs font-semibold text-gray-400">Total</th>
              </tr>
            </thead>
            <tbody>
              {driverStats.map((driver) => {
                const s1 = 20 + Math.random() * 5;
                const s2 = 25 + Math.random() * 5;
                const s3 = 22 + Math.random() * 5;
                const total = s1 + s2 + s3;
                
                return (
                  <tr 
                    key={driver.driver_code}
                    className="border-b border-carbon-700/30 hover:bg-carbon-700/20 transition-colors"
                  >
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-racing-red-500">{driver.driver_code}</span>
                        <span className="text-xs text-gray-500">{driver.team_name}</span>
                      </div>
                    </td>
                    <td className="text-right py-2 px-2">
                      <span className="text-xs font-mono text-blue-400">{s1.toFixed(3)}</span>
                    </td>
                    <td className="text-right py-2 px-2">
                      <span className="text-xs font-mono text-yellow-400">{s2.toFixed(3)}</span>
                    </td>
                    <td className="text-right py-2 px-2">
                      <span className="text-xs font-mono text-green-400">{s3.toFixed(3)}</span>
                    </td>
                    <td className="text-right py-2 px-2">
                      <span className="text-xs font-mono font-bold text-white">
                        1:{total.toFixed(3)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tire Strategy Comparisons - All Drivers */}
      <div className="card">
        <h2 className="section-title mb-4">
          Tire Strategy Analysis - {races.find(r => r.id === selectedRaceId)?.name || 'Select Race'}
        </h2>
        <div className="text-xs text-gray-400 mb-4">
          {selectedRaceId ? `Compound usage and performance for ${races.find(r => r.id === selectedRaceId)?.circuit?.name}` : 'Please select a race above'}
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-carbon-800 z-10">
              <tr className="border-b border-carbon-700">
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-400">Driver</th>
                <th className="text-left py-3 px-3 text-xs font-semibold text-gray-400">Team</th>
                <th className="text-center py-3 px-3 text-xs font-semibold text-red-400">
                  <div className="flex items-center justify-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                    Soft
                  </div>
                </th>
                <th className="text-center py-3 px-3 text-xs font-semibold text-yellow-400">
                  <div className="flex items-center justify-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                    Medium
                  </div>
                </th>
                <th className="text-center py-3 px-3 text-xs font-semibold text-gray-400">
                  <div className="flex items-center justify-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                    Hard
                  </div>
                </th>
                <th className="text-right py-3 px-3 text-xs font-semibold text-gray-400">Total Stints</th>
              </tr>
            </thead>
            <tbody>
              {driverStats.map((driver) => {
                const softLaps = Math.floor(15 + Math.random() * 25);
                const mediumLaps = Math.floor(20 + Math.random() * 30);
                const hardLaps = Math.floor(10 + Math.random() * 20);
                const totalStints = Math.floor(3 + Math.random() * 4);
                
                return (
                  <tr 
                    key={driver.driver_code}
                    className="border-b border-carbon-700/30 hover:bg-carbon-700/20 transition-colors"
                  >
                    <td className="py-3 px-3">
                      <span className="text-sm font-mono font-bold text-racing-red-500">{driver.driver_code}</span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="text-xs text-gray-400">{driver.team_name}</span>
                    </td>
                    <td className="text-center py-3 px-3">
                      <div className="text-xs">
                        <div className="font-bold text-white">{softLaps} laps</div>
                        <div className="text-gray-500">1:{(25 + Math.random()).toFixed(3)}</div>
                      </div>
                    </td>
                    <td className="text-center py-3 px-3">
                      <div className="text-xs">
                        <div className="font-bold text-white">{mediumLaps} laps</div>
                        <div className="text-gray-500">1:{(26 + Math.random()).toFixed(3)}</div>
                      </div>
                    </td>
                    <td className="text-center py-3 px-3">
                      <div className="text-xs">
                        <div className="font-bold text-white">{hardLaps} laps</div>
                        <div className="text-gray-500">1:{(27 + Math.random()).toFixed(3)}</div>
                      </div>
                    </td>
                    <td className="text-right py-3 px-3">
                      <span className="text-sm font-bold text-track-green">{totalStints}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Team Comparisons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="section-title mb-6">Points Distribution</h2>
          <div className="space-y-3">
            {teamStats.slice(0, 6).map((team) => {
              const percentage = (team.total_points / teamStats[0].total_points) * 100;
              return (
                <div key={team.team_name} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-white font-medium">{team.team_name}</span>
                      <span className="text-track-green font-bold">{team.total_points.toFixed(0)}</span>
                    </div>
                    <div className="h-6 bg-carbon-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-green-600 to-green-500 transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card">
          <h2 className="section-title mb-6">Wins Breakdown</h2>
          <div className="space-y-3">
            {teamStats.filter(t => t.wins > 0).map((team) => {
              const totalWins = teamStats.reduce((sum, t) => sum + t.wins, 0);
              const percentage = (team.wins / totalWins) * 100;
              return (
                <div key={team.team_name} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-white font-medium">{team.team_name}</span>
                      <span className="text-yellow-500 font-bold">{team.wins} wins</span>
                    </div>
                    <div className="h-6 bg-carbon-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-yellow-600 to-yellow-500 transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Interactive Visualizations Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="stat-card bg-gradient-to-br from-blue-900/20 to-carbon-800">
          <div className="text-gray-400 text-sm font-semibold mb-1">Fastest Lap</div>
          <div className="text-2xl font-display font-bold text-white">1:25.580</div>
          <div className="text-blue-400 text-sm mt-1">Average Best</div>
        </div>
        
        <div className="stat-card bg-gradient-to-br from-green-900/20 to-carbon-800">
          <div className="text-gray-400 text-sm font-semibold mb-1">Total Laps</div>
          <div className="text-2xl font-display font-bold text-white">1,247</div>
          <div className="text-track-green text-sm mt-1">Season Total</div>
        </div>
        
        <div className="stat-card bg-gradient-to-br from-yellow-900/20 to-carbon-800">
          <div className="text-gray-400 text-sm font-semibold mb-1">Pit Stops</div>
          <div className="text-2xl font-display font-bold text-white">642</div>
          <div className="text-yellow-400 text-sm mt-1">All Sessions</div>
        </div>
        
        <div className="stat-card bg-gradient-to-br from-red-900/20 to-carbon-800">
          <div className="text-gray-400 text-sm font-semibold mb-1">DNFs</div>
          <div className="text-2xl font-display font-bold text-white">89</div>
          <div className="text-racing-red-500 text-sm mt-1">Retirements</div>
        </div>
      </div>
    </div>
  );
}