import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { ForcePasswordChangeModal } from "@/components/ForcePasswordChangeModal";

// Pages
import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Projects from "@/pages/projects";
import ProjectDetail from "@/pages/project-detail";
import Inspections from "@/pages/inspections";
import InspectionDetail from "@/pages/inspection-detail";
import Analytics from "@/pages/analytics";
import Templates from "@/pages/templates";
import DocTemplates from "@/pages/doc-templates";
import Inspectors from "@/pages/inspectors";
import Settings from "@/pages/settings";
import Billing from "@/pages/billing";
import Admin from "@/pages/admin";
import Terms from "@/pages/terms";
import Privacy from "@/pages/privacy";
import DeleteAccount from "@/pages/delete-account";
import Join from "@/pages/join";
import MobileOnly from "@/pages/mobile-only";
import NotFound from "@/pages/not-found";
import ActivityPage from "@/pages/activity";
import ShareView from "@/pages/share-view";
import Issues from "@/pages/issues";
import ResetPassword from "@/pages/reset-password";
import VerifyEmail from "@/pages/verify-email";
import ContractorLibrary from "@/pages/contractor-library";
import CalendarPage from "@/pages/calendar";
import ContractorPortal from "@/pages/contractor-portal";

// Global fetch interceptor for auth
const originalFetch = window.fetch;
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof Request ? input.url : '';
  if (url.startsWith('/api')) {
    const token = localStorage.getItem('inspectproof_token');
    if (token) {
      init = init || {};
      // Merge headers safely — handle Headers instance, plain object, or array
      const merged = new Headers(init.headers);
      if (!merged.has('Authorization')) {
        merged.set('Authorization', `Bearer ${token}`);
      }
      init = { ...init, headers: merged, credentials: "include" };
    }
  }
  const response = await originalFetch(input, init);
  if (url !== '/api/auth/login' && response.status === 401) {
    localStorage.removeItem('inspectproof_token');
    window.location.href = '/login';
  }
  return response;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={Landing} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/projects" component={Projects} />
      <Route path="/projects/:id" component={ProjectDetail} />
      <Route path="/inspections" component={Inspections} />
      <Route path="/inspections/:id" component={InspectionDetail} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/templates" component={Templates} />
      <Route path="/doc-templates" component={DocTemplates} />
      <Route path="/inspectors" component={Inspectors} />
      <Route path="/settings" component={Settings} />
      <Route path="/billing" component={Billing} />
      <Route path="/admin" component={Admin} />
      <Route path="/terms" component={Terms} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/delete-account" component={DeleteAccount} />
      <Route path="/join" component={Join} />
      <Route path="/mobile-only" component={MobileOnly} />
      <Route path="/issues" component={Issues} />
      <Route path="/activity" component={ActivityPage} />
      <Route path="/share/:token" component={ShareView} />
      <Route path="/contractor-portal/:token" component={ContractorPortal} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/settings/contractor-library" component={ContractorLibrary} />
      <Route path="/calendar" component={CalendarPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AppInner() {
  const { user, token } = useAuth();

  const handlePasswordSet = () => {
    // Reload user from /me to clear the flag in state
    window.location.reload();
  };

  return (
    <>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
      <Toaster />
      {user?.requiresPasswordChange && token && (
        <ForcePasswordChangeModal token={token} onSuccess={handlePasswordSet} />
      )}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppInner />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
