import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import STIBadge from "../components/STIBadge";
import { locationsApi } from "../utils/api";
import {
  getStiColor,
  TIME_SLOTS,
  locTypeIcon,
  fmtSTI,
  getCurrentSlot,
} from "../utils/helpers";
import styles from "./Home.module.css";
import STISection from "../components/STISection";

const STAT_CARDS = [
  { icon: "📍", num: "35+", label: "Bengaluru Locations" },
  { icon: "⏱", num: "4", label: "Time Slots per Location" },
  { icon: "🛡", num: "TRS", label: "Trust Reliability System" },
  { icon: "🔒", num: "0", label: "Personal Data Collected" },
];

const HOW_STEPS = [
  {
    icon: "📍",
    title: "Choose a Location",
    desc: "Search any public space in Bengaluru — metro stations, markets, parks, roads.",
  },
  {
    icon: "🔒",
    title: "Submit Anonymously",
    desc: "Rate lighting, crowd, police presence and incidents. No sign-up. No tracking.",
  },
  {
    icon: "⚙️",
    title: "STI is Computed",
    desc: "Our weighted algorithm fuses your rating with community data, filtered by trust scores.",
  },
  {
    icon: "🗺",
    title: "Heatmap Updates",
    desc: "The live safety map refreshes instantly, colour-coded from green (safe) to red (risky).",
  },
];

const STI_FACTORS = [
  {
    pct: "30%",
    label: "Street Lighting",
    icon: "💡",
    desc: "Quality of illumination at visit time",
  },
  {
    pct: "30%",
    label: "Crowd Behavior",
    icon: "👥",
    desc: "Density & perceived behavior of bystanders",
  },
  {
    pct: "20%",
    label: "Police Visibility",
    icon: "🚔",
    desc: "Law enforcement or security presence",
  },
  {
    pct: "20%",
    label: "Incident Reports",
    icon: "⚠️",
    desc: "User-reported harassment or unsafe events",
  },
];

