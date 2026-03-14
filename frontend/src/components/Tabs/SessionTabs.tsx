'use client';

interface Session {
  id: number;
  session_type: string;
  date?: string;
}

interface SessionTabsProps {
  sessions: Session[];
  activeSessionId: number;
  onTabChange: (sessionId: number) => void;
}

export default function SessionTabs({ sessions, activeSessionId, onTabChange }: SessionTabsProps) {
  
  const getTabLabel = (sessionType: string) => {
    // Normalize session type labels
    if (sessionType.includes('Practice 1') || sessionType === 'FP1') return 'FP1';
    if (sessionType.includes('Practice 2') || sessionType === 'FP2') return 'FP2';
    if (sessionType.includes('Practice 3') || sessionType === 'FP3') return 'FP3';
    if (sessionType.includes('Sprint Qualifying') || sessionType.includes('Sprint Shootout')) return 'Sprint Qualifying';
    if (sessionType === 'Sprint') return 'Sprint';
    if (sessionType.includes('Qualifying')) return 'Qualifying';
    if (sessionType === 'Race') return 'Race';
    return sessionType;
  };

  const getTabIcon = (sessionType: string) => {
    const label = getTabLabel(sessionType);
    if (label.startsWith('FP')) return '🏎️';
    if (label === 'Sprint Qualifying') return '⚡';
    if (label === 'Qualifying') return '⏱️';
    if (label === 'Sprint') return '⚡';
    if (label === 'Race') return '🏁';
    return '📋';
  };

  return (
    <div className="card mb-6">
      <div className="overflow-x-auto">
        <div className="flex gap-2 min-w-max">
          {sessions.map((session) => {
            const isActive = session.id === activeSessionId;
            const label = getTabLabel(session.session_type);
            const icon = getTabIcon(session.session_type);
            
            return (
              <button
                key={session.id}
                onClick={() => onTabChange(session.id)}
                className={`
                  px-6 py-3 rounded-lg font-semibold transition-all duration-300
                  flex items-center gap-2 whitespace-nowrap
                  ${isActive
                    ? 'bg-racing-red-600 text-white shadow-lg transform scale-105'
                    : 'bg-carbon-700 text-gray-300 hover:bg-carbon-600 hover:text-white'
                  }
                `}
              >
                <span className="text-xl">{icon}</span>
                <span>{label}</span>
                {isActive && (
                  <div className="w-2 h-2 rounded-full bg-white animate-pulse"></div>
                )}
              </button>
            );
          })}
        </div>
      </div>
      
      {/* Mobile hint */}
      <div className="mt-2 text-xs text-gray-500 text-center md:hidden">
        ← Scroll for more sessions →
      </div>
    </div>
  );
}
