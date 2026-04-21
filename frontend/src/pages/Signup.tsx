import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { AuthLayout } from '../components/AuthLayout';
import { GoogleButton } from '../components/GoogleButton';
import { Loader2 } from 'lucide-react';

export default function Signup() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.includes('@')) { setError('Enter a valid email.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (!workspaceName.trim()) { setError('Workspace name is required.'); return; }

    setLoading(true);
    const { error: err } = await signUp(email.trim(), password, workspaceName.trim());
    setLoading(false);
    if (err) { setError(err); return; }

    navigate('/onboarding', { replace: true });
  };

  return (
    <AuthLayout>
      <h1 className="auth-title">Create your workspace</h1>
      <p className="auth-sub">
        Spin up an autonomous voice intelligence layer in under 2 minutes.
      </p>

      <GoogleButton label="Sign up with Google" onError={setError} />
      <div className="auth-divider">or with email</div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="field-label">Workspace name</label>
          <input
            className="field-input"
            placeholder="Acme Customer Ops"
            value={workspaceName}
            onChange={(e) => setWorkspaceName(e.target.value)}
            autoComplete="organization"
          />
        </div>

        <div>
          <label className="field-label">Email</label>
          <input
            className={`field-input ${error && !email.includes('@') ? 'is-error' : ''}`}
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>

        <div>
          <label className="field-label">Password</label>
          <input
            className="field-input"
            type="password"
            placeholder="At least 6 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          <p className="field-help">We never see your API keys. They live in your browser.</p>
        </div>

        {error && <p className="field-error">{error}</p>}

        <button type="submit" className="btn-block btn-block-primary" disabled={loading}>
          {loading ? <><Loader2 size={16} className="animate-spin" /> Creating workspace…</> : 'Create workspace'}
        </button>
      </form>

      <p className="auth-footer-line">
        Already have an account?{' '}
        <Link to="/login" className="auth-footer-link">Log in</Link>
      </p>
    </AuthLayout>
  );
}
