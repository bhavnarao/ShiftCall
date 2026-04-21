import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useKeys, KeyName } from '../lib/keys';
import { activateTrial, useTrial } from '../lib/trial';
import { SUPABASE_MODE } from '../lib/supabase';
import {
  Sparkles, Mic, Brain, Phone, ArrowRight, Eye, EyeOff,
  CheckCircle2, XCircle, Loader2, ExternalLink, Rocket, Zap,
} from 'lucide-react';

interface KeyStepConfig {
  name: KeyName;
  title: string;
  subtitle: string;
  placeholder: string;
  helpUrl: string;
  helpLabel: string;
  icon: React.ReactNode;
  description: string;
}

const STEPS: KeyStepConfig[] = [
  {
    name: 'vapi',
    title: 'Connect Vapi',
    subtitle: 'Voice agent orchestration',
    placeholder: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    helpUrl: 'https://dashboard.vapi.ai/account',
    helpLabel: 'Vapi dashboard → Account',
    icon: <Phone size={18} />,
    description: 'Vapi runs Aria, your AI agent. We use your **public key** which is browser-safe.',
  },
  {
    name: 'deepgram',
    title: 'Connect Deepgram',
    subtitle: 'Real-time speech-to-text',
    placeholder: 'Your Deepgram API key',
    helpUrl: 'https://console.deepgram.com/',
    helpLabel: 'Deepgram console → API Keys',
    icon: <Mic size={18} />,
    description: 'Deepgram transcribes the call live so Aria can react sentence-by-sentence.',
  },
  {
    name: 'xai',
    title: 'Connect xAI Grok',
    subtitle: 'Sentiment + Gratitude Window Detection',
    placeholder: 'xai-…',
    helpUrl: 'https://console.x.ai/',
    helpLabel: 'xAI console → API Keys',
    icon: <Brain size={18} />,
    description: 'Grok scores sentiment line-by-line and detects the Gratitude Window: the exact moment to pivot from support to sales.',
  },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, markOnboarded } = useAuth();
  const { keys, setKey, validateKey } = useKeys();
  const { status: trial, refresh: refreshTrial } = useTrial();
  const [trialBusy, setTrialBusy] = useState(false);
  const [trialErr, setTrialErr] = useState<string | null>(null);
  const [step, setStep] = useState(0); // 0 = welcome, 1..3 = keys, 4 = complete
  const [reveal, setReveal] = useState<Record<KeyName, boolean>>({ vapi: false, deepgram: false, xai: false });
  const [validation, setValidation] = useState<Record<KeyName, { state: 'idle' | 'checking' | 'ok' | 'fail'; msg?: string }>>({
    vapi: { state: 'idle' }, deepgram: { state: 'idle' }, xai: { state: 'idle' },
  });
  const [draft, setDraft] = useState<Record<KeyName, string>>({
    vapi: keys.vapi, deepgram: keys.deepgram, xai: keys.xai,
  });

  const totalSteps = STEPS.length + 2; // welcome + 3 keys + complete

  const handleValidate = async (cfg: KeyStepConfig) => {
    setValidation(v => ({ ...v, [cfg.name]: { state: 'checking' } }));
    const result = await validateKey(cfg.name, draft[cfg.name]);
    setValidation(v => ({ ...v, [cfg.name]: { state: result.ok ? 'ok' : 'fail', msg: result.message } }));
  };

  const saveAndNext = (cfg: KeyStepConfig) => {
    setKey(cfg.name, draft[cfg.name]);
    setStep(s => s + 1);
  };

  const finish = async () => {
    await markOnboarded();
    navigate('/dashboard', { replace: true });
  };

  const startTrial = async () => {
    setTrialErr(null);
    setTrialBusy(true);
    try {
      await activateTrial();
      await markOnboarded();
      await refreshTrial();
      navigate('/live-call', { replace: true });
    } catch (e: any) {
      setTrialErr(e?.message || 'Could not start trial.');
    } finally {
      setTrialBusy(false);
    }
  };

  const trialAvailable = SUPABASE_MODE === 'cloud';
  const trialLimitDisplay = trial.limit > 0 ? trial.limit : 3;
  const trialRemainingDisplay = trial.limit > 0 ? trial.remaining : 3;

  // ─────────────────────────────────────────────────────────────
  // Render the appropriate step
  // ─────────────────────────────────────────────────────────────
  return (
    <div className="wizard-shell">
      <div className="wizard-card">

        {/* Progress pips */}
        <div className="step-pips">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className="step-pip">
              <div className="step-pip-fill" style={{ transform: `scaleX(${i <= step ? 1 : 0})`, transition: 'transform .4s cubic-bezier(0.22,1,0.36,1)' }} />
            </div>
          ))}
        </div>

        {/* ── Welcome ── */}
        {step === 0 && (
          <>
            <div className="inline-flex items-center gap-1.5 mb-3 text-[12px] text-primary" style={{ letterSpacing: '-0.005em' }}>
              <Sparkles size={14} /> Welcome, {user?.email.split('@')[0]}
            </div>
            <h1 className="wizard-title">Let's activate your workspace</h1>
            <p className="wizard-sub">
              Try ShiftCall with {trialLimitDisplay} free calls on us, or bring your own API keys for unlimited usage.
              Either way, your keys stay in your browser and never touch our servers.
            </p>

            {trialAvailable && trialRemainingDisplay > 0 && (
              <div className="trial-hero">
                <div className="trial-hero-row">
                  <div className="trial-hero-icon"><Zap size={18} /></div>
                  <div className="trial-hero-text">
                    <div className="trial-hero-title">
                      Try {trialRemainingDisplay} free call{trialRemainingDisplay === 1 ? '' : 's'}, no keys required
                    </div>
                    <div className="trial-hero-sub">
                      We use our shared keys for your first {trialLimitDisplay} calls. Add your own anytime to keep going.
                    </div>
                  </div>
                </div>
                <button
                  onClick={startTrial}
                  disabled={trialBusy}
                  className="btn-block btn-block-primary"
                  style={{ marginTop: 14 }}
                >
                  {trialBusy
                    ? <><Loader2 size={16} className="animate-spin" /> Starting your trial…</>
                    : <>Start {trialRemainingDisplay} free call{trialRemainingDisplay === 1 ? '' : 's'} <ArrowRight size={16} /></>}
                </button>
                {trialErr && <p className="field-error" style={{ marginTop: 8 }}>{trialErr}</p>}
              </div>
            )}

            <div className="trial-divider">
              <span>or bring your own keys</span>
            </div>

            <div className="space-y-2.5">
              {STEPS.map((s, i) => (
                <div key={s.name} className="key-card">
                  <div className="key-card-row">
                    <div className="key-icon">{s.icon}</div>
                    <div className="flex-1">
                      <div className="text-[14px] font-semibold text-textMain" style={{ letterSpacing: '-0.01em' }}>
                        Step {i + 1} · {s.title}
                      </div>
                      <div className="text-[12px] text-textMuted">{s.subtitle}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="wizard-actions">
              <button onClick={() => setStep(1)} className="btn-block btn-block-primary">
                Get started <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}

        {/* ── Key steps ── */}
        {step >= 1 && step <= STEPS.length && (() => {
          const cfg = STEPS[step - 1];
          const v = validation[cfg.name];
          const value = draft[cfg.name];
          const canContinue = !!value.trim();
          return (
            <>
              <div className="inline-flex items-center gap-2 mb-3">
                <div className="key-icon">{cfg.icon}</div>
                <div className="text-[12px] text-primary" style={{ letterSpacing: '-0.005em' }}>
                  Step {step} of {STEPS.length}
                </div>
              </div>
              <h1 className="wizard-title">{cfg.title}</h1>
              <p className="wizard-sub" dangerouslySetInnerHTML={{ __html: cfg.description.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#F5F5F7;">$1</strong>') }} />

              <div>
                <label className="field-label flex items-center justify-between">
                  <span>API key</span>
                  <a
                    href={cfg.helpUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-primary text-[11.5px] inline-flex items-center gap-1"
                    style={{ letterSpacing: '-0.005em' }}
                  >
                    {cfg.helpLabel} <ExternalLink size={11} />
                  </a>
                </label>
                <div className="relative">
                  <input
                    className="field-input field-input-mono pr-20"
                    type={reveal[cfg.name] ? 'text' : 'password'}
                    placeholder={cfg.placeholder}
                    value={value}
                    onChange={(e) => {
                      setDraft(d => ({ ...d, [cfg.name]: e.target.value }));
                      setValidation(v => ({ ...v, [cfg.name]: { state: 'idle' } }));
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setReveal(r => ({ ...r, [cfg.name]: !r[cfg.name] }))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-textMuted hover:text-textMain transition-colors"
                  >
                    {reveal[cfg.name] ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>

                {/* Validation row */}
                <div className="mt-3 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => handleValidate(cfg)}
                    disabled={!value.trim() || v.state === 'checking'}
                    className="btn-pill"
                  >
                    {v.state === 'checking'
                      ? <><Loader2 size={13} className="animate-spin" /> Testing…</>
                      : 'Test connection'}
                  </button>

                  {v.state === 'ok' && (
                    <span className="key-status-pill" style={{ background: 'rgba(48,209,88,0.15)', color: '#30D158', border: '1px solid rgba(48,209,88,0.30)' }}>
                      <CheckCircle2 size={11} /> Verified
                    </span>
                  )}
                  {v.state === 'fail' && (
                    <span className="key-status-pill" style={{ background: 'rgba(255,69,58,0.15)', color: '#FF453A', border: '1px solid rgba(255,69,58,0.30)' }}>
                      <XCircle size={11} /> Failed
                    </span>
                  )}
                </div>
                {v.msg && (
                  <p className={v.state === 'ok' ? 'field-success' : 'field-error'}>{v.msg}</p>
                )}
              </div>

              <div className="wizard-actions">
                <button onClick={() => setStep(s => s - 1)} className="btn-block btn-block-ghost">Back</button>
                <button
                  onClick={() => saveAndNext(cfg)}
                  className="btn-block btn-block-primary"
                  disabled={!canContinue}
                >
                  Save and continue <ArrowRight size={16} />
                </button>
              </div>
              <p className="field-help mt-3 text-center">
                You can edit or remove keys anytime in <strong style={{ color: '#F5F5F7' }}>Settings</strong>.
              </p>
            </>
          );
        })()}

        {/* ── Complete ── */}
        {step === STEPS.length + 1 && (
          <>
            <div className="inline-flex items-center gap-1.5 mb-3 text-[12px] text-success" style={{ letterSpacing: '-0.005em' }}>
              <Rocket size={14} /> Workspace activated
            </div>
            <h1 className="wizard-title">You're all set</h1>
            <p className="wizard-sub">
              Your keys are saved locally. Aria is ready to start handling autonomous calls.
              Head to the dashboard to launch your first session.
            </p>

            <div className="space-y-2 my-6">
              {STEPS.map((s) => (
                <div key={s.name} className={`key-card ${draft[s.name] ? 'is-set' : ''}`}>
                  <div className="key-card-row">
                    <div className="key-icon">{s.icon}</div>
                    <div className="flex-1">
                      <div className="text-[13px] font-semibold text-textMain" style={{ letterSpacing: '-0.01em' }}>{s.title}</div>
                      <div className="text-[11.5px] text-textMuted">
                        {draft[s.name] ? `…${draft[s.name].slice(-6)}` : 'Not set'}
                      </div>
                    </div>
                    {draft[s.name]
                      ? <CheckCircle2 size={18} className="text-success" />
                      : <XCircle size={18} className="text-textFaint" />}
                  </div>
                </div>
              ))}
            </div>

            <div className="wizard-actions">
              <button onClick={finish} className="btn-block btn-block-primary">
                Enter dashboard <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
