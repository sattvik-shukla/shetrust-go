import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import mapboxgl from 'mapbox-gl';
import { BENGALURU_CENTER, getStiColor, fmtSTI, getCurrentSlot } from '../utils/helpers';
import { useLocations } from '../hooks/useLocations';
import CabBookingPanel from './CabBookingPanel';
import styles from './SafeRoute.module.css';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || '';

// ── Route colors: each route gets its own distinct color ─────────────
const ROUTE_COLORS   = ['#E63B6F', '#3B82F6', '#F59E0B'];
const ROUTE_COLORS_DIM = ['rgba(230,59,111,0.35)', 'rgba(59,130,246,0.35)', 'rgba(245,158,11,0.35)'];

// ── Fetch Directions with steps + voice instructions ─────────────────
async function fetchRoutes(from, to, token, mode = 'walking') {
  const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`;
  const params = new URLSearchParams({
    alternatives:        'true',
    geometries:          'geojson',
    overview:            'full',
    steps:               'true',
    voice_instructions:  'true',
    banner_instructions: 'true',
    language:            'en',
    access_token:        token,
  });
  const url = `https://api.mapbox.com/directions/v5/mapbox/${mode}/${coords}?${params}`;
  const res  = await fetch(url);
  const data = await res.json();
  if (!data.routes?.length) throw new Error('No routes found');
  return data.routes;
}

// ── Score a route for safety using nearby STI locations ───────────────
function scoreRouteSafety(coords, locations, slot) {
  if (!locations.length || !coords.length) return null;
  let total = 0, count = 0;
  const step = Math.max(1, Math.floor(coords.length / 25));
  for (let i = 0; i < coords.length; i += step) {
    const [lng, lat] = coords[i];
    let nearest = null, nearestDist = Infinity;
    for (const loc of locations) {
      const [lLng, lLat] = loc.location?.coordinates || [];
      if (!lLng) continue;
      const d = Math.hypot(lng - lLng, lat - lLat);
      if (d < nearestDist) { nearestDist = d; nearest = loc; }
    }
    if (nearest && nearestDist < 0.025) {
      const slotData = nearest.timeSlots?.find(s => s.slot === slot);
      if (slotData?.sti != null) { total += slotData.sti; count++; }
    }
  }
  return count > 0 ? Math.round((total / count) * 10) / 10 : null;
}

// ── Haversine distance between two [lng,lat] points (meters) ─────────
function haversineDist([lng1, lat1], [lng2, lat2]) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Find closest step index to current position ───────────────────────
function findClosestStep(steps, userCoords) {
  let closestIdx = 0, closestDist = Infinity;
  steps.forEach((step, i) => {
    const d = haversineDist(userCoords, step.maneuver.location);
    if (d < closestDist) { closestDist = d; closestIdx = i; }
  });
  return { idx: closestIdx, dist: closestDist };
}

// ── Maneuver icon map ─────────────────────────────────────────────────
const MANEUVER_ICON = {
  'turn-left':           '↰',  'turn-right':          '↱',
  'turn-slight-left':    '↖',  'turn-slight-right':   '↗',
  'turn-sharp-left':     '↲',  'turn-sharp-right':    '↳',
  'straight':            '↑',  'continue':            '↑',
  'merge':               '⇢',  'ramp-left':           '↖',
  'ramp-right':          '↗',  'fork-left':           '↖',
  'fork-right':          '↗',  'end-of-road-left':    '↰',
  'end-of-road-right':   '↱',  'u-turn':              '↶',
  'arrive':              '📍', 'depart':              '🚶',
  'roundabout':          '↻',  'rotary':              '↻',
  'exit-roundabout':     '↗',  'notification':        'ℹ️',
};
function maneuverIcon(step) {
  if (step.maneuver?.type === 'arrive') return '📍';
  if (step.maneuver?.type === 'depart') return '🚶';
  const key = `${step.maneuver?.modifier ? step.maneuver.type + '-' + step.maneuver.modifier : step.maneuver?.type}`;
  return MANEUVER_ICON[key] || MANEUVER_ICON[step.maneuver?.type] || '↑';
}

