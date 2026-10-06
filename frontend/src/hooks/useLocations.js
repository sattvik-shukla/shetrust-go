import { useState, useEffect, useCallback, useRef } from 'react';
import { locationsApi } from '../utils/api';
import { getCurrentSlot } from '../utils/helpers';
import { getSocket } from '../utils/socket';

/**
 * Manages heatmap GeoJSON + location list, auto-refreshes every 60s.
 * Also listens for real-time Socket.io updates.
 */
export function useLocations() {
  const [geojson, setGeojson]       = useState(null);
  const [locations, setLocations]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [slot, setSlot]             = useState(getCurrentSlot);
  const [lastUpdated, setLastUpdated] = useState(null);
  const timerRef = useRef(null);

  const fetchAll = useCallback(async (activeSlot) => {
    try {
      setError(null);
      const [heatRes, listRes] = await Promise.all([
        locationsApi.getHeatmap(activeSlot),
        locationsApi.getAll({ city: 'Bengaluru', limit: 100 }),
      ]);
      setGeojson(heatRes.data);
      setLocations(listRes.data.data || []);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('useLocations fetch error:', err);
      setError('Failed to load safety data. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchAll(slot);
    // Auto-refresh every 60 seconds
    timerRef.current = setInterval(() => fetchAll(slot), 60_000);
    return () => clearInterval(timerRef.current);
  }, [slot, fetchAll]);

  // ── Real-time Socket.io listener ──────────────────────────────────
  useEffect(() => {
    const socket = getSocket();

    const onHeatmapUpdate = (data) => {
      if (!data || !data.locationId) return;

      // Update locations array in-place
      setLocations(prev => prev.map(loc => {
        if (loc._id !== data.locationId) return loc;
        return data.location ? { ...loc, ...data.location } : loc;
      }));

      // Update geojson features in-place
      setGeojson(prev => {
        if (!prev || !prev.features) return prev;
        const updatedFeatures = prev.features.map(f => {
          if (f.properties.id !== data.locationId) return f;
          if (f.properties.slot === data.timeSlot || !data.timeSlot) {
            return {
              ...f,
              properties: {
                ...f.properties,
                sti: data.sti ?? f.properties.sti,
                category: data.category ?? f.properties.category,
                ratingCount: data.ratingCount ?? f.properties.ratingCount,
              },
            };
          }
          return f;
        });
        return { ...prev, features: updatedFeatures };
      });

      setLastUpdated(new Date());
    };

    socket.on('heatmap-update', onHeatmapUpdate);
    return () => { socket.off('heatmap-update', onHeatmapUpdate); };
  }, []);

  const changeSlot = (newSlot) => {
    setSlot(newSlot);
    setLoading(true);
  };

  const refresh = () => fetchAll(slot);

  return { geojson, locations, loading, error, slot, changeSlot, lastUpdated, refresh };
}

/**
 * Fetch details + rating stats for a single location.
 */
export function useLocationDetail(locationId) {
  const [location, setLocation] = useState(null);
  const [stats, setStats]       = useState(null);
  const [loading, setLoading]   = useState(false);

  useEffect(() => {
    if (!locationId) { setLocation(null); setStats(null); return; }
    setLoading(true);
    Promise.all([
      locationsApi.getById(locationId),
      locationsApi.getAll({ limit: 1 }),   // placeholder; stats come from ratings route
    ])
      .then(([locRes]) => setLocation(locRes.data.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [locationId]);

  return { location, stats, loading };
}

/**
 * Search autocomplete.
 */
export function useLocationSearch() {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await locationsApi.search(query);
        setResults(res.data.data || []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 280);
  }, [query]);

  return { query, setQuery, results, searching, clearResults: () => setResults([]) };
}
