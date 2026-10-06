// ─────────────────────────────────────────────────────────────────────────────
// STISection.jsx  –  Drop-in replacement for the <section className={styles.formulaSection}>
// block in Home.jsx.
//
// HOW TO USE:
//   1. Copy this file into your src/components/ folder.
//   2. Import it in Home.jsx:
//        import STISection from '../components/STISection';
//   3. Replace the entire <section className={styles.formulaSection}> … </section>
//      block in Home.jsx with:
//        <STISection />
// ─────────────────────────────────────────────────────────────────────────────

import React, { useEffect, useRef, useState } from 'react';

/* ── Data ──────────────────────────────────────────────────────────────────── */
const FACTORS = [
  {
    icon: '💡',
    svgIcon: (
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{width:28,height:28}}>
        <circle cx="20" cy="16" r="8" stroke="#e63b6f" strokeWidth="2.2" fill="rgba(230,59,111,0.12)"/>
        <path d="M16 24h8M17 27h6M18.5 30h3" stroke="#e63b6f" strokeWidth="2" strokeLinecap="round"/>
        <path d="M20 6V4M29.7 10.3l1.4-1.4M34 20h2M29.7 29.7l1.4 1.4M10.3 10.3L8.9 8.9M6 20H4M10.3 29.7l-1.4 1.4" stroke="#f5a623" strokeWidth="1.8" strokeLinecap="round" opacity="0.7"/>
      </svg>
    ),
    label: 'Street Lighting',
    weight: 30,
    color: '#f5a623',
    desc: 'Quality & reach of illumination at your visit time — well-lit streets cut harassment risk significantly.',
    stat: 'Highest predictor of perceived safety after dark',
  },
  {
    icon: '👥',
    svgIcon: (
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{width:28,height:28}}>
        <circle cx="14" cy="14" r="5" stroke="#e63b6f" strokeWidth="2.2" fill="rgba(230,59,111,0.12)"/>
        <circle cx="26" cy="14" r="5" stroke="#e63b6f" strokeWidth="2.2" fill="rgba(230,59,111,0.12)"/>
        <path d="M4 34c0-5.5 4.5-10 10-10h12c5.5 0 10 4.5 10 10" stroke="#e63b6f" strokeWidth="2.2" strokeLinecap="round"/>
      </svg>
    ),
    label: 'Crowd Behaviour',
    weight: 30,
    color: '#e63b6f',
    desc: 'Density and behaviour of bystanders — a healthy, mixed crowd creates natural surveillance.',
    stat: 'Balanced presence rated safer than empty or dense crowds',
  },
  {
    icon: '🚔',
    svgIcon: (
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{width:28,height:28}}>
        <rect x="5" y="18" width="30" height="14" rx="3" stroke="#4a9eff" strokeWidth="2.2" fill="rgba(74,158,255,0.1)"/>
        <path d="M8 18l3-8h18l3 8" stroke="#4a9eff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        <rect x="13" y="8" width="14" height="4" rx="1" fill="rgba(74,158,255,0.25)" stroke="#4a9eff" strokeWidth="1.5"/>
        <circle cx="12" cy="29" r="3" stroke="#4a9eff" strokeWidth="2"/>
        <circle cx="28" cy="29" r="3" stroke="#4a9eff" strokeWidth="2"/>
        <rect x="17" y="14" width="6" height="3" rx="1" fill="#4a9eff" opacity="0.5"/>
      </svg>
    ),
    label: 'Police Visibility',
    weight: 20,
    color: '#4a9eff',
    desc: 'Law enforcement or security presence in the area — visible patrolling deters opportunistic crime.',
    stat: 'Correlates with 18 % lower incident reports in our data',
  },
  {
    icon: '⚠️',
    svgIcon: (
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style={{width:28,height:28}}>
        <path d="M20 6L36 33H4L20 6z" stroke="#ff6b35" strokeWidth="2.2" fill="rgba(255,107,53,0.1)" strokeLinejoin="round"/>
        <path d="M20 17v8" stroke="#ff6b35" strokeWidth="2.5" strokeLinecap="round"/>
        <circle cx="20" cy="28" r="1.5" fill="#ff6b35"/>
      </svg>
    ),
    label: 'Incident Reports',
    weight: 20,
    color: '#ff6b35',
    desc: 'User-reported harassment, stalking, or unsafe events — recent reports heavily influence the score.',
    stat: 'Real-time reports decay over 48 h to stay current',
  },
];