function fmtDist(m) {
  if (m < 50)  return `${Math.round(m)} m`;
  if (m < 950) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(1)} km`;
}
function fmtTime(s) {
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m/60)}h ${m%60}m`;
}

// ── Route label logic (Safest / Fastest / Balanced) ──────────────────
function labelRoutes(routes) {
  if (routes.length === 0) return [];
  const sorted = [...routes];

  // Find extremes
  const maxSafety = Math.max(...sorted.map(r => r.safetyScore ?? 0));
  const minTime   = Math.min(...sorted.map(r => r.duration));

  return sorted.map((r, i) => {
    const isSafest  = r.safetyScore === maxSafety && r.safetyScore !== null;
    const isFastest = r.duration === minTime;

    let tag, tagColor;
    if (i === 0) {
      tag = isSafest ? '⭐ Safest' : isFastest ? '⚡ Fastest' : '✅ Recommended';
      tagColor = '#22C55E';
    } else if (isFastest && !isSafest) {
      tag = '⚡ Fastest'; tagColor = '#3B82F6';
    } else if (isSafest) {
      tag = '🛡️ Safest'; tagColor = '#22C55E';
    } else {
      tag = `Route ${i + 1}`; tagColor = '#9CA3AF';
    }
    return { ...r, tag, tagColor };
  });
}

// ── Voice announcement via Web Speech API ────────────────────────────
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 0.95;
  utt.lang = 'en-IN';
  window.speechSynthesis.speak(utt);
}

