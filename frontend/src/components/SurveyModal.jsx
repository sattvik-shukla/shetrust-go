import React, { useState, useEffect } from 'react';
import { useLocationSearch } from '../hooks/useLocations';
import { surveyApi } from '../utils/api';
import { TIME_SLOTS, locTypeIcon, getCurrentSlot } from '../utils/helpers';
import styles from './SurveyModal.module.css';

const SURVEY_FIELDS = [
  { key: 'lighting',          label: 'Street Lighting',       icon: '💡', hint: '1 = pitch dark · 10 = bright as day' },
  { key: 'crowdDensity',      label: 'Crowd Density',         icon: '👥', hint: '1 = deserted · 10 = very crowded & safe' },
  { key: 'publicTransport',   label: 'Public Transport',      icon: '🚌', hint: '1 = none available · 10 = excellent access' },
  { key: 'incidentFrequency', label: 'Incident Frequency',    icon: '⚠️', hint: '0 = never · 10 = very frequent' },
  { key: 'overallRating',     label: 'Overall Safety Rating', icon: '⭐', hint: '1 = very unsafe · 10 = extremely safe' },
];

const DEFAULT_VALUES = {
  lighting: 5,
  crowdDensity: 5,
  publicTransport: 5,
  incidentFrequency: 3,
  overallRating: 5,
};

