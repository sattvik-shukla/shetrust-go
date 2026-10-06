import React, { useState, useEffect, useRef } from 'react';
import styles from './EmergencyButton.module.css';

/* ── Bengaluru Police Stations (lat/lng) ────────────────────────── */
const POLICE_STATIONS = [
  { name: 'Cubbon Park Police Station',      lat: 12.9763, lng: 77.5929 },
  { name: 'Koramangala Police Station',      lat: 12.9347, lng: 77.6193 },
  { name: 'Jayanagar Police Station',        lat: 12.9304, lng: 77.5832 },
  { name: 'Indiranagar Police Station',      lat: 12.9784, lng: 77.6408 },
  { name: 'MG Road Police Station',          lat: 12.9758, lng: 77.6073 },
  { name: 'Marathahalli Police Station',     lat: 12.9591, lng: 77.7011 },
  { name: 'Whitefield Police Station',       lat: 12.9698, lng: 77.7499 },
  { name: 'Banashankari Police Station',     lat: 12.9253, lng: 77.5468 },
  { name: 'Electronic City Police Station',  lat: 12.8462, lng: 77.6635 },
  { name: 'Yelahanka Police Station',        lat: 13.1010, lng: 77.5963 },
  { name: 'Rajajinagar Police Station',      lat: 12.9897, lng: 77.5562 },
  { name: 'Shivajinagar Police Station',     lat: 12.9896, lng: 77.6013 },
  { name: 'HSR Layout Police Station',       lat: 12.9116, lng: 77.6472 },
  { name: 'Bellandur Police Station',        lat: 12.9266, lng: 77.6785 },
  { name: 'JP Nagar Police Station',         lat: 12.9084, lng: 77.5834 },
];

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getNearestStation(lat, lng) {
  return POLICE_STATIONS.map(s => ({
    ...s,
    dist: haversineKm(lat, lng, s.lat, s.lng),
  })).sort((a, b) => a.dist - b.dist)[0];
}

const DEFAULT_CONTACTS = [
  { id: 1, name: '', phone: '' },
  { id: 2, name: '', phone: '' },
];

const PHASE = { IDLE: 'idle', COUNTING: 'counting', ACTIVE: 'active', SENT: 'sent' };

