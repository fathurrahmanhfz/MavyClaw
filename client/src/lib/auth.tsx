import { createContext, useContext, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { AuthRole, SessionState } from "@shared/auth";

interface LoginPayload {
  username: string;
  password: string;
}

interface AuthContextValue {
  session: SessionState | null;
  isLoading: boolean;
  canWrite: boolean;
  isAdmin: boolean;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
  isLoggingIn: boolean;
  isLoggingOut: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const roleRank: Record<AuthRole, number> = {
  viewer: 1,
  editor: 2,
  admin: 3,
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const sessionQuery = useQuery<SessionState>({
    queryKey: ["/api/session"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/session");
      return res.json();
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (payload: LoginPayload) => {
      const res = await apiRequest("POST", "/api/session/login", payload);
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/session"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/session/logout");
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/session"] });
      queryClient.removeQueries({ queryKey: ["/api/scenarios"] });
      queryClient.removeQueries({ queryKey: ["/api/runs"] });
      queryClient.removeQueries({ queryKey: ["/api/safety-checks"] });
      queryClient.removeQueries({ queryKey: ["/api/lessons"] });
      queryClient.removeQueries({ queryKey: ["/api/reviews"] });
      queryClient.removeQueries({ queryKey: ["/api/stats"] });
    },
  });

  const value = useMemo<AuthContextValue>(() => {
    const session = sessionQuery.data ?? null;
    const role = session?.user?.role;

    return {
      session,
      isLoading: sessionQuery.isLoading,
      canWrite: Boolean(role && roleRank[role] >= roleRank.editor),
      isAdmin: Boolean(role && roleRank[role] >= roleRank.admin),
      login: async (payload) => {
        await loginMutation.mutateAsync(payload);
      },
      logout: async () => {
        await logoutMutation.mutateAsync();
      },
      isLoggingIn: loginMutation.isPending,
      isLoggingOut: logoutMutation.isPending,
    };
  }, [loginMutation, logoutMutation, sessionQuery.data, sessionQuery.isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
