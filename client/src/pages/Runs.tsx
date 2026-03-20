import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import StatusBadge from "@/components/StatusBadge";
import { Play, AlertTriangle, Plus, ChevronDown, ChevronUp } from "lucide-react";
import type { Run, Scenario } from "@shared/schema";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

export default function Runs() {
  const { toast } = useToast();
  const { canWrite } = useAuth();
  const [expandedRun, setExpandedRun] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newScenarioId, setNewScenarioId] = useState("");
  const [newNote, setNewNote] = useState("");

  const { data: runs, isLoading, error } = useQuery<Run[]>({
    queryKey: ["/api/runs"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/runs");
      return res.json();
    },
  });

  const { data: scenarios } = useQuery<Scenario[]>({
    queryKey: ["/api/scenarios"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/scenarios");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/runs", {
        scenarioId: newScenarioId,
        status: "planned",
        operatorNote: newNote || null,
        evidence: null,
        safetyDecision: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setShowCreate(false);
      setNewScenarioId("");
      setNewNote("");
      toast({ title: "Success", description: "New run created successfully" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/runs/${id}`, { status });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({ title: "Success", description: "Run status updated" });
    },
  });

  const scenarioMap = new Map((scenarios || []).map((s) => [s.id, s]));

  if (error) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="error-runs">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Failed to load benchmark runs</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="page-runs">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight" data-testid="heading-runs">
            Benchmark Runs
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage and monitor benchmark execution
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowCreate(!showCreate)}
          disabled={!canWrite}
          data-testid="button-create-run"
        >
          <Plus className="w-4 h-4 mr-1" />
          Create Run
        </Button>
      </div>

      {!canWrite ? (
        <Card className="bg-card border-card-border">
          <CardContent className="p-4 text-sm text-muted-foreground">
            Your current role is read-only. Sign in as an editor or admin to create or update runs.
          </CardContent>
        </Card>
      ) : null}

      {showCreate && (
        <Card className="bg-card border-card-border" data-testid="form-create-run">
          <CardContent className="p-4 space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Scenario</label>
              <Select value={newScenarioId} onValueChange={setNewScenarioId}>
                <SelectTrigger data-testid="select-scenario">
                  <SelectValue placeholder="Choose a scenario..." />
                </SelectTrigger>
                <SelectContent>
                  {(scenarios || []).map((sc) => (
                    <SelectItem key={sc.id} value={sc.id}>
                      {sc.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Operator Note</label>
              <Textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Optional operator note..."
                className="resize-none"
                data-testid="input-operator-note"
              />
            </div>
            <Button
              size="sm"
              disabled={!newScenarioId || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              data-testid="button-submit-run"
            >
              {createMutation.isPending ? "Creating..." : "Create New Run"}
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : runs?.length ? (
        <div className="space-y-3">
          {runs.map((run) => {
            const sc = scenarioMap.get(run.scenarioId);
            const isExpanded = expandedRun === run.id;
            return (
              <Card key={run.id} className="bg-card border-card-border" data-testid={`card-run-${run.id}`}>
                <CardContent className="p-4">
                  <div
                    className="flex items-center justify-between gap-4 cursor-pointer"
                    onClick={() => setExpandedRun(isExpanded ? null : run.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <Play className="w-4 h-4 text-primary shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground">{run.id}</span>
                          <StatusBadge status={run.status} testId={`badge-run-${run.id}`} />
                        </div>
                        <p className="text-sm font-medium mt-0.5 truncate">
                          {sc?.title || run.scenarioId}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground font-mono">
                        {new Date(run.createdAt).toLocaleDateString("en-US")}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-border space-y-3">
                      {run.operatorNote && (
                        <div>
                          <span className="text-xs font-medium text-muted-foreground">Operator Note</span>
                          <p className="text-sm mt-1" data-testid={`text-note-${run.id}`}>{run.operatorNote}</p>
                        </div>
                      )}
                      {run.evidence && (
                        <div>
                          <span className="text-xs font-medium text-muted-foreground">Verification Evidence</span>
                          <p className="text-sm font-mono mt-1" data-testid={`text-evidence-${run.id}`}>{run.evidence}</p>
                        </div>
                      )}
                      {run.safetyDecision && (
                        <div>
                          <span className="text-xs font-medium text-muted-foreground">Safety Decision</span>
                          <div className="mt-1">
                            <StatusBadge status={run.safetyDecision} testId={`badge-safety-${run.id}`} />
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2 pt-2">
                        {["planned", "running", "blocked", "passed", "failed"].map((s) => (
                          <Button
                            key={s}
                            variant={run.status === s ? "default" : "outline"}
                            size="sm"
                            className="text-xs h-7"
                            disabled={!canWrite || run.status === s || updateMutation.isPending}
                            onClick={() => updateMutation.mutate({ id: run.id, status: s })}
                            data-testid={`button-status-${s}-${run.id}`}
                          >
                            {s}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12" data-testid="empty-runs">
          <Play className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No benchmark runs yet</p>
        </div>
      )}
    </div>
  );
}
