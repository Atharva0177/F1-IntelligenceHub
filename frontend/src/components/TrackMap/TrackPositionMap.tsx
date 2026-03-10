'use client';

import React, { useState, useEffect, useRef } from 'react';
import { circuitLayouts } from '@/lib/circuitLayouts';
import api from '@/lib/api';

interface LapTime {
  lap_number: number;
  lap_time: number;
  driver_code: string;
}

interface TrackPositionMapProps {
  circuitName: string;
  sessionId?: number;
  selectedDrivers?: string[];
}

const DRIVER_COLORS: Record<string, string> = {
  'HAM': '#00D2BE', 'BOT': '#00D2BE', // Mercedes
  'VET': '#DC0000', 'RAI': '#DC0000', // Ferrari
  'VER': '#0600EF', 'RIC': '#0600EF', // Red Bull  
  'ALO': '#FF8700', 'VAN': '#FF8700', // McLaren
  'HUL': '#F58020', 'SAI': '#F58020', // Renault
  'PER': '#F596C8', 'OCO': '#F596C8', // Force India
  'HAR': '#469BFF', // Toro Rosso
  'ERI': '#9B0000', 'LEC': '#9B0000', // Sauber 
  'GRO': '#787878', 'MAG': '#787878', // Haas
  'STR': '#005AFF', 'SIR': '#005AFF', // Williams
};

