import React from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate, Outlet, Link } from 'react-router-dom';
import Overview from './pages/Overview';
import LiveCallSimulator from './pages/LiveCallSimulator';
import PostCallAnalytics from './pages/PostCallAnalytics';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Onboarding from './pages/Onboarding';
import Settings from './pages/Settings';
import { AuthProvider, useAuth } from './lib/auth';
import { ApiKeysProvider, useKeys } from './lib/keys';
import { ProtectedRoute, PublicOnlyRoute } from './components/ProtectedRoute';
import { UserMenu } from './components/UserMenu';
import { Logo, LogoMark } from './components/Logo';
import { AlertTriangle } from 'lucide-react';

// ── Top nav for authenticated app ─────────────────────────────────────
function AppShell() {
  const { user } = useAuth();
  const { hasAllRequired } = useKeys();

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className="h-14 sticky top-0 z-50 flex items-center justify-between px-6 lg:px-10"
        style={{
          background: 'rgba(8,8,10,0.65)',
          backdropFilter: 'saturate(180%) blur(24px)',
          WebkitBackdropFilter: 'saturate(180%) blur(24px)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="flex items-center gap-10">
          <Link to="/dashboard" aria-label="ShiftCall home">
            <Logo size={20} className="text-textMain" />
          </Link>

          <nav className="flex items-center gap-1 text-[13px]">
            {[
              { to: '/dashboard', label: 'Dashboard' },
              { to: '/live-call', label: 'Live Call' },
              { to: '/analytics', label: 'Analytics' },
            ].map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-full transition-all duration-150 ${
                    isActive
                      ? 'text-textMain bg-white/[0.07] border border-white/[0.08]'
                      : 'text-textMuted hover:text-textMain border border-transparent hover:bg-white/[0.04]'
                  }`
                }
                style={{ letterSpacing: '-0.005em', fontWeight: 500 }}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {hasAllRequired ? (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px]"
              style={{
                background: 'rgba(48,209,88,0.08)',
                borderColor: 'rgba(48,209,88,0.20)',
                color: '#30D158',
              }}
            >
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inset-0 rounded-full bg-success opacity-60 animate-ping" />
                <span className="w-1.5 h-1.5 rounded-full bg-success relative" />
              </span>
              <span className="font-medium" style={{ letterSpacing: '-0.005em' }}>Activated</span>
            </div>
          ) : (
            <Link
              to="/settings"
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] hover:bg-secondary/15 transition-colors"
              style={{
                background: 'rgba(245,158,11,0.08)',
                borderColor: 'rgba(245,158,11,0.25)',
                color: '#F59E0B',
              }}
            >
              <AlertTriangle size={11} />
              <span className="font-medium" style={{ letterSpacing: '-0.005em' }}>Add keys</span>
            </Link>
          )}
          <UserMenu />
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

// Root entry. Bounces logged-out users straight to /login,
// logged-in users to /dashboard. No marketing landing.
function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <BootSplash />;
  return <Navigate to={user ? '/dashboard' : '/login'} replace />;
}

function BootSplash() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-background text-textMain">
      <div className="boot-splash-mark">
        <LogoMark size={44} accent />
      </div>
      <div className="flex items-center gap-2 text-[13px] text-textMuted">
        <span className="w-1.5 h-1.5 rounded-full bg-textMuted animate-pulse" />
        <span>Loading workspace…</span>
      </div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <ApiKeysProvider>
          <Routes>
            {/* Root → bounce based on auth state */}
            <Route path="/" element={<RootRedirect />} />
            <Route path="/overview" element={<Navigate to="/" replace />} />

            {/* Public-only auth routes */}
            <Route path="/login"  element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
            <Route path="/signup" element={<PublicOnlyRoute><Signup /></PublicOnlyRoute>} />

            {/* Onboarding (auth required, doesn't require onboarded=true) */}
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute requireOnboarded={false}>
                  <Onboarding />
                </ProtectedRoute>
              }
            />

            {/* Authenticated app */}
            <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
              <Route path="/dashboard" element={<Overview />} />
              <Route path="/live-call" element={<div className="p-8 max-w-7xl mx-auto w-full"><LiveCallSimulator /></div>} />
              <Route path="/analytics" element={<PostCallAnalytics />} />
              <Route path="/settings" element={<Settings />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ApiKeysProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
