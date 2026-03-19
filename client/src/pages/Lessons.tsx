import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import StatusBadge from "@/components/StatusBadge";
import { BookOpen, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import type { Lesson } from "@shared/schema";
import { useState } from "react";

export default function Lessons() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: lessons, isLoading, error } = useQuery<Lesson[]>({
    queryKey: ["/api/lessons"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/lessons");
      return res.json();
    },
  });

  if (error) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="error-lessons">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Failed to load failure logs and lessons</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="page-lessons">
      <div>
        <h2 className="text-xl font-bold tracking-tight" data-testid="heading-lessons">
          Failures & Lessons
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Failure notes, near-misses, and lessons captured from operational work
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : lessons?.length ? (
        <div className="space-y-3">
          {lessons.map((lesson) => {
            const isExpanded = expandedId === lesson.id;
            return (
              <Card key={lesson.id} className="bg-card border-card-border" data-testid={`card-lesson-${lesson.id}`}>
                <CardContent className="p-4">
                  <div
                    className="flex items-start justify-between gap-4 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : lesson.id)}
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <BookOpen className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold" data-testid={`text-lesson-title-${lesson.id}`}>
                          {lesson.title}
                        </h3>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <StatusBadge status={lesson.status} testId={`badge-lesson-status-${lesson.id}`} />
                          <StatusBadge status={lesson.taxonomyL1} testId={`badge-taxonomy-${lesson.id}`} />
                          {lesson.taxonomyL2 && (
                            <span className="text-[11px] font-mono text-muted-foreground">
                              {lesson.taxonomyL2}
                            </span>
                          )}
                          <StatusBadge status={lesson.promotion} testId={`badge-promotion-${lesson.id}`} />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground font-mono">
                        {new Date(lesson.createdAt).toLocaleDateString("en-US")}
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
                      <DetailRow label="Context" value={lesson.context} />
                      <DetailRow label="Symptom" value={lesson.symptom} />
                      <DetailRow label="Root Cause" value={lesson.rootCause} />
                      <DetailRow label="Impact" value={lesson.impact} />
                      <DetailRow label="Prevention" value={lesson.prevention} highlight />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12" data-testid="empty-lessons">
          <BookOpen className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No lessons recorded yet</p>
        </div>
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <p className={highlight ? "mt-0.5 font-medium text-primary" : "mt-0.5"}>{value}</p>
    </div>
  );
}
