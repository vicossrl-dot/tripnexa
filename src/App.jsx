import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
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
import ProtectedRoute from '@/components/ProtectedRoute';
import AffiliateDisclosure from '@/components/AffiliateDisclosure';
const Admin=lazy(()=>import('@/pages/Admin'));
// Add page imports here

const AuthenticatedApp = () => {
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
      <Route element={<ProtectedRoute />}>
        <Route path="/admin/*" element={<Suspense fallback={<p role="status" className="p-8">Loading administration…</p>}><Admin /></Suspense>} />
        <Route path="/" element={<Home />} />
        <Route path="/trip/:tripId" element={<Dashboard />} />
        <Route path="/trip/:tripId/documents" element={<TripDocuments />} />
        <Route path="/trip/:tripId/wallet" element={<TravelWallet />} />
        <Route path="/trip/:tripId/plan" element={<PlanVisits />} />
        <Route path="/trip/:tripId/itinerary" element={<Itinerary />} />
        <Route path="/profile" element={<Profile />} />
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {
  useEffect(() => {
    let previous;
    const report = event => {
      previous?.dismiss();
      previous = toast({ title: 'Could not complete the request', description: event.detail, variant: 'destructive' });
    };
    window.addEventListener('api-error', report);
    return () => window.removeEventListener('api-error', report);
  }, []);

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
          <AffiliateDisclosure />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
