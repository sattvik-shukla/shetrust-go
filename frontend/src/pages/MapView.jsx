import React, { useRef, useEffect, useState, useCallback } from 'react';
import mapboxgl from 'mapbox-gl';
import { useLocations, useLocationSearch } from '../hooks/useLocations';
import LocationCard from '../components/LocationCard';
import LocationDetail from '../components/LocationDetail';
import RateModal from '../components/RateModal';
import {
  BENGALURU_CENTER, BENGALURU_BOUNDS,
  TIME_SLOTS, getStiColor, stiToHeatmapWeight,
  locTypeIcon, fmtSTI
} from '../utils/helpers';
import styles from './MapView.module.css';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || '';

// Map style — dark custom
const MAP_STYLE = 'mapbox://styles/mapbox/dark-v11';

export default function MapView() {
  const mapContainerRef = useRef(null);
  const mapRef          = useRef(null);
  const markersRef      = useRef([]);
  const popupRef        = useRef(null);

  const [mapReady, setMapReady]           = useState(false);
  const [selectedLocation, setSelected]   = useState(null);
  const [rateTarget, setRateTarget]       = useState(null);
  const [showRateModal, setShowRateModal] = useState(false);
  const [sidebarTab, setSidebarTab]       = useState('list'); // 'list' | 'detail'
  const [showHeatmap, setShowHeatmap]     = useState(true);

  const { geojson, locations, loading, error, slot, changeSlot, lastUpdated, refresh } = useLocations();
  const { query, setQuery, results, searching, clearResults } = useLocationSearch();

  // ── Init map ────────────────────────────────────────────────────────
  useEffect(() => {
    if (mapRef.current) return;
    if (!mapboxgl.accessToken) {
      console.warn('No Mapbox token set — map will not render. Set VITE_MAPBOX_TOKEN in .env');
      return;
    }

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: BENGALURU_CENTER,
      zoom: 11.5,
      maxBounds: [[76.8, 12.4], [78.3, 13.6]],
      pitchWithRotate: false,
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');

    map.on('load', () => {
      setMapReady(true);

      // ── Heatmap source ───────────────────────────────────────────
      map.addSource('shetrust-heat', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addLayer({
        id: 'sti-heatmap',
        type: 'heatmap',
        source: 'shetrust-heat',
        maxzoom: 15,
        paint: {
          'heatmap-weight': ['get', 'heatWeight'],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 8, 1, 14, 3],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0,    'rgba(34,197,94,0)',
            0.2,  'rgba(34,197,94,0.6)',
            0.4,  'rgba(245,158,11,0.7)',
            0.7,  'rgba(239,68,68,0.75)',
            1,    'rgba(239,68,68,0.9)',
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 8, 20, 14, 50],
          'heatmap-opacity': 0.7,
        }
      });

      // ── Circle layer (individual dots at high zoom) ──────────────
      map.addSource('shetrust-points', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addLayer({
        id: 'sti-circles',
        type: 'circle',
        source: 'shetrust-points',
        minzoom: 12,
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 12, 8, 16, 18],
          'circle-stroke-width': 2,
          'circle-stroke-color': 'rgba(255,255,255,0.3)',
          'circle-opacity': 0.9,
        }
      });

      // Click on circle
      map.on('click', 'sti-circles', (e) => {
        const props = e.features[0].properties;
        const loc = locations.find(l => l._id === props.id);
        if (loc) selectLocation(loc);
      });

      map.on('mouseenter', 'sti-circles', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'sti-circles', () => { map.getCanvas().style.cursor = ''; });
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  // ── Update map data when geojson/slot changes ───────────────────────
  useEffect(() => {
    if (!mapRef.current || !mapReady || !geojson) return;
    const map = mapRef.current;

    // Build heat features
    const heatFeatures = geojson.features.map(f => ({
      ...f,
      properties: {
        ...f.properties,
        heatWeight: stiToHeatmapWeight(f.properties.sti),
      }
    }));

    // Build circle features with color
    const circleFeatures = geojson.features.map(f => ({
      ...f,
      properties: {
        ...f.properties,
        color: getStiColor(f.properties.category),
      }
    }));

    const heatData = { ...geojson, features: heatFeatures };
    const pointData = { ...geojson, features: circleFeatures };

    if (map.getSource('shetrust-heat')) {
      map.getSource('shetrust-heat').setData(heatData);
    }
    if (map.getSource('shetrust-points')) {
      map.getSource('shetrust-points').setData(pointData);
    }

    // Visibility
    if (map.getLayer('sti-heatmap')) {
      map.setLayoutProperty('sti-heatmap', 'visibility', showHeatmap ? 'visible' : 'none');
    }
  }, [geojson, mapReady, showHeatmap]);

  // ── Fly to selected location ─────────────────────────────────────────
  const selectLocation = useCallback((loc) => {
    setSelected(loc);
    setSidebarTab('detail');
    if (mapRef.current && loc.location?.coordinates) {
      mapRef.current.flyTo({
        center: loc.location.coordinates,
        zoom: 14.5,
        duration: 900,
        offset: [-160, 0],
      });
    }
  }, []);

  const openRate = (loc) => {
    setRateTarget(loc || null);
    setShowRateModal(true);
  };

  const handleSearchSelect = (loc) => {
    selectLocation(loc);
    setQuery('');
    clearResults();
  };

  // ── Sidebar location list sorted by slot STI ─────────────────────────
  const sortedLocations = [...locations].sort((a, b) => {
    const sa = a.timeSlots?.find(s => s.slot === slot)?.sti ?? -1;
    const sb = b.timeSlots?.find(s => s.slot === slot)?.sti ?? -1;
    return sb - sa;
  });

  const noToken = !import.meta.env.VITE_MAPBOX_TOKEN;

  return (
    <div className={styles.page}>
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside className={styles.sidebar}>
        {/* Search */}
        <div className={styles.searchWrap}>
          <div className={styles.searchBox}>
            <span className={styles.searchIcon}>🔍</span>
            <input
              className={styles.searchInput}
              placeholder="Search Bengaluru locations…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
            {query && (
              <button className={styles.clearBtn} onClick={() => { setQuery(''); clearResults(); }}>✕</button>
            )}
          </div>

          {results.length > 0 && (
            <div className={styles.searchResults}>
              {results.map(r => (
                <button key={r._id} className={styles.searchResult} onClick={() => handleSearchSelect(r)}>
                  <span>{locTypeIcon(r.type)}</span>
                  <div>
                    <div className={styles.srName}>{r.name}</div>
                    <div className={styles.srArea}>{r.area}</div>
                  </div>
                  <span className={styles.srSTI} style={{ color: getStiColor(r.timeSlots?.find(s=>s.slot===slot)?.category) }}>
                    {fmtSTI(r.timeSlots?.find(s=>s.slot===slot)?.sti)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Time slot selector */}
        <div className={styles.slotTabs}>
          {TIME_SLOTS.map(ts => (
            <button
              key={ts.key}
              className={`${styles.slotTab} ${slot === ts.key ? styles.slotTabActive : ''}`}
              onClick={() => changeSlot(ts.key)}
            >
              {ts.icon} {ts.label}
            </button>
          ))}
        </div>

        {/* Controls bar */}
        <div className={styles.controlBar}>
          <div className={styles.controlLeft}>
            {loading && <span className={styles.loading}>↻ Updating…</span>}
            {lastUpdated && !loading && (
              <span className={styles.lastUpdated}>
                Updated {new Date(lastUpdated).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          <div className={styles.controlRight}>
            <button
              className={`btn btn-ghost btn-sm ${showHeatmap ? styles.heatActive : ''}`}
              onClick={() => setShowHeatmap(h => !h)}
              title="Toggle heatmap"
            >
              🔥 Heatmap
            </button>
            <button className="btn btn-ghost btn-sm" onClick={refresh} title="Refresh data">↻</button>
          </div>
        </div>

        {/* Tab: list vs detail */}
        {sidebarTab === 'list' && (
          <div className={styles.locationList}>
            {error && (
              <div className={styles.errorMsg}>
                ⚠️ {error}
                <button className="btn btn-ghost btn-sm" onClick={refresh}>Retry</button>
              </div>
            )}
            {sortedLocations.map(loc => (
              <LocationCard
                key={loc._id}
                location={loc}
                activeSlot={slot}
                onClick={selectLocation}
                selected={selectedLocation?._id === loc._id}
              />
            ))}
          </div>
        )}

        {sidebarTab === 'detail' && selectedLocation && (
          <div className={styles.detailWrap}>
            <LocationDetail
              location={selectedLocation}
              activeSlot={slot}
              onClose={() => { setSidebarTab('list'); setSelected(null); }}
              onRate={openRate}
            />
          </div>
        )}

        {/* Add rating CTA */}
        <div className={styles.rateFooter}>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => openRate(null)}>
            📍 Rate a Location
          </button>
        </div>
      </aside>

      {/* ── Map ─────────────────────────────────────────────────────── */}
      <div className={styles.mapWrap}>
        {noToken && (
          <div className={styles.noTokenBanner}>
            <div className={styles.noTokenCard}>
              <div className={styles.noTokenIcon}>🗺</div>
              <div className={styles.noTokenTitle}>Mapbox Token Required</div>
              <div className={styles.noTokenBody}>
                Add your free Mapbox token to <code>.env</code>:<br />
                <code>VITE_MAPBOX_TOKEN=pk.eyJ1Ijoi…</code><br /><br />
                Get one free at <a href="https://mapbox.com" target="_blank" rel="noreferrer" style={{ color: 'var(--rose)' }}>mapbox.com</a>
              </div>
            </div>
          </div>
        )}
        <div ref={mapContainerRef} className={styles.map} />

        {/* Map legend */}
        <div className={styles.legend}>
          <div className={styles.legendTitle}>Safety Index</div>
          {[
            { label: 'Safe (8–10)',     color: 'var(--safe)'     },
            { label: 'Moderate (5–7)', color: 'var(--moderate)' },
            { label: 'Risky (0–4)',    color: 'var(--risky)'    },
            { label: 'Unrated',        color: 'var(--unrated)'  },
          ].map(l => (
            <div key={l.label} className={styles.legendItem}>
              <span className={styles.legendDot} style={{ background: l.color }} />
              <span>{l.label}</span>
            </div>
          ))}
        </div>

        {/* City badge */}
        <div className={styles.cityBadge}>📍 Bengaluru</div>
      </div>

      {/* ── Rate Modal ───────────────────────────────────────────────── */}
      <RateModal
        isOpen={showRateModal}
        onClose={() => { setShowRateModal(false); setRateTarget(null); }}
        prefillLocation={rateTarget}
        onRated={() => { refresh(); setShowRateModal(false); }}
      />
    </div>
  );
}
