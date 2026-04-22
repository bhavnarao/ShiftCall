import React, { useMemo, useState } from 'react';
import { X, Phone, User, Sparkles, ChevronRight } from 'lucide-react';
import { useAuth } from '../lib/auth';
import {
  PRESET_PERSONAS, ISSUE_PRESETS, Persona, IssuePreset,
} from '../lib/personas';

interface Props {
  open: boolean;
  onCancel: () => void;
  onConfirm: (persona: Persona, issue: IssuePreset) => void;
}

const CUSTOM_ID = 'custom';
const ME_ID = 'me';

const CallSetupModal: React.FC<Props> = ({ open, onCancel, onConfirm }) => {
  const { user } = useAuth();

  // Build the dynamic options: [It's me] + presets + [Custom]
  const personaOptions = useMemo<Persona[]>(() => {
    const meName = user?.workspaceName?.trim() || (user?.email?.split('@')[0]) || 'You';
    const me: Persona = {
      id: ME_ID,
      name: meName,
      industry: 'Self (testing)',
      plan: 'Basic ($39/mo)',
      tenure: 'New customer',
      peakTime: 'Anytime',
      score: 90,
      angle: `${meName} is testing the system as themselves.`,
      voiceNote: 'Aria will greet you by your workspace name.',
      isYou: true,
    };
    const custom: Persona = {
      id: CUSTOM_ID,
      name: '',
      industry: '',
      plan: '',
      tenure: '',
      peakTime: '',
      score: 80,
      angle: '',
      voiceNote: 'Define a fresh customer from scratch.',
      isCustom: true,
    };
    return [me, ...PRESET_PERSONAS, custom];
  }, [user]);

  const [selectedPersonaId, setSelectedPersonaId] = useState<string>(ME_ID);
  const [selectedIssueId, setSelectedIssueId] = useState<string>(ISSUE_PRESETS[0].id);
  const [customName, setCustomName] = useState('');
  const [customPlan, setCustomPlan] = useState('Basic ($39/mo)');
  const [customTenure, setCustomTenure] = useState('1 year');
  const [customIndustry, setCustomIndustry] = useState('Residential');

  const selectedPersona = personaOptions.find(p => p.id === selectedPersonaId)!;
  const selectedIssue = ISSUE_PRESETS.find(i => i.id === selectedIssueId)!;

  const isCustomReady = !selectedPersona.isCustom || customName.trim().length > 1;
  const canStart = !!selectedIssue && isCustomReady;

  const handleStart = () => {
    let persona = selectedPersona;
    if (persona.isCustom) {
      persona = {
        ...persona,
        name: customName.trim(),
        industry: customIndustry.trim() || 'Residential',
        plan: customPlan.trim() || 'Basic ($39/mo)',
        tenure: customTenure.trim() || '1 year',
        peakTime: 'Varies',
        angle: `${customName.trim()}, ${customIndustry || 'Residential'} customer on ${customPlan}.`,
      };
    }
    onConfirm(persona, selectedIssue);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
      <div className="call-setup-modal">
        <div className="call-setup-header">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-textMuted flex items-center gap-2">
              <Sparkles size={12} /> New simulation
            </p>
            <h2 className="text-2xl font-semibold text-white mt-1">Who's calling Aria today?</h2>
            <p className="text-sm text-textMuted mt-1">
              Pick a customer and the issue. Aria will use this context for the entire call.
            </p>
          </div>
          <button onClick={onCancel} className="call-setup-close" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="call-setup-body">
          {/* ── Persona section ─────────────────────────── */}
          <div>
            <p className="field-label mb-3">Customer</p>
            <div className="persona-grid">
              {personaOptions.map(p => {
                const active = p.id === selectedPersonaId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPersonaId(p.id)}
                    className={`persona-card ${active ? 'is-active' : ''}`}
                  >
                    <div className="persona-card-top">
                      <div className="persona-avatar">
                        {p.isCustom ? '+' : (p.name || '?').split(' ').map(n => n[0]).slice(0, 2).join('')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="persona-name">
                          {p.isYou ? `${p.name} (you)` : p.isCustom ? 'Custom customer' : p.name}
                        </p>
                        <p className="persona-meta">{p.industry || 'Define your own'}</p>
                      </div>
                    </div>
                    {!p.isCustom && (
                      <p className="persona-angle">{p.voiceNote || p.angle}</p>
                    )}
                    {p.isCustom && (
                      <p className="persona-angle">Build a fresh persona below.</p>
                    )}
                  </button>
                );
              })}
            </div>

            {selectedPersona.isCustom && (
              <div className="custom-persona-form">
                <div>
                  <label className="field-label" htmlFor="custom-name">Customer name</label>
                  <input
                    id="custom-name" className="field-input" placeholder="e.g. Maya Patel"
                    value={customName} onChange={e => setCustomName(e.target.value)} autoFocus
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="field-label" htmlFor="custom-plan">Plan</label>
                    <input id="custom-plan" className="field-input" value={customPlan}
                      onChange={e => setCustomPlan(e.target.value)} />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="custom-tenure">Tenure</label>
                    <input id="custom-tenure" className="field-input" value={customTenure}
                      onChange={e => setCustomTenure(e.target.value)} />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="custom-industry">Segment</label>
                    <input id="custom-industry" className="field-input" value={customIndustry}
                      onChange={e => setCustomIndustry(e.target.value)} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── Issue section ─────────────────────────── */}
          <div>
            <p className="field-label mb-3">Reason for the call</p>
            <div className="issue-grid">
              {ISSUE_PRESETS.map(i => {
                const active = i.id === selectedIssueId;
                return (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => setSelectedIssueId(i.id)}
                    className={`issue-pill ${active ? 'is-active' : ''}`}
                  >
                    {i.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-textMuted mt-2 leading-relaxed">
              {selectedIssue.description}
            </p>
          </div>
        </div>

        {/* ── Footer ─────────────────────────── */}
        <div className="call-setup-footer">
          <div className="text-xs text-textMuted flex items-center gap-2 min-w-0">
            <User size={12} />
            <span className="truncate">
              Aria will greet{' '}
              <span className="text-white font-medium">
                {selectedPersona.isCustom
                  ? (customName.trim() || 'your custom customer')
                  : selectedPersona.name}
              </span>
              {' '}about {selectedIssue.shortLabel.toLowerCase()}.
            </span>
          </div>
          <div className="footer-actions">
            <button onClick={onCancel} className="btn-block btn-block-ghost call-setup-btn">
              Cancel
            </button>
            <button
              onClick={handleStart}
              disabled={!canStart}
              className="btn-block btn-block-primary call-setup-btn flex items-center justify-center gap-2"
            >
              <Phone size={14} /> Start call <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CallSetupModal;
