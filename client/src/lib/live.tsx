import { createContext, useContext, useEffect } from "react";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";

interface LiveContextValue {
  enabled: boolean;
}

const LiveContext = createContext<LiveContextValue>({ enabled: false });

const liveQueryKeys = [
  ["/api/stats"],
  ["/api/scenarios"],
  ["/api/runs"],
  ["/api/safety-checks"],
  ["/api/lessons"],
  ["/api/reviews"],
] as const;

export function LiveUpdatesProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();

  useEffect(() => {
    if (!session?.authenticated) {
      return;
    }

    const source = new EventSource("/api/live", { withCredentials: true });

    const handleWorkspaceUpdate = () => {
      for (const queryKey of liveQueryKeys) {
        queryClient.invalidateQueries({ queryKey: [...queryKey] });
      }
    };

    source.addEventListener("workspace-update", handleWorkspaceUpdate);

    return () => {
      source.removeEventListener("workspace-update", handleWorkspaceUpdate);
      source.close();
    };
  }, [session?.authenticated]);

  return <LiveContext.Provider value={{ enabled: Boolean(session?.authenticated) }}>{children}</LiveContext.Provider>;
}

export function useLiveUpdates() {
  return useContext(LiveContext);
}
