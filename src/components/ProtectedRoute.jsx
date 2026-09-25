import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
export default function ProtectedRoute() {
  const { isAuthenticated, isLoadingAuth, authError, checkUserAuth } = useAuth();
  const location = useLocation();
  if (isLoadingAuth) return <div className="min-h-screen grid place-items-center">Loading your account…</div>;
  if (authError) return <div className="min-h-screen grid place-items-center p-6"><div className="text-center max-w-md space-y-4">
    <h1 className="text-xl font-bold">Unable to connect</h1><p>{authError.message}</p>
    <button className="rounded-lg bg-neutral-900 text-white px-5 py-2" onClick={checkUserAuth}>Try again</button>
  </div></div>;
  if (!isAuthenticated) return <Navigate to={'/login?returnTo=' + encodeURIComponent(location.pathname + location.search)} replace />;
  return <Outlet />;
}
