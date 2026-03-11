'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

interface FlagEvent {
  timestamp: string;
  lap_number: number | null;
  flag: string;
  message: string;
  scope: string | null;
}

interface FlagTimelineProps {
  sessionId: number;
}

export default function FlagTimeline({ sessionId }: FlagTimelineProps) {
  const [flags, setFlags] = useState<FlagEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFlags = async () => {
      try {
        const response = await axios.get(`/api/race-control/${sessionId}/flags`);
        setFlags(response.data);
      } catch (error) {
        console.error('Error fetching flags:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchFlags();
  }, [sessionId]);

  const getFlagStyle = (flag: string) => {
    const flagUpper = flag.toUpperCase();
    if (flagUpper.includes('GREEN')) return { bg: 'bg-green-500', text: 'GREEN', emoji: '🟢' };
    if (flagUpper.includes('YELLOW')) return { bg: 'bg-yellow-500', text: 'YELLOW', emoji: '🟡' };
    if (flagUpper.includes('RED')) return { bg: 'bg-red-500', text: 'RED', emoji: '🔴' };
    if (flagUpper.includes('SC') || flagUpper.includes('SAFETY')) return { bg: 'bg-yellow-400', text: 'SC', emoji: '🚗' };
    if (flagUpper.includes('VSC')) return { bg: 'bg-yellow-600', text: 'VSC', emoji: '⚡' };
    if (flagUpper.includes('BLUE')) return { bg: 'bg-blue-500', text: 'BLUE', emoji: '🔵' };
    return { bg: 'bg-purple-500', text: flag, emoji: '🏁' };
  };

  if (loading) {
    return (
      <div className="card">
        <div className="flex items-center justify-center h-32">
          <div className="loading-spinner"></div>
        </div>
      </div>
    );
  }

  if (flags.length === 0) {
    return (
      <div className="card">
        <h3 className="text-xl font-display font-bold text-white mb-4">🏁 Flag Timeline</h3>
        <div className="text-center text-gray-400 py-8">
          No flag changes recorded
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="text-xl font-display font-bold text-white mb-4">🏁 Flag Timeline</h3>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-racing-red-600 to-transparent"></div>

        <div className="space-y-4">
          {flags.map((flag, index) => {
            const style = getFlagStyle(flag.flag);
            
            return (
              <div key={index} className="relative flex gap-4 items-start">
                {/* Flag indicator */}
                <div className="relative z-10">
                  <div className={`w-12 h-12 rounded-full ${style.bg} flex items-center justify-center text-2xl shadow-lg`}>
                    {style.emoji}
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 bg-carbon-700/50 rounded-lg p-4 hover:bg-carbon-700 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className={`px-3 py-1 rounded-full ${style.bg} text-white font-bold text-sm`}>
                        {style.text}
                      </span>
                      {flag.lap_number && (
                        <span className="text-sm font-semibold text-gray-400">
                          Lap {flag.lap_number}
                        </span>
                      )}
                      {flag.scope && (
                        <span className="text-xs px-2 py-1 rounded bg-carbon-600 text-gray-300">
                          {flag.scope}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">
                      {new Date(flag.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300">{flag.message}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Summary */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-3 text-center">
          <div className="text-2xl">🟢</div>
          <div className="text-xs text-gray-400 mt-1">Green Flags</div>
          <div className="text-lg font-bold text-green-400">
            {flags.filter(f => f.flag.toUpperCase().includes('GREEN')).length}
          </div>
        </div>
        <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-3 text-center">
          <div className="text-2xl">🟡</div>
          <div className="text-xs text-gray-400 mt-1">Yellow/SC</div>
          <div className="text-lg font-bold text-yellow-400">
            {flags.filter(f => {
              const fu = f.flag.toUpperCase();
              return fu.includes('YELLOW') || fu.includes('SC') || fu.includes('VSC');
            }).length}
          </div>
        </div>
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 text-center">
          <div className="text-2xl">🔴</div>
          <div className="text-xs text-gray-400 mt-1">Red Flags</div>
          <div className="text-lg font-bold text-red-400">
            {flags.filter(f => f.flag.toUpperCase().includes('RED')).length}
          </div>
        </div>
      </div>
    </div>
  );
}
