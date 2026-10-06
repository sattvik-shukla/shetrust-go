import React, { useState, useRef, useEffect } from 'react';

/* ── System prompt ─────────────────────────────────────────────────── */
const SYSTEM_PROMPT = `You are SheSafe, the AI safety companion for SheTrust — Bengaluru's crowd-sourced women's safety platform.

ABOUT SHETRUST:
- SheTrust crowdsources safety ratings from women across Bengaluru for public spaces
- Each location gets a Safety Trust Index (STI) score from 0–10, computed from 4 factors:
  • Street Lighting (30% weight) — quality of illumination
  • Crowd Behaviour (30% weight) — density and perceived safety of bystanders
  • Police / Security Visibility (20% weight) — law enforcement presence
  • Incident Reports (20% weight) — user-reported harassment or unsafe events
- Scores are time-aware across 4 daily slots: Morning (6AM–12PM), Afternoon (12PM–6PM), Evening (6PM–9PM), Night (9PM–6AM)
- STI categories: Safe (8–10 🟢), Moderate (5–7 🟡), Risky (0–4 🔴)
- Trust Reliability Score (TRS): ratings from consistent users are weighted higher
- The platform is fully anonymous — no sign-up, no personal data collected

YOUR ROLE:
- Help women navigate Bengaluru safely
- Answer questions about how the STI score works, what factors matter, how to read the map
- Give practical, empathetic safety tips for Bengaluru specifically (autos, metros, markets, late nights)
- Explain how to submit a rating and why it matters
- If asked about a specific location's score, acknowledge you'd need live data from the map
- Be warm, empowering, and non-alarmist — safety awareness without fear-mongering
- Keep responses concise and mobile-friendly (this is a floating chat widget)

BENGALURU SAFETY CONTEXT YOU KNOW:
- High-footfall safe areas generally: MG Road, Indiranagar, Koramangala, HSR Layout, Whitefield IT hubs
- Areas that need more caution at night: isolated stretches near Hebbal, some parts of Yeshwanthpur, poorly lit roads in the outer ring road zones
- Metro is generally considered safe with CCTV and security; women's coaches available
- Auto safety: prefer app-based autos (Namma Yatri, Rapido, Ola), share trip details
- Useful emergency: Women's helpline 1091, Police 100, Bengaluru Police app

TONE:
- Supportive and sisterly, not preachy
- Factual when explaining the algorithm
- Brief — aim for 2–4 sentences unless more detail is needed
- Use emojis sparingly but warmly`;

