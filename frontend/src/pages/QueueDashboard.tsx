import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, ArrowUpRight, Clock, ShieldCheck, TrendingUp, AlertCircle } from 'lucide-react';

const MOCK_CONTACTS = [
  {
    id: "maria-chen",
    name: "Maria Chen",
    industry: "Insurance",
    score: 91,
    angle: "Aria knows: Duplicate billing issue, loyal 3-yr customer",
    bestTime: "Inbound Potential: High",
    status: "active"
  },
  {
    id: "james-okafor",
    name: "James Okafor",
    industry: "Healthcare",
    score: 74,
    angle: "Aria knows: Reliability focused, recent login stability issues",
    bestTime: "Inbound Potential: Moderate",
    status: "active"
  },
  {
    id: "priya-nair",
    name: "Priya Nair",
    industry: "E-commerce",
    score: 48,
    angle: "Aria knows: Social proof deep diver, high case study engagement",
    bestTime: "Inbound Potential: Stabilizing",
    status: "pending"
  },
  {
    id: "tom-brecker",
    name: "Tom Brecker",
    industry: "Fintech",
    score: 22,
    angle: "Aria knows: Technical skeptic, prefers direct resolution",
    bestTime: "Inbound Potential: Low",
    status: "hold"
  }
];

const QueueDashboard = () => {
  const navigate = useNavigate();

  const getScoreColor = (score: number) => {
    if (score >= 70) return "text-success bg-success/10 border-success/20";
    if (score >= 40) return "text-secondary bg-secondary/10 border-secondary/20";
    return "text-danger bg-danger/10 border-danger/20";
  };

  const getScoreBarColor = (score: number) => {
    if (score >= 70) return "bg-success";
    if (score >= 40) return "bg-secondary";
    return "bg-danger";
  };

  return (
    <div className="space-y-8">
      {/* Header Section */}
      <div className="flex flex-col gap-2">
        <h2 className="text-3xl font-medium text-white">Inbound Simulation Queue</h2>
        <p className="text-textMuted">Contact profiles ready for autonomous AI handling.</p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-panel p-6 space-y-2">
          <div className="flex items-center gap-2 text-textMuted text-sm">
            <TrendingUp size={16} />
            Autonomous Resolve Rate
          </div>
          <div className="text-2xl font-semibold text-white">84.2%</div>
        </div>
        <div className="glass-panel p-6 space-y-2">
          <div className="flex items-center gap-2 text-textMuted text-sm">
            <ShieldCheck size={16} className="text-primary" />
            Conversion Signal
          </div>
          <div className="text-2xl font-semibold text-white">High Intensity</div>
        </div>
        <div className="glass-panel p-6 space-y-2">
          <div className="flex items-center gap-2 text-textMuted text-sm">
            <AlertCircle size={16} className="text-danger" />
            Active AI Instances
          </div>
          <div className="text-2xl font-semibold text-white">3 Running</div>
        </div>
      </div>

      {/* Queue List */}
      <div className="space-y-4">
        {MOCK_CONTACTS.map((contact) => (
          <div key={contact.id} className="glass-panel p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-white/20 transition-all cursor-default">
            {/* Contact Info */}
            <div className="flex items-center gap-6">
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-xl font-bold ${getScoreColor(contact.score)} border`}>
                {contact.score}
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-medium text-white">{contact.name}</h3>
                  <span className="text-xs text-textMuted px-2 py-0.5 bg-white/5 border border-white/5 rounded uppercase tracking-wider">{contact.industry}</span>
                </div>
                <div className="flex items-center gap-4 text-sm text-textMuted">
                  <div className="flex items-center gap-1.5">
                    <Clock size={14} />
                    {contact.bestTime}
                  </div>
                  <div className="flex items-center gap-1.5 italic">
                    <ArrowUpRight size={14} className="text-primary" />
                    AI Agent Briefing: {contact.angle}
                  </div>
                </div>
              </div>
            </div>

            {/* Score Bar & Action */}
            <div className="flex items-center gap-8 w-full md:w-auto">
              <div className="flex-1 md:w-48 h-1.5 bg-white/5 rounded-full overflow-hidden hidden sm:block">
                <div 
                  className={`h-full ${getScoreBarColor(contact.score)} transition-all duration-1000`} 
                  style={{ width: `${contact.score}%` }}
                />
              </div>
              <button
                onClick={() => contact.id === 'maria-chen' ? navigate('/live-call', { state: { contact } }) : null}
                className={`px-6 py-2.5 rounded-lg flex items-center gap-2 text-sm font-semibold transition-all ${
                  contact.status === 'active' 
                  ? "bg-primary text-background hover:scale-105 active:scale-95" 
                  : "bg-white/5 text-textMuted cursor-not-allowed border border-white/10"
                }`}
              >
                <Phone size={16} />
                Simulate Inbound Call
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default QueueDashboard;
