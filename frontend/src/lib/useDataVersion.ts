import { useEffect, useRef, useState } from 'react';
import api from './api';

/**
 * Polls /api/races/data-version every `intervalMs` milliseconds.
 * Returns a `refreshKey` integer that increments each time the backend
 * reports a new version — pages add this to their useEffect dependency
 * arrays so they automatically refetch when new race data is loaded.
 */
export function useDataVersion(intervalMs = 30_000): number {
  const [refreshKey, setRefreshKey] = useState(0);
  const versionRef = useRef<number | null>(null);

  useEffect(() => {
    const check = async () => {
      try {
        const { version } = await api.getDataVersion();
        if (versionRef.current !== null && version !== versionRef.current) {
          setRefreshKey((k) => k + 1);
        }
        versionRef.current = version;
      } catch {
        // Silently ignore network errors — the page still works without polling
      }
    };

    check();
    const id = setInterval(check, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return refreshKey;
}
