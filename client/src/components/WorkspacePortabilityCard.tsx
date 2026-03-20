import { useRef, useState, type ChangeEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Download, Upload, Database, HardDrive, Layers3 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface WorkspacePortabilityCardProps {
  runtime: string;
  persistence: string;
}

interface ExportPayload {
  exportedAt: string;
  runtime: string;
  snapshot: {
    scenarios: unknown[];
    runs: unknown[];
    safetyChecks: unknown[];
    lessons: unknown[];
    reviews: unknown[];
  };
}

export default function WorkspacePortabilityCard({ runtime, persistence }: WorkspacePortabilityCardProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const importMutation = useMutation({
    mutationFn: async (payload: ExportPayload) => {
      const res = await apiRequest("POST", "/api/workspace/import", {
        snapshot: payload.snapshot,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/scenarios"] });
      queryClient.invalidateQueries({ queryKey: ["/api/runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/safety-checks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lessons"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reviews"] });
      toast({
        title: "Workspace imported",
        description: "The full workspace snapshot has been restored successfully.",
      });
    },
    onError: (error) => {
      toast({
        title: "Import failed",
        description: error instanceof Error ? error.message : "The workspace snapshot could not be restored.",
        variant: "destructive",
      });
    },
  });

  async function handleExport() {
    setIsDownloading(true);
    try {
      const response = await fetch("/api/workspace/export");
      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = await response.json();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `mavyclaw-workspace-${payload.runtime}.json`;
      anchor.click();
      URL.revokeObjectURL(url);

      toast({
        title: "Workspace exported",
        description: "A full JSON snapshot of the workspace has been downloaded.",
      });
    } catch (error) {
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "The workspace snapshot could not be exported.",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  }

  async function handleFileImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const raw = await file.text();
      const payload = JSON.parse(raw) as ExportPayload;
      await importMutation.mutateAsync(payload);
    } catch (error) {
      toast({
        title: "Invalid snapshot",
        description: error instanceof Error ? error.message : "The uploaded file is not a valid MavyClaw snapshot.",
        variant: "destructive",
      });
    } finally {
      event.target.value = "";
    }
  }

  const runtimeIcon = runtime === "postgres"
    ? Database
    : persistence === "disk"
      ? HardDrive
      : Layers3;
  const RuntimeIcon = runtimeIcon;

  return (
    <Card className="bg-card border-card-border" data-testid="workspace-portability-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <RuntimeIcon className="w-4 h-4 text-primary" />
          Workspace Portability
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Download the full workspace as JSON or restore it into the current runtime without manual database work.
        </p>

        <div className="grid grid-cols-2 gap-3 text-sm" data-testid="workspace-portability-meta">
          <div className="rounded-lg border border-card-border p-3">
            <p className="text-xs text-muted-foreground mb-1">Active runtime</p>
            <p className="font-semibold capitalize">{runtime}</p>
          </div>
          <div className="rounded-lg border border-card-border p-3">
            <p className="text-xs text-muted-foreground mb-1">Snapshot format</p>
            <p className="font-semibold">JSON workspace</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            type="button"
            variant="default"
            onClick={handleExport}
            disabled={isDownloading}
            data-testid="button-export-workspace"
          >
            <Download className="w-4 h-4" />
            {isDownloading ? "Exporting..." : "Export workspace"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importMutation.isPending}
            data-testid="button-import-workspace"
          >
            <Upload className="w-4 h-4" />
            {importMutation.isPending ? "Importing..." : "Import workspace"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={handleFileImport}
          />
        </div>
      </CardContent>
    </Card>
  );
}