const CATEGORIES = [
  { emoji: '🟢', label: 'Safe',     range: '8 – 10', bg: 'rgba(34,197,94,0.1)',  border: 'rgba(34,197,94,0.3)',  text: '#22c55e' },
  { emoji: '🟡', label: 'Moderate', range: '5 – 7',  bg: 'rgba(245,166,35,0.1)', border: 'rgba(245,166,35,0.3)', text: '#f5a623' },
  { emoji: '🔴', label: 'Risky',    range: '0 – 4',  bg: 'rgba(230,59,111,0.1)', border: 'rgba(230,59,111,0.3)', text: '#e63b6f' },
];

/* ── Hook: fire once when element enters viewport ──────────────────────────── */
function useInView(threshold = 0.18) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

/* ── Animated progress bar ─────────────────────────────────────────────────── */
function ProgressBar({ pct, color, active }) {
  return (
    <div style={{
      height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.07)',
      overflow: 'hidden', flex: 1,
    }}>
      <div style={{
        height: '100%', borderRadius: 99,
        background: `linear-gradient(90deg, ${color}cc, ${color})`,
        width: active ? `${pct}%` : '0%',
        transition: active ? 'width 1.1s cubic-bezier(0.22,1,0.36,1)' : 'none',
        boxShadow: active ? `0 0 10px ${color}80` : 'none',
      }} />
    </div>
  );
}

/* ── Single factor card (timeline node) ───────────────────────────────────── */
function FactorNode({ factor, index, visible }) {
  const delay = `${index * 140}ms`;
  const isLast = index === FACTORS.length - 1;

  return (
    <div style={{
      display: 'flex', gap: 0, position: 'relative',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(32px)',
      transition: `opacity 0.55s ${delay}, transform 0.55s ${delay}`,
    }}>
      {/* Left: timeline spine */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 56, flexShrink: 0 }}>
        {/* Icon bubble */}
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          background: 'rgba(17,17,24,0.95)',
          border: `2px solid ${factor.color}55`,
          boxShadow: visible ? `0 0 0 4px ${factor.color}18, 0 0 20px ${factor.color}25` : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: `box-shadow 0.6s ${delay}`,
          zIndex: 2, flexShrink: 0,
        }}>
          {factor.svgIcon}
        </div>
        {/* Connector line */}
        {!isLast && (
          <div style={{
            width: 2, flex: 1, minHeight: 28,
            background: `linear-gradient(to bottom, ${factor.color}55, transparent)`,
            marginTop: 4,
          }} />
        )}
      </div>

      {/* Right: content card */}
      <div style={{
        flex: 1, marginLeft: 20, marginBottom: isLast ? 0 : 24,
        background: 'rgba(17,17,24,0.7)',
        border: `1px solid ${factor.color}28`,
        borderRadius: 16,
        padding: '20px 24px',
        backdropFilter: 'blur(8px)',
        transition: 'border-color 0.25s, box-shadow 0.25s',
        cursor: 'default',
      }}
        onMouseEnter={e => {
          e.currentTarget.style.borderColor = `${factor.color}60`;
          e.currentTarget.style.boxShadow = `0 4px 24px ${factor.color}18`;
        }}
        onMouseLeave={e => {
          e.currentTarget.style.borderColor = `${factor.color}28`;
          e.currentTarget.style.boxShadow = 'none';
        }}
      >
        {/* Header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{
            fontFamily: 'var(--font-mono, monospace)', fontSize: '0.68rem',
            fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: factor.color, background: `${factor.color}18`,
            border: `1px solid ${factor.color}35`,
            padding: '3px 10px', borderRadius: 99,
          }}>{factor.weight}% weight</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text, #f0f0f0)' }}>{factor.label}</span>
        </div>

        {/* Progress bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <ProgressBar pct={factor.weight} color={factor.color} active={visible} />
          <span style={{
            fontFamily: 'var(--font-mono, monospace)', fontSize: '0.72rem',
            fontWeight: 700, color: factor.color, flexShrink: 0,
          }}>{factor.weight}%</span>
        </div>

        {/* Description */}
        <p style={{ fontSize: '0.82rem', color: 'var(--text-muted, #9ca3af)', lineHeight: 1.65, margin: 0 }}>
          {factor.desc}
        </p>

        {/* Stat chip */}
        <div style={{
          marginTop: 12, fontSize: '0.72rem', color: 'var(--text-muted, #9ca3af)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span style={{ color: factor.color }}>●</span> {factor.stat}
        </div>
      </div>
    </div>
  );
}

