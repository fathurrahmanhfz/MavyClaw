import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StatusBadge from "@/components/StatusBadge";
import { ClipboardCheck, AlertTriangle, Plus, ChevronDown, ChevronUp } from "lucide-react";
import type { Review } from "@shared/schema";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";

export default function Reviews() {
  const { toast } = useToast();
  const { canWrite } = useAuth();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    taskGoal: "",
    finalResult: "",
    resultStatus: "",
    evidence: "",
    whatWorked: "",
    whatFailed: "",
    nearMiss: "",
    safestNextStep: "",
  });

  const { data: reviews, isLoading, error } = useQuery<Review[]>({
    queryKey: ["/api/reviews"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/reviews");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/reviews", {
        ...form,
        runId: null,
        createdAt: new Date().toISOString(),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      setShowForm(false);
      setForm({ taskGoal: "", finalResult: "", resultStatus: "", evidence: "", whatWorked: "", whatFailed: "", nearMiss: "", safestNextStep: "" });
      toast({ title: "Success", description: "Review saved successfully" });
    },
  });

  if (error) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="error-reviews">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Failed to load post-task reviews</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="page-reviews">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight" data-testid="heading-reviews">
            Post-Task Review
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Structured reflection after each important technical task
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)} disabled={!canWrite} data-testid="button-create-review">
          <Plus className="w-4 h-4 mr-1" />
          New Review
        </Button>
      </div>

      {!canWrite ? (
        <Card className="bg-card border-card-border">
          <CardContent className="p-4 text-sm text-muted-foreground">
            Your current role is read-only. Sign in as an editor or admin to save reviews.
          </CardContent>
        </Card>
      ) : null}

      {showForm && (
        <Card className="bg-card border-card-border" data-testid="form-create-review">
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Task Goal</label>
                <Input
                  value={form.taskGoal}
                  onChange={(e) => setForm({ ...form, taskGoal: e.target.value })}
                  placeholder="What was this task trying to accomplish..."
                  data-testid="input-task-goal"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Result Status</label>
                <Select value={form.resultStatus} onValueChange={(v) => setForm({ ...form, resultStatus: v })}>
                  <SelectTrigger data-testid="select-result-status">
                    <SelectValue placeholder="Choose..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="on-hold">On Hold</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Final Result</label>
              <Textarea
                value={form.finalResult}
                onChange={(e) => setForm({ ...form, finalResult: e.target.value })}
                placeholder="Summarize the outcome..."
                className="resize-none"
                data-testid="input-final-result"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Verification Evidence</label>
              <Textarea
                value={form.evidence}
                onChange={(e) => setForm({ ...form, evidence: e.target.value })}
                placeholder="Commands, logs, outputs..."
                className="resize-none font-mono text-xs"
                data-testid="input-evidence"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">What Worked</label>
                <Textarea
                  value={form.whatWorked}
                  onChange={(e) => setForm({ ...form, whatWorked: e.target.value })}
                  className="resize-none"
                  data-testid="input-what-worked"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">What Failed</label>
                <Textarea
                  value={form.whatFailed}
                  onChange={(e) => setForm({ ...form, whatFailed: e.target.value })}
                  className="resize-none"
                  data-testid="input-what-failed"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Near-Miss</label>
              <Textarea
                value={form.nearMiss}
                onChange={(e) => setForm({ ...form, nearMiss: e.target.value })}
                className="resize-none"
                data-testid="input-near-miss"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Safest Next Step</label>
              <Input
                value={form.safestNextStep}
                onChange={(e) => setForm({ ...form, safestNextStep: e.target.value })}
                data-testid="input-safest-next"
              />
            </div>

            <Button
              size="sm"
              disabled={!form.taskGoal || !form.resultStatus || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              data-testid="button-submit-review"
            >
              {createMutation.isPending ? "Saving..." : "Save Review"}
            </Button>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : reviews?.length ? (
        <div className="space-y-3">
          {reviews.map((review) => {
            const isExpanded = expandedId === review.id;
            return (
              <Card key={review.id} className="bg-card border-card-border" data-testid={`card-review-${review.id}`}>
                <CardContent className="p-4">
                  <div
                    className="flex items-start justify-between gap-4 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : review.id)}
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <ClipboardCheck className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold" data-testid={`text-review-goal-${review.id}`}>
                          {review.taskGoal}
                        </h3>
                        <div className="flex items-center gap-2 mt-1">
                          <StatusBadge status={review.resultStatus} testId={`badge-review-status-${review.id}`} />
                          {review.runId && (
                            <span className="text-xs font-mono text-muted-foreground">{review.runId}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground font-mono">
                        {new Date(review.createdAt).toLocaleDateString("en-US")}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-border space-y-3 text-sm">
                      <div>
                        <span className="text-xs font-medium text-muted-foreground">Final Result</span>
                        <p className="mt-0.5">{review.finalResult}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-muted-foreground">Verification Evidence</span>
                        <p className="mt-0.5 font-mono text-xs">{review.evidence}</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <span className="text-xs font-medium text-emerald-400">✓ What Worked</span>
                          <p className="mt-0.5">{review.whatWorked}</p>
                        </div>
                        <div>
                          <span className="text-xs font-medium text-red-400">✗ What Failed</span>
                          <p className="mt-0.5">{review.whatFailed}</p>
                        </div>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-amber-400">⚠ Near-Miss</span>
                        <p className="mt-0.5">{review.nearMiss}</p>
                      </div>
                      <div>
                        <span className="text-xs font-medium text-primary">→ Safest Next Step</span>
                        <p className="mt-0.5 font-medium">{review.safestNextStep}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12" data-testid="empty-reviews">
          <ClipboardCheck className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No post-task reviews yet</p>
        </div>
      )}
    </div>
  );
}
