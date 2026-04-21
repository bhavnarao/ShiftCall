import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { AuthLayout } from '../components/AuthLayout';
import { GoogleButton } from '../components/GoogleButton';
import { Loader2 } from 'lucide-react';

export default function Login() {
  const { signIn, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // If we land here already authenticated (e.g. after Google OAuth callback),
  // bounce to the right place instead of showing the login form.
  useEffect(() => {
    if (!authLoading && user) {
      navigate(user.onboarded ? '/dashboard' : '/onboarding', { replace: true });
    }
  }, [authLoading, user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: err } = await signIn(email.trim(), password);
    setLoading(false);
    if (err) { setError(err); return; }
    navigate('/dashboard', { replace: true });
  };

  return (
    <AuthLayout>
      <h1 className="auth-title">Welcome back</h1>
      <p className="auth-sub">Log in to your ShiftCall workspace.</p>

      <GoogleButton label="Continue with Google" onError={setError} />
      <div className="auth-divider">or with email</div>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="field-label">Email</label>
          <input
            className="field-input"
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
            placeholder="Your password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        {error && <p className="field-error">{error}</p>}

        <button type="submit" className="btn-block btn-block-primary" disabled={loading}>
          {loading ? <><Loader2 size={16} className="animate-spin" /> Signing in…</> : 'Log in'}
        </button>
      </form>

      <p className="auth-footer-line">
        New to ShiftCall?{' '}
        <Link to="/signup" className="auth-footer-link">Create a workspace</Link>
      </p>
    </AuthLayout>
  );
}
