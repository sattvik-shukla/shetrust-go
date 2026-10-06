import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import styles from "./HowItWorks.module.css";

/* ── Intersection observer hook ─────────────────────────────────────── */
function useInView(threshold = 0.15) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, visible];
}

/* ── Factor data ────────────────────────────────────────────────────── */
const FACTORS = [
  {
    svgIcon: (
      <svg
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: 26, height: 26 }}
      >
        <circle
          cx="20"
          cy="16"
          r="8"
          stroke="#f5a623"
          strokeWidth="2.2"
          fill="rgba(245,166,35,0.12)"
        />
        <path
          d="M16 24h8M17 27h6M18.5 30h3"
          stroke="#f5a623"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M20 6V4M29.7 10.3l1.4-1.4M34 20h2M10.3 10.3L8.9 8.9M6 20H4"
          stroke="#f5a623"
          strokeWidth="1.8"
          strokeLinecap="round"
          opacity="0.6"
        />
      </svg>
    ),
    label: "Street Lighting",
    weight: 30,
    color: "#f5a623",
    desc: "Well-lit streets improve visibility and safety. Quality and reach of illumination at your visit time.",
  },
  {
    svgIcon: (
      <svg
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: 26, height: 26 }}
      >
        <circle
          cx="14"
          cy="14"
          r="5"
          stroke="#e63b6f"
          strokeWidth="2.2"
          fill="rgba(230,59,111,0.12)"
        />
        <circle
          cx="26"
          cy="14"
          r="5"
          stroke="#e63b6f"
          strokeWidth="2.2"
          fill="rgba(230,59,111,0.12)"
        />
        <path
          d="M4 34c0-5.5 4.5-10 10-10h12c5.5 0 10 4.5 10 10"
          stroke="#e63b6f"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    ),
    label: "Crowd Behaviour",
    weight: 30,
    color: "#e63b6f",
    desc: "Balanced public presence makes spaces safer. Density and perceived behaviour of bystanders.",
  },
  {
    svgIcon: (
      <svg
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: 26, height: 26 }}
      >
        <rect
          x="5"
          y="18"
          width="30"
          height="14"
          rx="3"
          stroke="#4a9eff"
          strokeWidth="2.2"
          fill="rgba(74,158,255,0.1)"
        />
        <path
          d="M8 18l3-8h18l3 8"
          stroke="#4a9eff"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect
          x="13"
          y="8"
          width="14"
          height="4"
          rx="1"
          fill="rgba(74,158,255,0.2)"
          stroke="#4a9eff"
          strokeWidth="1.5"
        />
        <circle cx="12" cy="29" r="3" stroke="#4a9eff" strokeWidth="2" />
        <circle cx="28" cy="29" r="3" stroke="#4a9eff" strokeWidth="2" />
      </svg>
    ),
    label: "Police / Security",
    weight: 20,
    color: "#4a9eff",
    desc: "Visible police or guards increase confidence. Law enforcement presence deters opportunistic crime.",
  },
  {
    svgIcon: (
      <svg
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: 26, height: 26 }}
      >
        <path
          d="M20 6L36 33H4L20 6z"
          stroke="#ff6b35"
          strokeWidth="2.2"
          fill="rgba(255,107,53,0.1)"
          strokeLinejoin="round"
        />
        <path
          d="M20 17v8"
          stroke="#ff6b35"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <circle cx="20" cy="28" r="1.5" fill="#ff6b35" />
      </svg>
    ),
    label: "Incident Reports",
    weight: 20,
    color: "#ff6b35",
    desc: "Fewer reported issues lead to a higher score. Recent reports decay over 48 h to stay current.",
  },
];

/* ── Animated bar ───────────────────────────────────────────────────── */
function Bar({ pct, color, active, delay }) {
  return (
    <div className={styles.barTrack}>
      <div
        className={styles.barFill}
        style={{
          width: active ? `${pct}%` : "0%",
          background: `linear-gradient(90deg, ${color}99, ${color})`,
          boxShadow: active ? `0 0 10px ${color}60` : "none",
          transitionDelay: delay,
        }}
      />
    </div>
  );
}

