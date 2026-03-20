import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import StatusBadge from "@/components/StatusBadge";
import WorkspacePortabilityCard from "@/components/WorkspacePortabilityCard";
import { Link } from "wouter";
import {
  FlaskConical,
  Play,
  BookOpen,
  ClipboardCheck,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
  Activity,
} from "lucide-react";
import type { Run, ActivityLog } from "@shared/schema";
import { useLiveUpdates } from "@/lib/live";

interface Stats {
  runtime: string;
  persistence: string;
  databaseConfigured: boolean;
  agentIngest: {
    configured: boolean;
    mode: "disabled" | "token";
    endpointPrefix: string;
    helperCommand: string;
    authHeader: string | null;
    baseUrlHint: string | null;
  };
  totalScenarios: number;
  totalRuns: number;
  totalLessons: number;
  totalReviews: number;
  totalSafetyChecks: number;
  runsByStatus: Record<string, number>;
  lessonsByStatus: Record<string, number>;
  errorCategories: Record<string, number>;
  recentRuns: Run[];
}

export default function Dashboard() {
  const { enabled: liveEnabled } = useLiveUpdates();
  const { data: stats, isLoading, error } = useQuery<Stats>({
    queryKey: ["/api/stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/stats");
      return res.json();
    },
  });

  const { data: activityEntries, isLoading: activityLoading } = useQuery<ActivityLog[]>({
    queryKey: ["/api/activity"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/activity?limit=20");
      return res.json();
    },
  });

  if (error) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="error-dashboard">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Failed to load dashboard data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="page-dashboard">
      <div>
        <h2 className="text-xl font-bold tracking-tight" data-testid="heading-dashboard">
          Dashboard
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Benchmark, run, and operational learning summary for agent teams
        </p>
        <p className="text-xs text-muted-foreground mt-2" data-testid="dashboard-live-indicator">
          {liveEnabled ? "Live updates are connected" : "Live updates connect after sign-in"}
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="bg-card border-card-border">
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-12" />
              </CardContent>
            </Card>
          ))
        ) : stats ? (
          <>
            <KpiCard icon={FlaskConical} label="Scenarios" value={stats.totalScenarios} testId="kpi-scenarios" />
            <KpiCard icon={Play} label="Runs" value={stats.totalRuns} testId="kpi-runs" />
            <KpiCard icon={BookOpen} label="Lessons" value={stats.totalLessons} testId="kpi-lessons" />
            <KpiCard icon={ClipboardCheck} label="Reviews" value={stats.totalReviews} testId="kpi-reviews" />
            <KpiCard icon={ShieldCheck} label="Safety Checks" value={stats.totalSafetyChecks} testId="kpi-safety" />
          </>
        ) : null}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {stats ? (
          <Card className="bg-card border-card-border lg:col-span-3">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Agent Integration Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Token-based agent ingest lets external agents create runs, progress updates, safety checks, lessons, and reviews without using the UI.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
                <div className="rounded-lg border border-card-border p-3">
                  <p className="text-xs text-muted-foreground mb-1">Status</p>
                  <p className="font-semibold">{stats.agentIngest.configured ? "Ready" : "Disabled"}</p>
                </div>
                <div className="rounded-lg border border-card-border p-3">
                  <p className="text-xs text-muted-foreground mb-1">Auth mode</p>
                  <p className="font-semibold capitalize">{stats.agentIngest.mode}</p>
                </div>
                <div className="rounded-lg border border-card-border p-3">
                  <p className="text-xs text-muted-foreground mb-1">Endpoint prefix</p>
                  <p className="font-mono text-xs break-all">{stats.agentIngest.endpointPrefix}</p>
                </div>
                <div className="rounded-lg border border-card-border p-3">
                  <p className="text-xs text-muted-foreground mb-1">Base URL hint</p>
                  <p className="font-mono text-xs break-all">{stats.agentIngest.baseUrlHint ?? "Use current app origin"}</p>
                </div>
              </div>
              <div className="rounded-lg border border-card-border p-3 space-y-2">
                <p className="text-xs text-muted-foreground">Default helper command</p>
                <p className="font-mono text-xs break-all" data-testid="agent-ingest-helper">{stats.agentIngest.helperCommand}</p>
                <p className="text-xs text-muted-foreground">Set AGENT_INGEST_TOKEN on the server and use the helper to post lifecycle events into this workspace.</p>
              </div>
            </CardContent>
          </Card>
        ) : null}
        <Card className="bg-card border-card-border lg:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Runtime Readiness</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : stats ? (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3" data-testid="runtime-readiness">
                <div className="rounded-lg border border-card-border p-3">
                  <p className="text-xs text-muted-foreground mb-1">Active runtime</p>
                  <p className="text-sm font-semibold capitalize" data-testid="runtime-mode">{stats.runtime}</p>
                </div>
                <div className="rounded-lg border border-card-border p-3">
                  <p className="text-xs text-muted-foreground mb-1">Persistence</p>
                  <p className="text-sm font-semibold capitalize" data-testid="runtime-persistence">{stats.persistence}</p>
                </div>
                <div className="rounded-lg border border-card-border p-3">
                  <p className="text-xs text-muted-foreground mb-1">Database configured</p>
                  <p className="text-sm font-semibold" data-testid="runtime-db-configured">{stats.databaseConfigured ? "Yes" : "No"}</p>
                </div>
                <div className="rounded-lg border border-card-border p-3" data-testid="agent-ingest-state">
                  <p className="text-xs text-muted-foreground mb-1">Agent ingest</p>
                  <p className="text-sm font-semibold">{stats.agentIngest.configured ? "Configured" : "Not configured"}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No runtime data</p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card border-card-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Play className="w-4 h-4 text-primary" />
              Run Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)
            ) : stats ? (
              Object.entries(stats.runsByStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between" data-testid={`stat-run-${status}`}>
                  <StatusBadge status={status} />
                  <span className="text-sm font-mono font-semibold">{count}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-primary" />
              Lesson Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)
            ) : stats ? (
              Object.entries(stats.lessonsByStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between" data-testid={`stat-lesson-${status}`}>
                  <StatusBadge status={status} />
                  <span className="text-sm font-mono font-semibold">{count}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-card-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Error Categories
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)
            ) : stats ? (
              Object.entries(stats.errorCategories)
                .sort(([, a], [, b]) => b - a)
                .map(([cat, count]) => (
                  <div key={cat} className="flex items-center justify-between" data-testid={`stat-error-${cat}`}>
                    <span className="text-sm font-mono text-muted-foreground">{cat}</span>
                    <span className="text-sm font-mono font-semibold">{count}</span>
                  </div>
                ))
            ) : (
              <p className="text-sm text-muted-foreground">No data</p>
            )}
          </CardContent>
        </Card>
      </div>

      {stats ? (
        <WorkspacePortabilityCard runtime={stats.runtime} persistence={stats.persistence} />
      ) : null}

      <Card className="bg-card border-card-border" data-testid="activity-feed-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Recent Activity
            {liveEnabled && (
              <span className="text-[10px] font-normal text-muted-foreground ml-auto">live</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activityLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : activityEntries?.length ? (
            <div className="space-y-1" data-testid="activity-feed-list">
              {activityEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start justify-between gap-3 py-1.5 px-2 rounded-md hover:bg-accent/30 transition-colors"
                  data-testid={`activity-entry-${entry.id}`}
                >
                  <div className="flex items-start gap-2 min-w-0">
                    <span className="font-mono text-[11px] text-primary shrink-0 mt-0.5">{entry.action}</span>
                    <span className="text-sm text-muted-foreground truncate">{entry.summary}</span>
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground shrink-0">
                    {new Date(entry.occurredAt).toLocaleTimeString("en-US", {
                      hour: "2-digit",
                      minute: "2-digit",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center" data-testid="empty-activity">
              No activity yet
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card border-card-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Recent Benchmark Runs</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : stats?.recentRuns?.length ? (
            <div className="space-y-2">
              {stats.recentRuns.map((run) => (
                <Link key={run.id} href={`/runs`}>
                  <div
                    className="flex items-center justify-between p-3 rounded-md hover:bg-accent/50 transition-colors cursor-pointer"
                    data-testid={`recent-run-${run.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-mono text-muted-foreground shrink-0">{run.id}</span>
                      <span className="text-sm truncate">
                        {run.operatorNote || "No note"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <StatusBadge status={run.status} testId={`badge-run-status-${run.id}`} />
                      <span className="text-xs text-muted-foreground font-mono">
                        {new Date(run.createdAt).toLocaleDateString("en-US", { day: "2-digit", month: "short" })}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center" data-testid="empty-recent-runs">
              No benchmark runs yet
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  testId,
}: {
  icon: typeof FlaskConical;
  label: string;
  value: number;
  testId: string;
}) {
  return (
    <Card className="bg-card border-card-border" data-testid={testId}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon className="w-4 h-4 text-primary" />
          <span className="text-xs text-muted-foreground font-medium">{label}</span>
        </div>
        <span className="text-2xl font-bold font-mono">{value}</span>
      </CardContent>
    </Card>
  );
}
