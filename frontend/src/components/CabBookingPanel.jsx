/**
 * CabBookingPanel
 * Shows after a safe route is found. Deeplinks to Namma Yatri, Rapido, Ola, Uber
 * with the from/to address pre-filled where the API supports it.
 * Falls back to app store links on platforms that don't support query strings.
 */
import React, { useState } from 'react';
import styles from './CabBookingPanel.module.css';

const CAB_APPS = [
  {
    id: 'namma',
    name: 'Namma Yatri',
    emoji: '🟡',
    tagline: 'Driver-friendly · Bengaluru first',
    color: '#FBBF24',
    bgColor: 'rgba(251,191,36,0.08)',
    borderColor: 'rgba(251,191,36,0.25)',
    // Namma Yatri uses a custom URI scheme
    getLink: (from, to, fromCoords, toCoords) => {
      if (fromCoords && toCoords) {
        return `nammayatri://book?pickup_lat=${fromCoords[1]}&pickup_lng=${fromCoords[0]}&drop_lat=${toCoords[1]}&drop_lng=${toCoords[0]}`;
      }
      return 'https://nammayatri.in/link/rider/1234';
    },
    fallback: 'https://nammayatri.in',
    playStore: 'https://play.google.com/store/apps/details?id=net.openkochi.yatri',
  },
  {
    id: 'rapido',
    name: 'Rapido',
    emoji: '🟠',
    tagline: 'Bike & auto · Fast pickup',
    color: '#F97316',
    bgColor: 'rgba(249,115,22,0.08)',
    borderColor: 'rgba(249,115,22,0.25)',
    getLink: (from, to, fromCoords, toCoords) => {
      // Rapido supports lat/lng deeplinks
      if (fromCoords && toCoords) {
        return `rapido://book?src_lat=${fromCoords[1]}&src_lng=${fromCoords[0]}&dest_lat=${toCoords[1]}&dest_lng=${toCoords[0]}`;
      }
      return `https://rapido.bike`;
    },
    fallback: 'https://rapido.bike',
    playStore: 'https://play.google.com/store/apps/details?id=com.rapido.passenger',
  },
  {
    id: 'ola',
    name: 'Ola',
    emoji: '🟢',
    tagline: 'Auto, mini & prime',
    color: '#22C55E',
    bgColor: 'rgba(34,197,94,0.08)',
    borderColor: 'rgba(34,197,94,0.25)',
    getLink: (from, to, fromCoords, toCoords) => {
      if (fromCoords && toCoords) {
        return `https://book.olacabs.com/?pickup_lat=${fromCoords[1]}&pickup_lng=${fromCoords[0]}&drop_lat=${toCoords[1]}&drop_lng=${toCoords[0]}&utm_source=shetrust`;
      }
      return 'https://olacabs.com';
    },
    fallback: 'https://olacabs.com',
    playStore: 'https://play.google.com/store/apps/details?id=com.olacabs.customer',
  },
  {
    id: 'uber',
    name: 'Uber',
    emoji: '⬛',
    tagline: 'Always a reliable ride',
    color: '#94A3B8',
    bgColor: 'rgba(148,163,184,0.08)',
    borderColor: 'rgba(148,163,184,0.25)',
    getLink: (from, to, fromCoords, toCoords) => {
      // Uber universal link supports lat/lng
      if (fromCoords && toCoords) {
        return `https://m.uber.com/ul/?action=setPickup&pickup[latitude]=${fromCoords[1]}&pickup[longitude]=${fromCoords[0]}&dropoff[latitude]=${toCoords[1]}&dropoff[longitude]=${toCoords[0]}&dropoff[nickname]=${encodeURIComponent(to || 'Destination')}`;
      }
      return 'https://uber.com';
    },
    fallback: 'https://uber.com',
    playStore: 'https://play.google.com/store/apps/details?id=com.ubercab',
  },
];

export default function CabBookingPanel({ from, to, fromCoords, toCoords, routeSafetyLabel, onClose }) {
  const [copied, setCopied] = useState(false);

  const shareRoute = async () => {
    const text = `🛡️ SheTrust Safe Route\nFrom: ${from}\nTo: ${to}\nSafety: ${routeSafetyLabel}\n\nPlan your safe journey at shetrust.app`;
    if (navigator.share) {
      try { await navigator.share({ title: 'SheTrust Safe Route', text }); }
      catch (_) {}
    } else {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const openApp = (app) => {
    const deeplink = app.getLink(from, to, fromCoords, toCoords);
    // Try the deeplink; if it fails (app not installed), nothing happens on desktop
    window.location.href = deeplink;
    // After 1.5s, if still here, open web fallback
    setTimeout(() => {
      window.open(app.fallback, '_blank', 'noopener');
    }, 1500);
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>🚗 Book a Cab</div>
          <div className={styles.sub}>Pre-filled with your safe route</div>
        </div>
        <button className={styles.close} onClick={onClose}>✕</button>
      </div>

      <div className={styles.routePreview}>
        <div className={styles.routeRow}>
          <span className={styles.routeDot} style={{ background: '#22C55E' }} />
          <span className={styles.routeText}>{from || 'Starting point'}</span>
        </div>
        <div className={styles.routeLine} />
        <div className={styles.routeRow}>
          <span className={styles.routeDot} style={{ background: '#E63B6F' }} />
          <span className={styles.routeText}>{to || 'Destination'}</span>
        </div>
      </div>

      <div className={styles.appGrid}>
        {CAB_APPS.map(app => (
          <button
            key={app.id}
            className={styles.appCard}
            style={{ background: app.bgColor, borderColor: app.borderColor }}
            onClick={() => openApp(app)}
          >
            <div className={styles.appEmoji}>{app.emoji}</div>
            <div className={styles.appInfo}>
              <div className={styles.appName} style={{ color: app.color }}>{app.name}</div>
              <div className={styles.appTagline}>{app.tagline}</div>
            </div>
            <div className={styles.appArrow} style={{ color: app.color }}>→</div>
          </button>
        ))}
      </div>

      <div className={styles.safetyTip}>
        <div className={styles.tipIcon}>🛡️</div>
        <div className={styles.tipText}>
          Always verify driver name & vehicle number before boarding.
          Share your trip live with a trusted contact.
        </div>
      </div>

      <button className={styles.shareBtn} onClick={shareRoute}>
        {copied ? '✓ Copied to clipboard!' : '📤 Share this route'}
      </button>

      <div className={styles.helpline}>
        Women's helpline: <strong>1091</strong> · Police: <strong>100</strong>
      </div>
    </div>
  );
}
