// ── STI Helpers ──────────────────────────────────────────────────────

export const TIME_SLOTS = [
  { key: 'morning',   label: 'Morning',   icon: '🌅', range: '6 AM – 12 PM' },
  { key: 'afternoon', label: 'Afternoon', icon: '☀️',  range: '12 PM – 6 PM' },
  { key: 'evening',   label: 'Evening',   icon: '🌆', range: '6 PM – 9 PM'  },
  { key: 'night',     label: 'Night',     icon: '🌙', range: '9 PM – 6 AM'  },
];

export function getCurrentSlot() {
  const h = new Date().getHours();
  if (h >= 6  && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  if (h >= 18 && h < 21) return 'evening';
  return 'night';
}

export function getStiColor(category) {
  switch (category) {
    case 'safe':     return '#22C55E';
    case 'moderate': return '#F59E0B';
    case 'risky':    return '#EF4444';
    default:         return '#6B7280';
  }
}

export function getStiLabel(sti, category) {
  if (sti === null || sti === undefined) return 'Unrated';
  switch (category) {
    case 'safe':     return 'Safe';
    case 'moderate': return 'Moderate';
    case 'risky':    return 'Risky';
    default:         return 'Unrated';
  }
}

export function getStiEmoji(category) {
  switch (category) {
    case 'safe':     return '🟢';
    case 'moderate': return '🟡';
    case 'risky':    return '🔴';
    default:         return '⚫';
  }
}

export function getCategoryClass(category) {
  switch (category) {
    case 'safe':     return 'safe-badge';
    case 'moderate': return 'moderate-badge';
    case 'risky':    return 'risky-badge';
    default:         return 'unrated-badge';
  }
}

export function getCategoryTextClass(category) {
  switch (category) {
    case 'safe':     return 'safe-text';
    case 'moderate': return 'moderate-text';
    case 'risky':    return 'risky-text';
    default:         return 'unrated-text';
  }
}

// Compute raw STI from factors (mirrors backend formula)
export function computeRawSTI({ lighting, crowdBehavior, policeVisibility, incidentWeight }) {
  const sti = 0.30 * lighting
            + 0.30 * crowdBehavior
            + 0.20 * policeVisibility
            + 0.20 * (10 - incidentWeight);
  return Math.round(sti * 10) / 10;
}

export function categorizeSTI(sti) {
  if (sti === null || sti === undefined) return 'unrated';
  if (sti >= 8) return 'safe';
  if (sti >= 5) return 'moderate';
  return 'risky';
}

// ── Location type icons ──────────────────────────────────────────────
export const LOCATION_TYPE_ICONS = {
  metro_station: '🚇',
  bus_stop:      '🚌',
  market:        '🛒',
  park:          '🌳',
  road:          '🛣️',
  residential:   '🏘️',
  commercial:    '🏢',
  other:         '📍',
};

export function locTypeIcon(type) {
  return LOCATION_TYPE_ICONS[type] || '📍';
}

// ── Formatting ───────────────────────────────────────────────────────
export function fmtSTI(val) {
  if (val === null || val === undefined) return '—';
  return Number(val).toFixed(1);
}

export function fmtCount(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Bengaluru bounding box
export const BENGALURU_BOUNDS = [
  [77.35, 12.75], // SW
  [77.85, 13.15], // NE
];
export const BENGALURU_CENTER = [77.5946, 12.9716];

// Map STI 0–10 → heatmap weight 0–1 for Mapbox
export function stiToHeatmapWeight(sti) {
  if (sti === null) return 0;
  // Invert: low STI = high heat (danger)
  return Math.max(0, Math.min(1, (10 - sti) / 10));
}