/* ── STI factor block ───────────────────────────────────────────────── */
function STIFactors() {
  const [ref, visible] = useInView(0.1);

  return (
    <div ref={ref} className={styles.stiWrap}>
      {/* Left: vertical timeline */}
      <div className={styles.timeline}>
        {FACTORS.map((f, i) => {
          const isLast = i === FACTORS.length - 1;
          const delay = `${i * 130}ms`;
          return (
            <div
              key={f.label}
              className={styles.timelineRow}
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(28px)",
                transition: `opacity 0.5s ${delay}, transform 0.5s ${delay}`,
              }}
            >
              {/* Spine */}
              <div className={styles.spine}>
                <div
                  className={styles.spineIcon}
                  style={{
                    borderColor: `${f.color}55`,
                    boxShadow: visible
                      ? `0 0 0 4px ${f.color}14, 0 0 16px ${f.color}20`
                      : "none",
                  }}
                >
                  {f.svgIcon}
                </div>
                {!isLast && (
                  <div
                    className={styles.spineLine}
                    style={{
                      background: `linear-gradient(to bottom, ${f.color}50, transparent)`,
                    }}
                  />
                )}
              </div>

              {/* Card */}
              <div
                className={styles.factorCard2}
                style={{ borderColor: `${f.color}22` }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = `${f.color}55`;
                  e.currentTarget.style.boxShadow = `0 4px 20px ${f.color}14`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = `${f.color}22`;
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <div className={styles.factorHeader}>
                  <span
                    className={styles.weightChip}
                    style={{
                      color: f.color,
                      background: `${f.color}15`,
                      borderColor: `${f.color}30`,
                    }}
                  >
                    {f.weight}% weight
                  </span>
                  <span className={styles.factorLabel}>{f.label}</span>
                </div>
                <div className={styles.barRow}>
                  <Bar
                    pct={f.weight}
                    color={f.color}
                    active={visible}
                    delay={delay}
                  />
                  <span className={styles.barPct} style={{ color: f.color }}>
                    {f.weight}%
                  </span>
                </div>
                <p className={styles.factorDesc}>{f.desc}</p>
              </div>
            </div>
          );
        })}

        {/* Combined bar */}
        <div
          className={styles.combinedBar}
          style={{
            opacity: visible ? 1 : 0,
            transition: "opacity 0.5s 0.6s",
          }}
        >
          <span className={styles.combinedLabel}>Combined weight</span>
          <div className={styles.combinedTrack}>
            {FACTORS.map((f, i) => (
              <div
                key={f.label}
                className={styles.combinedSegment}
                style={{
                  flex: f.weight,
                  background: f.color,
                  transition: visible
                    ? `flex 1.1s ${i * 130}ms cubic-bezier(0.22,1,0.36,1)`
                    : "none",
                }}
                title={`${f.label}: ${f.weight}%`}
              />
            ))}
          </div>
          <div className={styles.combinedLegend}>
            {FACTORS.map((f) => (
              <div key={f.label} className={styles.legendItem}>
                <span
                  className={styles.legendDot}
                  style={{ background: f.color }}
                />
                {f.label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: score card */}
      <div
        className={styles.scoreCard}
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(20px)",
          transition: "opacity 0.6s 0.45s, transform 0.6s 0.45s",
        }}
      >
        <div className={styles.scoreCardLabel}>Sample STI Output</div>

        {/* SVG gauge */}
        <div className={styles.gaugeWrap}>
          <svg
            viewBox="0 0 180 90"
            style={{ width: "100%", overflow: "visible" }}
          >
            <path
              d="M 10 90 A 80 80 0 0 1 170 90"
              stroke="rgba(255,255,255,0.07)"
              strokeWidth="10"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M 10 90 A 80 80 0 0 1 170 90"
              stroke="url(#g)"
              strokeWidth="10"
              fill="none"
              strokeLinecap="round"
              strokeDasharray="251.2"
              strokeDashoffset={visible ? 0 : 251.2}
              style={{
                transition:
                  "stroke-dashoffset 1.4s 0.5s cubic-bezier(0.22,1,0.36,1)",
              }}
            />
            <defs>
              <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#e63b6f" />
                <stop offset="50%" stopColor="#f5a623" />
                <stop offset="100%" stopColor="#22c55e" />
              </linearGradient>
            </defs>
            <g
              transform={`rotate(${visible ? 44 : -90}, 90, 90)`}
              style={{
                transition: "transform 1.5s 0.65s cubic-bezier(0.22,1,0.36,1)",
              }}
            >
              <line
                x1="90"
                y1="90"
                x2="90"
                y2="20"
                stroke="#fff"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <circle cx="90" cy="90" r="5" fill="#fff" />
            </g>
          </svg>
          <div className={styles.gaugeScore}>
            <div className={styles.gaugeNum}>7.4</div>
            <div className={styles.gaugeSub}>/ 10 · Moderate</div>
          </div>
        </div>

        {/* Category chips */}
        <div className={styles.catChips}>
          {[
            { label: "Safe", range: "8–10", color: "#22c55e" },
            { label: "Moderate", range: "5–7", color: "#f5a623" },
            { label: "Risky", range: "0–4", color: "#e63b6f" },
          ].map((c) => (
            <div
              key={c.label}
              className={styles.catChip}
              style={{
                borderColor: `${c.color}30`,
                background: `${c.color}10`,
              }}
            >
              <span className={styles.catDot} style={{ background: c.color }} />
              <span className={styles.catRange} style={{ color: c.color }}>
                {c.range}
              </span>
              <span className={styles.catLabel}>{c.label}</span>
            </div>
          ))}
        </div>

        <div className={styles.timeNote}>
          <span style={{ color: "#f5a623" }}>⏱</span> Scores update across 4
          daily time slots
        </div>
      </div>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────── */
export default function HowItWorks({ onRateClick }) {
  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div className={styles.label}>Documentation</div>
        <h1 className={styles.title}>How SheTrust Works</h1>
        <p className={styles.sub}>
          A transparent breakdown of the technology, algorithms, and privacy
          design that power Bengaluru's first crowd-verified women's safety
          index.
        </p>
      </div>

      <div className={styles.content}>
        {/* ── STI Visual ── */}
        <div className={styles.block}>
          <div className={styles.blockTitleRow}>
            <h2 className={styles.blockTitle}>
              How the Safety Score is Calculated
            </h2>
            <span className={styles.blockBadge}>Algorithm</span>
          </div>
          <p className={styles.blockText}>
            Four weighted signals are crowd-sourced, decay-filtered through the
            Trust Reliability System, and fused into a single Safety Trust Index
            (STI) per location per time slot.
          </p>
          <STIFactors />
        </div>

        {/* ── TRS ── */}
        <div className={styles.block}>
          <div className={styles.blockTitleRow}>
            <h2 className={styles.blockTitle}>🛡 Trust Reliability Score</h2>
            <span className={styles.blockBadge}>Anti-Spam</span>
          </div>
          <p className={styles.blockText}>
            Every contribution matters, but consistency builds trust. Over time,
            reliable inputs have a greater impact on safety scores.
          </p>
          <ul className={styles.list}>
            <li>All users start with a neutral trust level</li>
            <li>Consistent and meaningful ratings increase influence</li>
            <li>Unusual or inconsistent inputs have less impact</li>
            <li>
              A minimum number of ratings is required before scores are shown
            </li>
          </ul>
        </div>

        {/* ── Time slots ── */}
        <div className={styles.block}>
          <div className={styles.blockTitleRow}>
            <h2 className={styles.blockTitle}>⏱ Time-Slot Granularity</h2>
            <span className={styles.blockBadge}>Time-aware</span>
          </div>
          <p className={styles.blockText}>
            Safety is not static. SheTrust maintains four independent STI scores
            per location:
          </p>
          <div className={styles.slotsGrid}>
            {[
              { icon: "🌅", label: "Morning", range: "6 AM – 12 PM" },
              { icon: "☀️", label: "Afternoon", range: "12 PM – 6 PM" },
              { icon: "🌆", label: "Evening", range: "6 PM – 9 PM" },
              { icon: "🌙", label: "Night", range: "9 PM – 6 AM" },
            ].map((s) => (
              <div key={s.label} className={styles.slotCard}>
                <div className={styles.slotIcon}>{s.icon}</div>
                <div className={styles.slotLabel}>{s.label}</div>
                <div className={styles.slotRange}>{s.range}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Privacy ── */}
        <div className={styles.block}>
          <div className={styles.blockTitleRow}>
            <h2 className={styles.blockTitle}>🔒 Privacy & Anonymity</h2>
            <span className={styles.blockBadge}>Zero Data</span>
          </div>
          <ul className={styles.list}>
            <li>No account, name, email, or phone number is required</li>
            <li>All contributions are completely anonymous</li>
            <li>Your data is securely handled and never shared</li>
            <li>No location is tracked unless you choose to share it</li>
          </ul>
        </div>

        {/* ── Phase 2 ── */}
        <div className={styles.block}>
          <div className={styles.blockTitleRow}>
            <h2 className={styles.blockTitle}>
              🚀 Phase 2: Crime Report Integration
            </h2>
            <span className={styles.blockBadge}>Coming Soon</span>
          </div>
          <p className={styles.blockText}>
            The Rating model includes a <code>crimeReportRef</code> field, and
            the STI engine is designed to accept external data sources. Planned
            integrations include Bengaluru Police FIR data and NCRB statistics,
            which will be weighted as an additional factor alongside
            crowd-sourced ratings.
          </p>
        </div>

        <div className={styles.ctaRow}>
          <button
            className="btn btn-primary"
            style={{ fontSize: "1rem", padding: "14px 28px" }}
            onClick={onRateClick}
          >
            📍 Rate a Location Now
          </button>
          <Link
            to="/map"
            className="btn btn-outline"
            style={{ fontSize: "1rem", padding: "14px 28px" }}
          >
            🗺 View Safety Map
          </Link>
        </div>
      </div>
    </div>
  );
}
