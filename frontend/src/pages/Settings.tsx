import React, { useState } from 'react';
import { useAuth } from '../lib/auth';
import { useKeys, KeyName } from '../lib/keys';
import { useCalls } from '../lib/calls';
import {
  Settings as SettingsIcon, User, Key, Database, LogOut, Trash2, Save,
  Eye, EyeOff, CheckCircle2, XCircle, Loader2, Mic, Brain, Phone, ExternalLink, Sparkles,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const KEY_META: Record<KeyName, { name: string; placeholder: string; helpUrl: string; icon: React.ReactNode; subtitle: string }> = {
  vapi: {
    name: 'Vapi',
    placeholder: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    helpUrl: 'https://dashboard.vapi.ai/account',
    icon: <Phone size={16} />,
    subtitle: 'Public key. Runs the voice agent in your browser.',
  },
  deepgram: {
    name: 'Deepgram',
    placeholder: 'Your Deepgram API key',
    helpUrl: 'https://console.deepgram.com/',
    icon: <Mic size={16} />,
    subtitle: 'Real-time speech-to-text on your microphone.',
  },
  anthropic: {
    name: 'Anthropic',
    placeholder: 'sk-ant-…',
    helpUrl: 'https://console.anthropic.com/settings/keys',
    icon: <Brain size={16} />,
    subtitle: 'Sentiment streaming, Gratitude Window Detection, post-call analysis.',
  },
};

export default function Settings() {
  const { user, mode, signOut, updateWorkspace } = useAuth();
  const { keys, setKey, clearKey, clearAll, validateKey } = useKeys();
  const { calls, clearAll: clearCalls } = useCalls();
  const navigate = useNavigate();

  const [reveal, setReveal] = useState<Record<KeyName, boolean>>({ vapi: false, deepgram: false, anthropic: false });
  const [drafts, setDrafts] = useState<Record<KeyName, string>>({
    vapi: keys.vapi, deepgram: keys.deepgram, anthropic: keys.anthropic,
  });
  const [validations, setValidations] = useState<Record<KeyName, { state: 'idle' | 'checking' | 'ok' | 'fail'; msg?: string }>>({
    vapi: { state: 'idle' }, deepgram: { state: 'idle' }, anthropic: { state: 'idle' },
  });

  const [workspaceDraft, setWorkspaceDraft] = useState(user?.workspaceName || '');
  const [workspaceSaved, setWorkspaceSaved] = useState(false);

  const test = async (k: KeyName) => {
    setValidations(v => ({ ...v, [k]: { state: 'checking' } }));
    const r = await validateKey(k, drafts[k]);
    setValidations(v => ({ ...v, [k]: { state: r.ok ? 'ok' : 'fail', msg: r.message } }));
  };

  const save = (k: KeyName) => {
    setKey(k, drafts[k]);
    setValidations(v => ({ ...v, [k]: { state: 'idle' } }));
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  if (!user) return null;

  return (
    <div className="pca-page">
      <div className="pca-page-header">
        <div className="pca-eyebrow"><SettingsIcon size={13} /> Workspace settings</div>
        <h1 className="pca-page-title">Settings</h1>
        <p className="pca-page-sub">
          Manage your workspace, API keys, and call history. Keys are stored only in your browser.
        </p>
      </div>

      <div className="pca-content space-y-7 pb-20" style={{ maxWidth: 880 }}>

        {/* ── Profile ─────────────────────────────────────────────── */}
        <div className="section-card space-y-5">
          <div>
            <h3 className="section-title"><User size={15} className="text-primary" /> Profile</h3>
            <p className="section-subtitle">Account info for the current logged-in user.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="field-label">Workspace name</label>
              <input
                className="field-input"
                value={workspaceDraft}
                onChange={(e) => { setWorkspaceDraft(e.target.value); setWorkspaceSaved(false); }}
              />
            </div>
            <div>
              <label className="field-label">Email</label>
              <input className="field-input" value={user.email} disabled />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-[11.5px] text-textFaint">
              Auth backend: <span className="text-textMuted">{mode === 'cloud' ? 'Supabase' : 'Local demo (browser only)'}</span>
            </p>
            <button
              className="btn-pill"
              onClick={async () => {
                if (!workspaceDraft.trim()) return;
                await updateWorkspace(workspaceDraft.trim());
                setWorkspaceSaved(true);
                setTimeout(() => setWorkspaceSaved(false), 2200);
              }}
            >
              {workspaceSaved ? <><CheckCircle2 size={13} /> Saved</> : <><Save size={13} /> Save profile</>}
            </button>
          </div>
        </div>

        {/* ── API Keys ───────────────────────────────────────────── */}
        <div className="section-card space-y-5">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="section-title"><Key size={15} className="text-primary" /> API keys</h3>
              <p className="section-subtitle">
                These power your calls. Stored in your browser's localStorage; cleared on logout if you want.
              </p>
            </div>
            <button
              className="btn-pill"
              onClick={() => {
                if (confirm('Remove all API keys from this browser?')) {
                  clearAll();
                  setDrafts({ vapi: '', deepgram: '', anthropic: '' });
                  setValidations({ vapi: { state: 'idle' }, deepgram: { state: 'idle' }, anthropic: { state: 'idle' } });
                }
              }}
            >
              <Trash2 size={13} /> Remove all
            </button>
          </div>

          <div className="space-y-3">
            {(['vapi', 'deepgram', 'anthropic'] as KeyName[]).map((k) => {
              const meta = KEY_META[k];
              const v = validations[k];
              return (
                <div key={k} className={`key-card ${keys[k] ? 'is-set' : ''}`}>
                  <div className="key-card-row">
                    <div className="key-icon">{meta.icon}</div>
                    <div className="flex-1">
                      <div className="text-[14px] font-semibold text-textMain" style={{ letterSpacing: '-0.01em' }}>
                        {meta.name}
                        {keys[k] && <span className="key-status-pill ml-2" style={{ background: 'rgba(48,209,88,0.15)', color: '#30D158', border: '1px solid rgba(48,209,88,0.30)' }}>
                          <CheckCircle2 size={10} /> Set
                        </span>}
                      </div>
                      <div className="text-[12px] text-textMuted">{meta.subtitle}</div>
                    </div>
                    <a
                      href={meta.helpUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-primary text-[11.5px] inline-flex items-center gap-1"
                      style={{ letterSpacing: '-0.005em' }}
                    >
                      Get key <ExternalLink size={10} />
                    </a>
                  </div>

                  <div className="relative">
                    <input
                      className="field-input field-input-mono pr-20"
                      type={reveal[k] ? 'text' : 'password'}
                      placeholder={meta.placeholder}
                      value={drafts[k]}
                      onChange={(e) => {
                        setDrafts(d => ({ ...d, [k]: e.target.value }));
                        setValidations(v => ({ ...v, [k]: { state: 'idle' } }));
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setReveal(r => ({ ...r, [k]: !r[k] }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-textMuted hover:text-textMain transition-colors"
                    >
                      {reveal[k] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <button onClick={() => test(k)} disabled={!drafts[k] || v.state === 'checking'} className="btn-pill">
                        {v.state === 'checking' ? <><Loader2 size={12} className="animate-spin" /> Testing</> : 'Test'}
                      </button>
                      <button onClick={() => save(k)} disabled={drafts[k] === keys[k]} className="btn-pill btn-primary-pill">
                        <Save size={12} /> Save
                      </button>
                      {keys[k] && (
                        <button
                          onClick={() => { clearKey(k); setDrafts(d => ({ ...d, [k]: '' })); setValidations(v => ({ ...v, [k]: { state: 'idle' } })); }}
                          className="btn-pill"
                        >
                          <Trash2 size={12} /> Clear
                        </button>
                      )}
                    </div>
                    {v.state === 'ok' && <span className="field-success">{v.msg}</span>}
                    {v.state === 'fail' && <span className="field-error">{v.msg}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Data ────────────────────────────────────────────────── */}
        <div className="section-card space-y-4">
          <div>
            <h3 className="section-title"><Database size={15} className="text-primary" /> Call history</h3>
            <p className="section-subtitle">
              {calls.length === 0
                ? 'No calls yet. Your live sessions will appear in Analytics once recorded.'
                : `${calls.length} call${calls.length === 1 ? '' : 's'} stored ${mode === 'cloud' ? 'in Supabase' : 'in this browser'}.`}
            </p>
          </div>
          {calls.length > 0 && (
            <button
              className="btn-pill"
              onClick={() => { if (confirm('Delete all call history? This cannot be undone.')) clearCalls(); }}
            >
              <Trash2 size={13} /> Delete all call history
            </button>
          )}
        </div>

        {/* ── Account ─────────────────────────────────────────────── */}
        <div className="section-card space-y-4">
          <h3 className="section-title"><Sparkles size={15} className="text-primary" /> Account</h3>
          <div className="flex items-center gap-2">
            <button onClick={handleLogout} className="btn-pill" style={{ color: '#FF453A', borderColor: 'rgba(255,69,58,0.3)' }}>
              <LogOut size={13} /> Log out
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
