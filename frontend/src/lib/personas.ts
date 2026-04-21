// Customer personas + issue presets used by the Live Call Simulator.
// These build the prompt sent to Aria so she addresses each caller correctly
// (instead of greeting everyone as "Sarah Mitchell").

export interface Persona {
  id: string;
  name: string;
  industry: string;
  plan: string;
  tenure: string;
  peakTime: string;
  score: number;
  angle: string;          // one-line story Aria uses for context
  voiceNote?: string;     // shown in UI to set vibe
  isYou?: boolean;        // marker for "It's me" persona
  isCustom?: boolean;     // marker for the "Custom" form
}

export const PRESET_PERSONAS: Persona[] = [
  {
    id: 'sarah_mitchell',
    name: 'Sarah Mitchell',
    industry: 'Residential',
    plan: 'Basic ($39/mo)',
    tenure: '2 years',
    peakTime: '7–10pm evenings',
    score: 85,
    angle: 'Loyal 2-year customer, works from home, wifi drops every evening 7–10pm.',
    voiceNote: 'Warm, slightly frustrated. The classic upgrade candidate.',
  },
  {
    id: 'marcus_chen',
    name: 'Marcus Chen',
    industry: 'Residential / Gamer',
    plan: 'Premium ($59/mo)',
    tenure: '8 months',
    peakTime: '10pm–2am late night',
    score: 78,
    angle: 'New customer, hardcore gamer, complains about latency spikes during ranked matches.',
    voiceNote: 'Tech-literate, impatient, talks fast.',
  },
  {
    id: 'linda_rodriguez',
    name: 'Linda Rodriguez',
    industry: 'Residential / Family',
    plan: 'Family ($49/mo)',
    tenure: '5 years',
    peakTime: '4–8pm school nights',
    score: 92,
    angle: 'Long-time customer, three kids on Zoom school + streaming, bandwidth keeps choking.',
    voiceNote: 'Polite, busy, easily distracted by kids in background.',
  },
  {
    id: 'david_park',
    name: 'David Park',
    industry: 'Small Business',
    plan: 'Business Pro ($129/mo)',
    tenure: '3 years',
    peakTime: '9am–6pm business hours',
    score: 88,
    angle: 'Owns a 10-person design studio, every minute of downtime costs real money.',
    voiceNote: 'Direct, results-oriented, no time for small talk.',
  },
  {
    id: 'jennifer_adams',
    name: 'Jennifer Adams',
    industry: 'Residential / At-risk',
    plan: 'Basic ($39/mo, downgraded)',
    tenure: '4 years',
    peakTime: 'all day, works from home',
    score: 71,
    angle: 'Recently downgraded, budget-conscious, openly considering cancellation.',
    voiceNote: 'Cautious, comparing competitor prices, sensitive to upsells.',
  },
  {
    id: 'tom_williams',
    name: 'Tom Williams',
    industry: 'Residential / Senior',
    plan: 'Basic ($39/mo)',
    tenure: '7 years',
    peakTime: '10am–6pm daytime',
    score: 80,
    angle: 'Long-time customer, less tech-savvy, needs patient walk-throughs.',
    voiceNote: 'Friendly, asks for clarification often, appreciates being heard.',
  },
];

export interface IssuePreset {
  id: string;
  label: string;
  shortLabel: string;          // for UI cards / call history
  description: string;         // injected into Aria's prompt
  resolutionHint: string;      // what "fixed" looks like for this issue
}

export const ISSUE_PRESETS: IssuePreset[] = [
  {
    id: 'wifi_drops',
    label: 'Wifi drops every evening',
    shortLabel: 'Wifi connectivity drops',
    description: 'Wifi signal drops every evening between 7pm and 10pm, forcing the customer to reset the router multiple times.',
    resolutionHint: 'A frequency optimization push fixes the evening congestion.',
  },
  {
    id: 'slow_speeds',
    label: 'Slow speeds during peak hours',
    shortLabel: 'Slow peak-hour speeds',
    description: 'Internet speed drops to 1/4 of advertised throughput between 6pm and 11pm. Streaming buffers, video calls freeze.',
    resolutionHint: 'A channel reallocation + DNS swap usually clears this up.',
  },
  {
    id: 'billing_dispute',
    label: 'Billing dispute / unexpected charge',
    shortLabel: 'Billing dispute',
    description: 'A surprise $30 charge appeared on the latest bill. The customer believes it is incorrect and wants it removed.',
    resolutionHint: 'Aria can issue a one-time credit and explain the cause.',
  },
  {
    id: 'login_issue',
    label: 'Cannot log in to portal',
    shortLabel: 'Portal login issue',
    description: 'Customer cannot sign in to their BrightFiber account portal. Password reset emails never arrive.',
    resolutionHint: 'A manual password reset + whitelisting their email domain resolves it.',
  },
  {
    id: 'install_delay',
    label: 'Service installation delays',
    shortLabel: 'Installation delay',
    description: 'A scheduled installation has been rescheduled twice. The customer is on day 14 without service.',
    resolutionHint: 'Aria can confirm a guaranteed window + offer service credit.',
  },
  {
    id: 'considering_cancel',
    label: 'Considering cancellation',
    shortLabel: 'Cancellation risk',
    description: 'Customer mentions a competitor (BlueWave) offering a better rate and is openly thinking about cancelling.',
    resolutionHint: 'Aria can apply a loyalty rate or upgrade them at a held price.',
  },
];

// Build a one-line "first message" that Aria opens with. Uses the customer's name.
export function firstMessageFor(persona: Persona): string {
  const firstName = persona.name.split(' ')[0];
  return `Thank you for calling BrightFiber, this is Aria. Hi ${firstName}, I can see your account here. How can I help you today?`;
}

// Build the system prompt Aria uses based on persona + issue.
export function buildSystemPrompt(persona: Persona, issue: IssuePreset): string {
  const firstName = persona.name.split(' ')[0];
  return `You are Aria, an AI customer support and sales agent for BrightFiber Internet Services. SUPPORT MODE.

Customer profile:
- Name: ${persona.name}
- Plan: ${persona.plan}
- Tenure: ${persona.tenure}
- Industry: ${persona.industry}
- Peak usage: ${persona.peakTime}
- Background: ${persona.angle}

Today's issue: ${issue.description}
Path to resolution: ${issue.resolutionHint}

SUPPORT MODE: Be warm, empathetic. Address the customer as ${firstName} naturally (not at the start of every sentence). Ask one clarifying question at a time. After 2-3 exchanges, push the appropriate fix. Confirm the fix worked. Express genuine relief when they confirm.

SALES MODE triggers (all three): issue confirmed resolved, customer expresses gratitude, sentiment > 0.4.
SALES MODE: Make a natural transition. Mention shared bandwidth as the root cause, introduce Fiber Pro ($69/mo for 24mo loyal rate), soft close: "Would it be worth two minutes to walk through what changes?"

RULES:
- Never sound scripted. Never say "switching to sales mode".
- Use ${firstName}'s name naturally, not in every sentence.
- Reference the specific issue (${issue.shortLabel}) and their context (${persona.peakTime}).
- Match the customer's energy.`;
}
