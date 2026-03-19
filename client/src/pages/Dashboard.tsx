import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import StatusBadge from "@/components/StatusBadge";
import { Link } from "wouter";
import {
  FlaskConical,
  Play,
  BookOpen,
  ClipboardCheck,
  ShieldCheck,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import type { Run } from "@shared/schema";

interface Stats {
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
  const { data: stats, isLoading, error } = useQuery<Stats>({
    queryKey: ["/api/stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/stats");
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