export default function EmergencyButton() {
  const [phase, setPhase]           = useState(PHASE.IDLE);
  const [panelOpen, setPanelOpen]   = useState(false);
  const [contacts, setContacts]     = useState(() => {
    try { return JSON.parse(localStorage.getItem('sos_contacts')) || DEFAULT_CONTACTS; }
    catch { return DEFAULT_CONTACTS; }
  });
  const [editMode, setEditMode]     = useState(false);
  const [countdown, setCountdown]   = useState(5);
  const [location, setLocation]     = useState(null);
  const [nearestPS, setNearestPS]   = useState(null);
  const [locErr, setLocErr]         = useState('');
  const [messages, setMessages]     = useState([]);
  const countRef                    = useRef(null);
  const holdRef                     = useRef(null);

  /* ── Save contacts to localStorage ─────────────────────────────── */
  useEffect(() => {
    localStorage.setItem('sos_contacts', JSON.stringify(contacts));
  }, [contacts]);

  /* ── Geolocation fetch ──────────────────────────────────────────── */
  function fetchLocation() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) { reject('Geolocation not supported'); return; }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        err => reject(err.message),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  }

  /* ── Start hold to trigger SOS ──────────────────────────────────── */
  function startHold() {
    if (phase !== PHASE.IDLE) return;
    setPhase(PHASE.COUNTING);
    setCountdown(5);
    setPanelOpen(false);

    countRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(countRef.current);
          triggerSOS();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }

  function cancelHold() {
    if (phase === PHASE.COUNTING) {
      clearInterval(countRef.current);
      setPhase(PHASE.IDLE);
      setCountdown(5);
    }
  }

  /* ── Trigger full SOS ───────────────────────────────────────────── */
  async function triggerSOS() {
    setPhase(PHASE.ACTIVE);
    setMessages([]);
    setLocErr('');

    let loc = null;
    let ps  = null;

    try {
      loc = await fetchLocation();
      ps  = getNearestStation(loc.lat, loc.lng);
      setLocation(loc);
      setNearestPS(ps);
      setPanelOpen(true);

      const mapsUrl = `https://maps.google.com/?q=${loc.lat},${loc.lng}`;
      const msgText = `🚨 EMERGENCY ALERT from SheTrust\n\nI need help! My current location:\n📍 ${mapsUrl}\n\nNearest Police: ${ps.name} (${ps.dist.toFixed(1)} km away)\n\nPlease contact me or send help immediately.`;

      // Simulate sending to contacts (SMS API would go here)
      const validContacts = contacts.filter(c => c.name && c.phone);
      const logs = validContacts.map(c => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        status: 'sent',
        msg: msgText,
      }));
      if (logs.length === 0) {
        logs.push({ id: 0, name: 'No contacts saved', phone: '—', status: 'warn' });
      }
      setMessages(logs);
      setPhase(PHASE.SENT);
    } catch (err) {
      setLocErr(String(err));
      setPhase(PHASE.ACTIVE);
      setPanelOpen(true);
    }
  }

  function reset() {
    clearInterval(countRef.current);
    setPhase(PHASE.IDLE);
    setCountdown(5);
    setLocation(null);
    setNearestPS(null);
    setMessages([]);
    setLocErr('');
    setPanelOpen(false);
  }

  function updateContact(id, field, value) {
    setContacts(cs => cs.map(c => c.id === id ? { ...c, [field]: value } : c));
  }

  const isCountdown = phase === PHASE.COUNTING;
  const isActive    = phase === PHASE.ACTIVE || phase === PHASE.SENT;

  /* ── Open Directions to nearest police station ───────────────────── */
  function openPoliceDirections() {
    if (!nearestPS) return;
    window.open(
      `https://www.google.com/maps/dir/?api=1&destination=${nearestPS.lat},${nearestPS.lng}`,
      '_blank'
    );
  }

  function openMyLocation() {
    if (!location) return;
    window.open(
      `https://www.google.com/maps?q=${location.lat},${location.lng}`,
      '_blank'
    );
  }

  return (
    <>
      {/* ── Floating SOS button ─────────────────────────────────────── */}
      <div className={`${styles.sosWrap} ${isCountdown ? styles.counting : ''} ${isActive ? styles.triggered : ''}`}>
        {isCountdown && (
          <div className={styles.countdownRing}>
            <svg viewBox="0 0 56 56">
              <circle cx="28" cy="28" r="24" />
              <circle
                cx="28" cy="28" r="24"
                strokeDasharray={150.8}
                strokeDashoffset={150.8 * (countdown / 5)}
                className={styles.countdownArc}
              />
            </svg>
            <span className={styles.countdownNum}>{countdown}</span>
          </div>
        )}

        <button
          className={styles.sosBtn}
          onMouseDown={startHold}
          onMouseUp={cancelHold}
          onMouseLeave={cancelHold}
          onTouchStart={startHold}
          onTouchEnd={cancelHold}
          onClick={() => {
            if (phase === PHASE.IDLE) setPanelOpen(p => !p);
            if (isActive) setPanelOpen(true);
          }}
          aria-label="SOS Emergency"
        >
          {isCountdown ? '✕' : '🆘'}
        </button>

        {!isCountdown && !isActive && (
          <div className={styles.sosLabel}>HOLD 5s for SOS</div>
        )}
        {isActive && (
          <div className={styles.sosLabel} style={{ color: '#ff6b6b' }}>SOS ACTIVE</div>
        )}
      </div>

      {/* ── Slide-up panel ─────────────────────────────────────────── */}
      {panelOpen && (
        <div className={styles.overlay} onClick={() => !isActive && setPanelOpen(false)}>
          <div className={styles.panel} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className={styles.panelHeader}>
              {isActive ? (
                <>
                  <span className={styles.alertDot} />
                  <h3>Emergency Activated</h3>
                </>
              ) : (
                <h3>🆘 Emergency Settings</h3>
              )}
              <button className={styles.closeBtn} onClick={() => isActive ? reset() : setPanelOpen(false)}>
                {isActive ? 'Dismiss' : '✕'}
              </button>
            </div>

            {/* ── ACTIVE state ────────────────────────────────────── */}
            {isActive && (
              <div className={styles.activeContent}>
                {/* Location block */}
                {location ? (
                  <div className={styles.locCard}>
                    <div className={styles.locCardTitle}>📍 Your Location Detected</div>
                    <div className={styles.locCoords}>
                      {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                    </div>
                    <button className={styles.mapBtn} onClick={openMyLocation}>
                      Open in Google Maps ↗
                    </button>
                  </div>
                ) : locErr ? (
                  <div className={styles.errCard}>
                    ⚠️ Could not get location: {locErr}
                  </div>
                ) : (
                  <div className={styles.locCard}>
                    <div className={styles.locCardTitle}>📡 Fetching your location…</div>
                  </div>
                )}

                {/* Nearest police station */}
                {nearestPS && (
                  <div className={styles.psCard}>
                    <div className={styles.psIcon}>🚔</div>
                    <div className={styles.psInfo}>
                      <div className={styles.psName}>{nearestPS.name}</div>
                      <div className={styles.psDist}>{nearestPS.dist.toFixed(2)} km away</div>
                    </div>
                    <button className={styles.directionsBtn} onClick={openPoliceDirections}>
                      Navigate ↗
                    </button>
                  </div>
                )}

                {/* Contacts notified */}
                <div className={styles.contactsSection}>
                  <div className={styles.contactsTitle}>Trusted Contacts</div>
                  {messages.map((m, i) => (
                    <div key={i} className={`${styles.contactRow} ${m.status === 'warn' ? styles.warnRow : styles.sentRow}`}>
                      <span className={styles.contactName}>{m.name}</span>
                      <span className={styles.contactPhone}>{m.phone}</span>
                      <span className={styles.contactStatus}>
                        {m.status === 'sent' ? '✅ Alerted' : '⚠️ Not set'}
                      </span>
                    </div>
                  ))}

                  {/* Show SMS template the user can copy/send */}
                  {location && messages.some(m => m.msg) && (
                    <div className={styles.msgPreview}>
                      <div className={styles.msgPreviewTitle}>Alert Message Preview</div>
                      <textarea
                        className={styles.msgText}
                        readOnly
                        value={messages.find(m => m.msg)?.msg || ''}
                        rows={5}
                      />
                      <div style={{ display:'flex', gap: 8, marginTop: 8 }}>
                        <button
                          className={styles.copyBtn}
                          onClick={() => navigator.clipboard.writeText(messages.find(m => m.msg)?.msg || '')}
                        >
                          📋 Copy Message
                        </button>
                        {contacts.filter(c => c.phone).map(c => (
                          <a
                            key={c.id}
                            className={styles.smsBtn}
                            href={`sms:${c.phone}?body=${encodeURIComponent(messages.find(m => m.msg)?.msg || '')}`}
                          >
                            📱 SMS {c.name || c.phone}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Call 112 */}
                <a href="tel:112" className={styles.callBtn}>
                  📞 Call 112 (Police Emergency)
                </a>
              </div>
            )}

            {/* ── IDLE settings state ──────────────────────────────── */}
            {!isActive && (
              <div className={styles.settingsContent}>
                <p className={styles.settingsDesc}>
                  Hold the SOS button for 5 seconds to trigger an emergency alert.
                  It will detect your location, find the nearest police station, and
                  prepare alerts for your trusted contacts.
                </p>

                <div className={styles.contactsTitle}>
                  Trusted Contacts
                  <button className={styles.editToggle} onClick={() => setEditMode(e => !e)}>
                    {editMode ? 'Done' : 'Edit'}
                  </button>
                </div>

                {contacts.map(c => (
                  <div key={c.id} className={styles.contactEditRow}>
                    {editMode ? (
                      <>
                        <input
                          className={styles.contactInput}
                          placeholder="Name"
                          value={c.name}
                          onChange={e => updateContact(c.id, 'name', e.target.value)}
                        />
                        <input
                          className={styles.contactInput}
                          placeholder="+91 phone number"
                          value={c.phone}
                          onChange={e => updateContact(c.id, 'phone', e.target.value)}
                        />
                      </>
                    ) : (
                      <div className={styles.contactReadRow}>
                        <span className={styles.contactAvatar}>
                          {c.name ? c.name[0].toUpperCase() : '?'}
                        </span>
                        <div>
                          <div className={styles.contactName}>{c.name || 'Not set'}</div>
                          <div className={styles.contactPhone}>{c.phone || 'Add phone number'}</div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                <div className={styles.holdHint}>
                  <span>💡</span>
                  <span>Hold the red SOS button for 5 seconds to activate. You can cancel within the countdown.</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
