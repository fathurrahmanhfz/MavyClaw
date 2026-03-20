import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  FlaskConical,
  Play,
  ShieldCheck,
  BookOpen,
  ClipboardCheck,
  Sun,
  Moon,
  Terminal,
  LogOut,
} from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useLiveUpdates } from "@/lib/live";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, testId: "nav-dashboard" },
  { href: "/scenarios", label: "Scenario Catalog", icon: FlaskConical, testId: "nav-scenarios" },
  { href: "/runs", label: "Benchmark Runs", icon: Play, testId: "nav-runs" },
  { href: "/safety", label: "Safety Gate", icon: ShieldCheck, testId: "nav-safety" },
  { href: "/lessons", label: "Lessons Learned", icon: BookOpen, testId: "nav-lessons" },
  { href: "/reviews", label: "Post-Task Review", icon: ClipboardCheck, testId: "nav-reviews" },
];

export default function AppSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [location] = useLocation();
  const { theme, toggleTheme } = useTheme();
  const { session, canWrite, logout, isLoggingOut } = useAuth();
  const { enabled: liveEnabled } = useLiveUpdates();

  const isActive = (href: string) => {
    if (href === "/") return location === "/";
    return location.startsWith(href);
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
          data-testid="sidebar-overlay"
        />
      )}

      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-64 flex flex-col bg-sidebar border-r border-sidebar-border transition-transform duration-200 ease-out lg:translate-x-0 lg:static lg:z-auto",
          open ? "translate-x-0" : "-translate-x-full"
        )}
        data-testid="sidebar"
      >
        <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary text-primary-foreground">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-sidebar-foreground" data-testid="app-title">
              MavyClaw
            </h1>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Benchmark Ops Workspace
            </p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" data-testid="sidebar-nav">
          {navItems.map((item) => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer",
                    active
                      ? "bg-sidebar-accent text-sidebar-foreground"
                      : "text-muted-foreground hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                  )}
                  data-testid={item.testId}
                  onClick={onClose}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  {item.label}
                  {active && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="px-3 py-4 border-t border-sidebar-border space-y-3">
          <div className="rounded-lg border border-sidebar-border px-3 py-3 text-xs text-muted-foreground space-y-1" data-testid="session-summary">
            <div className="font-medium text-sidebar-foreground">{session?.user?.name || "Unknown user"}</div>
            <div className="font-mono">{session?.user?.username}</div>
            <div className="uppercase tracking-wide">Role: {session?.user?.role}</div>
            <div>{canWrite ? "Write access enabled" : "Read-only access"}</div>
            <div>{liveEnabled ? "Live updates connected" : "Live updates offline"}</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            className="w-full justify-start gap-3 text-muted-foreground hover:text-sidebar-foreground"
            data-testid="button-toggle-theme"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout()}
            disabled={isLoggingOut}
            className="w-full justify-start gap-3 text-muted-foreground hover:text-sidebar-foreground"
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
            {isLoggingOut ? "Signing out..." : "Sign out"}
          </Button>
          <div className="px-3 text-[10px] text-muted-foreground">
            <span className="font-mono">v0.1.0</span> · Public Prototype
          </div>
        </div>
      </aside>
    </>
  );
}