export default function Home({ onRateClick, onSurveyClick }) {
  const [topLocations, setTopLocations] = useState([]);
  const [currentSlot] = useState(getCurrentSlot);

  useEffect(() => {
    locationsApi
      .getAll({ limit: 6, city: "Bengaluru" })
      .then((r) => setTopLocations(r.data.data || []))
      .catch(() => {});
  }, []);

  return (
    <div className={styles.page}>
      {/* ── Hero ───────────────────────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.heroBg} />
        <div className={styles.heroGrid} />

        <div className={styles.heroContent}>
          <div className={styles.heroBadge}>
            <span className={styles.heroBadgeDot} />
            Live · Bengaluru Safety Network
          </div>

          <h1 className={styles.heroTitle}>
            Real-time <em>Safety</em>
            <br />
            for Every Woman
          </h1>

          <p className={styles.heroSub}>
            SheTrust crowdsources safety perceptions from women across
            Bengaluru, building a live, time-aware Safety Trust Index for every
            public space — so you navigate with confidence, not fear.
          </p>

          <div className={styles.heroActions}>
            <Link to="/map" className="btn btn-primary">
              🗺 Explore Safety Map
            </Link>
            <button className="btn btn-outline" onClick={onRateClick}>
              📍 Rate a Location
            </button>
            <button className="btn btn-outline" onClick={onSurveyClick}>
              📋 Take Safety Survey
            </button>
          </div>

          {/* Stats row */}
          <div className={styles.statsRow}>
            {STAT_CARDS.map((s) => (
              <div key={s.label} className={styles.statCard}>
                <div className={styles.statIcon}>{s.icon}</div>
                <div className={styles.statNum}>{s.num}</div>
                <div className={styles.statLabel}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Hero visual — mini live snapshot */}
        <div className={styles.heroVisual}>
          <div className={styles.heroCard}>
            <div className={styles.heroCardHeader}>
              <span className={styles.heroCardTitle}>
                📍 Bengaluru · Live Safety
              </span>
              <span className={styles.heroPulse}>
                <span className={styles.heroPulseDot} />
                Live
              </span>
            </div>

            <div className={styles.heroSlots}>
              {TIME_SLOTS.map((ts) => (
                <div
                  key={ts.key}
                  className={`${styles.heroSlot} ${ts.key === currentSlot ? styles.heroSlotActive : ""}`}
                >
                  {ts.icon} {ts.label}
                  {ts.key === currentSlot && (
                    <span className={styles.nowBadge}>Now</span>
                  )}
                </div>
              ))}
            </div>

            <div className={styles.heroLocList}>
              {topLocations.slice(0, 5).map((loc) => {
                const s = loc.timeSlots?.find((x) => x.slot === currentSlot);
                return (
                  <div key={loc._id} className={styles.heroLocRow}>
                    <span>{locTypeIcon(loc.type)}</span>
                    <div className={styles.heroLocName}>{loc.name}</div>
                    <STIBadge
                      sti={s?.sti ?? null}
                      category={s?.category ?? "unrated"}
                      size="sm"
                    />
                  </div>
                );
              })}
              {topLocations.length === 0 && (
                <div
                  style={{
                    color: "var(--text-muted)",
                    fontSize: "0.8rem",
                    padding: "8px 0",
                  }}
                >
                  Connect backend to see live data
                </div>
              )}
            </div>

            <Link to="/map" className={`btn btn-primary ${styles.heroCardBtn}`}>
              View Full Safety Map →
            </Link>
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────── */}
      <section className={styles.howSection}>
        <div className={styles.sectionLabel}>Process</div>
        <h2 className={styles.sectionTitle}>How SheTrust Works</h2>
        <p className={styles.sectionSub}>
          A transparent, four-step pipeline from anonymous input to real-time
          safety intelligence.
        </p>

        <div className={styles.stepsGrid}>
          {HOW_STEPS.map((s, i) => (
            <div key={i} className={styles.stepCard}>
              <div className={styles.stepNum}>0{i + 1}</div>
              <div className={styles.stepIcon}>{s.icon}</div>
              <div className={styles.stepTitle}>{s.title}</div>
              <div className={styles.stepDesc}>{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── STI Formula ─────────────────────────────────────────────── */}
      <STISection />

      {/* ── Trust engine ────────────────────────────────────────────── */}
      <section className={styles.trustSection}>
        <div className={styles.sectionLabel}>Anti-Spam</div>
        <h2 className={styles.sectionTitle}>Trust Reliability Engine</h2>
        <p className={styles.sectionSub}>
          Not all votes are equal. Each user earns a Trust Reliability Score
          that weights their ratings based on consensus alignment.
        </p>

        <div className={styles.trustGrid}>
          {[
            {
              num: "1",
              title: "Neutral Start",
              desc: "All new users begin with TRS = 0.5 — contributions matter but carry moderate weight.",
            },
            {
              num: "2",
              title: "Consensus Builds Trust",
              desc: "Ratings that align with the crowd consensus increase your TRS over time.",
            },
            {
              num: "3",
              title: "Outliers Down-weighted",
              desc: "Submissions that deviate sharply from consensus receive reduced influence.",
            },
            {
              num: "4",
              title: "Min Vote Threshold",
              desc: "A location's STI is only published once enough ratings are collected per slot.",
            },
          ].map((s) => (
            <div key={s.num} className={styles.trustCard}>
              <div className={styles.trustNum}>{s.num}</div>
              <div className={styles.trustTitle}>{s.title}</div>
              <div className={styles.trustDesc}>{s.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────────── */}
      <section className={styles.ctaSection}>
        <h2 className={styles.ctaTitle}>
          Make Bengaluru Safer —<br />
          One Rating at a Time
        </h2>
        <p className={styles.ctaSub}>
          Every anonymous submission builds a more accurate safety map for every
          woman who follows.
        </p>
        <div className={styles.ctaActions}>
          <button
            className="btn btn-primary"
            style={{ fontSize: "1rem", padding: "14px 28px" }}
            onClick={onRateClick}
          >
            📍 Submit Your First Rating
          </button>
          <button
            className="btn btn-outline"
            style={{ fontSize: "1rem", padding: "14px 28px" }}
            onClick={onSurveyClick}
          >
            📋 Take Safety Survey
          </button>
          <Link
            to="/map"
            className="btn btn-outline"
            style={{ fontSize: "1rem", padding: "14px 28px" }}
          >
            🗺 Explore the Safety Map
          </Link>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className={styles.footer}>
        <div className={styles.footerLogo}>
          <span className={styles.footerDot} />
          SheTrust · Bengaluru
        </div>
        <div className={styles.footerLinks}>
          <Link to="/map">Safety Map</Link>
          <Link to="/how">How it Works</Link>
        </div>
        <div className={styles.footerNote}>
          Team Innovix
        </div>
      </footer>
    </div>
  );
}