// ═══════════════════════════════════════════════════════════════════════
export default function SafeRoute({ slot }) {
  const mapContainerRef = useRef(null);
  const mapRef          = useRef(null);
  const userMarkerRef   = useRef(null);
  const watchIdRef      = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  // ── Input state ───────────────────────────────────────────────────
  const [from, setFrom]         = useState('');
  const [to, setTo]             = useState('');
  const [fromCoords, setFromCoords] = useState(null);
  const [toCoords, setToCoords]     = useState(null);
  const [fromSuggestions, setFromSuggestions] = useState([]);
  const [toSuggestions, setToSuggestions]     = useState([]);
  const [travelMode, setTravelMode] = useState('walking');

  // ── Route state ───────────────────────────────────────────────────
  const [routes, setRoutes]           = useState([]);      // labelled + scored
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  // ── Navigation state ──────────────────────────────────────────────
  const [navigating, setNavigating]   = useState(false);
  const [userPos, setUserPos]         = useState(null);    // [lng, lat]
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [distToNext, setDistToNext]   = useState(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [arrived, setArrived]         = useState(false);
  const [showCabPanel, setShowCabPanel] = useState(false);

  const { locations } = useLocations();
  const currentRoute = routes[selectedIdx] ?? null;
  const currentSteps = currentRoute?.legs?.[0]?.steps ?? [];

  // ── Init map ──────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current || !mapboxgl.accessToken) return;
    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: BENGALURU_CENTER,
      zoom: 12,
      pitchWithRotate: true,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: true }), 'bottom-right');

    // GeolocateControl — used only for initial position, not for navigation tracking
    const geoCtrl = new mapboxgl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: false,
      showUserHeading: false,
      showAccuracyCircle: false,
    });
    map.addControl(geoCtrl, 'bottom-right');

    map.on('load', () => {
      // ── Route layers (3 alternatives) ──────────────────────────────
      for (let i = 0; i < 3; i++) {
        map.addSource(`route-${i}`, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        // Casing (wider, darker) for depth
        map.addLayer({
          id: `route-casing-${i}`,
          type: 'line', source: `route-${i}`,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': '#000',
            'line-width': i === 0 ? 9 : 6,
            'line-opacity': 0.4,
          },
        });
        // Main route line
        map.addLayer({
          id: `route-line-${i}`,
          type: 'line', source: `route-${i}`,
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: {
            'line-color': ROUTE_COLORS[i],
            'line-width': i === 0 ? 6 : 4,
            'line-opacity': i === 0 ? 1 : 0.55,
          },
        });
      }

      // ── Navigation progress layer (travelled portion dims out) ─────
      map.addSource('nav-progress', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'nav-progress-line',
        type: 'line', source: 'nav-progress',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#6B7280', 'line-width': 5, 'line-opacity': 0.6 },
      });

      // ── Step waypoint dots ─────────────────────────────────────────
      map.addSource('step-dots', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'step-dots-layer',
        type: 'circle', source: 'step-dots',
        paint: {
          'circle-radius': 5,
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 2,
          'circle-stroke-color': '#fff',
          'circle-opacity': 0.9,
        },
      });

      // ── Origin / destination markers ───────────────────────────────
      map.addSource('endpoints', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'endpoints-layer',
        type: 'circle', source: 'endpoints',
        paint: {
          'circle-radius': ['case', ['==', ['get', 'type'], 'dest'], 10, 8],
          'circle-color': ['get', 'color'],
          'circle-stroke-width': 3,
          'circle-stroke-color': '#fff',
        },
      });

      setMapReady(true);
    });

    mapRef.current = map;
    return () => {
      stopNavigation();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ── Draw routes whenever they change ─────────────────────────────
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;

    routes.forEach((r, i) => {
      const src = map.getSource(`route-${i}`);
      if (src) src.setData({ type: 'Feature', geometry: r.geometry });

      const isSelected = i === selectedIdx;
      if (map.getLayer(`route-line-${i}`)) {
        map.setPaintProperty(`route-line-${i}`, 'line-opacity', isSelected ? 1 : 0.4);
        map.setPaintProperty(`route-line-${i}`, 'line-width',   isSelected ? 6 : 3);
        map.setPaintProperty(`route-casing-${i}`, 'line-opacity', isSelected ? 0.4 : 0.1);
      }
    });

    // Clear unused slots
    for (let i = routes.length; i < 3; i++) {
      const src = map.getSource(`route-${i}`);
      if (src) src.setData({ type: 'FeatureCollection', features: [] });
    }

    // Draw step waypoints for selected route
    const steps = routes[selectedIdx]?.legs?.[0]?.steps ?? [];
    const stepFeatures = steps.map((step, si) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: step.maneuver.location },
      properties: {
        color: si === 0 ? '#22C55E' : si === steps.length - 1 ? '#E63B6F' : '#fff',
      },
    }));
    const dotSrc = map.getSource('step-dots');
    if (dotSrc) dotSrc.setData({ type: 'FeatureCollection', features: stepFeatures });

    // Origin + destination endpoint markers
    const endFeatures = [];
    if (fromCoords) endFeatures.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: fromCoords },
      properties: { color: '#22C55E', type: 'origin' },
    });
    if (toCoords) endFeatures.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: toCoords },
      properties: { color: '#E63B6F', type: 'dest' },
    });
    const epSrc = map.getSource('endpoints');
    if (epSrc) epSrc.setData({ type: 'FeatureCollection', features: endFeatures });
  }, [routes, selectedIdx, mapReady, fromCoords, toCoords]);

  // ── Update navigation progress overlay when user moves ────────────
  useEffect(() => {
    if (!mapRef.current || !mapReady || !navigating || !userPos || !currentRoute) return;
    const map = mapRef.current;

    // Build "travelled" slice of route up to current step
    const steps = currentRoute.legs[0].steps;
    const travelledCoords = [];
    for (let i = 0; i < currentStepIdx && i < steps.length; i++) {
      travelledCoords.push(...(steps[i].geometry?.coordinates ?? [steps[i].maneuver.location]));
    }
    if (travelledCoords.length > 0) {
      travelledCoords.push(userPos);
      const src = map.getSource('nav-progress');
      if (src) src.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: travelledCoords },
      });
    }
  }, [userPos, currentStepIdx, navigating, mapReady, currentRoute]);

  // ── Geocode ───────────────────────────────────────────────────────
  const geocode = async (text, setSugg) => {
    if (!text || text.length < 3) { setSugg([]); return; }
    const token = import.meta.env.VITE_MAPBOX_TOKEN;
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(text)}.json?proximity=77.5946,12.9716&bbox=77.35,12.75,77.85,13.15&country=in&access_token=${token}&limit=5`;
    try {
      const res  = await fetch(url);
      const data = await res.json();
      setSugg(data.features || []);
    } catch { setSugg([]); }
  };
  const debRef = useRef({});
  const debGeocode = (key, text, setSugg) => {
    clearTimeout(debRef.current[key]);
    debRef.current[key] = setTimeout(() => geocode(text, setSugg), 380);
  };

  const selectSugg = (place, isFrom) => {
    const coords = place.center;
    const name   = place.place_name?.split(',').slice(0, 2).join(', ') || place.text;
    if (isFrom) { setFrom(name); setFromCoords(coords); setFromSuggestions([]); }
    else        { setTo(name);   setToCoords(coords);   setToSuggestions([]); }
  };

  // ── My location ───────────────────────────────────────────────────
  const useMyLoc = () => {
    if (!navigator.geolocation) { setError('Geolocation not supported'); return; }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const coords = [pos.coords.longitude, pos.coords.latitude];
        setFromCoords(coords);
        setFrom('My Location');
        setFromSuggestions([]);
        mapRef.current?.flyTo({ center: coords, zoom: 14, duration: 700 });
      },
      () => setError('Could not get your location. Please allow access.')
    );
  };

  // ── Find routes ───────────────────────────────────────────────────
  const findRoutes = useCallback(async () => {
    if (!fromCoords || !toCoords) { setError('Select both start and destination.'); return; }
    setError(''); setLoading(true); setRoutes([]); setNavigating(false); setArrived(false);

    try {
      const token = import.meta.env.VITE_MAPBOX_TOKEN;
      const raw   = await fetchRoutes(fromCoords, toCoords, token, travelMode);

      // Score and label
      const scored = raw.map(r => ({
        ...r,
        safetyScore: scoreRouteSafety(r.geometry.coordinates, locations, slot),
      }));

      // Sort: safety-first, but keep a "fastest" option available
      const sorted = [...scored].sort((a, b) => {
        const sDiff = (b.safetyScore ?? 0) - (a.safetyScore ?? 0);
        if (Math.abs(sDiff) > 0.5) return sDiff; // big safety diff wins
        return a.duration - b.duration;           // otherwise prefer faster
      });

      const labelled = labelRoutes(sorted);
      setRoutes(labelled);
      setSelectedIdx(0);

      // Fit map to best route
      if (mapRef.current && labelled[0]?.geometry?.coordinates?.length) {
        const coords = labelled[0].geometry.coordinates;
        const bounds = coords.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]));
        mapRef.current.fitBounds(bounds, { padding: { top: 80, bottom: 80, left: 420, right: 80 }, duration: 900 });
      }
    } catch (e) {
      setError('Could not find a route. Try different locations.');
    } finally { setLoading(false); }
  }, [fromCoords, toCoords, locations, slot, travelMode]);

  // ── Start navigation ──────────────────────────────────────────────
  const startNavigation = useCallback(() => {
    if (!currentRoute) return;
    setNavigating(true);
    setCurrentStepIdx(0);
    setArrived(false);
    setShowCabPanel(false);

    const steps = currentRoute.legs[0].steps;
    if (voiceEnabled && steps[0]) {
      speak(`Starting navigation. ${steps[0].maneuver?.instruction || 'Head ' + steps[0].maneuver?.modifier}`);
    }

    // Watch GPS position
    if (navigator.geolocation) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        pos => {
          const coords = [pos.coords.longitude, pos.coords.latitude];
          setUserPos(coords);

          // Move / create user marker
          if (!userMarkerRef.current) {
            const el = document.createElement('div');
            el.className = 'nav-user-dot';
            el.style.cssText = `
              width:18px;height:18px;border-radius:50%;
              background:#E63B6F;border:3px solid #fff;
              box-shadow:0 0 0 6px rgba(230,59,111,0.25);
              animation:pulse-nav 1.5s ease infinite;
            `;
            userMarkerRef.current = new mapboxgl.Marker({ element: el, anchor: 'center' })
              .setLngLat(coords)
              .addTo(mapRef.current);
          } else {
            userMarkerRef.current.setLngLat(coords);
          }

          // Camera follows user during navigation
          mapRef.current?.easeTo({ center: coords, zoom: 16, duration: 800, pitch: 45 });

          // Step advancement logic
          const { idx: nearestStep, dist } = findClosestStep(steps, coords);
          setDistToNext(dist);

          // Auto-advance when within 25m of next step start
          setCurrentStepIdx(prev => {
            if (nearestStep > prev || (dist < 25 && nearestStep === prev + 1)) {
              const newIdx = Math.max(nearestStep, prev);
              if (newIdx !== prev && steps[newIdx]) {
                const instr = steps[newIdx].maneuver?.instruction || '';
                if (voiceEnabled) speak(instr);
                // Check arrival
                if (newIdx >= steps.length - 1) {
                  setArrived(true);
                  stopNavigation(false);
                  if (voiceEnabled) speak('You have arrived at your destination.');
                }
              }
              return newIdx;
            }
            return prev;
          });
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
      );
    }
  }, [currentRoute, voiceEnabled]);

  // ── Stop navigation ───────────────────────────────────────────────
  const stopNavigation = useCallback((resetState = true) => {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
    // Clear progress overlay
    if (mapRef.current) {
      const src = mapRef.current.getSource?.('nav-progress');
      if (src) src.setData({ type: 'FeatureCollection', features: [] });
    }
    if (resetState) {
      setNavigating(false);
      setUserPos(null);
      setCurrentStepIdx(0);
      setDistToNext(null);
      // Reset camera
      if (mapRef.current) mapRef.current.easeTo({ pitch: 0, zoom: 13, duration: 600 });
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  // ── Safety bar width ──────────────────────────────────────────────
  const safetyBarWidth = (score) => score !== null ? `${(score / 10) * 100}%` : '0%';
  const safetyBarColor = (score) => {
    if (score === null) return '#6B7280';
    if (score >= 7.5) return '#22C55E';
    if (score >= 5)   return '#F59E0B';
    return '#EF4444';
  };

  const noToken = !import.meta.env.VITE_MAPBOX_TOKEN;

  // ── Current step for navigation HUD ──────────────────────────────
  const currentStep = currentSteps[currentStepIdx];
  const nextStep    = currentSteps[currentStepIdx + 1];
  const stepsLeft   = currentSteps.length - currentStepIdx - 1;
  const totalDistLeft = currentRoute
    ? currentSteps.slice(currentStepIdx).reduce((s, st) => s + (st.distance || 0), 0)
    : 0;

  return (
    <div className={styles.page}>

      {/* ══ PANEL ══════════════════════════════════════════════════════ */}
      <aside className={`${styles.panel} ${navigating ? styles.panelNav : ''}`}>

        {/* ── Navigation HUD (replaces input when navigating) ───────── */}
        {navigating && currentRoute && !arrived ? (
          <div className={styles.navHud}>
            {/* Top bar: stop + ETA */}
            <div className={styles.navTopBar}>
              <button className={styles.stopNavBtn} onClick={() => stopNavigation(true)}>✕ End</button>
              <div className={styles.navEta}>
                <span className={styles.navEtaDist}>{fmtDist(totalDistLeft)}</span>
                <span className={styles.navEtaTime}>{fmtTime(currentRoute.duration * (stepsLeft / Math.max(currentSteps.length, 1)))}</span>
              </div>
              <button
                className={`${styles.voiceBtn} ${voiceEnabled ? styles.voiceOn : ''}`}
                onClick={() => setVoiceEnabled(v => !v)}
                title="Toggle voice"
              >
                {voiceEnabled ? '🔊' : '🔇'}
              </button>
            </div>

            {/* Current maneuver */}
            <div className={styles.navCurrentStep}>
              <div className={styles.navIcon}>{currentStep ? maneuverIcon(currentStep) : '↑'}</div>
              <div className={styles.navInstruction}>
                {currentStep?.maneuver?.instruction || 'Continue on route'}
              </div>
              {distToNext !== null && (
                <div className={styles.navDist}>{fmtDist(distToNext)}</div>
              )}
            </div>

            {/* Next maneuver preview */}
            {nextStep && (
              <div className={styles.navNextStep}>
                <span className={styles.navNextLabel}>Then</span>
                <span className={styles.navNextIcon}>{maneuverIcon(nextStep)}</span>
                <span className={styles.navNextText}>{nextStep.name || nextStep.maneuver?.instruction}</span>
                <span className={styles.navNextDist}>{fmtDist(nextStep.distance)}</span>
              </div>
            )}

            {/* Step list */}
            <div className={styles.navStepList}>
              {currentSteps.map((step, si) => (
                <div
                  key={si}
                  className={`${styles.navStepItem} ${si === currentStepIdx ? styles.navStepActive : ''} ${si < currentStepIdx ? styles.navStepDone : ''}`}
                  onClick={() => {
                    setCurrentStepIdx(si);
                    mapRef.current?.flyTo({ center: step.maneuver.location, zoom: 17, duration: 600 });
                  }}
                >
                  <span className={styles.navStepIcon}>{maneuverIcon(step)}</span>
                  <span className={styles.navStepText}>{step.maneuver?.instruction}</span>
                  <span className={styles.navStepDist}>{fmtDist(step.distance)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : arrived ? (
          // ── Arrived screen ────────────────────────────────────────
          <div className={styles.arrivedScreen}>
            <div className={styles.arrivedIcon}>📍</div>
            <div className={styles.arrivedTitle}>You've arrived!</div>
            <div className={styles.arrivedSub}>at {to}</div>
            <button className={styles.findBtn} onClick={() => { setArrived(false); setRoutes([]); setFrom(''); setTo(''); setFromCoords(null); setToCoords(null); }}>
              Plan another route
            </button>
          </div>
        ) : (
          // ── Planning mode ─────────────────────────────────────────
          <>
            <div className={styles.panelHeader}>
              <div className={styles.panelTitle}>🛡️ Safe Route</div>
              <div className={styles.panelSub}>Navigation with live safety scoring</div>
            </div>

            {/* Travel mode tabs */}
            <div className={styles.modeTabs}>
              {[
                { key: 'walking',  icon: '🚶', label: 'Walk' },
                { key: 'cycling',  icon: '🚲', label: 'Cycle' },
                { key: 'driving',  icon: '🚗', label: 'Drive' },
              ].map(m => (
                <button key={m.key}
                  className={`${styles.modeTab} ${travelMode === m.key ? styles.modeTabActive : ''}`}
                  onClick={() => setTravelMode(m.key)}>
                  {m.icon} {m.label}
                </button>
              ))}
            </div>

            {/* From */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>
                <span className={styles.dot} style={{ background: '#22C55E' }} /> From
              </label>
              <div className={styles.inputRow}>
                <div className={styles.inputWrap}>
                  <input className={styles.input} placeholder="Start location…" value={from}
                    onChange={e => { setFrom(e.target.value); setFromCoords(null); debGeocode('from', e.target.value, setFromSuggestions); }} />
                  {fromSuggestions.length > 0 && (
                    <div className={styles.suggestions}>
                      {fromSuggestions.map(s => (
                        <button key={s.id} className={styles.suggestion} onClick={() => selectSugg(s, true)}>
                          <span className={styles.suggIcon}>📍</span>
                          <div>
                            <div className={styles.suggName}>{s.text}</div>
                            <div className={styles.suggSub}>{s.place_name?.split(',').slice(1, 3).join(',').trim()}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button className={styles.locBtn} onClick={useMyLoc} title="Use my location">📡</button>
              </div>
            </div>

            {/* To */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>
                <span className={styles.dot} style={{ background: '#E63B6F' }} /> To
              </label>
              <div className={styles.inputWrap}>
                <input className={styles.input} placeholder="Destination…" value={to}
                  onChange={e => { setTo(e.target.value); setToCoords(null); debGeocode('to', e.target.value, setToSuggestions); }} />
                {toSuggestions.length > 0 && (
                  <div className={styles.suggestions}>
                    {toSuggestions.map(s => (
                      <button key={s.id} className={styles.suggestion} onClick={() => selectSugg(s, false)}>
                        <span className={styles.suggIcon}>📍</span>
                        <div>
                          <div className={styles.suggName}>{s.text}</div>
                          <div className={styles.suggSub}>{s.place_name?.split(',').slice(1, 3).join(',').trim()}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <button className={styles.findBtn} onClick={findRoutes} disabled={loading || !fromCoords || !toCoords}>
              {loading ? '⏳ Calculating routes…' : '🔍 Find Routes'}
            </button>
            {error && <div className={styles.error}>{error}</div>}

            {/* ── Route cards ─────────────────────────────────────── */}
            {routes.length > 0 && (
              <div className={styles.routeList}>
                <div className={styles.routeListHeader}>
                  <span className={styles.routeListTitle}>{routes.length} routes found</span>
                  <span className={styles.routeListSub}>Sorted by safety · {slot}</span>
                </div>

                {routes.map((r, i) => {
                  const mins  = Math.round(r.duration / 60);
                  const km    = (r.distance / 1000).toFixed(1);
                  const isSelected = i === selectedIdx;
                  return (
                    <button
                      key={i}
                      className={`${styles.routeCard} ${isSelected ? styles.routeCardActive : ''}`}
                      style={isSelected ? { borderColor: ROUTE_COLORS[i] + '80' } : {}}
                      onClick={() => {
                        setSelectedIdx(i);
                        if (mapRef.current && r.geometry?.coordinates?.length) {
                          const bounds = r.geometry.coordinates.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(r.geometry.coordinates[0], r.geometry.coordinates[0]));
                          mapRef.current.fitBounds(bounds, { padding: { top: 80, bottom: 80, left: 420, right: 80 }, duration: 700 });
                        }
                      }}
                    >
                      {/* Route header */}
                      <div className={styles.routeCardHeader}>
                        <div className={styles.routeColorDot} style={{ background: ROUTE_COLORS[i] }} />
                        <span className={styles.routeTag} style={{ color: r.tagColor }}>{r.tag}</span>
                        {isSelected && <span className={styles.selectedBadge}>Selected</span>}
                      </div>

                      {/* Time + distance */}
                      <div className={styles.routeMeta}>
                        <span className={styles.routeTime}>🕐 {fmtTime(r.duration)}</span>
                        <span className={styles.routeDist}>📏 {km} km</span>
                        <span className={styles.routeSteps}>↩ {r.legs?.[0]?.steps?.length ?? 0} turns</span>
                      </div>

                      {/* Safety score bar */}
                      <div className={styles.safetyRow}>
                        <span className={styles.safetyLabel} style={{ color: safetyBarColor(r.safetyScore) }}>
                          {r.safetyScore !== null ? `STI ${fmtSTI(r.safetyScore)}` : 'Unscored'}
                        </span>
                        <div className={styles.safetyBar}>
                          <div className={styles.safetyFill}
                            style={{ width: safetyBarWidth(r.safetyScore), background: safetyBarColor(r.safetyScore) }}
                          />
                        </div>
                      </div>

                      {/* Safety description */}
                      {isSelected && r.safetyScore !== null && (
                        <div className={styles.routeSafetyNote} style={{ color: safetyBarColor(r.safetyScore) }}>
                          {r.safetyScore >= 7.5 ? '🟢 Well-rated area, safe to travel'
                            : r.safetyScore >= 5  ? '🟡 Moderate safety — stay alert'
                            : '🔴 Lower-rated area — exercise caution'}
                        </div>
                      )}
                    </button>
                  );
                })}

                {/* Start navigation CTA */}
                <button className={styles.startNavBtn} onClick={startNavigation}>
                  <span className={styles.startNavIcon}>▶</span>
                  Start Navigation
                  <span className={styles.startNavSub}>{routes[selectedIdx]?.tag}</span>
                </button>

                {/* Cab booking */}
                <button className={styles.bookCabBtn} onClick={() => setShowCabPanel(v => !v)}>
                  🚗 {showCabPanel ? 'Hide Cab Options' : 'Book a Cab for This Route'}
                </button>
                {showCabPanel && (
                  <CabBookingPanel
                    from={from} to={to} fromCoords={fromCoords} toCoords={toCoords}
                    routeSafetyLabel={routes[selectedIdx]?.tag ?? 'Route'}
                    onClose={() => setShowCabPanel(false)}
                  />
                )}

                {/* Safety tips */}
                <div className={styles.safetyTips}>
                  <div className={styles.tipsTitle}>🛡️ Stay safe</div>
                  <ul className={styles.tipsList}>
                    <li>Share your live location with a trusted contact</li>
                    <li>Prefer well-lit, populated streets after dark</li>
                    <li>Use the SOS button if you feel unsafe at any point</li>
                  </ul>
                </div>
              </div>
            )}
            {noToken && (
              <div className={styles.noToken}>⚠️ Set <code>VITE_MAPBOX_TOKEN</code> in <code>.env</code></div>
            )}
          </>
        )}
      </aside>

      {/* ══ MAP ════════════════════════════════════════════════════════ */}
      <div className={styles.mapWrap}>
        <div ref={mapContainerRef} className={styles.map} />

        {/* Empty state overlay */}
        {!routes.length && !loading && !navigating && (
          <div className={styles.mapOverlay}>
            <div className={styles.mapOverlayCard}>
              <div className={styles.mapOverlayIcon}>🛡️</div>
              <div className={styles.mapOverlayTitle}>Find your safest route</div>
              <div className={styles.mapOverlayText}>Enter start and destination to see safety-scored route options</div>
            </div>
          </div>
        )}

        {/* Map legend */}
        {routes.length > 0 && !navigating && (
          <div className={styles.mapLegend}>
            {routes.map((r, i) => (
              <div key={i} className={styles.legendRow} onClick={() => setSelectedIdx(i)} style={{ cursor: 'pointer', opacity: i === selectedIdx ? 1 : 0.55 }}>
                <span style={{ width: 24, height: 4, borderRadius: 2, background: ROUTE_COLORS[i], display: 'inline-block', flexShrink: 0 }} />
                <span className={styles.legendLabel}>{r.tag}</span>
              </div>
            ))}
          </div>
        )}

        {/* Navigation compass / re-center */}
        {navigating && userPos && (
          <button className={styles.recentreBtn}
            onClick={() => mapRef.current?.flyTo({ center: userPos, zoom: 16, pitch: 45, duration: 500 })}>
            📍 Re-centre
          </button>
        )}
      </div>

      {/* Pulse animation for user dot */}
      <style>{`
        @keyframes pulse-nav {
          0%,100% { box-shadow: 0 0 0 6px rgba(230,59,111,0.25); }
          50%      { box-shadow: 0 0 0 12px rgba(230,59,111,0.08); }
        }
      `}</style>
    </div>
  );
}
