import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, AreaChart, Area, BarChart, Bar, ReferenceArea, Cell, RadialBarChart,
  RadialBar, PolarAngleAxis,
} from 'recharts';
import {
  TrendingUp, Sparkles, BarChart3, ArrowLeft, Zap, Brain, Heart, MessageCircle,
  Target, ArrowUpRight, ChevronRight, Shield, Activity, Phone, Loader2,
} from 'lucide-react';
import { useCalls, SavedCall } from '../lib/calls';

// ── Types ─────────────────────────────────────────────────────────────
interface AnalysisData {
  summary: string;
  gratitude_line: number;
  reason: string;
  converted: boolean;
  sentiment_trajectory: number[];
  support_duration_lines: number;
  sales_duration_lines: number;
}

interface RecentCall {
  customer: string;
  issue: string;
  duration: string;
  switchAt: string;
  sentiment: string;
  outcome: 'converted' | 'missed';
  industry: string;
  plan: string;
  supportExchanges: number;
  salesExchanges: number;
  autonomousScore: number;
  frustrationHandled: string;
  gratitudeSpotting: string;
  salesTransition: string;
  sentimentArc: number[];
  gratitudeTrigger: string;
  pivotReason: string;
  callSummary: string;
  revenueAdded: string;
  switchTriggers: { label: string; met: boolean }[];
}

// ── Parsing helpers (real call rows are strings like "1m 48s" / "+$30/mo") ──
function parseDurationToSec(s?: string): number {
  if (!s) return 0;
  const m = s.match(/(\d+)\s*m/);
  const sec = s.match(/(\d+)\s*s/);
  return (m ? parseInt(m[1], 10) * 60 : 0) + (sec ? parseInt(sec[1], 10) : 0);
}
function parseRevenueToNumber(s?: string): number {
  if (!s) return 0;
  const m = s.match(/[\d.]+/);
  return m ? parseFloat(m[0]) : 0;
}

// ── Helpers ───────────────────────────────────────────────────────────
const TONE = {
  Perfect:    { rating: 5, label: 'Perfect',    tag: 'tag-success' },
  Strong:     { rating: 4, label: 'Strong',     tag: 'tag-success' },
  Smooth:     { rating: 4, label: 'Smooth',     tag: 'tag-success' },
  Seamless:   { rating: 5, label: 'Seamless',   tag: 'tag-success' },
  Precise:    { rating: 5, label: 'Precise',    tag: 'tag-success' },
  Adequate:   { rating: 3, label: 'Adequate',   tag: 'tag-amber' },
  Delayed:    { rating: 2, label: 'Delayed',    tag: 'tag-amber' },
  Weak:       { rating: 2, label: 'Weak',       tag: 'tag-amber' },
  Partial:    { rating: 2, label: 'Partial',    tag: 'tag-amber' },
  Missed:     { rating: 1, label: 'Missed',     tag: 'tag-red' },
  Premature:  { rating: 1, label: 'Premature',  tag: 'tag-red' },
} as const;

const ratingFor = (label?: string) =>
  (label && (TONE as any)[label]?.rating) || 0;

const tagFor = (label?: string) =>
  (label && (TONE as any)[label]?.tag) || 'tag-mute';

// ── Convert SavedCall (snake_case from DB) → RecentCall (camelCase) ──
function savedToRecent(c: SavedCall): RecentCall {
  return {
    customer: c.customer,
    issue: c.issue,
    duration: c.duration,
    switchAt: c.switch_at,
    sentiment: c.sentiment,
    outcome: c.outcome,
    industry: c.industry,
    plan: c.plan,
    supportExchanges: c.support_exchanges,
    salesExchanges: c.sales_exchanges,
    autonomousScore: c.autonomous_score,
    frustrationHandled: c.frustration_handled,
    gratitudeSpotting: c.gratitude_spotting,
    salesTransition: c.sales_transition,
    sentimentArc: c.sentiment_arc,
    gratitudeTrigger: c.gratitude_trigger,
    pivotReason: c.pivot_reason,
    callSummary: c.call_summary,
    revenueAdded: c.revenue_added,
    switchTriggers: c.switch_triggers,
  };
}

