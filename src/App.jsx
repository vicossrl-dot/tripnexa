import { t } from "@/i18n/runtime";
import { useLocale } from "@/i18n/react";
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import LocaleRouteSync from '@/i18n/LocaleRouteSync';
import NativeValidation from '@/i18n/NativeValidation';
import { PublicSettingsProvider } from '@/lib/PublicSettingsContext';
import { useEffect,lazy,Suspense } from 'react';
import { toast } from '@/components/ui/use-toast';
import ScrollToTop from './components/ScrollToTop';
import Dashboard from '@/pages/Dashboard';
import TripDocuments from '@/pages/TripDocuments';
import TravelWallet from '@/pages/TravelWallet';
import PlanVisits from '@/pages/PlanVisits';
import Itinerary from '@/pages/Itinerary';
import Home from '@/pages/Home';
import Profile from '@/pages/Profile';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import SocialLink from '@/pages/SocialLink';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import PublicTrip from '@/pages/PublicTrip';
import CustomizeItinerary from '@/pages/CustomizeItinerary';
import ProtectedRoute from '@/components/ProtectedRoute';
import AffiliateDisclosure from '@/components/AffiliateDisclosure';
import {BillingPage, PricingPage, BillingReturn, BillingPaywall} from '@/components/billing/Billing';
const Admin=lazy(()=>import('@/pages/Admin'));
// Add page imports here

const AuthenticatedApp = () => {
  useLocale();
  // Render the main app
  return (
    <Routes>
      {/* Add your page Route elements here */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/auth/link" element={<SocialLink />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/share/:token" element={<PublicTrip />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/customize/:publicId" element={<CustomizeItinerary />} />
        <Route path="/admin/*" element={<Suspense fallback={<p role="status" className="p-8">{t("ui.loading.administration.9696586")}</p>}><Admin /></Suspense>} />
        <Route path="/" element={<Home />} />
        <Route path="/trip/:tripId" element={<Dashboard />} />
        <Route path="/trip/:tripId/documents" element={<TripDocuments />} />
        <Route path="/trip/:tripId/wallet" element={<TravelWallet />} />
        <Route path="/trip/:tripId/plan" element={<PlanVisits />} />
        <Route path="/trip/:tripId/itinerary" element={<Itinerary />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/billing/success" element={<BillingReturn />} />
        <Route path="/billing/cancel" element={<BillingReturn />} />
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {
  useLocale();
  useEffect(() => {
    const report = event => {
      toast({ title: 'Could not complete the request', description: event.detail, variant: 'destructive' });
    };
    window.addEventListener('api-error', report);
    const unlocked = () => toast({title:'Trip unlocked',description:'You can now retry your action.'});
    window.addEventListener('billing-unlocked', unlocked);
    return () => {window.removeEventListener('api-error', report);window.removeEventListener('billing-unlocked', unlocked);};
  }, []);

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <PublicSettingsProvider>
          <Router>
            <LocaleRouteSync />
            <NativeValidation />
            <ScrollToTop />
            <AuthenticatedApp />
            <BillingPaywall />
            <AffiliateDisclosure />
          </Router>
        </PublicSettingsProvider>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
