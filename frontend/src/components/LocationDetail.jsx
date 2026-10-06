import React, { useEffect, useState } from 'react';
import STIRing from './STIRing';
import STIBadge from './STIBadge';
import { TIME_SLOTS, locTypeIcon, fmtSTI, fmtCount, getStiColor, categorizeSTI } from '../utils/helpers';
import { ratingsApi } from '../utils/api';
import styles from './LocationDetail.module.css';

const FACTOR_ROWS = [
  { key: 'avgLighting',   icon: '💡', label: 'Street Lighting',      weight: '30%' },
  { key: 'avgCrowd',      icon: '👥', label: 'Crowd Behavior',        weight: '30%' },
  { key: 'avgPolice',     icon: '🚔', label: 'Police / Security',     weight: '20%' },
  { key: 'avgIncident',   icon: '⚠️', label: 'Incident Reports',     weight: '20%', invert: true },
];

export default function LocationDetail({ location, activeSlot, onClose, onRate }) {
  const [selSlot, setSelSlot] = useState(activeSlot);
  const [stats, setStats]     = useState(null);

  useEffect(() => { setSelSlot(activeSlot); }, [activeSlot]);

  useEffect(() => {
    if (!location) return;
    ratingsApi.getForLocation(location._id, selSlot)
      .then(r => setStats(r.data.data))
      .catch(() => setStats(null));
  }, [location?._id, selSlot]);

  if (!location) return null;

  const slot = location.timeSlots?.find(s => s.slot === selSlot);
  const sti  = slot?.sti ?? null;
  const cat  = slot?.category ?? 'unrated';

  return (
    <div className={styles.panel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.typeIcon}>{locTypeIcon(location.type)}</span>
          <div>
            <div className={styles.name}>{location.name}</div>
            <div className={styles.area}>{location.area} · Bengaluru</div>
          </div>
        </div>
        <button className="btn btn-ghost btn-icon" onClick={onClose} title="Close">✕</button>
      </div>

      {/* Score ring */}
      <div className={styles.ringWrap}>
        <STIRing sti={sti} category={cat} size={140} />
        <div className={styles.ratingCount}>
          {slot?.ratingCount ? `${fmtCount(slot.ratingCount)} ratings` : 'No ratings yet'}
          {location.isVerified && <span className={styles.verified}> · ✓ Verified</span>}
        </div>
      </div>

      {/* Time slot selector */}
      <div className={styles.slots}>
        {TIME_SLOTS.map(ts => {
          const s = location.timeSlots?.find(x => x.slot === ts.key);
          return (
            <button
              key={ts.key}
              className={`${styles.slotBtn} ${selSlot === ts.key ? styles.slotActive : ''}`}
              onClick={() => setSelSlot(ts.key)}
            >
              <span>{ts.icon}</span>
              <span className={styles.slotLabel}>{ts.label}</span>
              <STIBadge sti={s?.sti ?? null} category={s?.category ?? 'unrated'} size="sm" />
            </button>
          );
        })}
      </div>

      {/* Factor breakdown */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Factor Breakdown</div>
        {FACTOR_ROWS.map(f => {
          const val = slot?.[f.key] ?? null;
          const display = f.invert && val !== null ? (10 - val) : val;
          const pct = display !== null ? (display / 10) * 100 : 0;
          return (
            <div key={f.key} className={styles.factorRow}>
              <span className={styles.factorIcon}>{f.icon}</span>
              <div className={styles.factorInfo}>
                <div className={styles.factorLabel}>{f.label}</div>
                <div className={styles.factorBarWrap}>
                  <div
                    className={styles.factorBar}
                    style={{
                      width: `${pct}%`,
                      background: getStiColor(categorizeSTI(display !== null ? display : null)),
                      transition: 'width 0.8s ease',
                    }}
                  />
                </div>
              </div>
              <span className={styles.factorVal}>{val !== null ? val.toFixed(1) : '—'}</span>
              <span className={styles.factorWeight}>{f.weight}</span>
            </div>
          );
        })}
      </div>

      {/* All-slot overview */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>24-Hour Safety Profile</div>
        <div className={styles.allSlots}>
          {TIME_SLOTS.map(ts => {
            const s = location.timeSlots?.find(x => x.slot === ts.key);
            const c = s?.category ?? 'unrated';
            return (
              <div key={ts.key} className={styles.allSlotItem}>
                <div className={styles.allSlotBar}>
                  <div
                    className={styles.allSlotFill}
                    style={{
                      height: s?.sti ? `${(s.sti / 10) * 100}%` : '6%',
                      background: getStiColor(c),
                    }}
                  />
                </div>
                <div className={styles.allSlotIcon}>{ts.icon}</div>
                <div className={styles.allSlotLabel}>{ts.label}</div>
                <div className={styles.allSlotVal} style={{ color: getStiColor(c) }}>
                  {fmtSTI(s?.sti)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rate button */}
      <button
        className={`btn btn-primary ${styles.rateBtn}`}
        onClick={() => onRate?.(location)}
      >
        📍 Rate This Location
      </button>
    </div>
  );
}
