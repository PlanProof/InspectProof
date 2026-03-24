import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

// Pages
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Projects from "@/pages/projects";
import Inspections from "@/pages/inspections";
import Issues from "@/pages/issues";
import Analytics from "@/pages/analytics";
import Compliance from "@/pages/compliance";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";

// Global fetch interceptor for auth
const originalFetch = window.fetch;
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof Request ? input.url : '';
  if (url.startsWith('/api')) {
    const token = localStorage.getItem('inspectproof_token');
    if (token) {
      init = init || {};
      init.headers = {
        ...init.headers,
        'Authorization': `Basic ${token}`
      };
      // Allow credentials for cross-origin if needed, though we use same origin
      init.credentials = "include";
    }
  }
  const response = await originalFetch(input, init);
  if (response.status === 401 && url !== '/api/auth/login') {
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
      <Route path="/" component={Dashboard} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/projects" component={Projects} />
      <Route path="/inspections" component={Inspections} />
      <Route path="/issues" component={Issues} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/compliance" component={Compliance} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
