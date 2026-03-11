'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';

interface SessionStatusEvent {
  id: number;
  timestamp: string;
  status: string;
  message: string | null;
}

interface SessionStatusTimelineProps {
  sessionId: number;
}

export default function SessionStatusTimeline({ sessionId }: SessionStatusTimelineProps) {
  const [events, setEvents] = useState<SessionStatusEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await axios.get(`/api/session-status/${sessionId}`);
        setEvents(response.data);
      } catch (error) {
        console.error('Error fetching session status:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, [sessionId]);

  const getStatusColor = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower.includes('start')) return 'bg-green-500';
    if (statusLower.includes('finish') || statusLower.includes('end')) return 'bg-purple-500';
    if (statusLower.includes('abort') || statusLower.includes('stop')) return 'bg-red-500';
    if (statusLower.includes('yellow') || statusLower.includes('sc')) return 'bg-yellow-500';
    return 'bg-blue-500';
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

  if (events.length === 0) {
    return (
      <div className="card">
        <h3 className="text-xl font-display font-bold text-white mb-4">⏱️ Session Timeline</h3>
        <div className="text-center text-gray-400 py-8">
          No session status data available
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h3 className="text-xl font-display font-bold text-white mb-4">⏱️ Session Timeline</h3>
      
      <div className="space-y-3">
        {events.map((event, index) => (
          <div key={event.id} className="flex items-center gap-4">
            <div className={`w-3 h-3 rounded-full ${getStatusColor(event.status)} shadow-lg flex-shrink-0`}></div>
            <div className="flex-1 bg-carbon-700/50 rounded-lg p-3 hover:bg-carbon-700 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-semibold text-white">{event.status}</span>
                  {event.message && (
                    <span className="text-sm text-gray-400 ml-3">{event.message}</span>
                  )}
                </div>
                <span className="text-sm text-gray-400 font-mono">
                  {new Date(event.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-400">Start Events</div>
          <div className="text-lg font-bold text-green-400">
            {events.filter(e => e.status.toLowerCase().includes('start')).length}
          </div>
        </div>
        <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-400">Total Events</div>
          <div className="text-lg font-bold text-blue-400">{events.length}</div>
        </div>
        <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-3 text-center">
          <div className="text-xs text-gray-400">End Events</div>
          <div className="text-lg font-bold text-purple-400">
            {events.filter(e => e.status.toLowerCase().includes('finish') || e.status.toLowerCase().includes('end')).length}
          </div>
        </div>
      </div>
    </div>
  );
}