export default function SurveyModal({ isOpen, onClose }) {
  const [step, setStep]               = useState(1);
  const [location, setLocation]       = useState(null);
  const [timeSlot, setTimeSlot]       = useState(getCurrentSlot());
  const [values, setValues]           = useState(DEFAULT_VALUES);
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState(null);
  const [weights, setWeights]         = useState(null);
  const [loadingWeights, setLoadingWeights] = useState(false);

  const { query, setQuery, results, searching, clearResults } = useLocationSearch();

  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => {
        setStep(1);
        setLocation(null);
        setValues(DEFAULT_VALUES);
        setError(null);
        setWeights(null);
        setTimeSlot(getCurrentSlot());
      }, 300);
    }
  }, [isOpen]);

  const selectLocation = (loc) => {
    setLocation(loc);
    setQuery('');
    clearResults();
    setStep(2);
  };

  const setValue = (key, val) => {
    setValues(prev => ({ ...prev, [key]: Number(val) }));
  };

  const handleSubmit = async () => {
    if (!location?._id) return;
    setSubmitting(true);
    setError(null);
    try {
      await surveyApi.submit({
        locationId: location._id,
        timeSlot,
        ...values,
      });
      // After submission, fetch updated weights
      setLoadingWeights(true);
      try {
        const wRes = await surveyApi.getWeights();
        setWeights(wRes.data.data);
      } catch {
        // non-critical
      }
      setLoadingWeights(false);
      setStep(3);
    } catch (err) {
      const msg = err.response?.data?.error || 'Submission failed. Please try again.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.modalTitle}>
              {step === 1 ? '📋 Safety Survey' : step === 2 ? '📊 Rate Safety Factors' : '✅ Survey Submitted!'}
            </div>
            <div className={styles.modalSub}>
              {step === 1 && 'Help us optimize safety weights — pick a location'}
              {step === 2 && location && `${locTypeIcon(location.type)} ${location.name} · ${location.area || ''}`}
              {step === 3 && 'Thank you for contributing to smarter safety analysis.'}
            </div>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose}>✕</button>
        </div>

        {/* Step indicator */}
        {step < 3 && (
          <div className={styles.steps}>
            {[1, 2].map(s => (
              <div key={s} className={`${styles.stepDot} ${step >= s ? styles.stepActive : ''}`}>
                {s < step ? '✓' : s}
              </div>
            ))}
            <div className={`${styles.stepLine} ${step >= 2 ? styles.stepLineFill : ''}`} />
          </div>
        )}

        {/* Step 1: Location search */}
        {step === 1 && (
          <div className={styles.body}>
            <input
              className="input"
              placeholder="Search: MG Road, Koramangala, Whitefield…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              autoFocus
            />
            {searching && <div className={styles.searching}>Searching…</div>}
            {results.length > 0 && (
              <div className={styles.results}>
                {results.map(loc => (
                  <button key={loc._id} className={styles.resultItem} onClick={() => selectLocation(loc)}>
                    <span>{locTypeIcon(loc.type)}</span>
                    <div>
                      <div className={styles.resultName}>{loc.name}</div>
                      <div className={styles.resultArea}>{loc.area}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
            {query.length < 2 && (
              <div className={styles.hint}>
                This survey helps our ML model learn optimal safety weights from your experience.
                Type at least 2 characters to search.
              </div>
            )}
          </div>
        )}

        {/* Step 2: Survey factors */}
        {step === 2 && (
          <div className={styles.body}>
            {/* Time slot */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Time Slot</label>
              <div className={styles.slotGrid}>
                {TIME_SLOTS.map(ts => (
                  <button
                    key={ts.key}
                    className={`${styles.slotBtn} ${timeSlot === ts.key ? styles.slotActive : ''}`}
                    onClick={() => setTimeSlot(ts.key)}
                  >
                    <span className={styles.slotIcon}>{ts.icon}</span>
                    <span>{ts.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Factor sliders */}
            {SURVEY_FIELDS.map(f => (
              <div key={f.key} className={styles.fieldGroup}>
                <div className={styles.sliderHeader}>
                  <label className={styles.fieldLabel}>
                    {f.icon} {f.label}
                  </label>
                  <span className={styles.sliderVal}>{values[f.key]}/10</span>
                </div>
                <input
                  type="range" min={f.key === 'incidentFrequency' ? '0' : '1'} max="10" step="1"
                  value={values[f.key]}
                  onChange={e => setValue(f.key, e.target.value)}
                />
                <div className={styles.sliderHint}>{f.hint}</div>
              </div>
            ))}

            {error && <div className={styles.error}>{error}</div>}

            <div className={styles.submitRow}>
              <button className="btn btn-outline" onClick={() => setStep(1)}>← Back</button>
              <button
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={submitting}
                style={{ flex: 1 }}
              >
                {submitting ? '⏳ Submitting…' : '📊 Submit Survey'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Success + weights */}
        {step === 3 && (
          <div className={`${styles.body} ${styles.successBody}`}>
            <div className={styles.successIcon}>📊</div>
            <div className={styles.successTitle}>Survey Recorded!</div>
            <div className={styles.successSub}>
              Your feedback for <strong>{location?.name}</strong> will help optimize our Safety Trust Index formula.
            </div>

            {loadingWeights && <div className={styles.weightsLoading}>Computing optimal weights…</div>}

            {weights && (
              <div className={styles.weightsCard}>
                <div className={styles.weightsTitle}>
                  {weights.fallback ? '📐 Default STI Weights' : '🧠 ML-Optimized Weights'}
                </div>
                <div className={styles.weightsGrid}>
                  <div className={styles.weightItem}>
                    <span className={styles.weightIcon}>💡</span>
                    <span className={styles.weightLabel}>Lighting</span>
                    <span className={styles.weightVal}>{(weights.weights.lighting * 100).toFixed(0)}%</span>
                  </div>
                  <div className={styles.weightItem}>
                    <span className={styles.weightIcon}>👥</span>
                    <span className={styles.weightLabel}>Crowd</span>
                    <span className={styles.weightVal}>{(weights.weights.crowd * 100).toFixed(0)}%</span>
                  </div>
                  <div className={styles.weightItem}>
                    <span className={styles.weightIcon}>🚌</span>
                    <span className={styles.weightLabel}>Transport</span>
                    <span className={styles.weightVal}>{(weights.weights.transport * 100).toFixed(0)}%</span>
                  </div>
                  <div className={styles.weightItem}>
                    <span className={styles.weightIcon}>⚠️</span>
                    <span className={styles.weightLabel}>Incidents</span>
                    <span className={styles.weightVal}>{(weights.weights.incident * 100).toFixed(0)}%</span>
                  </div>
                </div>
                {weights.formula && (
                  <div className={styles.formula}>{weights.formula}</div>
                )}
                {weights.r2 !== null && weights.r2 !== undefined && (
                  <div className={styles.r2}>R² = {weights.r2} · {weights.sampleSize} surveys</div>
                )}
                <div className={styles.weightsNote}>{weights.message}</div>
              </div>
            )}

            <div className={styles.successActions}>
              <button className="btn btn-primary" onClick={() => { setStep(1); setLocation(null); setValues(DEFAULT_VALUES); setWeights(null); }}>
                Submit Another Survey
              </button>
              <button className="btn btn-ghost" onClick={onClose}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
