/**
 * AdminDashboard v2
 * Tabs: Overview (stats + live feed + incident breakdown chart)
 *       Pending locations (approve/reject queue)
 *       Flagged raters (unflag / block)
 *       Incidents (moderate, filter by severity/type, STI override)
 *       NLP feed (latest AI-analysed comments)
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import styles from './AdminDashboard.module.css';

// ── Tiny bar chart (no lib) ───────────────────────────────────────────
function BarChart({ data }) {
  if (!data?.length) return <div className={styles.empty}>No incident data yet</div>;
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className={styles.barChart}>
      {data.map(item => (
        <div key={item._id} className={styles.barRow}>
          <div className={styles.barLabel}>{item._id?.replace(/_/g, ' ')}</div>
          <div className={styles.barTrack}>
            <div className={styles.barFill} style={{ width: `${(item.count / max) * 100}%` }} />
          </div>
          <div className={styles.barCount}>{item.count}</div>
        </div>
      ))}
    </div>
  );
}

// ── STI trend sparkline ───────────────────────────────────────────────
function Sparkline({ data, color = '#E63B6F' }) {
  if (!data?.length) return null;
  const values = data.map(d => d.sti).filter(v => v !== null);
  if (!values.length) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const W = 120, H = 32;
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * W,
    y: H - ((v - min) / range) * H,
  }));
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  return (
    <svg width={W} height={H} style={{ display: 'block' }}>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────
function Stat({ icon, value, label, color, delta }) {
  return (
    <div className={styles.statCard} style={{ borderColor: color + '33' }}>
      <div className={styles.statIcon}>{icon}</div>
      <div className={styles.statVal} style={{ color }}>{value ?? '—'}</div>
      {delta !== undefined && (
        <div className={styles.statDelta} style={{ color: delta >= 0 ? '#22C55E' : '#EF4444' }}>
          {delta >= 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)}
        </div>
      )}
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

const SEV_COLOR = { high: '#EF4444', critical: '#B91C1C', medium: '#F59E0B', low: '#22C55E', pending: '#6B7280' };
const SEV_EMOJI = { critical: '🆘', high: '🔴', medium: '🟡', low: '🟢' };
const INC_EMOJI = { harassment:'😰', stalking:'👁️', theft:'🔓', assault:'⚠️', unsafe_lighting:'💡', unsafe_crowd:'👥', infrastructure:'🏗️', suspicious_person:'🕵️', other:'📋' };

export default function AdminDashboard() {
  const { user } = useAuth() || {};
  const [tab, setTab]   = useState('overview');
  const [stats, setStats]     = useState(null);
  const [pending, setPending] = useState([]);
  const [flagged, setFlagged] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [nlpFeed, setNlpFeed]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [flash, setFlash]     = useState('');
  const [stiOverride, setStiOverride] = useState({ locId: null, slot: 'evening', val: 5 });
  const [incFilter, setIncFilter]     = useState({ severity: '', type: '', status: 'pending' });
  const liveRef  = useRef([]);

  const isAdmin = user?.role === 'admin' || user?.role === 'moderator';

  const msg = (m) => { setFlash(m); setTimeout(() => setFlash(''), 3500); };

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const [st, pe, fl, inc, nlp] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/locations/pending'),
        api.get('/admin/users/flagged'),
        api.get(`/admin/ratings/incidents?severity=${incFilter.severity}&type=${incFilter.type}`),
        api.get('/admin/ratings/incidents?severity=high'),
      ]);
      setStats(st.data.data);
      setPending(pe.data.data || []);
      setFlagged(fl.data.data || []);
      setIncidents(inc.data.data || []);
      setNlpFeed(nlp.data.data?.slice(0, 15) || []);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load admin data');
    } finally { setLoading(false); }
  }, [isAdmin, incFilter.severity, incFilter.type]);

  useEffect(() => { load(); }, [load]);

  // Approve location
  const approve = async (id) => {
    try { await api.put(`/admin/locations/${id}/approve`); setPending(p => p.filter(l => l._id !== id)); msg('✅ Location approved'); }
    catch (e) { msg('❌ ' + (e.response?.data?.error || 'Failed')); }
  };
  const reject = async (id) => {
    if (!window.confirm('Delete this location permanently?')) return;
    try { await api.delete(`/admin/locations/${id}`); setPending(p => p.filter(l => l._id !== id)); msg('🗑️ Location removed'); }
    catch (_) { msg('❌ Failed'); }
  };

  // Flag/unflag user
  const unflag = async (tokenHash) => {
    try { await api.put(`/admin/users/${tokenHash}/unflag`); setFlagged(f => f.filter(u => u.tokenHash !== tokenHash)); msg('✅ User unflagged + TRS reset'); }
    catch (_) { msg('❌ Failed'); }
  };
  const block = async (tokenHash) => {
    try { await api.put(`/admin/users/${tokenHash}/block`, { reason: 'Admin block' }); setFlagged(f => f.map(u => u.tokenHash === tokenHash ? { ...u, trs: 0.1 } : u)); msg('🔒 User blocked, ratings excluded'); }
    catch (_) { msg('❌ Failed'); }
  };

  // Moderate incident
  const moderate = async (id, status, note) => {
    try {
      await api.put(`/incidents/${id}/moderate`, { status, moderatorNote: note });
      setIncidents(prev => prev.map(i => i._id === id ? { ...i, status } : i));
      msg(`✅ Incident marked as ${status}`);
    } catch (_) { msg('❌ Failed'); }
  };

  // STI override
  const doOverride = async (locId) => {
    try {
      await api.put(`/admin/locations/${locId}/sti-override`, { timeSlot: stiOverride.slot, sti: stiOverride.val });
      msg(`✅ STI overridden to ${stiOverride.val} for ${stiOverride.slot}`);
      setStiOverride(o => ({ ...o, locId: null }));
    } catch (_) { msg('❌ Override failed'); }
  };

  if (!isAdmin) {
    return (
      <div className={styles.denied}>
        <div className={styles.deniedIcon}>🔒</div>
        <h2 className={styles.deniedTitle}>Access Restricted</h2>
        <p className={styles.deniedSub}>Moderator or admin role required.</p>
        <Link to="/" className="btn btn-primary">Go Home</Link>
      </div>
    );
  }
  if (loading) return <div className={styles.loading}>Loading admin data…</div>;
  if (error)   return <div className={styles.error}>{error} <button onClick={load}>Retry</button></div>;

  const TABS = [
    { key: 'overview',  label: `📊 Overview` },
    { key: 'pending',   label: `⏳ Locations (${pending.length})` },
    { key: 'flagged',   label: `🚩 Raters (${flagged.length})` },
    { key: 'incidents', label: `🚨 Incidents (${incidents.length})` },
    { key: 'nlp',       label: `🧠 NLP Feed` },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <div className={styles.pageTitle}>🛡️ SheTrust Admin</div>
          <div className={styles.pageSub}>{user?.name} · {user?.role}</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load}>↻ Refresh</button>
      </div>

      {flash && <div className={styles.flash}>{flash}</div>}

      {/* Stats row */}
      {stats && (
        <div className={styles.statsRow}>
          <Stat icon="📍" value={stats.totalLocations}  label="Locations"        color="#22C55E" />
          <Stat icon="⏳" value={stats.pendingLocations} label="Pending approval"  color="#F59E0B" />
          <Stat icon="⭐" value={stats.totalRatings}     label="Total ratings"     color="#3B82F6" />
          <Stat icon="🚩" value={stats.flaggedUsers}     label="Flagged raters"    color="#EF4444" />
          <Stat icon="👤" value={stats.totalUsers}       label="Registered users"  color="#8B5CF6" />
        </div>
      )}

      <div className={styles.tabs}>
        {TABS.map(t => (
          <button key={t.key} className={`${styles.tab} ${tab === t.key ? styles.tabActive : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview ────────────────────────────────────────────────── */}
      {tab === 'overview' && stats && (
        <div className={styles.twoCol}>
          <div className={styles.card}>
            <div className={styles.cardTitle}>Recent Ratings</div>
            {(stats.recentRatings || []).slice(0, 8).map((r, i) => (
              <div key={i} className={styles.actRow}>
                <span className={styles.actLoc}>{r.locationId?.name || '—'}</span>
                <span className={styles.actSlot}>{r.timeSlot}</span>
                <span className={styles.actSTI}>STI {r.rawSTI?.toFixed(1) ?? '—'}</span>
                {r.nlpAnalysis?.severity && (
                  <span className={styles.sevPill} style={{ background: SEV_COLOR[r.nlpAnalysis.severity] + '22', color: SEV_COLOR[r.nlpAnalysis.severity] }}>
                    {r.nlpAnalysis.severity}
                  </span>
                )}
              </div>
            ))}
          </div>

          <div className={styles.card}>
            <div className={styles.cardTitle}>Incident Breakdown (NLP)</div>
            <BarChart data={stats.incidentBreakdown} />
          </div>
        </div>
      )}

      {/* ── Pending locations ────────────────────────────────────────── */}
      {tab === 'pending' && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>Locations awaiting approval ({pending.length})</div>
          {pending.length === 0 && <div className={styles.empty}>No pending locations 🎉</div>}
          {pending.map(loc => (
            <div key={loc._id} className={styles.locRow}>
              <div className={styles.locInfo}>
                <div className={styles.locName}>{loc.name}</div>
                <div className={styles.locMeta}>{loc.area} · {loc.type} · [{loc.location?.coordinates?.[1]?.toFixed(4)}, {loc.location?.coordinates?.[0]?.toFixed(4)}]</div>
              </div>
              <div className={styles.locActions}>
                <button className={styles.approveBtn} onClick={() => approve(loc._id)}>✅ Approve</button>
                <button className={styles.rejectBtn}  onClick={() => reject(loc._id)}>🗑️ Remove</button>
                {stiOverride.locId !== loc._id ? (
                  <button className={styles.overrideBtn} onClick={() => setStiOverride(o => ({ ...o, locId: loc._id }))}>⚙️ STI</button>
                ) : (
                  <div className={styles.overrideForm}>
                    <select value={stiOverride.slot} onChange={e => setStiOverride(o => ({ ...o, slot: e.target.value }))}>
                      {['morning','afternoon','evening','night'].map(s => <option key={s}>{s}</option>)}
                    </select>
                    <input type="number" min="0" max="10" step="0.1" value={stiOverride.val}
                      onChange={e => setStiOverride(o => ({ ...o, val: parseFloat(e.target.value) }))}
                      className={styles.stiInput}
                    />
                    <button className={styles.approveBtn} onClick={() => doOverride(loc._id)}>Set</button>
                    <button className={styles.rejectBtn}  onClick={() => setStiOverride(o => ({ ...o, locId: null }))}>✕</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Flagged raters ───────────────────────────────────────────── */}
      {tab === 'flagged' && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>Flagged raters — TRS &lt; 0.3</div>
          {flagged.length === 0 && <div className={styles.empty}>No flagged users 🎉</div>}
          {flagged.map(u => (
            <div key={u.tokenHash} className={styles.userRow}>
              <div className={styles.userInfo}>
                <div className={styles.userToken}>{u.tokenHash.slice(0,16)}…</div>
                <div className={styles.userMeta}>
                  TRS: <strong style={{ color: u.trs < 0.3 ? '#EF4444' : '#F59E0B' }}>{u.trs?.toFixed(2)}</strong>
                  {' · '}{u.totalRatings} ratings · {u.flaggedRatings} flagged
                  {u.flagReason && <> · <em>{u.flagReason}</em></>}
                </div>
              </div>
              <div className={styles.locActions}>
                <button className={styles.approveBtn} onClick={() => unflag(u.tokenHash)}>✅ Unflag</button>
                {user?.role === 'admin' && (
                  <button className={styles.rejectBtn} onClick={() => block(u.tokenHash)}>🔒 Block</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Incidents ────────────────────────────────────────────────── */}
      {tab === 'incidents' && (
        <div className={styles.card}>
          <div className={styles.filterBar}>
            <select className={styles.filterSelect} value={incFilter.severity}
              onChange={e => setIncFilter(f => ({ ...f, severity: e.target.value }))}>
              <option value="">All severities</option>
              {['low','medium','high','critical'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className={styles.filterSelect} value={incFilter.type}
              onChange={e => setIncFilter(f => ({ ...f, type: e.target.value }))}>
              <option value="">All types</option>
              {Object.keys(INC_EMOJI).map(k => <option key={k} value={k}>{k.replace(/_/g,' ')}</option>)}
            </select>
            <button className="btn btn-ghost btn-sm" onClick={load}>Apply</button>
          </div>

          {incidents.length === 0 && <div className={styles.empty}>No incidents match the filter</div>}
          {incidents.map(inc => (
            <div key={inc._id} className={styles.incCard}
              style={{ borderLeft: `3px solid ${SEV_COLOR[inc.severity] || '#6B7280'}` }}>
              <div className={styles.incHeader}>
                <span className={styles.incType}>
                  {INC_EMOJI[inc.type] || '⚠️'} {inc.type?.replace(/_/g,' ')}
                </span>
                <span className={styles.sevPill} style={{ background: SEV_COLOR[inc.severity] + '22', color: SEV_COLOR[inc.severity] }}>
                  {inc.severity}
                </span>
                <span className={styles.incSlot}>{inc.timeSlot}</span>
                <span className={`${styles.statusPill} ${styles['status_' + inc.status]}`}>{inc.status}</span>
              </div>
              <div className={styles.incLoc}>📍 {inc.locationId?.name}, {inc.locationId?.area}</div>
              <div className={styles.incDesc}>"{inc.description?.slice(0, 200)}{inc.description?.length > 200 ? '…' : ''}"</div>
              {inc.policeReportRef?.refNumber && (
                <div className={styles.policeRef}>🚔 FIR: {inc.policeReportRef.refNumber} · {inc.policeReportRef.station}</div>
              )}
              {inc.photos?.length > 0 && <div className={styles.photoCount}>📷 {inc.photos.length} photo(s)</div>}
              {inc.nlpTags?.length > 0 && (
                <div className={styles.nlpTagsRow}>
                  {inc.nlpTags.map(t => <span key={t} className={styles.nlpTag}>{t.replace(/_/g,' ')}</span>)}
                </div>
              )}
              {inc.status === 'pending' && (
                <div className={styles.incActions}>
                  <button className={styles.approveBtn} onClick={() => moderate(inc._id, 'verified')}>✅ Verify</button>
                  <button className={styles.rejectBtn}  onClick={() => moderate(inc._id, 'rejected')}>❌ Reject</button>
                  {inc.severity !== 'critical' && (
                    <button className={styles.overrideBtn} onClick={() => moderate(inc._id, 'escalated')}>🆘 Escalate</button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── NLP Feed ─────────────────────────────────────────────────── */}
      {tab === 'nlp' && (
        <div className={styles.card}>
          <div className={styles.cardTitle}>🧠 AI-analysed comments (high severity)</div>
          <div className={styles.nlpLegend}>
            <span style={{color:'#22C55E'}}>● positive</span>
            <span style={{color:'#6B7280'}}>● neutral</span>
            <span style={{color:'#EF4444'}}>● negative</span>
          </div>
          {nlpFeed.length === 0 && <div className={styles.empty}>No NLP-processed ratings yet. Comments are analysed after submission.</div>}
          {nlpFeed.map((r, i) => (
            <div key={i} className={styles.nlpCard}>
              <div className={styles.nlpHeader}>
                <span className={styles.nlpSentDot} style={{ background: r.nlpAnalysis?.sentiment === 'positive' ? '#22C55E' : r.nlpAnalysis?.sentiment === 'negative' ? '#EF4444' : '#6B7280' }} />
                <span className={styles.nlpType}>{INC_EMOJI[r.nlpAnalysis?.incidentType] || '💬'} {r.nlpAnalysis?.incidentType?.replace(/_/g,' ') || 'unclassified'}</span>
                {r.nlpAnalysis?.severity && (
                  <span className={styles.sevPill} style={{ background: SEV_COLOR[r.nlpAnalysis.severity] + '22', color: SEV_COLOR[r.nlpAnalysis.severity] }}>
                    {r.nlpAnalysis.severity}
                  </span>
                )}
                <span className={styles.incSlot}>{r.locationId?.name} · {r.timeSlot}</span>
              </div>
              <div className={styles.nlpComment}>"{r.comment}"</div>
              {r.nlpAnalysis?.tags?.length > 0 && (
                <div className={styles.nlpTagsRow}>
                  {r.nlpAnalysis.tags.map(t => <span key={t} className={styles.nlpTag}>{t.replace(/_/g,' ')}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
