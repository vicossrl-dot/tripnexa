import { t, translateText } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
export default function ProtectedRoute() {
  useLocale();
  const { isAuthenticated, isLoadingAuth, authError, checkUserAuth } = useAuth();
  const location = useLocation();
  if (isLoadingAuth) return <div className="min-h-screen grid place-items-center">{t("ui.loading.your.account.8fa5b7f")}</div>;
  if (authError) return <div className="min-h-screen grid place-items-center p-6"><div className="text-center max-w-md space-y-4">
    <h1 className="text-xl font-bold">{t("ui.unable.to.connect.e409661")}</h1><p>{translateText(authError.message)}</p>
    <button className="rounded-lg bg-neutral-900 text-white px-5 py-2" onClick={checkUserAuth}>{t("ui.try.again.d8b8392")}</button>
  </div></div>;
  if (!isAuthenticated) return <Navigate to={'/login?returnTo=' + encodeURIComponent(location.pathname + location.search)} replace />;
  return <Outlet />;
}