/* ── Google-Maps-style score meter ─────────────────────────────────────────── */
function ScoreMeter({ visible }) {
  const score = 7.4; // example live score
  const angle = (score / 10) * 180 - 90; // -90 → 90 deg arc

  return (
    <div style={{
      background: 'rgba(17,17,24,0.8)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 20, padding: '28px 32px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      backdropFilter: 'blur(10px)',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(24px)',
      transition: 'opacity 0.6s 0.5s, transform 0.6s 0.5s',
    }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted, #9ca3af)', marginBottom: 18 }}>Live STI Preview</div>

      {/* Semi-circle gauge */}
      <div style={{ position: 'relative', width: 180, height: 90, marginBottom: 8 }}>
        <svg viewBox="0 0 180 90" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
          {/* Track */}
          <path d="M 10 90 A 80 80 0 0 1 170 90" stroke="rgba(255,255,255,0.08)" strokeWidth="10" fill="none" strokeLinecap="round"/>
          {/* Coloured arc — green zone */}
          <path d="M 10 90 A 80 80 0 0 1 170 90" stroke="url(#arcGrad)" strokeWidth="10" fill="none" strokeLinecap="round"
            strokeDasharray="251.2"
            strokeDashoffset={visible ? 0 : 251.2}
            style={{ transition: 'stroke-dashoffset 1.4s 0.6s cubic-bezier(0.22,1,0.36,1)' }}
          />
          <defs>
            <linearGradient id="arcGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#e63b6f"/>
              <stop offset="50%" stopColor="#f5a623"/>
              <stop offset="100%" stopColor="#22c55e"/>
            </linearGradient>
          </defs>
          {/* Needle */}
          <g transform={`rotate(${visible ? angle : -90}, 90, 90)`} style={{ transition: `transform 1.5s 0.7s cubic-bezier(0.22,1,0.36,1)` }}>
            <line x1="90" y1="90" x2="90" y2="20" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"/>
            <circle cx="90" cy="90" r="5" fill="#fff"/>
          </g>
        </svg>

        {/* Score label centred below arc */}
        <div style={{
          position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)',
          textAlign: 'center',
        }}>
          <div style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: '2.2rem', fontWeight: 900, color: '#f5a623', lineHeight: 1 }}>
            {visible ? score : '–'}
          </div>
          <div style={{ fontSize: '0.65rem', color: 'var(--text-muted, #9ca3af)', fontWeight: 600, marginTop: 2 }}>/ 10 · Moderate</div>
        </div>
      </div>

      {/* Mini legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 28 }}>
        {[['#e63b6f','Risky'],['#f5a623','Moderate'],['#22c55e','Safe']].map(([c,l]) => (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', color: 'var(--text-muted, #9ca3af)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: c, display: 'block' }}/>
            {l}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main section export ───────────────────────────────────────────────────── */
export default function STISection() {
  const [headerRef, headerVisible] = useInView(0.2);
  const [factorsRef, factorsVisible] = useInView(0.1);
  const [catsRef, catsVisible] = useInView(0.2);

  return (
    <section style={{
      padding: '100px 60px',
      background: 'var(--bg, #0d0d14)',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* ambient glow */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 60% 50% at 30% 60%, rgba(230,59,111,0.06) 0%, transparent 70%)',
      }}/>

      {/* ── Section header ── */}
      <div ref={headerRef} style={{
        maxWidth: 560, marginBottom: 64, margin: '0 auto 64px',
        opacity: headerVisible ? 1 : 0,
        transform: headerVisible ? 'translateY(0)' : 'translateY(24px)',
        transition: 'opacity 0.6s, transform 0.6s',
      }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: 'var(--rose, #e63b6f)',
          marginBottom: 14,
        }}>
          <span style={{ width: 18, height: 1, background: 'var(--rose, #e63b6f)', display: 'block' }}/>
          Algorithm
        </div>
        <h2 style={{
          fontSize: 'clamp(1.8rem, 3vw, 2.6rem)', fontWeight: 900, marginBottom: 14,
          color: 'var(--text, #f0f0f0)', lineHeight: 1.1,
        }}>
          The Safety Trust Index
        </h2>
        <p style={{
          color: 'var(--text-muted, #9ca3af)', fontSize: '1rem', lineHeight: 1.72, margin: 0,
        }}>
          Four signal layers, fused in real-time. Each factor is crowd-sourced, decay-weighted, and filtered through our Trust Reliability System.
        </p>
      </div>

      {/* ── Two-column layout: timeline + meter ── */}
      <div ref={factorsRef} style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) 260px',
        gap: 48, alignItems: 'start',
        maxWidth: 900, margin: '0 auto',
      }}>
        {/* Left: vertical timeline of factors */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {FACTORS.map((f, i) => (
            <FactorNode key={f.label} factor={f} index={i} visible={factorsVisible} />
          ))}

          {/* Total weight bar at the bottom */}
          <div style={{
            marginTop: 32, padding: '20px 24px',
            background: 'rgba(230,59,111,0.06)', border: '1px solid rgba(230,59,111,0.2)',
            borderRadius: 14,
            opacity: factorsVisible ? 1 : 0,
            transform: factorsVisible ? 'translateY(0)' : 'translateY(16px)',
            transition: 'opacity 0.5s 0.7s, transform 0.5s 0.7s',
          }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #9ca3af)', marginBottom: 10, fontWeight: 600 }}>Combined weight</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {FACTORS.map((f, i) => (
                <div key={f.label} style={{ flex: f.weight, height: 8, borderRadius: 99, background: f.color, opacity: 0.85,
                  transition: factorsVisible ? `flex 1s ${i * 140}ms cubic-bezier(0.22,1,0.36,1)` : 'none',
                }} title={`${f.label}: ${f.weight}%`}/>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
              {FACTORS.map(f => (
                <div key={f.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.68rem', color: 'var(--text-muted, #9ca3af)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: f.color, flexShrink: 0 }}/>
                  {f.label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right: sticky score meter */}
        <div style={{ position: 'sticky', top: 100 }}>
          <ScoreMeter visible={factorsVisible} />

          {/* Time-aware note */}
          <div style={{
            marginTop: 16, padding: '14px 18px',
            background: 'rgba(245,166,35,0.07)', border: '1px solid rgba(245,166,35,0.2)',
            borderRadius: 14, fontSize: '0.75rem', color: 'var(--text-muted, #9ca3af)', lineHeight: 1.6,
            opacity: factorsVisible ? 1 : 0,
            transition: 'opacity 0.5s 0.9s',
          }}>
            <span style={{ color: '#f5a623', fontWeight: 700 }}>⏱ Time-aware</span><br/>
            Scores shift across 4 daily slots: Dawn, Day, Evening, Night — because safety changes with light.
          </div>
        </div>
      </div>

      {/* ── Score categories ── */}
      <div ref={catsRef} style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 14, marginTop: 64, maxWidth: 900, margin: '64px auto 0',
      }}>
        {CATEGORIES.map((c, i) => (
          <div key={c.label} style={{
            display: 'flex', alignItems: 'center', gap: 20,
            padding: '22px 28px', borderRadius: 16,
            background: c.bg, border: `1px solid ${c.border}`,
            opacity: catsVisible ? 1 : 0,
            transform: catsVisible ? 'translateY(0)' : 'translateY(20px)',
            transition: `opacity 0.5s ${i * 120}ms, transform 0.5s ${i * 120}ms`,
          }}>
            <span style={{ fontSize: '2rem', lineHeight: 1 }}>{c.emoji}</span>
            <div>
              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '1.3rem', fontWeight: 900, color: c.text }}>{c.range}</div>
              <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text, #f0f0f0)', marginTop: 2 }}>{c.label}</div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
