import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import StatusBadge from "@/components/StatusBadge";
import { Link, useParams } from "wouter";
import {
  ArrowLeft,
  Target,
  CheckCircle,
  ShieldAlert,
  XCircle,
  ClipboardList,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Scenario } from "@shared/schema";

export default function ScenarioDetail() {
  const params = useParams<{ id: string }>();
  const { data: scenario, isLoading, error } = useQuery<Scenario>({
    queryKey: ["/api/scenarios", params.id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/scenarios/${params.id}`);
      return res.json();
    },
  });

  if (error) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="error-scenario-detail">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Scenario not found</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!scenario) return null;

  return (
    <div className="space-y-6" data-testid="page-scenario-detail">
      <div>
        <Link href="/scenarios">
          <Button variant="ghost" size="sm" className="mb-3 -ml-2 text-muted-foreground" data-testid="button-back-scenarios">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
        </Link>
        <h2 className="text-xl font-bold tracking-tight" data-testid="heading-scenario-title">
          {scenario.title}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">{scenario.description}</p>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <StatusBadge status={scenario.category} />
          <StatusBadge status={scenario.difficulty} />
          <StatusBadge status={scenario.readiness} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DetailCard icon={Target} title="Objective" content={scenario.objective} testId="card-objective" />
        <DetailCard icon={CheckCircle} title="Acceptance Criteria" content={scenario.acceptanceCriteria} testId="card-acceptance" />
        <DetailCard icon={ShieldAlert} title="Required Safe Steps" content={scenario.safeSteps} testId="card-safe-steps" mono />
        <DetailCard icon={XCircle} title="Anti-Patterns" content={scenario.antiPatterns} testId="card-anti-patterns" />
        <DetailCard icon={ClipboardList} title="Verification Checklist" content={scenario.verificationChecklist} testId="card-verification" />
        <DetailCard icon={AlertTriangle} title="Primary Risk" content={scenario.primaryRisk} testId="card-risk" />
      </div>

      <Card className="bg-card border-card-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            Target Verification Evidence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap" data-testid="text-target-evidence">
            {scenario.targetEvidence}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function DetailCard({
  icon: Icon,
  title,
  content,
  testId,
  mono = false,
}: {
  icon: typeof Target;
  title: string;
  content: string;
  testId: string;
  mono?: boolean;
}) {
  return (
    <Card className="bg-card border-card-border" data-testid={testId}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p
          className={`text-sm whitespace-pre-wrap leading-relaxed ${
            mono ? "font-mono text-xs" : ""
          }`}
        >
          {content}
        </p>
      </CardContent>
    </Card>
  );
}
