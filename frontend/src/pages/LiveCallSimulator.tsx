import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Area, AreaChart
} from 'recharts';
import {
  PhoneOff, Sparkles, MessageSquare, AlertTriangle, X, Play, Mic,
  CheckCircle2, XCircle, User, Wifi, Briefcase, KeyRound
} from 'lucide-react';
import Vapi from '@vapi-ai/web';
import { createClient } from "@deepgram/sdk";
import { useKeys } from '../lib/keys';
import { useCalls } from '../lib/calls';
import { useTrial, fetchTrialKeys, consumeTrialCall } from '../lib/trial';
import {
  Persona, IssuePreset, PRESET_PERSONAS, ISSUE_PRESETS,
  buildSystemPrompt, firstMessageFor,
} from '../lib/personas';
import CallSetupModal from '../components/CallSetupModal';

interface CallLine {
  line_index: number;
  speaker: string;
  text: string;
  sentiment: number;
  tone: string;
  is_final: boolean;
  timestamp: string;
}

interface PivotData {
  should_pivot: boolean;
  confidence: number;
  reason: string;
  suggested_pivot_line: string;
  upgrade_to: string;
  monthly_price: string;
}

const GRATITUDE_KEYWORDS = [
  'thank you', 'thanks', 'great', 'amazing', 'wonderful', 'that worked',
  'perfect', 'awesome', 'excellent', 'appreciate', 'fantastic', 'brilliant',
  'so relieved', 'relief', 'fixed', 'works now', 'working now', 'much better'
];

const RESOLUTION_KEYWORDS = [
  'frequency optimization', 'pushed', 'applied', 'should be working',
  'check your connection', 'resolved', 'fix should', 'optimization',
  'updated your router', 'reset your', 'should see'
];

// Default fallback persona/issue (used only when navigating directly into the
// page with route state. The modal supplies a fresh persona for normal flow.
const FALLBACK_PERSONA: Persona = PRESET_PERSONAS[0];
const FALLBACK_ISSUE: IssuePreset = ISSUE_PRESETS[0];

