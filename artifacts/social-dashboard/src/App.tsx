import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { AppLayout } from "@/components/layout";
import { AuthProvider } from "@/contexts/AuthContext";
import { ActiveBusinessProvider } from "@/contexts/ActiveBusinessContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { OnboardingGuard } from "@/components/OnboardingGuard";
import { ErrorBoundary } from "@/components/ErrorBoundary";

import Dashboard from "@/pages/dashboard";
import Calendar from "@/pages/calendar";
import Approval from "@/pages/approval";
import Generate from "@/pages/generate";
import Niches from "@/pages/niches";
import CaptionAddons from "@/pages/caption-addons";
import History from "@/pages/history";
import Settings from "@/pages/settings";
import Analytics from "@/pages/analytics";
import Backgrounds from "@/pages/backgrounds";
import PrivacyPolicy from "@/pages/privacy-policy";
import DataDeletion from "@/pages/data-deletion";
import TermsOfService from "@/pages/terms-of-service";
import TikTokGuide from "@/pages/tiktok-guide";
import VerifyEmail from "@/pages/verify-email";
import Landings from "@/pages/landings";
import Login from "@/pages/login";
import Register from "@/pages/register";
import Admin from "@/pages/admin";
import ResetPassword from "@/pages/reset-password";
import Pricing from "@/pages/pricing";
import Onboarding from "@/pages/onboarding";
import Chatbot from "@/pages/chatbot";
import Businesses from "@/pages/businesses";
import Referidos from "@/pages/referidos";
import Afiliados from "@/pages/afiliados";
import Recursos from "@/pages/recursos";
import AdminMetrics from "@/pages/admin-metrics";
import AdminMonitor from "@/pages/admin-monitor";
import AdminContentTemplates from "@/pages/admin-content-templates";
import Landing from "@/pages/landing";
import Features from "@/pages/features";
import About from "@/pages/about";
import Profile from "@/pages/profile";
import Credits from "@/pages/credits";
import Billing from "@/pages/billing";

function Router() {
  return (
    <Switch>
      {/* Public pages */}
      <Route path="/" component={Landing} />
      <Route path="/features" component={Features} />
      <Route path="/about" component={About} />
      <Route path="/privacy-policy" component={PrivacyPolicy} />
      <Route path="/terms-of-service" component={TermsOfService} />
      <Route path="/tiktok-guide" component={TikTokGuide} />
      <Route path="/data-deletion" component={DataDeletion} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/pricing" component={Pricing} />

      {/* Onboarding — protected but renders standalone (no AppLayout) */}
      <Route path="/onboarding">
        <ProtectedRoute>
          <Onboarding />
        </ProtectedRoute>
      </Route>

      {/* Protected admin (renders its own ProtectedRoute wrapper) */}
      <Route path="/admin">
        <AppLayout>
          <Admin />
        </AppLayout>
      </Route>

      {/* All other protected routes */}
      <Route>
        <ProtectedRoute>
          <ActiveBusinessProvider>
          <OnboardingGuard>
          <AppLayout>
            <Switch>
              <Route path="/dashboard" component={Dashboard} />
              <Route path="/calendar" component={Calendar} />
              <Route path="/approval" component={Approval} />
              <Route path="/generate" component={Generate} />
              <Route path="/niches" component={Niches} />
              <Route path="/caption-addons" component={CaptionAddons} />
              <Route path="/history" component={History} />
              <Route path="/analytics">
                <ProtectedRoute adminOnly adminRedirectTo="/credits">
                  <Analytics />
                </ProtectedRoute>
              </Route>
              <Route path="/backgrounds" component={Backgrounds} />
              <Route path="/landings" component={Landings} />
              <Route path="/chatbot" component={Chatbot} />
              <Route path="/settings" component={Settings} />
              <Route path="/businesses" component={Businesses} />
              <Route path="/referidos" component={Referidos} />
              <Route path="/afiliados" component={Afiliados} />
              <Route path="/recursos" component={Recursos} />
              <Route path="/admin/metricas" component={AdminMetrics} />
              <Route path="/admin/monitor" component={AdminMonitor} />
              <Route path="/admin/plantillas" component={AdminContentTemplates} />
              <Route path="/profile" component={Profile} />
              <Route path="/credits" component={Credits} />
              <Route path="/billing" component={Billing} />
              <Route component={NotFound} />
            </Switch>
          </AppLayout>
          </OnboardingGuard>
          </ActiveBusinessProvider>
        </ProtectedRoute>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
              <Router />
            </WouterRouter>
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
