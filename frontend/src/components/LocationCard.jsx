import React from 'react';
import STIBadge from './STIBadge';
import { locTypeIcon, TIME_SLOTS, fmtSTI, fmtCount } from '../utils/helpers';
import styles from './LocationCard.module.css';

export default function LocationCard({ location, activeSlot, onClick, selected }) {
  const slot = location.timeSlots?.find(s => s.slot === activeSlot);
  const sti  = slot?.sti ?? null;
  const cat  = slot?.category ?? 'unrated';
  const cnt  = slot?.ratingCount ?? 0;

  // Mini slot bars
  const slotBars = TIME_SLOTS.map(ts => {
    const s = location.timeSlots?.find(x => x.slot === ts.key);
    return { ...ts, sti: s?.sti, cat: s?.category ?? 'unrated' };
  });

  return (
    <div
      className={`${styles.card} ${selected ? styles.selected : ''}`}
      onClick={() => onClick?.(location)}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick?.(location)}
    >
      <div className={styles.header}>
        <div className={styles.nameRow}>
          <span className={styles.typeIcon}>{locTypeIcon(location.type)}</span>
          <div>
            <div className={styles.name}>{location.name}</div>
            <div className={styles.area}>{location.area}</div>
          </div>
        </div>
        <STIBadge sti={sti} category={cat} size="sm" />
      </div>

      <div className={styles.meta}>
        {cnt > 0 ? `${fmtCount(cnt)} rating${cnt !== 1 ? 's' : ''}` : 'No ratings yet'}
        {location.isVerified && <span className={styles.verified}>✓ Verified</span>}
      </div>

      {/* Time-slot mini bars */}
      <div className={styles.slotBars}>
        {slotBars.map(ts => (
          <div key={ts.key} className={styles.slotBar} title={`${ts.label}: ${fmtSTI(ts.sti)}`}>
            <div
              className={styles.slotFill}
              style={{
                height: ts.sti !== null ? `${(ts.sti / 10) * 100}%` : '10%',
                background: ts.cat === 'safe' ? 'var(--safe)'
                           : ts.cat === 'moderate' ? 'var(--moderate)'
                           : ts.cat === 'risky' ? 'var(--risky)'
                           : 'var(--border)',
                opacity: ts.key === activeSlot ? 1 : 0.45,
              }}
            />
            <span className={styles.slotIcon}>{ts.icon}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