/* ── Typing indicator ───────────────────────────────────────────────── */
function TypingDots() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '10px 14px' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'rgba(230,59,111,0.6)',
          animation: `dotBounce 1.2s ${i * 0.2}s ease-in-out infinite`,
        }} />
      ))}
      <style>{`
        @keyframes dotBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

/* ── Message bubble ─────────────────────────────────────────────────── */
function Bubble({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: 10,
    }}>
      {!isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: 'linear-gradient(135deg, #e63b6f, #f5a623)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 13, marginRight: 8, alignSelf: 'flex-end',
        }}>🛡</div>
      )}
      <div style={{
        maxWidth: '78%',
        padding: '9px 13px',
        borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
        background: isUser
          ? 'linear-gradient(135deg, #e63b6f, #c42d5a)'
          : 'rgba(255,255,255,0.06)',
        border: isUser ? 'none' : '1px solid rgba(255,255,255,0.08)',
        color: '#f0ebf4',
        fontSize: '0.82rem',
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        {msg.content}
      </div>
    </div>
  );
}

/* ── Quick suggestion chips ─────────────────────────────────────────── */
const SUGGESTIONS = [
  'How is the STI score calculated?',
  'Is it safe to travel at night?',
  'How do I rate a location?',
  'What makes a place risky?',
];

/* ── Main chatbot component ─────────────────────────────────────────── */
export default function Chatbot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: "Hi! I'm SheSafe 🛡 — your AI safety companion for Bengaluru. Ask me anything about location safety scores, how SheTrust works, or tips for getting around safely.",
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  async function send(text) {
    const userText = (text || input).trim();
    if (!userText || loading) return;

    setInput('');
    setShowSuggestions(false);
    const newMessages = [...messages, { role: 'user', content: userText }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const apiBase = import.meta.env.VITE_API_URL || '/api';
      const res = await fetch(`${apiBase}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: SYSTEM_PROMPT,
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Server error');
      const reply = data.content?.find(b => b.type === 'text')?.text || 'Sorry, I couldn\'t get a response. Please try again.';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '⚠️ Couldn\'t connect to the AI right now. Make sure the backend server is running on port 5000, then try again.',
      }]);
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  }

  return (
    <>
      {/* ── Floating bubble button ── */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Open SheSafe AI assistant"
        style={{
          position: 'fixed', bottom: 108, right: 28, zIndex: 1000,
          width: 56, height: 56, borderRadius: '50%', border: 'none',
          background: open
            ? 'rgba(17,17,24,0.95)'
            : 'linear-gradient(135deg, #e63b6f, #c42d5a)',
          boxShadow: open
            ? '0 4px 20px rgba(0,0,0,0.4)'
            : '0 4px 20px rgba(230,59,111,0.5), 0 0 0 4px rgba(230,59,111,0.15)',
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22,
          transition: 'all 0.25s cubic-bezier(0.34,1.56,0.64,1)',
          transform: open ? 'rotate(0deg) scale(1)' : 'scale(1)',
        }}
      >
        {open ? '✕' : '🛡'}
      </button>

      {/* ── Chatbot label (shown when closed) ── */}
      {!open && (
        <div style={{
          position: 'fixed', bottom: 90, right: 28, zIndex: 1000,
          fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.05em',
          color: 'rgba(230,59,111,0.9)', textAlign: 'center',
          textTransform: 'uppercase', pointerEvents: 'none',
          textShadow: '0 1px 4px rgba(0,0,0,0.6)',
          width: 56,
        }}>AI Chat</div>
      )}

      {/* ── Unread dot (shown when closed) ── */}
      {!open && (
        <span style={{
          position: 'fixed', bottom: 158, right: 28, zIndex: 1001,
          width: 10, height: 10, borderRadius: '50%',
          background: '#22c55e',
          border: '2px solid #0d0d14',
          boxShadow: '0 0 6px #22c55e',
        }} />
      )}

      {/* ── Chat panel ── */}
      <div style={{
        position: 'fixed', bottom: 176, right: 28, zIndex: 999,
        width: 340, maxHeight: 520,
        background: '#111118',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 20,
        boxShadow: '0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(230,59,111,0.1)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        opacity: open ? 1 : 0,
        transform: open ? 'translateY(0) scale(1)' : 'translateY(16px) scale(0.96)',
        pointerEvents: open ? 'auto' : 'none',
        transition: 'opacity 0.22s ease, transform 0.22s cubic-bezier(0.34,1.2,0.64,1)',
      }}>

        {/* Header */}
        <div style={{
          padding: '14px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(230,59,111,0.06)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'linear-gradient(135deg, #e63b6f, #f5a623)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, flexShrink: 0,
          }}>🛡</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#f0ebf4' }}>SheSafe AI</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 1 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: '0.68rem', color: 'rgba(240,235,244,0.5)' }}>Your safety companion</span>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            style={{
              marginLeft: 'auto', background: 'none', border: 'none',
              color: 'rgba(240,235,244,0.4)', cursor: 'pointer', fontSize: 16,
              padding: 4, borderRadius: 6, lineHeight: 1,
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => e.target.style.color = '#f0ebf4'}
            onMouseLeave={e => e.target.style.color = 'rgba(240,235,244,0.4)'}
          >✕</button>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '14px 12px',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.1) transparent',
        }}>
          {messages.map((m, i) => <Bubble key={i} msg={m} />)}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, #e63b6f, #f5a623)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
              }}>🛡</div>
              <div style={{
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px 16px 16px 4px',
              }}>
                <TypingDots />
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Suggestion chips */}
        {showSuggestions && (
          <div style={{
            padding: '0 12px 10px',
            display: 'flex', flexWrap: 'wrap', gap: 6,
          }}>
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => send(s)} style={{
                background: 'rgba(230,59,111,0.08)',
                border: '1px solid rgba(230,59,111,0.22)',
                borderRadius: 99, padding: '4px 10px',
                fontSize: '0.7rem', color: 'rgba(240,235,244,0.75)',
                cursor: 'pointer', transition: 'all 0.15s',
                fontFamily: 'inherit',
              }}
                onMouseEnter={e => { e.target.style.background = 'rgba(230,59,111,0.16)'; e.target.style.color = '#f0ebf4'; }}
                onMouseLeave={e => { e.target.style.background = 'rgba(230,59,111,0.08)'; e.target.style.color = 'rgba(240,235,244,0.75)'; }}
              >{s}</button>
            ))}
          </div>
        )}

        {/* Input row */}
        <div style={{
          padding: '10px 12px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', gap: 8, flexShrink: 0,
          background: 'rgba(0,0,0,0.2)',
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about safety, scores, tips…"
            rows={1}
            style={{
              flex: 1, background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 12, padding: '8px 12px',
              color: '#f0ebf4', fontSize: '0.82rem',
              fontFamily: 'inherit', resize: 'none',
              outline: 'none', lineHeight: 1.5,
              maxHeight: 80, overflowY: 'auto',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => e.target.style.borderColor = 'rgba(230,59,111,0.5)'}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            style={{
              width: 36, height: 36, borderRadius: '50%', border: 'none',
              background: input.trim() && !loading
                ? 'linear-gradient(135deg, #e63b6f, #c42d5a)'
                : 'rgba(255,255,255,0.07)',
              color: input.trim() && !loading ? '#fff' : 'rgba(255,255,255,0.3)',
              cursor: input.trim() && !loading ? 'pointer' : 'default',
              fontSize: 16, flexShrink: 0, alignSelf: 'flex-end',
              transition: 'all 0.2s',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >↑</button>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </>
  );
}
