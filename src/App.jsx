import React, { useEffect, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

import Login from '@/pages/Login';
import PortalLogin from '@/pages/PortalLogin';
import AdminLogin from '@/pages/AdminLogin';

import AdminDashboard from '@/pages/AdminDashboard';
import DoctorDashboard from '@/pages/doctor/DoctorDashboard';
import PatientDashboard from '@/pages/patient/PatientDashboard';

// Hospital portal — lazily loaded to keep main bundle lean
const HospitalLoginPage = lazy(() => import('@/pages/hospital/HospitalLogin'));
const HospitalDashboardPage = lazy(() => import('@/pages/hospital/HospitalDashboard'));
const HospitalRegisterPage = lazy(() => import('@/pages/hospital/HospitalRegister'));
const SehatLinkPage = lazy(() => import('@/pages/patient/SehatLinkPage'));

function LoadingScreen() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50">
      <span className="animate-spin material-symbols-outlined text-primary text-4xl">progress_activity</span>
    </div>
  );
}

/** Wrapper: redirects to / if not authed or wrong role */
function ProtectedRoute({ role: requiredRole, children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user || user.role !== requiredRole) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, loading, logout, loginAsDemo } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect to dashboard after login if already on a login/root page
  useEffect(() => {
    if (loading || !user || user.role === 'loading') return;
    const onLoginPage =
      location.pathname === '/' ||
      location.pathname.startsWith('/portal') ||
      location.pathname === '/admin/login';
    if (onLoginPage) {
      navigate(`/${user.role}/dashboard`, { replace: true });
    }
  }, [user, loading, location.pathname, navigate]);

  const handleLoginSuccess = (selectedRole, name) => {
    if (selectedRole === 'gateway_back') { navigate('/'); return; }
    if (selectedRole === 'admin') { navigate('/admin/login'); return; }
    if (name) localStorage.setItem('sehat_user_name', name);
    navigate(`/${selectedRole}/dashboard`);
  };

  // When user picks a portal from the gateway, log out any existing session first
  // so the auth-redirect useEffect doesn't bounce them back to their old dashboard.
  const handlePortalSelect = async (selectedRole, initialMode = 'signin') => {
    if (user) {
      await logout();
    }
    if (initialMode === 'demo') {
      loginAsDemo(selectedRole);
      return;
    }
    if (selectedRole === 'admin') { navigate('/admin/login'); return; }
    navigate(`/portal/${selectedRole}${initialMode === 'signup' ? '?mode=signup' : ''}`);
  };

  return (
    <Routes>
      {/* ── Public routes ── */}
      <Route
        path="/"
        element={
          <Login onLogin={handlePortalSelect} />
        }
      />
      <Route path="/portal/:loginRole" element={<PortalLogin onLogin={handleLoginSuccess} />} />
      <Route
        path="/admin/login"
        element={<AdminLogin onConfirm={() => navigate('/admin/dashboard')} onBack={() => navigate('/')} />}
      />

      {/* ── Hospital Portal (session-based, independent of Firebase user roles) ── */}
      <Route path="/hospital" element={<Navigate to="/hospital/lks/login" replace />} />
      <Route
        path="/hospital/register"
        element={
          <Suspense fallback={<LoadingScreen />}>
            <HospitalRegisterPage />
          </Suspense>
        }
      />
      <Route
        path="/hospital/:hospitalId/login"
        element={
          <Suspense fallback={<LoadingScreen />}>
            <HospitalLoginPage />
          </Suspense>
        }
      />
      <Route
        path="/hospital/:hospitalId/dashboard/*"
        element={
          <Suspense fallback={<LoadingScreen />}>
            <HospitalDashboardPage />
          </Suspense>
        }
      />

      {/* ── Patient Portal ── */}
      <Route
        path="/patient/sehat-link"
        element={
          <ProtectedRoute role="patient">
            <Suspense fallback={<LoadingScreen />}>
              <SehatLinkPage onBack={() => window.history.back()} />
            </Suspense>
          </ProtectedRoute>
        }
      />
      <Route
        path="/patient/*"
        element={
          <ProtectedRoute role="patient">
            <PatientDashboard onLogout={() => { logout(); navigate('/'); }} />
          </ProtectedRoute>
        }
      />

      {/* ── Doctor / Hospital Staff Portal ── */}
      <Route
        path="/doctor/*"
        element={
          <ProtectedRoute role="doctor">
            <DoctorDashboard onLogout={() => { logout(); navigate('/'); }} />
          </ProtectedRoute>
        }
      />

      {/* ── Admin Portal ── */}
      <Route
        path="/admin/*"
        element={
          <ProtectedRoute role="admin">
            <AdminDashboard onLogout={() => { logout(); navigate('/'); }} />
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