const LiveCallSimulator = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Modal that asks "who's calling?" before each call.
  const [setupOpen, setSetupOpen] = useState(false);

  // Active persona + issue for the current call.
  const [activePersona, setActivePersona] = useState<Persona>(
    (location.state?.persona as Persona) || FALLBACK_PERSONA
  );
  const [activeIssue, setActiveIssue] = useState<IssuePreset>(
    (location.state?.issue as IssuePreset) || FALLBACK_ISSUE
  );
  // Backwards-compat shape used by the right-panel customer card.
  const contact = {
    name: activePersona.name,
    industry: activePersona.industry,
    plan: activePersona.plan,
    tenure: activePersona.tenure,
    peakTime: activePersona.peakTime,
    angle: activePersona.angle,
    issueType: activeIssue.shortLabel,
    issue: activeIssue.shortLabel,
  };

  // ── Existing core state ──────────────────────────────────────────
  const [lines, setLines] = useState<CallLine[]>([]);
  const [sentimentData, setSentimentData] = useState<{ time: number; value: number }[]>([]);
  const [currentTone, setCurrentTone] = useState("Neutral");
  const [pivotData, setPivotData] = useState<PivotData | null>(null);
  const [showPivotNotification, setShowPivotNotification] = useState(false);
  const [callMode, setCallMode] = useState<"support" | "sales">("support");
  const [isFinished, setIsFinished] = useState(false);
  const [callStatus, setCallStatus] = useState<"idle" | "connecting" | "active">("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  // ── New intelligence state ───────────────────────────────────────
  const [currentSentimentScore, setCurrentSentimentScore] = useState(0);
  const [thresholdCrossedIdx, setThresholdCrossedIdx] = useState<number | null>(null);
  const [conditionIssueResolved, setConditionIssueResolved] = useState(false);
  const [conditionSentimentHigh, setConditionSentimentHigh] = useState(false);
  const [conditionGratitudeExpressed, setConditionGratitudeExpressed] = useState(false);
  const [gratitudeTriggerLine, setGratitudeTriggerLine] = useState<CallLine | null>(null);
  const [pivotConfidence, setPivotConfidence] = useState(0);
  const [rightPanelFlash, setRightPanelFlash] = useState(false);
  const [callSummary, setCallSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [modeSwitchElapsed, setModeSwitchElapsed] = useState(0);
  const [sentimentAtSwitch, setSentimentAtSwitch] = useState(0);
  const [isConverted, setIsConverted] = useState(false);

  // ── Refs ─────────────────────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const vapiRef = useRef<any>(null);
  const dgSocketRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const pivotTriggeredRef = useRef(false);
  const conditionSentimentHighRef = useRef(false);
  const conditionIssueResolvedRef = useRef(false);
  const conditionGratitudeRef = useRef(false);
  const elapsedTimeRef = useRef(0);
  const currentSentimentRef = useRef(0);
  const sentimentDataLenRef = useRef(0);

  // ── Per-user keys (from localStorage; entered during onboarding) ──
  const { keys, hasAllRequired, missing } = useKeys();
  const { insertCall } = useCalls();
  const { status: trial, refresh: refreshTrial } = useTrial();
  const ENV_VAPI_KEY = import.meta.env.VITE_VAPI_PUBLIC_KEY || "";
  const ENV_DG_KEY   = import.meta.env.VITE_DEEPGRAM_API_KEY || "";
  // Two paths qualify the user to start a call:
  //   1. They've added their own keys (full BYO).
  //   2. They're on a free trial with calls remaining (we'll fetch trial
  //      keys from the backend right before the call).
  const hasOwnKeys = hasAllRequired || (keys.vapi && keys.deepgram && keys.xai);
  const hasEnvKeys = !!(ENV_VAPI_KEY && ENV_DG_KEY);
  const trialAvailable = trial.trialActive && trial.remaining > 0;
  const isConfigured = hasOwnKeys || hasEnvKeys || trialAvailable;
  // Track the keys actually used for the in-flight call so we know whether
  // to decrement the trial counter when it ends.
  const trialUsedThisCallRef = useRef(false);

  // ── Derived ───────────────────────────────────────────────────────
  const allConditionsMet =
    conditionIssueResolved && conditionSentimentHigh && conditionGratitudeExpressed;

  // ── Sync elapsed to ref ───────────────────────────────────────────
  useEffect(() => { elapsedTimeRef.current = elapsedTime; }, [elapsedTime]);

  // ── Auto-scroll transcript ────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [lines]);

  // ── Call timer ────────────────────────────────────────────────────
  useEffect(() => {
    if (callStatus === "active") {
      timerRef.current = setInterval(() => setElapsedTime(p => p + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [callStatus]);

  // ── Watch all 3 conditions → trigger mode switch ──────────────────
  useEffect(() => {
    if (allConditionsMet && !pivotTriggeredRef.current && callStatus === 'active') {
      pivotTriggeredRef.current = true;
      setCallMode('sales');
      setShowPivotNotification(true);
      setRightPanelFlash(true);
      setModeSwitchElapsed(elapsedTimeRef.current);
      setSentimentAtSwitch(currentSentimentRef.current);
      vapiRef.current?.say(
        "INTERNAL SIGNAL: Gratitude window confirmed. Issue resolved. " +
        "Customer sentiment positive. Switch to SALES MODE now. Your next " +
        "response must begin the natural transition to the Fiber Pro upgrade conversation."
      );
      setTimeout(() => setRightPanelFlash(false), 1600);
    }
  }, [allConditionsMet, callStatus]);

  // startCall: accepts the persona + issue selected in the setup modal.
  // Resolves API keys in priority order:
  //   1. User's own keys (entered in Onboarding/Settings)
  //   2. Build-time VITE_* env keys (local-dev escape hatch)
  //   3. Free-trial keys minted by the backend
  const startCall = async (persona: Persona = activePersona, issue: IssuePreset = activeIssue) => {
    // Decide which keys to use up-front so the rest of the function reads them
    // from locals instead of reactive state.
    let vapiKey = keys.vapi || ENV_VAPI_KEY;
    let dgKey   = keys.deepgram || ENV_DG_KEY;
    let usedTrial = false;

    if (!vapiKey || !dgKey) {
      // Need to fall back to the trial path
      if (!trialAvailable) {
        setError("API keys are not configured. Open Settings to add your Vapi, Deepgram, and xAI keys, or activate the free trial from Onboarding.");
        return;
      }
      try {
        setCallStatus("connecting");
        setError(null);
        const tk = await fetchTrialKeys();
        vapiKey = tk.vapiPublicKey;
        dgKey = tk.deepgramToken;
        usedTrial = true;
      } catch (e: any) {
        const msg = e?.message === 'TRIAL_EXHAUSTED'
          ? "You've used all your free trial calls. Add your own API keys in Settings to keep going."
          : `Could not start trial call: ${e?.message || 'unknown error'}`;
        setError(msg);
        setCallStatus("idle");
        return;
      }
    }
    trialUsedThisCallRef.current = usedTrial;
    setActivePersona(persona);
    setActiveIssue(issue);
    try {
      setCallStatus("connecting");
      setError(null);
      setLines([]);
      setSentimentData([]);
      setElapsedTime(0);
      setCallMode("support");
      setShowPivotNotification(false);
      pivotTriggeredRef.current = false;
      // Reset intelligence state
      setCurrentSentimentScore(0);
      setThresholdCrossedIdx(null);
      setConditionIssueResolved(false);
      setConditionSentimentHigh(false);
      setConditionGratitudeExpressed(false);
      setGratitudeTriggerLine(null);
      setPivotConfidence(0);
      setRightPanelFlash(false);
      setCallSummary(null);
      setSummaryLoading(false);
      setModeSwitchElapsed(0);
      setSentimentAtSwitch(0);
      setIsConverted(false);
      setIsFinished(false);
      conditionSentimentHighRef.current = false;
      conditionIssueResolvedRef.current = false;
      conditionGratitudeRef.current = false;
      currentSentimentRef.current = 0;
      sentimentDataLenRef.current = 0;

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        setError("Microphone access denied. Please enable permissions.");
        setCallStatus("idle");
        return;
      }

      const connectionTimeout = setTimeout(() => {
        if (vapiRef.current) {
          console.error("[ShiftCall] Connection timed out after 15s");
          setError("Connection timed out. Check your API keys and try again.");
          setCallStatus("idle");
          try { vapiRef.current.stop(); } catch (_) {}
          try { dgSocketRef.current?.finish(); } catch (_) {}
        }
      }, 15000);

      console.log("[ShiftCall] Initializing Deepgram...");
      const deepgram = createClient(dgKey);
      const dgSocket = deepgram.listen.live({
        model: "nova-2", language: "en-US", smart_format: true,
        interim_results: true, diarize: true, endpointing: 300, punctuate: true,
      });
      dgSocketRef.current = dgSocket;

      dgSocket.on("open", () => {
        console.log("[ShiftCall] Deepgram connected ✓");
        const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mr.addEventListener('dataavailable', e => {
          if (e.data.size > 0 && dgSocket.getReadyState() === 1) dgSocket.send(e.data);
        });
        mr.start(250);
      });
      dgSocket.on("error", (err: any) => console.error("[ShiftCall] Deepgram error:", err));
      dgSocket.on("transcript", (data: any) => {
        const transcript = data.channel.alternatives[0].transcript;
        if (!transcript) return;
        const speaker = data.channel.alternatives[0].words[0]?.speaker === 1 ? "Agent" : "Customer";
        handleTranscriptUpdate(speaker, transcript, data.is_final);
      });

      console.log("[ShiftCall] Initializing Vapi...");
      const vapi = new Vapi(vapiKey);
      vapiRef.current = vapi;

      vapi.on('call-start', () => {
        console.log("[ShiftCall] Vapi call started ✓");
        clearTimeout(connectionTimeout);
        setCallStatus("active");
      });

      // ── Capture live transcripts from BOTH sides via Vapi ──
      vapi.on('message', (msg: any) => {
        if (msg.type !== 'transcript') return;
        const speaker = msg.role === 'assistant' ? 'Agent' : 'Customer';
        const text: string = msg.transcript || '';
        const isFinal = msg.transcriptType === 'final';
        if (text.trim()) handleTranscriptUpdate(speaker, text, isFinal);
      });
      vapi.on('call-end', () => {
        console.log("[ShiftCall] Vapi call ended");
        clearTimeout(connectionTimeout);
        setIsFinished(true);
      });
      vapi.on('error', (err: any) => {
        console.error("[ShiftCall] Vapi error:", JSON.stringify(err, null, 2));
        clearTimeout(connectionTimeout);
        const msg = err?.message || err?.error?.message || err?.error?.statusMessage ||
          (typeof err === 'string' ? err : JSON.stringify(err));
        setError(`Vapi error: ${msg}`);
        setCallStatus("idle");
      });

      try {
        await vapi.start({
          name: "Aria - BrightFiber AI Support Agent",
          voice: { provider: "deepgram", voiceId: "asteria" },
          firstMessage: firstMessageFor(persona),
          model: {
            provider: "openai", model: "gpt-4",
            messages: [{
              role: "system",
              content: buildSystemPrompt(persona, issue),
            }]
          }
        });
        console.log(`[ShiftCall] vapi.start() resolved. caller: ${persona.name}, issue: ${issue.shortLabel}`);
      } catch (vapiErr: any) {
        console.error("[ShiftCall] vapi.start() threw:", vapiErr);
        clearTimeout(connectionTimeout);
        setError(`Vapi failed to start: ${vapiErr?.message || JSON.stringify(vapiErr)}`);
        setCallStatus("idle");
      }
    } catch (err: any) {
      setError(`Failed to start call: ${err.message}`);
      setCallStatus("idle");
    }
  };

  // ── handleTranscriptUpdate ────────────────────────────────────────
  // Agent: always accumulate into one bubble until Customer speaks next.
  // Customer: accumulate partials until final, then lock.
  const handleTranscriptUpdate = (speaker: string, text: string, isFinal: boolean) => {
    setLines(prev => {
      const lastLine = prev[prev.length - 1];
      let updatedLine: CallLine;
      let newLines: CallLine[];

      const shouldMerge =
        lastLine &&
        lastLine.speaker === speaker &&
        (speaker === 'Agent' || !lastLine.is_final); // Agent: always merge; Customer: merge until final

      if (shouldMerge) {
        // For Agent: append the new sentence (space-separated). For Customer: replace with latest partial.
        const mergedText = speaker === 'Agent'
          ? (lastLine.text + ' ' + text).trim()
          : text;
        updatedLine = { ...lastLine, text: mergedText, is_final: isFinal, timestamp: new Date().toISOString() };
        newLines = [...prev];
        newLines[newLines.length - 1] = updatedLine;
      } else {
        updatedLine = {
          line_index: prev.length, speaker, text, is_final: isFinal,
          sentiment: lastLine?.sentiment || 0, tone: lastLine?.tone || 'Neutral',
          timestamp: new Date().toISOString()
        };
        newLines = [...prev, updatedLine];
      }

      if (isFinal) {
        const lower = text.toLowerCase();

        // Customer gratitude detection
        if (speaker === 'Customer' && !conditionGratitudeRef.current) {
          if (GRATITUDE_KEYWORDS.some(k => lower.includes(k))) {
            conditionGratitudeRef.current = true;
            setConditionGratitudeExpressed(true);
            setGratitudeTriggerLine(updatedLine);
          }
        }

        // Agent resolution detection
        if (speaker === 'Agent' && !conditionIssueResolvedRef.current) {
          if (RESOLUTION_KEYWORDS.some(k => lower.includes(k)) ||
            (lower.includes('check') && lower.includes('connection')) ||
            (lower.includes('should') && lower.includes('work'))) {
            conditionIssueResolvedRef.current = true;
            setConditionIssueResolved(true);
          }
        }

        // Customer interest in upgrade (post-switch)
        if (speaker === 'Customer' && pivotTriggeredRef.current) {
          const upgradeKw = ['yes', 'sure', 'sounds good', 'tell me more', 'how much', 'interested', "let's do it", 'sign me up'];
          if (upgradeKw.some(k => lower.includes(k))) setIsConverted(true);
        }

        if (speaker === 'Customer') triggerSentimentAndPivot(text, newLines);
      }

      return newLines;
    });
  };

  const triggerSentimentAndPivot = async (text: string, currentLines: CallLine[]) => {
    fetchSentimentStreaming(text, currentLines);
    if (!pivotTriggeredRef.current) detectPivotSignal(currentLines);
  };

  // ── fetchSentimentStreaming (enhanced with condition tracking) ─────
  const fetchSentimentStreaming = async (text: string, history: CallLine[]) => {
    try {
      const response = await fetch('/api/sentiment-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, history })
      });
      if (!response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        const sm = accumulated.match(/sentiment":\s*(-?\d*\.?\d+)/);
        const tm = accumulated.match(/tone":\s*"([^"]+)"/);
        if (sm) {
          const val = parseFloat(sm[1]);
          const t = elapsedTimeRef.current;
          setSentimentData(prev => {
            const updated = [...prev, { time: t, value: val }];
            sentimentDataLenRef.current = updated.length;
            return updated;
          });
          setCurrentSentimentScore(val);
          currentSentimentRef.current = val;

          // Sentiment threshold condition
          if (val > 0.4 && !conditionSentimentHighRef.current) {
            conditionSentimentHighRef.current = true;
            setConditionSentimentHigh(true);
            setThresholdCrossedIdx(sentimentDataLenRef.current - 1);
          }

          if (tm) setCurrentTone(tm[1]);
        }
      }
    } catch (e) { console.error("Sentiment error", e); }
  };

  // ── detectPivotSignal (capture confidence) ────────────────────────
  const detectPivotSignal = async (transcript: CallLine[]) => {
    try {
      const response = await fetch('/api/detect-pivot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript })
      });
      const data: PivotData = await response.json();
      if (data.should_pivot && !pivotTriggeredRef.current) {
        setPivotData(data);
        setPivotConfidence(Math.round((data.confidence || 0.94) * 100));
      }
    } catch (e) { console.error("Pivot error", e); }
  };

  // ── endCall (no immediate navigate; fetch summary instead) ────────
  const endCall = async () => {
    vapiRef.current?.stop();
    dgSocketRef.current?.finish();
    setIsFinished(true);
    setCallStatus("idle");
    setSummaryLoading(true);

    let summary: any = null;
    let converted = false;

    try {
      const response = await fetch('/api/analyze-call', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Pass the user's xAI key so the backend can use it per request
          ...(keys.xai ? { 'X-XAI-Key': keys.xai } : {}),
        },
        body: JSON.stringify({ transcript: lines })
      });
      const data = await response.json();
      summary = data.summary || data.analysis || null;
      setCallSummary(summary);
      if (data.converted !== undefined) {
        converted = data.converted;
        setIsConverted(converted);
      }
    } catch {
      setCallSummary(null);
    } finally {
      setSummaryLoading(false);
    }

    // ─── Persist this call to the user's history ──────────────────
    try {
      const finalArc = sentimentData.length > 0
        ? sentimentData.map(p => p.value)
        : [0];
      const lastSentiment = finalArc[finalArc.length - 1] ?? 0;
      const switched = modeSwitchElapsed > 0;

      await insertCall({
        customer: contact?.name || 'Unknown caller',
        issue: contact?.issue || 'General inquiry',
        duration: fmt(elapsedTime),
        switch_at: switched ? fmt(modeSwitchElapsed) : '-',
        sentiment: (lastSentiment >= 0 ? '+' : '') + lastSentiment.toFixed(2),
        outcome: converted ? 'converted' : 'missed',
        industry: contact?.industry || '-',
        plan: contact?.plan || '-',
        support_exchanges: lines.filter(l => l.speaker === 'Agent' || l.speaker === 'User').length,
        sales_exchanges: switched ? Math.max(1, Math.round(lines.length / 3)) : 0,
        autonomous_score: Math.min(100, Math.round(70 + lastSentiment * 30)),
        frustration_handled: (finalArc[0] ?? 0) < 0 ? 'Strong' : 'Partial',
        gratitude_spotting: switched ? 'Precise' : 'Missed',
        sales_transition: converted ? 'Smooth' : (switched ? 'Partial' : 'Missed'),
        sentiment_arc: finalArc,
        gratitude_trigger: gratitudeTriggerLine?.text || '',
        pivot_reason: switched ? 'Sentiment > 0.4 + gratitude detected' : 'Pivot conditions not met',
        call_summary: typeof summary === 'string' ? summary : JSON.stringify(summary || {}).slice(0, 500),
        revenue_added: converted ? '+$30/mo' : '$0',
        switch_triggers: [
          { label: 'Issue resolved',      met: conditionIssueResolved },
          { label: 'Sentiment above 0.4', met: lastSentiment > 0.4 },
          { label: 'Gratitude expressed', met: conditionGratitudeExpressed },
        ],
      });
    } catch (e) {
      console.error('Failed to persist call:', e);
    }

    // ─── Decrement trial counter if this was a free-trial call ────
    if (trialUsedThisCallRef.current) {
      try {
        await consumeTrialCall();
        await refreshTrial();
      } catch (e) {
        console.error('Failed to decrement trial counter:', e);
      } finally {
        trialUsedThisCallRef.current = false;
      }
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────
  const toneBadgeClass = () => {
    if (['Frustrated', 'Tense'].includes(currentTone)) return 'bg-red-500/20 text-red-400 border-red-500/30';
    if (['Relieved', 'Warm', 'Grateful'].includes(currentTone)) return 'bg-success/20 text-success border-success/30';
    if (currentTone === 'Explaining') return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
    return 'bg-white/10 text-textMuted border-white/20';
  };
  const scoreColor = currentSentimentScore > 0.4 ? '#F59E0B' : currentSentimentScore > 0 ? '#2DD4BF' : '#EF4444';
  const chartLineColor = conditionSentimentHigh ? '#F59E0B' : '#2DD4BF';
  const chartFillColor = callMode === 'sales' ? '#F59E0B' : '#378ADD';
  const fmt = (s: number) => `${Math.floor(s / 60)}m ${(s % 60).toString().padStart(2, '0')}s`;

  // ── JSX ───────────────────────────────────────────────────────────
  return (
    <div className="pca-page">
      <div className="pca-page-header">
        <div className="pca-eyebrow"><Sparkles size={13} /> Aria Intelligence</div>
        <h1 className="pca-page-title">Live Call Simulator</h1>
        <p className="pca-page-sub">Experience Aria autonomously managing support and sales transitions in real time.</p>
      </div>

      <div className="pca-content">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-[calc(100vh-20rem)] relative">

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="glass-panel p-8 max-w-md border-danger/30 space-y-6">
            <div className="flex items-center gap-3 text-danger"><AlertTriangle size={32} /><h2 className="text-xl font-bold">Error</h2></div>
            <p className="text-textMain leading-relaxed">{error}</p>
            <button onClick={() => setError(null)} className="w-full bg-white/10 py-3 rounded-xl font-bold">Dismiss</button>
          </div>
        </div>
      )}

      {/* ── LEFT PANEL: Transcript ─────────────────────────────── */}
      <div className="lg:col-span-8 flex flex-col glass-panel overflow-hidden border-white/5">
        {/* Header bar */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between bg-panel/50">
          <div className="flex items-center gap-3">
            {callStatus === "active" ? (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <span className="text-sm font-medium text-white">Live Call: Aria Agent</span>
              </div>
            ) : (
              <span className="text-sm font-medium text-textMuted">
                {callStatus === "connecting" ? "Connecting..." : "Waiting to Start"}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Mode Indicator Pill (Change 2) */}
            {callStatus === "active" && (
              <div
                className="px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest transition-all duration-700"
                style={{
                  background: callMode === 'support' ? 'rgba(55,138,221,0.2)' : 'rgba(245,158,11,0.2)',
                  color: callMode === 'support' ? '#378ADD' : '#F59E0B',
                  border: `1px solid ${callMode === 'support' ? 'rgba(55,138,221,0.4)' : 'rgba(245,158,11,0.5)'}`,
                  boxShadow: callMode === 'sales' ? '0 0 12px rgba(245,158,11,0.2)' : 'none',
                }}
              >
                {callMode === 'support' ? '● Support Mode' : '⚡ Sales Mode'}
              </div>
            )}
            {/* Tone badge */}
            <div className={`px-3 py-1 rounded-full text-xs font-bold border transition-all duration-500 ${toneBadgeClass()}`}>
              {currentTone}
            </div>
            {/* End Call */}
            {callStatus === "active" && (
              <button
                onClick={endCall}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-danger/20 text-danger border border-danger/30 rounded-lg text-xs font-bold hover:bg-danger/30 transition-all"
              >
                <PhoneOff size={12} /> End Call
              </button>
            )}
          </div>
        </div>

        {/* Transcript scroll area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 relative" ref={scrollRef}>
          {/* Pivot banner */}
          {showPivotNotification && (
            <div className="sticky top-0 z-10 w-full animate-slide-down">
              <div className="bg-secondary/20 border border-secondary/30 backdrop-blur-md rounded-xl p-3 flex items-center justify-between mb-6 shadow-xl">
                <div className="flex items-center gap-3 text-secondary text-sm font-medium">
                  <Sparkles size={18} className="animate-pulse" />
                  Gratitude Window Detected. Aria autonomously switching to Sales Mode.
                </div>
                <button onClick={() => setShowPivotNotification(false)} className="text-secondary/60 hover:text-secondary"><X size={16} /></button>
              </div>
            </div>
          )}

          {/* Idle */}
          {callStatus === "idle" && !isFinished && (
            <div className="h-full flex flex-col items-center justify-center space-y-6">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center text-primary"><Mic size={40} /></div>
              {!isConfigured ? (
                <div className="text-center space-y-4 max-w-sm">
                  <div className="bg-secondary/10 border border-secondary/20 p-4 rounded-xl text-secondary text-sm">
                    <p className="font-bold flex items-center justify-center gap-2 mb-1"><KeyRound size={16} /> Activate your workspace</p>
                    <p className="opacity-80">
                      {missing.length === 1
                        ? `Add your ${missing[0]} key to enable live calls.`
                        : `${missing.length} API keys missing: ${missing.join(', ')}.`}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-textMuted text-center max-w-xs text-sm">
                  Autonomous interaction simulator. Pick a customer + issue and Aria will roleplay it live.
                </p>
              )}
              <button
                onClick={() => isConfigured ? setSetupOpen(true) : navigate('/settings')}
                className={`px-8 py-3 rounded-xl font-bold transition-all flex items-center gap-2 ${
                  isConfigured ? "bg-primary text-background hover:scale-105" : "bg-white/10 text-textMain hover:bg-white/15 border border-white/15"
                }`}
              >
                {isConfigured ? <Play size={18} fill="currentColor" /> : <KeyRound size={18} />}
                {isConfigured ? "Set up new call" : "Open Settings to add keys"}
              </button>
            </div>
          )}

          {/* Transcript lines */}
          {lines.map((line, idx) => (
            <div key={idx} className={`flex flex-col ${line.speaker === 'Agent' ? 'items-start' : 'items-end'} space-y-1`}>
              <div className="flex items-center gap-2 px-1">
                <div className={`w-1.5 h-1.5 rounded-full ${line.speaker === 'Agent' ? 'bg-primary' : 'bg-white'}`} />
                <span className="text-[10px] font-bold uppercase tracking-widest text-textMuted">
                  {line.speaker === 'Agent' ? 'Aria (AI)' : 'You (Customer)'}
                </span>
              </div>
              <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-[15px] leading-relaxed shadow-lg ${
                line.speaker === 'Agent'
                  ? "bg-primary/10 text-primary border border-primary/20 rounded-tl-none"
                  : "bg-white/5 text-textMain border border-white/10 rounded-tr-none"
              }`}>
                {line.text}
              </div>
            </div>
          ))}

          {/* Post-call navigate button */}
          {isFinished && (
            <div className="flex justify-center pt-8">
              <button
                onClick={() => navigate('/analytics', {
                  state: {
                    transcript: lines, sentiment: sentimentData,
                    modeSwitchTime: modeSwitchElapsed, sentimentAtSwitch,
                    gratitudeTriggerLine, pivotConfidence, isConverted
                  }
                })}
                className="bg-textMain text-background px-8 py-3 rounded-xl font-bold hover:bg-white transition-all shadow-xl flex items-center gap-2"
              >
                <PhoneOff size={18} /> Full Analytics Dashboard
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL ────────────────────────────────────────── */}
      <div
        className={`lg:col-span-4 flex flex-col gap-4 overflow-y-auto transition-all ${rightPanelFlash ? 'animate-border-flash' : ''}`}
      >
        {!isFinished ? (
          <>
            {/* Customer Info Card */}
            <div className="glass-panel p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">
                  {contact.name.split(' ').map((n: string) => n[0]).join('')}
                </div>
                <div>
                  <p className="font-semibold text-white text-sm">{contact.name}</p>
                  <p className="text-[10px] text-textMuted uppercase tracking-wider">{contact.industry}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { icon: <Briefcase size={11} />, label: 'Plan', value: contact.plan || 'Basic ($39/mo)' },
                  { icon: <Wifi size={11} />, label: 'Issue', value: contact.issueType || 'Wifi drops' },
                  { icon: <User size={11} />, label: 'Tenure', value: contact.tenure || '2 years' },
                  { icon: <MessageSquare size={11} />, label: 'Peak', value: contact.peakTime || '7–10pm' },
                ].map(({ icon, label, value }) => (
                  <div key={label} className="bg-white/[0.03] rounded-lg p-2.5 space-y-0.5">
                    <div className="flex items-center gap-1 text-textMuted">{icon}<span className="text-[9px] uppercase tracking-wider font-bold">{label}</span></div>
                    <p className="text-xs text-white font-medium truncate">{value}</p>
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-primary/80 italic leading-relaxed border-t border-white/5 pt-3">
                {contact.angle}
              </div>
            </div>

            {/* Change 4: Gratitude Window Banner */}
            {allConditionsMet && (
              <div
                className="glass-panel p-4 flex items-center justify-between animate-slide-down pulse-amber"
                style={{ borderColor: 'rgba(245,158,11,0.5)', background: 'rgba(245,158,11,0.07)' }}
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-bold text-secondary">Gratitude Window Open</p>
                  <p className="text-xs text-textMuted">Aria switching to Sales Mode</p>
                </div>
                <div className="px-3 py-1 bg-success/20 text-success text-xs font-bold rounded-full border border-success/30">
                  {pivotConfidence > 0 ? `${pivotConfidence}%` : '94%'} confidence
                </div>
              </div>
            )}

            {/* Change 1: Sentiment Chart */}
            <div className="glass-panel p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-textMuted uppercase tracking-wider flex items-center gap-2">
                  <MessageSquare size={13} className="text-primary" /> Customer Sentiment
                </h3>
                <span className="text-[10px] font-mono text-textMuted">{elapsedTime}s</span>
              </div>
              <div className="h-[160px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={sentimentData}>
                    <defs>
                      <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={chartFillColor} stopOpacity={0.18} />
                        <stop offset="95%" stopColor={chartFillColor} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                    <YAxis domain={[-1, 1]} ticks={[-1, 0, 0.4, 1]} stroke="#7D8590" fontSize={9} axisLine={false} tickLine={false} width={26} />
                    <Tooltip contentStyle={{ backgroundColor: '#161B22', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '11px' }} />
                    <ReferenceLine y={0} stroke="#ffffff10" />
                    <ReferenceLine y={0.4} stroke="#F59E0B" strokeDasharray="5 5" label={{ position: 'right', value: 'Pivot', fill: '#F59E0B', fontSize: 8 }} />
                    {thresholdCrossedIdx !== null && (
                      <ReferenceLine x={thresholdCrossedIdx} stroke="#F59E0B" strokeOpacity={0.6}
                        label={{ position: 'top', value: 'Threshold crossed', fill: '#F59E0B', fontSize: 8 }} />
                    )}
                    <Area
                      type="monotone" dataKey="value"
                      stroke={chartLineColor} strokeWidth={2.5}
                      fill="url(#sentGrad)" fillOpacity={1}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Change 3: Live Intelligence Card */}
            <div className="glass-panel p-5 flex-1 space-y-4">
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">Live Intelligence</p>

              {/* Score + Tone */}
              <div className="text-center space-y-2">
                <div
                  className="text-5xl font-bold tabular-nums"
                  style={{ color: scoreColor, transition: 'color 0.5s ease' }}
                >
                  {currentSentimentScore >= 0 ? '+' : ''}{currentSentimentScore.toFixed(2)}
                </div>
                <span className={`inline-block px-3 py-0.5 rounded-full text-xs font-bold border transition-all duration-300 ${toneBadgeClass()}`}>
                  {currentTone}
                </span>
              </div>

              {/* 3 Condition rows */}
              <div className="space-y-2.5 pt-3 border-t border-white/5">
                {[
                  { label: 'Issue resolved', met: conditionIssueResolved },
                  { label: 'Sentiment above 0.4', met: conditionSentimentHigh },
                  { label: 'Gratitude expressed', met: conditionGratitudeExpressed },
                ].map(({ label, met }) => (
                  <div key={label} className="flex items-center justify-between">
                    <span className="text-sm text-textMuted">{label}</span>
                    <div className={`flex items-center gap-1 transition-all duration-500 ${met ? 'text-success' : 'text-danger/50'}`}>
                      {met
                        ? <CheckCircle2 size={16} className="animate-check-pop" />
                        : <XCircle size={16} />
                      }
                    </div>
                  </div>
                ))}
              </div>

              {/* Aria status row */}
              <div className="pt-3 border-t border-white/5 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-textMuted">Core Model</span><span className="text-white font-mono">GPT-4 Omni</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-textMuted">Transcription</span><span className="text-white font-mono">Deepgram Nova-2</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* ── Post-call right panel ──────────────────── */
          <>
            {/* Section A: Outcome */}
            <div
              className="rounded-xl p-6 space-y-3 border"
              style={{
                background: isConverted ? '#0A1F0A' : '#1F0A0A',
                borderColor: isConverted ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
              }}
            >
              <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: isConverted ? '#22C55E' : '#EF4444' }}>
                Outcome
              </p>
              <div className="text-xl font-bold" style={{ color: isConverted ? '#22C55E' : '#EF4444' }}>
                {isConverted ? 'Converted to Fiber Pro' : 'Not Converted'}
              </div>
              {isConverted && <div className="text-sm font-bold text-primary">+$30/mo revenue added</div>}
              <div className="flex gap-4 pt-1">
                <div className="text-[10px] text-textMuted">
                  Mode switched at <span className="text-white font-mono">{fmt(modeSwitchElapsed)}</span>
                </div>
                <div className="text-[10px] text-textMuted">
                  Sentiment at switch: <span className="font-mono" style={{ color: '#F59E0B' }}>+{sentimentAtSwitch.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Section B: AI Call Summary */}
            <div className="glass-panel p-5 space-y-3">
              <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">Call Summary</p>
              {summaryLoading ? (
                <div className="flex items-center gap-3 text-textMuted text-sm py-4">
                  <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  Aria is generating summary...
                </div>
              ) : (
                <p className="text-sm text-textMain leading-relaxed">
                  {callSummary || "Aria handled the customer's issue end-to-end and attempted a natural transition into the upsell conversation once the Gratitude Window opened."}
                </p>
              )}
            </div>

            {/* Section C: Gratitude Trigger Quote */}
            {gratitudeTriggerLine && (
              <div className="glass-panel p-5 space-y-3">
                <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest">Gratitude Window · Trigger Phrase</p>
                <div className="border-l-2 pl-4 py-1" style={{ borderColor: '#F59E0B' }}>
                  <p className="text-sm text-textMain italic leading-relaxed">"{gratitudeTriggerLine.text}"</p>
                  <div className="mt-2 space-y-0.5">
                    <p className="text-[10px] text-textMuted">
                      Spoken at {new Date(gratitudeTriggerLine.timestamp).toLocaleTimeString()}
                    </p>
                    <p className="text-[10px] text-textMuted">
                      Confidence: <span className="text-success">{pivotConfidence > 0 ? pivotConfidence : 94}%</span>
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
    </div>

      <CallSetupModal
        open={setupOpen}
        onCancel={() => setSetupOpen(false)}
        onConfirm={(persona, issue) => {
          setSetupOpen(false);
          startCall(persona, issue);
        }}
      />
    </div>
  );
};

export default LiveCallSimulator;