export default function TrackPositionMap({ 
  circuitName,
  sessionId,
  selectedDrivers = []
 }: TrackPositionMapProps) {
  const circuit = circuitLayouts[circuitName];
  const [isPlaying, setIsPlaying] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(1); // 0.5x, 1x, 2x, 4x
  const [driverProgress, setDriverProgress] = useState<Record<string, number>>({});
  const [lapTimes, setLapTimes] = useState<Record<string, number>>({});
  const pathRef = useRef<SVGPathElement>(null);
  const animationRef = useRef<number>();
  const lastTimeRef = useRef<number>(Date.now());

  // Fetch lap times for selected drivers
  useEffect(() => {
    if (!sessionId || selectedDrivers.length === 0) return;

    const fetchLapTimes = async () => {
      try {
        const response = await api.getSessionLapTimes(sessionId);
        
        // Calculate fastest lap time for each driver
        const driverFastestLaps: Record<string, number> = {};
        response.forEach((lap: any) => {
          if (selectedDrivers.includes(lap.driver_code) && lap.lap_time) {
            if (!driverFastestLaps[lap.driver_code] || lap.lap_time < driverFastestLaps[lap.driver_code]) {
              driverFastestLaps[lap.driver_code] = lap.lap_time;
            }
          }
        });
        
        setLapTimes(driverFastestLaps);
        
        // Initialize progress for each driver
        const initialProgress: Record<string, number> = {};
        selectedDrivers.forEach((driver, index) => {
          initialProgress[driver] = (index * (100 / selectedDrivers.length));
        });
        setDriverProgress(initialProgress);
      } catch (error) {
        console.error('Error fetching lap times:', error);
        // Fallback: equal speeds
        const equalLapTime = 90; // 90 seconds default
        const fallbackTimes: Record<string, number> = {};
        selectedDrivers.forEach(driver => {
          fallbackTimes[driver] = equalLapTime;
        });
        setLapTimes(fallbackTimes);
      }
    };

    fetchLapTimes();
  }, [sessionId, selectedDrivers]);

  // Realistic animation based on lap times
  useEffect(() => {
    if (!isPlaying || Object.keys(lapTimes).length === 0) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      return;
    }

    const animate = () => {
      const now = Date.now();
      const deltaTime = (now - lastTimeRef.current) / 1000; // seconds
      lastTimeRef.current = now;

      setDriverProgress(prev => {
        const newProgress = { ...prev };
        
        selectedDrivers.forEach(driver => {
          const lapTime = lapTimes[driver];
          if (lapTime) {
            // Calculate speed: 100% progress per lap time in seconds
            // Apply speed multiplier (e.g., 2x makes cars go twice as fast)
            const speedPerSecond = (100 / lapTime) * speedMultiplier;
            const increment = speedPerSecond * deltaTime;
            newProgress[driver] = ((prev[driver] || 0) + increment) % 100;
          }
        });
        
        return newProgress;
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    lastTimeRef.current = Date.now();
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isPlaying, lapTimes, selectedDrivers, speedMultiplier]);

  const handleStartPause = () => {
    if (!isPlaying) {
      lastTimeRef.current = Date.now();
    }
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    const initialProgress: Record<string, number> = {};
    selectedDrivers.forEach((driver, index) => {
      initialProgress[driver] = (index * (100 / selectedDrivers.length));
    });
    setDriverProgress(initialProgress);
    setIsPlaying(false);
  };

  // Get position along path for a given progress (0-100)
  const getPositionOnPath = (progressPercent: number) => {
    if (!pathRef.current) return { x: 50, y: 50 };
    
    const path = pathRef.current;
    const totalLength = path.getTotalLength();
    const point = path.getPointAtLength((progressPercent / 100) * totalLength);
    
    return { x: point.x, y: point.y };
  };

  if (!circuit) {
    return (
      <div className="card">
        <h2 className="section-title mb-4">Track Position Map</h2>
        <div className="text-center py-12">
          <p className="text-gray-400">
            Circuit layout not available for this race
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Looking for: "{circuitName}"
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="section-title">{circuit.name}</h2>
          <p className="text-sm text-gray-400 mt-1">
            {circuit.location}, {circuit.country} • Round {circuit.round}  
          </p>
        </div>
        
        {/* Animation Controls */}
        {selectedDrivers.length > 0 && (
          <div className="flex items-center gap-3">
            {/* Speed Control */}
            <div className="flex items-center gap-2 bg-carbon-800 rounded-lg p-1.5 border border-carbon-600">
              <span className="text-xs text-gray-400 px-2">Speed:</span>
              {[0.5, 1, 2, 4].map((speed) => (
                <button
                  key={speed}
                  onClick={() => setSpeedMultiplier(speed)}
                  className={`px-2 py-1 text-xs rounded transition-colors ${
                    speedMultiplier === speed
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-carbon-700'
                  }`}
                >
                  {speed}x
                </button>
              ))}
            </div>
            
            <button
              onClick={handleReset}
              className="px-3 py-1.5 bg-carbon-700 hover:bg-carbon-600 text-white text-sm rounded transition-colors"
            >
              Reset
            </button>
            <button
              onClick={handleStartPause}
              className={`px-4 py-1.5 text-sm font-medium rounded transition-colors ${
                isPlaying 
                  ? 'bg-yellow-600 hover:bg-yellow-700 text-white' 
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {isPlaying ? '⏸ Pause' : '▶ Start'}
            </button>
          </div>
        )}
      </div>

      {/* Real Circuit SVG */}
      <div className="relative bg-carbon-900 rounded-lg p-6" style={{ height: '600px' }}>
        <svg
          width="100%"
          height="100%"
          viewBox="0 0 1000 1000"
          className="mx-auto"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Track Background */}
          <path
            d={circuit.svgPath}
            fill="none"
            stroke="#2D3748"
            strokeWidth="30"
            opacity="0.3"
          />
          
          {/* Track Main Line (invisible reference path) */}
          <path
            ref={pathRef}
            d={circuit.svgPath}
            fill="none"
            stroke="#10b981"
            strokeWidth="3"
            opacity="0.6"
          />

          {/* Animated Cars */}
          {selectedDrivers.map((driver) => {
            const progress = driverProgress[driver] || 0;
            const pos = getPositionOnPath(progress);
            const lapTime = lapTimes[driver];
            
            return (
              <g key={driver}>
                {/* Car trail */}
                {isPlaying && (
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r="12"
                    fill={DRIVER_COLORS[driver] || '#888'}
                    opacity="0.2"
                  />
                )}
                
                {/* Car */}
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r="8"
                  fill={DRIVER_COLORS[driver] || '#888'}
                  stroke="#fff"
                  strokeWidth="2"
                  className="drop-shadow-lg"
                >
                  <title>{driver} - {lapTime ? `${lapTime.toFixed(3)}s` : 'No data'}</title>
                </circle>
                
                {/* Driver code label */}
                <text
                  x={pos.x}
                  y={pos.y - 15}
                  fill="#ffffff"
                  fontSize="10"
                  fontWeight="bold"
                  textAnchor="middle"
                  className="drop-shadow pointer-events-none"
                >
                  {driver}
                </text>
              </g>
            );
          })}

          {/* Start/Finish Line Indicator */}
          <g opacity="0.8">
            <circle
              cx="50"
              cy="50"
              r="12"
              fill="#10b981"
              stroke="#fff"
              strokeWidth="2"
            />
            <text
              x="50"
              y="54"
              fill="#ffffff"
              fontSize="10"
              textAnchor="middle"
              fontWeight="bold"
            >
              S/F
            </text>
          </g>
        </svg>

        {/* Track Info Overlay */}
        <div className="absolute bottom-4 left-4 bg-carbon-800 rounded-lg p-3 border border-carbon-600">
          <h3 className="text-xs font-semibold text-gray-300 mb-1">Track Information</h3>
          <div className="space-y-1 text-xs text-gray-400">
            <div><span className="text-gray-500">Circuit:</span> {circuit.name}</div>
            <div><span className="text-gray-500">Location:</span> {circuit.location}</div>
          </div>
        </div>

        {/* Legend for selected drivers */}
        {selectedDrivers.length > 0 && (
          <div className="absolute top-4 right-4 bg-carbon-800 rounded-lg p-3 border border-carbon-600">
            <h3 className="text-xs font-semibold text-gray-300 mb-2">Drivers ({selectedDrivers.length})</h3>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {selectedDrivers.map((driver) => (
                <div key={driver} className="flex items-center gap-2">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: DRIVER_COLORS[driver] || '#888' }}
                  />
                  <span className="text-xs font-mono text-gray-300">{driver}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Info Message */}
        <div className="absolute bottom-4 right-4 bg-blue-900/20 border border-blue-700/30 rounded-lg p-2 max-w-xs">
          <p className="text-xs text-blue-300">
            {selectedDrivers.length > 0 && Object.keys(lapTimes).length > 0
              ? `Speed: ${speedMultiplier}x | Fastest: ${Math.min(...Object.values(lapTimes)).toFixed(1)}s`
              : selectedDrivers.length > 0
              ? 'Loading lap times...'
              : 'Real track from FastF1 data'
            }
          </p>
        </div>
      </div>
    </div>
  );
}
