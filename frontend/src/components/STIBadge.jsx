import React from 'react';
import { fmtSTI, getStiEmoji, getCategoryClass, getStiLabel } from '../utils/helpers';

/**
 * Compact STI badge — used on map pins, location cards, etc.
 * size: 'sm' | 'md' | 'lg'
 */
export default function STIBadge({ sti, category, size = 'md', showLabel = false }) {
  const cls = getCategoryClass(category);
  const emoji = getStiEmoji(category);
  const label = getStiLabel(sti, category);

  const fontSize = size === 'sm' ? '0.7rem' : size === 'lg' ? '0.95rem' : '0.8rem';
  const padding  = size === 'sm' ? '3px 8px' : size === 'lg' ? '7px 16px' : '4px 12px';

  return (
    <span
      className={`badge ${cls}`}
      style={{ fontSize, padding, fontFamily: 'var(--font-mono)', fontWeight: 700 }}
    >
      {emoji} {fmtSTI(sti)}{showLabel && ` · ${label}`}
    </span>
  );
}
