import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusColors: Record<string, string> = {
  // Run statuses
  planned: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  running: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  blocked: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  passed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  failed: "bg-red-500/15 text-red-400 border-red-500/20",
  // Lesson statuses
  verified: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  partial: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  hypothesis: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  // Review statuses
  selesai: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  tertahan: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  gagal: "bg-red-500/15 text-red-400 border-red-500/20",
  // Readiness
  ready: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  draft: "bg-slate-500/15 text-slate-400 border-slate-500/20",
  "needs-review": "bg-amber-500/15 text-amber-400 border-amber-500/20",
  // Difficulty
  easy: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  medium: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  hard: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  critical: "bg-red-500/15 text-red-400 border-red-500/20",
  // Safety decisions
  "allow-read-only": "bg-blue-500/15 text-blue-400 border-blue-500/20",
  "allow-guarded-write": "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  "hold-for-approval": "bg-amber-500/15 text-amber-400 border-amber-500/20",
  deny: "bg-red-500/15 text-red-400 border-red-500/20",
  // Env
  produksi: "bg-red-500/15 text-red-400 border-red-500/20",
  staging: "bg-amber-500/15 text-amber-400 border-amber-500/20",
  dev: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  sandbox: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  // Action mode
  "read-only": "bg-blue-500/15 text-blue-400 border-blue-500/20",
  write: "bg-orange-500/15 text-orange-400 border-orange-500/20",
  // Promotion
  "memory only": "bg-slate-500/15 text-slate-400 border-slate-500/20",
  checklist: "bg-blue-500/15 text-blue-400 border-blue-500/20",
  workflow: "bg-purple-500/15 text-purple-400 border-purple-500/20",
  skill: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
};

export default function StatusBadge({
  status,
  className,
  testId,
}: {
  status: string;
  className?: string;
  testId?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "font-mono text-[11px] font-medium border px-2 py-0.5",
        statusColors[status] || "bg-muted text-muted-foreground border-border",
        className
      )}
      data-testid={testId}
    >
      {status}
    </Badge>
  );
}
