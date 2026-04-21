import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Phone, BarChart3, Settings as SettingsIcon, KeyRound, CheckCircle2,
  ArrowRight, Sparkles, TrendingUp, MessageSquare, DollarSign,
  PhoneCall, Plus, ChevronRight, Activity,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useKeys } from '../lib/keys';
import { useCalls } from '../lib/calls';
import { useTrial } from '../lib/trial';
import { SUPABASE_MODE } from '../lib/supabase';

// Page. Only ever rendered for authenticated users (route is protected).
export default function Overview() {
  return <Dashboard />;
}

// ─────────────────────────────────────────────────────────────
// Authenticated dashboard
// ─────────────────────────────────────────────────────────────
function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { keys, hasAllRequired, missing } = useKeys();
  const { calls, loading } = useCalls();
  const { status: trial } = useTrial();
  // A trial-active user counts as "ready to call" even without their own keys
  const onTrial = trial.trialActive && trial.remaining > 0;
  const canCall = hasAllRequired || onTrial;

  // Derived metrics from the user's own calls
  const metrics = useMemo(() => {
    if (!calls.length) {
      return { total: 0, converted: 0, conversionRate: 0, avgSentiment: 0, revenue: 0 };
    }
    const total = calls.length;
    const converted = calls.filter(c => c.outcome === 'converted').length;
    const conversionRate = Math.round((converted / total) * 100);
    const sentiments = calls
      .map(c => parseFloat(c.sentiment))
      .filter(n => !Number.isNaN(n));
    const avgSentiment = sentiments.length
      ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length
      : 0;
    // revenue_added looks like "+$30/mo" or "$0"
    const revenue = calls.reduce((sum, c) => {
      const m = (c.revenue_added || '').match(/(\d+(\.\d+)?)/);
      return sum + (m ? parseFloat(m[1]) : 0);
    }, 0);
    return { total, converted, conversionRate, avgSentiment, revenue };
  }, [calls]);

  const recent = calls.slice(0, 5);
  const firstName = user?.workspaceName?.split(' ')[0] || user?.email?.split('@')[0] || 'there';

  // Setup checklist
  const checklist = [
    { id: 'account', label: 'Account created', done: true },
    { id: 'keys', label: hasAllRequired ? 'API keys configured' : `Add ${missing.length} API key${missing.length === 1 ? '' : 's'}`, done: hasAllRequired, action: () => navigate('/settings') },
    { id: 'firstcall', label: calls.length ? 'First call recorded' : 'Run your first call', done: calls.length > 0, action: () => navigate('/live-call') },
  ];
  const checklistComplete = checklist.every(c => c.done);

  return (
    <div className="dash-page">
      {/* ── Greeting strip ─────────────────────────────── */}
      <div className="dash-greeting">
        <div>
          <p className="dash-eyebrow">
            <Sparkles size={11} /> Workspace
          </p>
          <h1 className="dash-title">Good to see you, {firstName}.</h1>
          <p className="dash-sub">
            {hasAllRequired
              ? 'Your AI agent is live. Launch a call and watch Aria detect the Gratitude Window in real time.'
              : onTrial
                ? `You have ${trial.remaining} free call${trial.remaining === 1 ? '' : 's'} left. Add your own API keys anytime in Settings to keep going.`
                : 'You\'re one step away from going live. Finish setup to start detecting Gratitude Windows.'}
          </p>
        </div>
        <div className="dash-status-row">
          {hasAllRequired ? (
            <span className="dash-pill is-ok">
              <span className="dash-dot" /> Activated
            </span>
          ) : onTrial ? (
            <span className="dash-pill is-trial">
              <span className="dash-dot" /> Free trial · {trial.remaining}/{trial.limit} calls left
            </span>
          ) : trial.trialActive && trial.remaining === 0 ? (
            <span className="dash-pill is-warn">
              <span className="dash-dot" /> Trial used. Add your keys to continue
            </span>
          ) : (
            <span className="dash-pill is-warn">
              <span className="dash-dot" /> {missing.length} key{missing.length === 1 ? '' : 's'} missing
            </span>
          )}
          <span className="dash-pill is-muted">
            {SUPABASE_MODE === 'cloud' ? 'Cloud workspace' : 'Local demo mode'}
          </span>
        </div>
      </div>

      {/* ── Quick action cards ─────────────────────────── */}
      <div className="dash-actions">
        <button
          className="dash-action dash-action-primary"
          onClick={() => navigate(canCall ? '/live-call' : '/settings')}
        >
          <div className="dash-action-icon"><PhoneCall size={18} /></div>
          <div className="dash-action-body">
            <p className="dash-action-title">{canCall ? 'Start a live call' : 'Add your API keys'}</p>
            <p className="dash-action-sub">
              {hasAllRequired
                ? 'Pick a customer, run a simulation'
                : onTrial
                  ? `${trial.remaining} free call${trial.remaining === 1 ? '' : 's'} on the house`
                  : `Configure ${missing.join(', ')}`}
            </p>
          </div>
          <ArrowRight size={16} className="dash-action-arrow" />
        </button>

        <button className="dash-action" onClick={() => navigate('/analytics')}>
          <div className="dash-action-icon"><BarChart3 size={18} /></div>
          <div className="dash-action-body">
            <p className="dash-action-title">View analytics</p>
            <p className="dash-action-sub">{calls.length ? `${calls.length} call${calls.length === 1 ? '' : 's'} on record` : 'Empty. Run a call first'}</p>
          </div>
          <ArrowRight size={16} className="dash-action-arrow" />
        </button>

        <button className="dash-action" onClick={() => navigate('/settings')}>
          <div className="dash-action-icon"><SettingsIcon size={18} /></div>
          <div className="dash-action-body">
            <p className="dash-action-title">Workspace settings</p>
            <p className="dash-action-sub">Profile, API keys, history</p>
          </div>
          <ArrowRight size={16} className="dash-action-arrow" />
        </button>
      </div>

      {/* ── KPI tiles ──────────────────────────────────── */}
      <div className="dash-kpi-grid">
        <KpiTile icon={<PhoneCall size={14} />} label="Total calls" value={String(metrics.total)} hint={loading ? 'loading…' : 'Lifetime sessions'} />
        <KpiTile icon={<TrendingUp size={14} />} label="Conversion rate" value={metrics.total ? `${metrics.conversionRate}%` : '-'} hint={metrics.total ? `${metrics.converted}/${metrics.total} converted` : 'No data yet'} />
        <KpiTile icon={<MessageSquare size={14} />} label="Avg sentiment" value={metrics.total ? (metrics.avgSentiment >= 0 ? '+' : '') + metrics.avgSentiment.toFixed(2) : '-'} hint={metrics.total ? 'Across all calls' : 'No data yet'} positive={metrics.avgSentiment > 0.2} />
        <KpiTile icon={<DollarSign size={14} />} label="Revenue added" value={metrics.revenue ? `$${metrics.revenue}/mo` : '$0'} hint={metrics.converted ? `${metrics.converted} upgrade${metrics.converted === 1 ? '' : 's'}` : 'No conversions yet'} />
      </div>

      {/* ── Lower split: Recent calls + Setup card ─────── */}
      <div className="dash-lower">
        <div className="dash-recent">
          <div className="dash-card-header">
            <div>
              <p className="dash-card-eyebrow"><Activity size={11} /> Recent activity</p>
              <h3 className="dash-card-title">Latest calls</h3>
            </div>
            {recent.length > 0 && (
              <button className="dash-link" onClick={() => navigate('/analytics')}>
                View all <ChevronRight size={13} />
              </button>
            )}
          </div>

          {loading ? (
            <div className="dash-empty">
              <div className="dash-spinner" />
              <p>Loading your calls…</p>
            </div>
          ) : recent.length === 0 ? (
            <div className="dash-empty">
              <div className="dash-empty-icon"><Phone size={22} /></div>
              <p className="dash-empty-title">No calls yet</p>
              <p className="dash-empty-sub">Run your first simulation to populate this list.</p>
              <button
                onClick={() => navigate(canCall ? '/live-call' : '/settings')}
                className="dash-empty-cta"
              >
                <Plus size={14} /> {canCall ? 'Start your first call' : 'Add keys to start'}
              </button>
            </div>
          ) : (
            <ul className="dash-call-list">
              {recent.map(c => {
                const sentNum = parseFloat(c.sentiment);
                const sentColor = Number.isNaN(sentNum) ? '#A1A1A6' : sentNum > 0.2 ? '#30D158' : sentNum < -0.1 ? '#FF453A' : '#F5F5F7';
                return (
                  <li
                    key={c.id}
                    className="dash-call-row"
                    onClick={() => navigate('/analytics')}
                  >
                    <div className="dash-call-avatar">
                      {(c.customer || '?').split(' ').map(n => n[0]).slice(0, 2).join('')}
                    </div>
                    <div className="dash-call-main">
                      <p className="dash-call-name">{c.customer}</p>
                      <p className="dash-call-meta">{c.issue} · {c.duration}</p>
                    </div>
                    <div className="dash-call-side">
                      <span className="dash-call-sent" style={{ color: sentColor }}>{c.sentiment}</span>
                      <span className={`dash-call-outcome ${c.outcome === 'converted' ? 'is-converted' : 'is-missed'}`}>
                        {c.outcome === 'converted' ? 'Converted' : 'Missed'}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="dash-side">
          {/* Setup checklist (only if incomplete OR onboarding still useful) */}
          {!checklistComplete ? (
            <div className="dash-card">
              <div className="dash-card-header">
                <div>
                  <p className="dash-card-eyebrow"><KeyRound size={11} /> Setup</p>
                  <h3 className="dash-card-title">Finish activating</h3>
                </div>
              </div>
              <ul className="dash-checklist">
                {checklist.map(c => (
                  <li key={c.id} className={`dash-check-row ${c.done ? 'is-done' : ''}`}>
                    <div className={`dash-check-icon ${c.done ? 'is-done' : ''}`}>
                      {c.done ? <CheckCircle2 size={15} /> : <span className="dash-check-blank" />}
                    </div>
                    <span className="dash-check-label">{c.label}</span>
                    {!c.done && c.action && (
                      <button className="dash-check-cta" onClick={c.action}>
                        Open <ArrowRight size={11} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="dash-card dash-card-success">
              <div className="dash-card-header">
                <div>
                  <p className="dash-card-eyebrow" style={{ color: '#30D158' }}><CheckCircle2 size={11} /> All set</p>
                  <h3 className="dash-card-title">Workspace activated</h3>
                </div>
              </div>
              <p className="dash-card-text">
                Your AI agent has everything it needs. Each call uses your own API keys and stays scoped to your workspace.
              </p>
            </div>
          )}

          {/* Connected services card */}
          <div className="dash-card">
            <div className="dash-card-header">
              <div>
                <p className="dash-card-eyebrow"><Sparkles size={11} /> Stack</p>
                <h3 className="dash-card-title">Connected services</h3>
              </div>
            </div>
            <ul className="dash-service-list">
              <ServiceRow label="Vapi (voice orchestration)" present={!!keys.vapi} />
              <ServiceRow label="Deepgram (transcription)" present={!!keys.deepgram} />
              <ServiceRow label="xAI Grok (intelligence)" present={!!keys.xai} />
            </ul>
            <button className="dash-card-link" onClick={() => navigate('/settings')}>
              Manage in settings <ChevronRight size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiTile({ icon, label, value, hint, positive }: {
  icon: React.ReactNode; label: string; value: string; hint: string; positive?: boolean;
}) {
  return (
    <div className="dash-kpi">
      <div className="dash-kpi-top">
        <span className="dash-kpi-icon">{icon}</span>
        <span className="dash-kpi-label">{label}</span>
      </div>
      <p className="dash-kpi-value" style={positive ? { color: '#30D158' } : undefined}>{value}</p>
      <p className="dash-kpi-hint">{hint}</p>
    </div>
  );
}

function ServiceRow({ label, present }: { label: string; present: boolean }) {
  return (
    <li className="dash-service-row">
      <span className={`dash-service-dot ${present ? 'is-ok' : 'is-off'}`} />
      <span className="dash-service-label">{label}</span>
      <span className={`dash-service-status ${present ? 'is-ok' : 'is-off'}`}>
        {present ? 'Connected' : 'Not set'}
      </span>
    </li>
  );
}

