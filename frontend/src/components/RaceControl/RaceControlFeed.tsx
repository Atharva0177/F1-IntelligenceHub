'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

interface RaceControlMessage {
  id: number;
  timestamp: string;
  lap_number: number | null;
  category: string;
  message: string;
  flag: string | null;
  scope: string | null;
  driver_code: string | null;
}

interface RaceControlFeedProps {
  sessionId: number;
  limit?: number;
}

export default function RaceControlFeed({ sessionId, limit = 10 }: RaceControlFeedProps) {
  const [messages, setMessages] = useState<RaceControlMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('');

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const params = new URLSearchParams();
        if (limit) params.append('limit', limit.toString());
        if (filter) params.append('category', filter);

        const response = await axios.get(
          `http://localhost:8000/api/race-control/${sessionId}?${params.toString()}`
        );
        setMessages(response.data);
      } catch (error) {
        console.error('Error fetching race control messages:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();
  }, [sessionId, limit, filter]);

  const getFlagColor = (flag: string | null) => {
    if (!flag) return 'bg-gray-600';
    
    const flagUpper = flag.toUpperCase();
    if (flagUpper.includes('GREEN')) return 'bg-green-500';
    if (flagUpper.includes('YELLOW')) return 'bg-yellow-500';
    if (flagUpper.includes('RED')) return 'bg-red-500';
    if (flagUpper.includes('SC') || flagUpper.includes('SAFETY')) return 'bg-yellow-400';
    if (flagUpper.includes('VSC')) return 'bg-yellow-600';
    if (flagUpper.includes('BLUE')) return 'bg-blue-500';
    return 'bg-purple-500';
  };

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'flag': return '🏁';
      case 'drs': return '💨';
      case 'safetycar': return '🚗';
      case 'other': return '📢';
      default: return '📋';
    }
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

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
          📻 Race Control
        </h3>
        
        {/* Category Filters */}
        <div className="flex gap-2">
          {['', 'Flag', 'Drs', 'SafetyCar'].map((cat) => (
            <button
              key={cat || 'all'}
              onClick={() => setFilter(cat)}
              className={`text-xs px-3 py-1 rounded-full transition-colors ${
                filter === cat
                  ? 'bg-racing-red-600 text-white'
                  : 'bg-carbon-700 text-gray-400 hover:bg-carbon-600'
              }`}
            >
              {cat || 'All'}
            </button>
          ))}
        </div>
      </div>

      {messages.length === 0 ? (
        <div className="text-center text-gray-400 py-8">
          No race control messages
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className="bg-carbon-700/50 rounded-lg p-3 hover:bg-carbon-700 transition-colors border-l-4"
              style={{ borderLeftColor: msg.flag ? getFlagColor(msg.flag).replace('bg-', '#') : 'transparent' }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{getCategoryIcon(msg.category)}</span>
                    <span className="text-xs font-semibold text-gray-400">
                      {msg.lap_number ? `Lap ${msg.lap_number}` : 'Pre-race'}
                    </span>
                    {msg.flag && (
                      <span className={`text-xs px-2 py-1 rounded-full ${getFlagColor(msg.flag)} text-white font-semibold`}>
                        {msg.flag}
                      </span>
                    )}
                    {msg.driver_code && (
                      <span className="text-xs px-2 py-1 rounded-full bg-racing-red-600 text-white font-mono">
                        {msg.driver_code}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-200">{msg.message}</p>
                </div>
                <div className="text-xs text-gray-500 whitespace-nowrap">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