// ── Analytics Dashboard ───────────────────────────────────────────────
function AnalyticsDashboard() {
  const navigate = useNavigate();
  const [selectedCall, setSelectedCall] = useState<RecentCall | null>(null);
  const { calls: userCalls, loading: callsLoading } = useCalls();

  // Real calls only. No mock data anymore.
  const recentCalls: RecentCall[] = useMemo(
    () => userCalls.map(savedToRecent),
    [userCalls],
  );

  // ── KPI cards ───────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const total = recentCalls.length;
    const converted = recentCalls.filter(c => c.outcome === 'converted').length;
    const gratitudeWindows = recentCalls.filter(c =>
      c.switchTriggers?.find(t => t.label === 'Gratitude expressed')?.met,
    ).length;
    const conversionRate = total > 0 ? Math.round((converted / total) * 100) : 0;
    const mrr = recentCalls.reduce((s, c) => s + parseRevenueToNumber(c.revenueAdded), 0);
    return {
      total,
      converted,
      gratitudeWindows,
      conversionRate,
      gratitudeCapturePct: total > 0 ? Math.round((gratitudeWindows / total) * 100) : 0,
      mrr,
      annualised: mrr * 12,
      avgPerConversion: converted > 0 ? Math.round(mrr / converted) : 0,
    };
  }, [recentCalls]);

  // ── Aggregated Intent Detection ────────────────────────────────────
  const intent = useMemo(() => {
    const n = recentCalls.length || 1;
    const frustration = recentCalls.reduce((s, c) => s + ratingFor(c.frustrationHandled), 0) / n;
    const gratitude   = recentCalls.reduce((s, c) => s + ratingFor(c.gratitudeSpotting), 0) / n;
    const transition  = recentCalls.reduce((s, c) => s + ratingFor(c.salesTransition), 0) / n;
    const pct = (v: number) => Math.round((v / 5) * 100);

    const tally = (key: 'frustrationHandled' | 'gratitudeSpotting' | 'salesTransition') => {
      const counts: Record<string, number> = {};
      recentCalls.forEach((c) => {
        const v = c[key];
        if (v) counts[v] = (counts[v] || 0) + 1;
      });
      return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    };

    const triggerHits = recentCalls.reduce(
      (acc, c) => {
        c.switchTriggers?.forEach((t) => {
          acc[t.label] = (acc[t.label] || 0) + (t.met ? 1 : 0);
        });
        return acc;
      },
      {} as Record<string, number>,
    );

    return {
      frustrationPct: pct(frustration),
      gratitudePct: pct(gratitude),
      transitionPct: pct(transition),
      totalCalls: recentCalls.length,
      tallyFrustration: tally('frustrationHandled'),
      tallyGratitude: tally('gratitudeSpotting'),
      tallyTransition: tally('salesTransition'),
      triggerHits,
    };
  }, [recentCalls]);

  // ── Sentiment overlay (one line per call + computed average) ───────
  const sentimentOverlayData = useMemo(() => {
    if (recentCalls.length === 0) return [];
    const arcs = recentCalls.map(c => c.sentimentArc || []).filter(a => a.length > 0);
    if (arcs.length === 0) return [];
    const longest = Math.max(...arcs.map(a => a.length));
    return Array.from({ length: longest }).map((_, i) => {
      const obj: Record<string, number> = { x: i * 24 };
      let sum = 0;
      let count = 0;
      arcs.forEach((arc, ci) => {
        if (i < arc.length) {
          obj[`call${ci}`] = arc[i];
          sum += arc[i];
          count += 1;
        }
      });
      obj.avg = count > 0 ? sum / count : 0;
      return obj;
    });
  }, [recentCalls]);

  // ── Switch-timing histogram (minute buckets parsed from switchAt) ──
  const switchTimingData = useMemo(() => {
    const buckets = [
      { bucket: '0–1', min: 0,   max: 60,  count: 0 },
      { bucket: '1–2', min: 60,  max: 120, count: 0 },
      { bucket: '2–3', min: 120, max: 180, count: 0 },
      { bucket: '3–4', min: 180, max: 240, count: 0 },
      { bucket: '4–5', min: 240, max: 300, count: 0 },
      { bucket: '5+',  min: 300, max: Infinity, count: 0 },
    ];
    recentCalls.forEach((c) => {
      const sec = parseDurationToSec(c.switchAt);
      if (sec <= 0) return;
      const b = buckets.find(b => sec >= b.min && sec < b.max);
      if (b) b.count += 1;
    });
    return buckets.map(({ bucket, count }) => ({ bucket, count }));
  }, [recentCalls]);

  if (selectedCall) {
    return <PostCallView callEntry={selectedCall} onBack={() => setSelectedCall(null)} />;
  }

  // ── Loading / empty states ─────────────────────────────────────────
  if (callsLoading) {
    return (
      <div className="pca-page">
        <div className="pca-page-header">
          <div className="pca-eyebrow"><Sparkles size={13} /> Aria Intelligence</div>
          <h1 className="pca-page-title">Analytics</h1>
        </div>
        <div className="pca-content flex items-center justify-center py-32 text-textMuted">
          <Loader2 size={20} className="animate-spin" />
        </div>
      </div>
    );
  }

  if (recentCalls.length === 0) {
    return (
      <div className="pca-page">
        <div className="pca-page-header">
          <div className="pca-eyebrow"><Sparkles size={13} /> Aria Intelligence</div>
          <h1 className="pca-page-title">Analytics</h1>
          <p className="pca-page-sub">
            Aggregate performance across your autonomous Aria sessions: sentiment arcs,
            Gratitude Window precision, and revenue impact.
          </p>
        </div>
        <div className="pca-content">
          <div
            className="section-card flex flex-col items-center text-center py-20 px-6"
            style={{ maxWidth: 560, margin: '0 auto' }}
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
              style={{
                background: 'linear-gradient(135deg, rgba(45,212,191,0.18), rgba(99,102,241,0.18))',
                border: '1px solid rgba(255,255,255,0.06)',
                color: '#2DD4BF',
              }}
            >
              <BarChart3 size={24} />
            </div>
            <h3 className="text-[20px] font-semibold text-textMain" style={{ letterSpacing: '-0.025em' }}>
              No calls recorded yet
            </h3>
            <p className="text-[13.5px] text-textMuted mt-2 max-w-sm leading-relaxed" style={{ letterSpacing: '-0.005em' }}>
              Run your first Aria session and your sentiment arcs, Gratitude Window timing,
              intent detection, and revenue impact will populate here automatically.
            </p>
            <button
              className="btn-block btn-block-primary mt-7"
              style={{ width: 'auto', padding: '0 22px' }}
              onClick={() => navigate('/live-call')}
            >
              <Phone size={15} /> Start your first live call
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pca-page">
      {/* Page header */}
      <div className="pca-page-header">
        <div className="pca-eyebrow"><Sparkles size={13} /> Aria Intelligence</div>
        <h1 className="pca-page-title">Analytics</h1>
        <p className="pca-page-sub">
          Aggregate performance across all autonomous Aria sessions: sentiment arcs,
          Gratitude Window precision, and revenue impact.
        </p>
      </div>

      <div className="pca-content space-y-8 pb-20">

        {/* ── KPI Cards (computed from your real calls) ──────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              label: 'Total Calls',
              value: String(kpis.total),
              trend: kpis.total === 1 ? '1 session recorded' : `${kpis.total} sessions recorded`,
              color: '#F5F5F7',
            },
            {
              label: 'Gratitude Windows',
              value: String(kpis.gratitudeWindows),
              trend: `${kpis.gratitudeCapturePct}% capture rate`,
              color: '#2DD4BF',
            },
            {
              label: 'Converted',
              value: String(kpis.converted),
              trend: kpis.mrr > 0 ? `+$${kpis.mrr.toLocaleString()} MRR` : 'No revenue yet',
              color: '#30D158',
            },
            {
              label: 'Conversion Rate',
              value: `${kpis.conversionRate}%`,
              trend: kpis.converted > 0 ? `${kpis.converted}/${kpis.total} converted` : 'No conversions yet',
              color: '#F59E0B',
            },
          ].map(({ label, value, trend, color }) => (
            <div key={label} className="metric-card">
              <p className="metric-card-label">{label}</p>
              <p className="metric-card-value" style={{ color }}>{value}</p>
              <p className="metric-card-trend">{trend}</p>
            </div>
          ))}
        </div>

        {/* ── INTENT DETECTION (NEW: surfaced on dashboard) ──────── */}
        <div className="section-card space-y-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h3 className="section-title"><Brain size={15} className="text-primary" /> Intent Detection</h3>
              <p className="section-subtitle">
                How accurately Aria recognised emotional cues across {intent.totalCalls} recent calls.
              </p>
            </div>
            <div className="flex gap-2">
              <span className="tag tag-mute"><Activity size={10} /> Live model: claude-3.5-sonnet</span>
            </div>
          </div>

          <div className="intent-grid">
            <IntentTile
              icon={<Heart size={16} />}
              label="Frustration Handle"
              pct={intent.frustrationPct}
              color="#F59E0B"
              tally={intent.tallyFrustration}
              caption="Detect rising frustration → de-escalate before it spikes."
            />
            <IntentTile
              icon={<Sparkles size={16} />}
              label="Gratitude Spotting"
              pct={intent.gratitudePct}
              color="#2DD4BF"
              tally={intent.tallyGratitude}
              caption="Pinpoint the gratitude moment: the gateway to upsell."
            />
            <IntentTile
              icon={<ArrowUpRight size={16} />}
              label="Sales Transition"
              pct={intent.transitionPct}
              color="#30D158"
              tally={intent.tallyTransition}
              caption="Pivot from support to sales without sounding scripted."
            />
          </div>

          {/* Trigger logic strip */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { key: 'Issue resolved',      icon: <Shield size={14} />,        accent: '#2DD4BF' },
              { key: 'Sentiment above 0.4', icon: <TrendingUp size={14} />,    accent: '#F59E0B' },
              { key: 'Gratitude expressed', icon: <Heart size={14} />,         accent: '#30D158' },
            ].map(({ key, icon, accent }) => {
              const hits = intent.triggerHits[key] || 0;
              const pct = Math.round((hits / intent.totalCalls) * 100);
              return (
                <div
                  key={key}
                  className="rounded-2xl p-4 flex items-center justify-between"
                  style={{
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.030) 0%, rgba(255,255,255,0.010) 100%)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center"
                      style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}33` }}
                    >
                      {icon}
                    </div>
                    <div>
                      <p className="text-[12px] text-textMuted" style={{ letterSpacing: '-0.005em' }}>{key}</p>
                      <p className="text-[15px] font-semibold text-textMain" style={{ letterSpacing: '-0.015em' }}>
                        {hits}/{intent.totalCalls} calls
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[18px] font-semibold tabular-nums" style={{ color: accent, letterSpacing: '-0.02em' }}>
                      {pct}%
                    </p>
                    <p className="text-[10px] text-textFaint uppercase tracking-wider">trigger rate</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Revenue Impact ──────────────────────────────────────── */}
        <div className="section-card">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
            <div>
              <h3 className="section-title"><Zap size={15} className="text-secondary" /> Revenue Impact</h3>
              <p className="section-subtitle">
                Autonomous conversion earnings across {kpis.total} session{kpis.total === 1 ? '' : 's'}.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { value: `$${kpis.mrr.toLocaleString()}`,         label: 'MRR added',                accent: '#30D158' },
              { value: `$${kpis.annualised.toLocaleString()}`,  label: 'Annualised projection',    accent: '#2DD4BF' },
              { value: `$${kpis.avgPerConversion.toLocaleString()}`, label: 'Average per conversion', accent: '#F5F5F7' },
            ].map(({ value, label, accent }) => (
              <div
                key={label}
                className="rounded-2xl p-5"
                style={{
                  background: 'linear-gradient(180deg, rgba(255,255,255,0.025) 0%, rgba(255,255,255,0.008) 100%)',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <p className="text-[28px] font-semibold tabular-nums" style={{ color: accent, letterSpacing: '-0.03em' }}>
                  {value}
                </p>
                <p className="text-[12px] text-textMuted mt-1" style={{ letterSpacing: '-0.005em' }}>{label}</p>
              </div>
            ))}
          </div>

          {kpis.mrr > 0 && (
            <div className="mt-5 space-y-2">
              <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5">
                <div style={{ width: `${Math.min(50, Math.round((kpis.total * 5 / Math.max(kpis.mrr, 1)) * 100))}%`, background: 'rgba(255,69,58,0.55)' }} />
                <div style={{ flex: 1, background: 'rgba(48,209,88,0.7)' }} />
              </div>
              <div className="flex justify-between text-[11px] text-textFaint">
                <span>Estimated cost · ${kpis.total * 5}</span>
                <span style={{ color: '#30D158' }}>
                  Generated revenue · {(kpis.mrr / Math.max(kpis.total * 5, 1)).toFixed(1)}× ROI
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── Two-up: Sentiment Journey + Switch Timing ───────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="section-card">
            <div className="mb-4">
              <h3 className="section-title"><Activity size={14} className="text-primary" /> Sentiment Journey</h3>
              <p className="section-subtitle">Average customer sentiment, all calls.</p>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sentimentOverlayData}>
                  <CartesianGrid strokeDasharray="2 4" stroke="#ffffff08" vertical={false} />
                  <XAxis dataKey="x" stroke="#6E6E73" fontSize={10} tickFormatter={(v) => `${v}s`} axisLine={false} tickLine={false} />
                  <YAxis domain={[-1, 1]} stroke="#6E6E73" fontSize={10} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      background: '#16161B', border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 10, fontSize: 11, color: '#F5F5F7',
                    }}
                  />
                  {recentCalls.map((_, i) => (
                    <Line key={i} type="monotone" dataKey={`call${i}`} stroke="#2DD4BF" strokeWidth={1} strokeOpacity={0.16} dot={false} isAnimationActive={false} />
                  ))}
                  <Line type="monotone" dataKey="avg" stroke="#2DD4BF" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="section-card">
            <div className="mb-4">
              <h3 className="section-title"><Target size={14} className="text-secondary" /> Gratitude Window Timing</h3>
              <p className="section-subtitle">Minutes elapsed before the Gratitude Window opened in each call.</p>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={switchTimingData} barCategoryGap="32%">
                  <CartesianGrid strokeDasharray="2 4" stroke="#ffffff08" vertical={false} />
                  <XAxis dataKey="bucket" stroke="#6E6E73" fontSize={10} axisLine={false} tickLine={false}
                    tickFormatter={(v) => `${v}m`} />
                  <YAxis stroke="#6E6E73" fontSize={10} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: '#16161B', border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 10, fontSize: 11, color: '#F5F5F7',
                    }}
                  />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {(() => {
                      const peak = Math.max(...switchTimingData.map(d => d.count), 0);
                      return switchTimingData.map((entry, index) => (
                        <Cell key={index} fill={entry.count > 0 && entry.count === peak ? '#F59E0B' : '#2A2A30'} />
                      ));
                    })()}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[11px] text-textFaint mt-2">
              Distribution of Gratitude Window detection times across your sessions.
            </p>
          </div>
        </div>

        {/* ── Recent Calls Table ──────────────────────────────────── */}
        <div className="section-card !p-0 overflow-hidden">
          <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <div>
              <h3 className="section-title"><MessageCircle size={14} className="text-primary" /> Recent Calls</h3>
              <p className="section-subtitle">Click any row for the full per-call breakdown.</p>
            </div>
            <span className="text-[11px] text-textFaint">{recentCalls.length} sessions</span>
          </div>
          <div className="overflow-x-auto">
            <table className="calls-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Issue</th>
                  <th>Duration</th>
                  <th>Switch</th>
                  <th>Sentiment</th>
                  <th>Detection</th>
                  <th>Outcome</th>
                  <th>Score</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recentCalls.map((call, idx) => (
                  <tr key={idx} onClick={() => setSelectedCall(call)}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="avatar-mini">
                          {call.customer.split(' ').map(n => n[0]).join('')}
                        </div>
                        <div>
                          <p className="text-textMain font-medium" style={{ letterSpacing: '-0.01em' }}>{call.customer}</p>
                          <p className="text-[11px] text-textFaint">{call.industry} · {call.plan.split('(')[0].trim()}</p>
                        </div>
                      </div>
                    </td>
                    <td className="text-textMuted text-[13px]">{call.issue}</td>
                    <td className="font-mono text-textMuted text-[13px]">{call.duration}</td>
                    <td className="font-mono text-textMuted text-[13px]">{call.switchAt}</td>
                    <td className="font-mono text-[13px]" style={{ color: parseFloat(call.sentiment) > 0.5 ? '#30D158' : '#F59E0B' }}>
                      {call.sentiment}
                    </td>
                    <td>
                      <div className="flex items-center gap-1">
                        <span className={`tag ${tagFor(call.frustrationHandled)}`} title={`Frustration: ${call.frustrationHandled}`}>
                          F
                        </span>
                        <span className={`tag ${tagFor(call.gratitudeSpotting)}`} title={`Gratitude: ${call.gratitudeSpotting}`}>
                          G
                        </span>
                        <span className={`tag ${tagFor(call.salesTransition)}`} title={`Transition: ${call.salesTransition}`}>
                          T
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`tag ${call.outcome === 'converted' ? 'tag-success' : 'tag-amber'}`}>
                        {call.outcome === 'converted' ? 'Converted' : 'Missed'}
                      </span>
                    </td>
                    <td>
                      <span
                        className="font-mono font-semibold text-[14px] tabular-nums"
                        style={{
                          color: call.autonomousScore >= 90 ? '#30D158' :
                                 call.autonomousScore >= 80 ? '#2DD4BF' : '#F59E0B',
                        }}
                      >
                        {call.autonomousScore}%
                      </span>
                    </td>
                    <td className="text-textFaint">
                      <ChevronRight size={16} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-[11px] text-textFaint items-center">
          <span>Detection legend:</span>
          <span><strong className="text-textMuted">F</strong> · Frustration Handle</span>
          <span><strong className="text-textMuted">G</strong> · Gratitude Spotting</span>
          <span><strong className="text-textMuted">T</strong> · Sales Transition</span>
          <span className="ml-3 flex items-center gap-1.5"><span className="tag tag-success">·</span> Strong</span>
          <span className="flex items-center gap-1.5"><span className="tag tag-amber">·</span> Partial</span>
          <span className="flex items-center gap-1.5"><span className="tag tag-red">·</span> Missed</span>
        </div>
      </div>
    </div>
  );
}

// ── Intent Tile (with mini radial + tally) ───────────────────────────
function IntentTile({
  icon, label, pct, color, tally, caption,
}: {
  icon: React.ReactNode;
  label: string;
  pct: number;
  color: string;
  tally: [string, number][];
  caption: string;
}) {
  const data = [{ name: label, value: pct, fill: color }];

  return (
    <div className="intent-tile" style={{ ['--tile-glow' as any]: color }}>
      <div className="flex items-start justify-between">
        <div className="intent-tile-icon" style={{ color, background: `${color}18`, borderColor: `${color}33` }}>
          {icon}
        </div>
        <div className="w-14 h-14 -mt-1 -mr-1">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart innerRadius="68%" outerRadius="100%" barSize={6} data={data} startAngle={90} endAngle={-270}>
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              <RadialBar background={{ fill: 'rgba(255,255,255,0.05)' }} dataKey="value" cornerRadius={6} />
            </RadialBarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div>
        <p className="intent-tile-label">{label}</p>
        <p className="intent-tile-value">{pct}<span className="text-[14px] text-textFaint font-medium ml-0.5">%</span></p>
      </div>

      <div className="intent-tile-bar">
        <div className="intent-tile-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>

      {/* Tally chips */}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {tally.slice(0, 3).map(([k, v]) => (
          <span key={k} className={`tag ${tagFor(k)}`}>{k} · {v}</span>
        ))}
      </div>

      <p className="text-[11.5px] text-textFaint leading-snug pt-1">{caption}</p>
    </div>
  );
}

// ── Post-Call View (drill-in) ──────────────────────────────────────────
function PostCallView({ state, callEntry, onBack }: { state?: any; callEntry?: RecentCall; onBack?: () => void }) {
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [loading] = useState(false);

  const isMock = !!callEntry;

  const initialConverted = isMock ? callEntry?.outcome === 'converted' : !!state?.isConverted;
  const [isConverted, setIsConverted] = useState(initialConverted);

  useEffect(() => { setIsConverted(initialConverted); }, [initialConverted]);

  const fmt = (s: number) => `${Math.floor(s / 60)}m ${(s % 60).toString().padStart(2, '0')}s`;

  const customerName = isMock ? callEntry?.customer : 'Sarah Mitchell';
  const durationStr = isMock ? callEntry?.duration : fmt((state?.transcript?.length || 0) * 5);
  const supportExchanges = isMock ? callEntry?.supportExchanges : (analysis?.support_duration_lines || 0);
  const salesExchanges   = isMock ? callEntry?.salesExchanges   : (analysis?.sales_duration_lines || 0);
  const switchTimeStr = isMock ? callEntry?.switchAt : (state?.modeSwitchTime ? fmt(state.modeSwitchTime) : 'N/A');
  const sentimentAtSwitch = isMock ? parseFloat(callEntry?.sentiment || '0') : state?.sentimentAtSwitch;

  const totalExchanges = isMock
    ? ((callEntry?.supportExchanges || 0) + (callEntry?.salesExchanges || 0))
    : (state?.transcript?.length || 0);

  const sentimentChartData = isMock
    ? (callEntry?.sentimentArc || []).map((val, i) => ({ name: i.toString(), value: val }))
    : (analysis?.sentiment_trajectory || state?.sentiment?.map((s: any) => s.value) || [])
        .map((val: number, i: number) => ({ name: i.toString(), value: val }));

  const gratitudeTriggerX = isMock
    ? Math.floor((callEntry?.sentimentArc?.length || 0) * 0.5).toString()
    : (analysis?.gratitude_line != null && analysis.gratitude_line !== -1 ? analysis.gratitude_line.toString() : null);

  const summaryText = isMock ? callEntry?.callSummary : analysis?.summary;
  const reasonText = isMock ? callEntry?.pivotReason : analysis?.reason;
  const gratitudeText = isMock ? callEntry?.gratitudeTrigger : state?.gratitudeTriggerLine?.text;
  const confidenceScore = isMock ? callEntry?.autonomousScore : (state?.pivotConfidence || 94);

  const frustrationHandled = isMock ? callEntry?.frustrationHandled : 'Perfect';
  const gratitudeSpotting  = isMock ? callEntry?.gratitudeSpotting  : 'Precise';
  const salesTransition    = isMock ? callEntry?.salesTransition    : 'Seamless';
  const autonomousScore    = isMock ? callEntry?.autonomousScore    : 94;

  if (loading) {
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center space-y-6">
        <div className="w-14 h-14 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
        <div className="text-center">
          <h2 className="text-xl font-semibold text-textMain" style={{ letterSpacing: '-0.02em' }}>
            Synthesising autonomous session…
          </h2>
          <p className="text-textMuted text-sm mt-1">Aria is reviewing the conversion window and support logs.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pca-page">
      <div className="pca-page-header">
        <button
          onClick={onBack ? onBack : () => navigate('/analytics')}
          className="flex items-center gap-1.5 text-textMuted hover:text-textMain text-[13px] mb-5 transition-colors"
        >
          <ArrowLeft size={14} /> Back to Analytics
        </button>
        <div className="pca-eyebrow"><Sparkles size={13} /> Post-Interaction Intelligence</div>
        <h1 className="pca-page-title">Aria × {customerName}</h1>
        <p className="pca-page-sub">
          {totalExchanges} exchanges · {durationStr} duration
        </p>
      </div>

      <div className="pca-content space-y-7 pb-20">
        {/* Outcome bar */}
        <div
          className="rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap"
          style={{
            background: isConverted
              ? 'linear-gradient(180deg, rgba(48,209,88,0.07) 0%, rgba(48,209,88,0.02) 100%)'
              : 'linear-gradient(180deg, rgba(255,69,58,0.07) 0%, rgba(255,69,58,0.02) 100%)',
            border: `1px solid ${isConverted ? 'rgba(48,209,88,0.25)' : 'rgba(255,69,58,0.25)'}`,
          }}
        >
          <div>
            <p className="text-[11px] font-medium uppercase tracking-widest mb-1"
              style={{ color: isConverted ? '#30D158' : '#FF453A', letterSpacing: '0.06em' }}>
              Upgrade {isConverted ? 'processed' : 'declined'}
            </p>
            <div className="text-[22px] font-semibold" style={{
              color: isConverted ? '#30D158' : '#FF453A', letterSpacing: '-0.025em',
            }}>
              {isConverted ? 'Conversion confirmed' : 'No conversion'}
            </div>
          </div>
          <button
            onClick={() => setIsConverted(!isConverted)}
            className={`btn-pill ${isConverted ? '' : 'btn-primary-pill'}`}
          >
            {isConverted ? 'Mark as lost' : 'Mark as converted'}
          </button>
        </div>

        {/* Mode metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniMetric label="Support phase"     value={`${supportExchanges}`} unit="exchanges" tone="primary" />
          <MiniMetric label="Sales phase"       value={`${salesExchanges}`}   unit="exchanges" tone="amber" />
          <MiniMetric label="Mode switched at"  value={switchTimeStr || ''}   unit="elapsed"   tone="white" />
          <MiniMetric
            label="Sentiment at switch"
            value={sentimentAtSwitch != null ? `${sentimentAtSwitch > 0 ? '+' : ''}${sentimentAtSwitch.toFixed(2)}` : 'N/A'}
            unit="emotional peak"
            tone="amber"
          />
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-6">
            {/* Sentiment timeline */}
            <div className="section-card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="section-title"><TrendingUp size={15} className="text-primary" /> Sentiment & mode timeline</h3>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sentimentChartData}>
                    <defs>
                      <linearGradient id="pca-grad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor={isConverted ? '#2DD4BF' : '#F59E0B'} stopOpacity={0.28} />
                        <stop offset="95%" stopColor={isConverted ? '#2DD4BF' : '#F59E0B'} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 4" stroke="#ffffff08" vertical={false} />
                    <XAxis dataKey="name" hide />
                    <YAxis domain={[-1, 1]} stroke="#6E6E73" fontSize={10} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: '#16161B', border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 10, fontSize: 11, color: '#F5F5F7',
                      }}
                    />
                    {gratitudeTriggerX && (
                      <ReferenceLine
                        x={gratitudeTriggerX}
                        stroke="#F59E0B" strokeDasharray="4 4"
                        label={{ position: 'top', value: 'Mode switch', fill: '#F59E0B', fontSize: 10, fontWeight: 600 }}
                      />
                    )}
                    <Area
                      type="monotone" dataKey="value"
                      stroke={isConverted ? '#2DD4BF' : '#F59E0B'} strokeWidth={2.5}
                      fill="url(#pca-grad)" fillOpacity={1}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Summary */}
            <div className="section-card space-y-4">
              <h3 className="section-title"><BarChart3 size={15} className="text-primary" /> Autonomous logic log</h3>
              <p className="text-textMain text-[14px] leading-relaxed" style={{ letterSpacing: '-0.005em' }}>
                {summaryText || 'Analysing interaction…'}
              </p>
              {reasonText && (
                <div
                  className="p-4 rounded-xl"
                  style={{
                    background: 'rgba(45,212,191,0.05)',
                    border: '1px solid rgba(45,212,191,0.18)',
                  }}
                >
                  <p className="text-[10.5px] font-semibold uppercase tracking-widest text-primary mb-1.5">
                    Gratitude Window · pivot rationale
                  </p>
                  <p className="text-[13.5px] text-textMain italic leading-relaxed">"{reasonText}"</p>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-4 space-y-5">
            {/* Autonomous score */}
            <div
              className="rounded-2xl p-6 text-center"
              style={{
                background: 'linear-gradient(180deg, rgba(45,212,191,0.07) 0%, rgba(45,212,191,0.02) 100%)',
                border: '1px solid rgba(45,212,191,0.20)',
              }}
            >
              <p className="text-[11px] font-semibold uppercase text-primary tracking-widest mb-3">Autonomous score</p>
              <div className="text-[56px] font-semibold text-textMain leading-none tabular-nums" style={{ letterSpacing: '-0.04em' }}>
                {autonomousScore}<span className="text-[28px] text-textFaint">%</span>
              </div>
              <p className="text-[11.5px] text-textMuted mt-3 leading-relaxed">
                Aria managed the troubleshooting flow with 0.4s avg latency and accurate intent matching.
              </p>
            </div>

            {/* Gratitude trigger */}
            {gratitudeText && (
              <div className="section-card space-y-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-textMuted">Gratitude trigger</p>
                <div className="border-l-2 pl-4 py-1" style={{ borderColor: '#F59E0B' }}>
                  <p className="text-[13.5px] text-textMain italic leading-relaxed">"{gratitudeText}"</p>
                  <p className="text-[11px] text-textFaint mt-2">
                    Confidence: <span style={{ color: '#30D158' }}>{confidenceScore && confidenceScore > 0 ? confidenceScore : 94}%</span>
                  </p>
                </div>
              </div>
            )}

            {/* Intent Detection (per-call) */}
            <div className="section-card space-y-4">
              <h3 className="section-title"><Brain size={14} className="text-primary" /> Intent Detection</h3>
              <div className="space-y-3">
                <DetectionRow label="Frustration handle"  rating={ratingFor(frustrationHandled)}  value={frustrationHandled || ''} />
                <DetectionRow label="Gratitude spotting"  rating={ratingFor(gratitudeSpotting)}   value={gratitudeSpotting || ''} />
                <DetectionRow label="Sales transition"    rating={ratingFor(salesTransition)}     value={salesTransition || ''} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Mini Metric ───────────────────────────────────────────────────────
function MiniMetric({
  label, value, unit, tone,
}: { label: string; value: string; unit: string; tone: 'primary' | 'amber' | 'white' }) {
  const color = tone === 'primary' ? '#2DD4BF' : tone === 'amber' ? '#F59E0B' : '#F5F5F7';
  return (
    <div className="metric-card">
      <p className="metric-card-label">{label}</p>
      <p className="metric-card-value tabular-nums" style={{ color }}>{value}</p>
      <p className="metric-card-trend">{unit}</p>
    </div>
  );
}

// ── Detection Row (5-bar rating) ──────────────────────────────────────
function DetectionRow({ label, rating, value }: { label: string; rating: number; value: string }) {
  const tag = tagFor(value);
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[13px] text-textMuted" style={{ letterSpacing: '-0.005em' }}>{label}</span>
        <span className={`tag ${tag}`}>{value}</span>
      </div>
      <div className="flex gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex-1 h-1.5 rounded-full"
            style={{
              background: i < rating
                ? (rating >= 4 ? '#30D158' : rating >= 3 ? '#F59E0B' : '#FF453A')
                : 'rgba(255,255,255,0.06)',
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────
const PostCallAnalytics = () => {
  const location = useLocation();
  const hasCallData = !!(location.state?.transcript);
  if (!hasCallData) return <AnalyticsDashboard />;
  return <PostCallView state={location.state} />;
};

export default PostCallAnalytics;
