import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge from "@/components/StatusBadge";
import { ShieldCheck, AlertTriangle, Plus } from "lucide-react";
import type { SafetyCheck, Run } from "@shared/schema";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

export default function SafetyGate() {
  const { toast } = useToast();
  const { canWrite } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    runId: "",
    targetEnv: "",
    actionMode: "",
    affectedAssets: "",
    minVerification: "",
    recoveryPath: "",
    decision: "",
    reason: "",
  });

  const { data: runs } = useQuery<Run[]>({
    queryKey: ["/api/runs"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/runs");
      return res.json();
    },
  });

  const { data: checks, isLoading, error } = useQuery<SafetyCheck[]>({
    queryKey: ["/api/safety-checks"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/safety-checks");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        runId: form.runId || null,
        createdAt: new Date().toISOString(),
      };
      const res = await apiRequest("POST", "/api/safety-checks", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety-checks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/runs"] });
      setShowForm(false);
      setForm({ runId: "", targetEnv: "", actionMode: "", affectedAssets: "", minVerification: "", recoveryPath: "", decision: "", reason: "" });
      toast({ title: "Success", description: "Safety check saved successfully" });
    },
  });

  if (error) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="error-safety">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Failed to load safety checks</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="page-safety">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight" data-testid="heading-safety">
            Safety Gate Center
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Evaluate risk before higher-impact actions
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)} disabled={!canWrite} data-testid="button-create-safety">
          <Plus className="w-4 h-4 mr-1" />
          New Safety Check
        </Button>
      </div>

      {!canWrite ? (
        <Card className="bg-card border-card-border">
          <CardContent className="p-4 text-sm text-muted-foreground">
            Your current role is read-only. Sign in as an editor or admin to record safety decisions.
          </CardContent>
        </Card>
      ) : null}

      {showForm && (
        <Card className="bg-card border-card-border" data-testid="form-create-safety">
          <CardContent className="p-4 space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Related Run (Optional)</label>
              <Select value={form.runId} onValueChange={(v) => setForm({ ...form, runId: v })}>
                <SelectTrigger data-testid="select-run-id">
                  <SelectValue placeholder="Choose a run..." />
                </SelectTrigger>
                <SelectContent>
                  {runs?.map((run) => (
                    <SelectItem key={run.id} value={run.id}>
                      {run.id} ({run.status})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Target Environment</label>
                <Select value={form.targetEnv} onValueChange={(v) => setForm({ ...form, targetEnv: v })}>
                  <SelectTrigger data-testid="select-target-env">
                    <SelectValue placeholder="Choose..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">Production</SelectItem>
                    <SelectItem value="staging">Staging</SelectItem>
                    <SelectItem value="dev">Dev</SelectItem>
                    <SelectItem value="sandbox">Sandbox</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Action Mode</label>
                <Select value={form.actionMode} onValueChange={(v) => setForm({ ...form, actionMode: v })}>
                  <SelectTrigger data-testid="select-action-mode">
                    <SelectValue placeholder="Choose..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read-only">Read-Only</SelectItem>
                    <SelectItem value="write">Write</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Affected Assets</label>
              <Input
                value={form.affectedAssets}
                onChange={(e) => setForm({ ...form, affectedAssets: e.target.value })}
                placeholder="Example: users database, Nginx config..."
                data-testid="input-affected-assets"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Minimum Verification</label>
              <Textarea
                value={form.minVerification}
                onChange={(e) => setForm({ ...form, minVerification: e.target.value })}
                placeholder="What must be checked before acting..."
                className="resize-none"
                data-testid="input-min-verification"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Recovery Path</label>
              <Textarea
                value={form.recoveryPath}
                onChange={(e) => setForm({ ...form, recoveryPath: e.target.value })}
                placeholder="How to roll back if something fails..."
                className="resize-none"
                data-testid="input-recovery-path"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Gate Decision</label>
                <Select value={form.decision} onValueChange={(v) => setForm({ ...form, decision: v })}>
                  <SelectTrigger data-testid="select-decision">
                    <SelectValue placeholder="Choose..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="allow-read-only">Allow Read-Only</SelectItem>
                    <SelectItem value="allow-guarded-write">Allow Guarded Write</SelectItem>
                    <SelectItem value="hold-for-approval">Hold for Approval</SelectItem>
                    <SelectItem value="deny">Deny</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Reason</label>
                <Input
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                  placeholder="Decision rationale..."
                  data-testid="input-reason"
                />
              </div>
            </div>

            <Button
              size="sm"
              disabled={!form.targetEnv || !form.actionMode || !form.decision || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              data-testid="button-submit-safety"
            >
              {createMutation.isPending ? "Saving..." : "Save Safety Check"}
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      ) : checks?.length ? (
        <div className="space-y-3">
          {checks.map((check) => (
            <Card key={check.id} className="bg-card border-card-border" data-testid={`card-safety-${check.id}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    <span className="text-xs font-mono text-muted-foreground">{check.id}</span>
                    {check.runId && (
                      <span className="text-xs text-muted-foreground">→ {check.runId}</span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">
                    {new Date(check.createdAt).toLocaleDateString("en-US")}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <StatusBadge status={check.targetEnv} testId={`badge-env-${check.id}`} />
                  <StatusBadge status={check.actionMode} testId={`badge-mode-${check.id}`} />
                  <StatusBadge status={check.decision} testId={`badge-decision-${check.id}`} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground font-medium">Affected Assets</span>
                    <p className="mt-0.5">{check.affectedAssets}</p>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground font-medium">Recovery Path</span>
                    <p className="mt-0.5">{check.recoveryPath}</p>
                  </div>
                </div>

                <div>
                  <span className="text-xs text-muted-foreground font-medium">Reason</span>
                  <p className="text-sm mt-0.5">{check.reason}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12" data-testid="empty-safety">
          <ShieldCheck className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No safety checks yet</p>
        </div>
      )}
    </div>
  );
}
