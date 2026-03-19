import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import AppLayout from "@/components/AppLayout";
import Dashboard from "@/pages/Dashboard";
import Scenarios from "@/pages/Scenarios";
import ScenarioDetail from "@/pages/ScenarioDetail";
import Runs from "@/pages/Runs";
import SafetyGate from "@/pages/SafetyGate";
import Lessons from "@/pages/Lessons";
import Reviews from "@/pages/Reviews";
import NotFound from "@/pages/not-found";

function AppRouter() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/scenarios" component={Scenarios} />
        <Route path="/scenarios/:id" component={ScenarioDetail} />
        <Route path="/runs" component={Runs} />
        <Route path="/safety" component={SafetyGate} />
        <Route path="/lessons" component={Lessons} />
        <Route path="/reviews" component={Reviews} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router hook={useHashLocation}>
            <AppRouter />
          </Router>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
