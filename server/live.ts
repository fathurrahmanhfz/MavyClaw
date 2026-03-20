import type { Request, Response } from "express";
import { randomUUID } from "crypto";

type WorkspaceEventType =
  | "workspace-imported"
  | "scenario-created"
  | "run-created"
  | "run-updated"
  | "safety-check-created"
  | "lesson-created"
  | "review-created"
  | "activity-log-created";

export interface WorkspaceEvent {
  id: string;
  type: WorkspaceEventType;
  occurredAt: string;
}

const clients = new Set<Response>();

function sendEvent(res: Response, event: WorkspaceEvent) {
  res.write(`event: workspace-update\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function registerWorkspaceEventsStream(_req: Request, res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  res.write(`retry: 3000\n\n`);
  clients.add(res);

  const heartbeat = setInterval(() => {
    res.write(`: heartbeat ${Date.now()}\n\n`);
  }, 15000);

  res.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(res);
    res.end();
  });
}

export function publishWorkspaceEvent(type: WorkspaceEventType) {
  const event: WorkspaceEvent = {
    id: randomUUID(),
    type,
    occurredAt: new Date().toISOString(),
  };

  Array.from(clients).forEach((client) => {
    sendEvent(client, event);
  });
}
