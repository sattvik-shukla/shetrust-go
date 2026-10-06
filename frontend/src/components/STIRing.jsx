import React from 'react';
import { getStiColor, fmtSTI, getStiLabel, categorizeSTI } from '../utils/helpers';

const R = 52;
const CIRC = 2 * Math.PI * R;

export default function STIRing({ sti, category, size = 140, showLabel = true }) {
  const col = getStiColor(category ?? categorizeSTI(sti));
  const pct = sti !== null ? Math.max(0, Math.min(1, sti / 10)) : 0;
  const offset = CIRC - pct * CIRC;
  const label = getStiLabel(sti, category);

  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <svg
        width={size} height={size}
        viewBox="0 0 120 120"
        style={{ transform: 'rotate(-90deg)' }}
      >
        {/* Background track */}
        <circle
          cx="60" cy="60" r={R}
          fill="none"
          stroke="var(--border)"
          strokeWidth="8"
        />
        {/* Filled arc */}
        <circle
          cx="60" cy="60" r={R}
          fill="none"
          stroke={col}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1), stroke 0.5s' }}
        />
      </svg>

      {/* Center text */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        textAlign: 'center',
      }}>
        <span style={{
          fontFamily: 'var(--font-serif)',
          fontSize: size * 0.21,
          fontWeight: 900,
          color: col,
          lineHeight: 1,
          transition: 'color 0.5s',
        }}>
          {fmtSTI(sti)}
        </span>
        {showLabel && (
          <span style={{ fontSize: size * 0.095, color: 'var(--text-muted)', marginTop: 3 }}>
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
