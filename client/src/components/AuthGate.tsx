import { useState, type ReactNode } from "react";
import { Shield, Lock, UserCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

export default function AuthGate({ children }: { children: ReactNode }) {
  const { session, isLoading, login, isLoggingIn } = useAuth();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  if (isLoading) {
    return <div className="min-h-screen bg-background" />;
  }

  if (session?.authenticated) {
    return <>{children}</>;
  }

  async function handleLogin() {
    try {
      await login({ username, password });
      toast({ title: "Signed in", description: "Session access is now active." });
    } catch (error) {
      toast({
        title: "Sign-in failed",
        description: error instanceof Error ? error.message : "The provided credentials were rejected.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-10" data-testid="auth-gate">
      <Card className="w-full max-w-md bg-card border-card-border">
        <CardHeader className="space-y-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <CardTitle className="text-xl">Secure workspace access</CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              Sign in to access benchmark data and role-based actions in MavyClaw.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-card-border p-3 text-sm text-muted-foreground space-y-2" data-testid="auth-mode-summary">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-primary" />
              <span>Authentication mode: {session?.mode ?? "demo"}</span>
            </div>
            <div className="flex items-center gap-2">
              <UserCircle2 className="w-4 h-4 text-primary" />
              <span>Default demo login usually follows the configured environment values.</span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Username</label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} data-testid="input-login-username" />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground">Password</label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="input-login-password" />
          </div>

          <Button className="w-full" onClick={handleLogin} disabled={!username || !password || isLoggingIn} data-testid="button-login-submit">
            {isLoggingIn ? "Signing in..." : "Sign in"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
