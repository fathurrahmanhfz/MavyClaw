import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import StatusBadge from "@/components/StatusBadge";
import { Link } from "wouter";
import { FlaskConical, AlertTriangle, ChevronRight } from "lucide-react";
import type { Scenario } from "@shared/schema";

export default function Scenarios() {
  const { data: scenarios, isLoading, error } = useQuery<Scenario[]>({
    queryKey: ["/api/scenarios"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/scenarios");
      return res.json();
    },
  });

  if (error) {
    return (
      <div className="flex items-center justify-center h-64" data-testid="error-scenarios">
        <div className="text-center">
          <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Gagal memuat skenario</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="page-scenarios">
      <div>
        <h2 className="text-xl font-bold tracking-tight" data-testid="heading-scenarios">
          Katalog Skenario
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Daftar skenario benchmark realistis untuk agent ops
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : scenarios?.length ? (
        <div className="space-y-3">
          {scenarios.map((sc) => (
            <Link key={sc.id} href={`/scenarios/${sc.id}`}>
              <Card
                className="bg-card border-card-border hover:bg-accent/30 transition-colors cursor-pointer"
                data-testid={`card-scenario-${sc.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <FlaskConical className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold truncate" data-testid={`text-scenario-title-${sc.id}`}>
                          {sc.title}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {sc.description}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <StatusBadge status={sc.category} testId={`badge-category-${sc.id}`} />
                          <StatusBadge status={sc.difficulty} testId={`badge-difficulty-${sc.id}`} />
                          <StatusBadge status={sc.readiness} testId={`badge-readiness-${sc.id}`} />
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground mt-1 shrink-0" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-12" data-testid="empty-scenarios">
          <FlaskConical className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Belum ada skenario benchmark</p>
        </div>
      )}
    </div>
  );
}
