import type { Express } from "express";
import { type Server } from "http";
import { z } from "zod";
import { getSessionState, loginHandler, logoutHandler, requireRole } from "./auth";
import { publishWorkspaceEvent, registerWorkspaceEventsStream } from "./live";
import {
  insertLessonSchema,
  insertReviewSchema,
  insertRunSchema,
  insertSafetyCheckSchema,
  insertScenarioSchema,
} from "@shared/schema";
import {
  agentLessonSchema,
  agentReviewSchema,
  agentRunFinishSchema,
  agentRunProgressSchema,
  agentRunStartSchema,
  agentSafetyCheckSchema,
  buildAgentScenario,
  requireAgentIngest,
  toInsertLessonFromAgent,
  toInsertReviewFromAgent,
  toInsertRunFromAgentStart,
  toInsertSafetyCheckFromAgent,
  toRunPatchFromAgentProgress,
} from "./agent";
import { storage, type StorageSnapshot } from "./storage";
import { HttpError } from "./errors";

// Helper: fire-and-forget activity log creation.
// Non-blocking so a log write failure never breaks the primary response.
function logActivity(
  action: string,
  entityType: string,
  entityId: string | null | undefined,
  summary: string,
  actorNote?: string | null,
): void {
  storage
    .createActivityLog({
      action,
      entityType,
      entityId: entityId ?? null,
      summary,
      actorNote: actorNote ?? null,
      occurredAt: new Date().toISOString(),
    })
    .then(() => publishWorkspaceEvent("activity-log-created"))
    .catch((err) => {
      // Never let a log failure surface to the caller
      console.error("[activity-log] write failed:", err);
    });
}

const runUpdateSchema = insertRunSchema
  .partial()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field must be provided to update a run",
  });

const snapshotSchema = z.object({
  scenarios: z.array(insertScenarioSchema.extend({ id: z.string() })),
  runs: z.array(insertRunSchema.extend({ id: z.string() })),
  safetyChecks: z.array(insertSafetyCheckSchema.extend({ id: z.string() })),
  lessons: z.array(insertLessonSchema.extend({ id: z.string() })),
  reviews: z.array(insertReviewSchema.extend({ id: z.string() })),
});

function normalizeSnapshot(snapshot: z.infer<typeof snapshotSchema>): StorageSnapshot {
  return {
    scenarios: snapshot.scenarios,
    runs: snapshot.runs.map((run) => ({
      ...run,
      operatorNote: run.operatorNote ?? null,
      evidence: run.evidence ?? null,
      safetyDecision: run.safetyDecision ?? null,
      approvalNote: (run as any).approvalNote ?? null,
    })),
    safetyChecks: snapshot.safetyChecks.map((check) => ({
      ...check,
      runId: check.runId ?? null,
    })),
    lessons: snapshot.lessons.map((lesson) => ({
      ...lesson,
      taxonomyL2: lesson.taxonomyL2 ?? null,
    })),
    reviews: snapshot.reviews.map((review) => ({
      ...review,
      runId: review.runId ?? null,
    })),
    // Activity logs are not imported via workspace snapshot (they are operational data)
    activityLogs: [],
  };
}

function validateBody<T>(schema: z.ZodType<T>, payload: unknown) {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: {
        error: "Invalid payload",
        details: parsed.error.flatten(),
      },
    };
  }

  return {
    ok: true as const,
    data: parsed.data,
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/session", (req, res) => {
    res.json(getSessionState(req));
  });

  app.get("/api/live", requireRole("viewer"), registerWorkspaceEventsStream);

  app.post("/api/session/login", loginHandler());
  app.post("/api/session/logout", logoutHandler());

  app.get("/api/health", async (_req, res) => {
    const runtimeInfo = await storage.getRuntimeInfo();

    res.json({
      status: "ok",
      app: "MavyClaw",
      runtime: runtimeInfo.runtime,
      persistence: runtimeInfo.persistence,
      databaseConfigured: runtimeInfo.databaseConfigured,
      dataFile: runtimeInfo.dataFile,
      agentIngest: runtimeInfo.agentIngest,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  app.get("/api/workspace/export", async (_req, res) => {
    const runtimeInfo = await storage.getRuntimeInfo();
    const snapshot = await storage.exportSnapshot();

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="mavyclaw-workspace-${runtimeInfo.runtime}.json"`);
    res.json({
      exportedAt: new Date().toISOString(),
      runtime: runtimeInfo.runtime,
      snapshot,
    });
  });

  app.post("/api/workspace/import", requireRole("admin"), async (req, res) => {
    const parsed = validateBody(z.object({ snapshot: snapshotSchema }), req.body);
    if (!parsed.ok) return res.status(400).json(parsed.error);

    await storage.importSnapshot(normalizeSnapshot(parsed.data.snapshot));
    publishWorkspaceEvent("workspace-imported");
    logActivity("workspace.imported", "workspace", null, "Workspace snapshot imported");
    const runtimeInfo = await storage.getRuntimeInfo();
    res.json({
      status: "ok",
      runtime: runtimeInfo.runtime,
      importedAt: new Date().toISOString(),
    });
  });

  // ── Activity Log ──────────────────────────────────────────────────────────
  // GET /api/activity — returns recent activity events, newest first.
  // Optional query params: ?entityType=run&entityId=<id>&limit=50
  app.get("/api/activity", requireRole("viewer"), async (req, res) => {
    const entityType = typeof req.query.entityType === "string" ? req.query.entityType : undefined;
    const entityId = typeof req.query.entityId === "string" ? req.query.entityId : undefined;
    const rawLimit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : undefined;
    const limit = rawLimit !== undefined && !isNaN(rawLimit) && rawLimit > 0 ? rawLimit : 100;

    const entries = await storage.getActivityLogs({ entityType, entityId, limit });
    res.json(entries);
  });

  app.get("/api/activity/:id", requireRole("viewer"), async (req, res) => {
    const entryId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const entry = await storage.getActivityLog(entryId);
    if (!entry) return res.status(404).json({ error: "Activity log entry not found" });
    res.json(entry);
  });

  app.get("/api/agent/status", async (_req, res) => {
    const runtimeInfo = await storage.getRuntimeInfo();
    res.json(runtimeInfo.agentIngest);
  });

  app.post("/api/agent/run/start", requireAgentIngest(), async (req, res) => {
    const parsed = validateBody(agentRunStartSchema, req.body);
    if (!parsed.ok) return res.status(400).json(parsed.error);

    let scenarioId = parsed.data.scenarioId;

    if (scenarioId) {
      const existingScenario = await storage.getScenario(scenarioId);
      if (!existingScenario) {
        return res.status(400).json({ error: `Scenario with ID ${scenarioId} was not found` });
      }
    } else {
      const scenario = await storage.createScenario(
        buildAgentScenario(parsed.data.scenario, parsed.data.taskTitle, parsed.data.scenarioId),
      );
      scenarioId = scenario.id;
      publishWorkspaceEvent("scenario-created");
    }

    const run = await storage.createRun(toInsertRunFromAgentStart(parsed.data, scenarioId));
    publishWorkspaceEvent("run-created");
    logActivity("run.created", "run", run.id, `Run created for scenario ${scenarioId}`, parsed.data.operatorNote);
    res.status(201).json(run);
  });

  app.post("/api/agent/run/progress", requireAgentIngest(), async (req, res) => {
    const parsed = validateBody(agentRunProgressSchema, req.body);
    if (!parsed.ok) return res.status(400).json(parsed.error);

    const run = await storage.updateRun(parsed.data.runId, toRunPatchFromAgentProgress(parsed.data));
    if (!run) return res.status(404).json({ error: "Run not found" });
    publishWorkspaceEvent("run-updated");
    logActivity("run.updated", "run", run.id, `Run status updated to '${parsed.data.status ?? "running"}'`, parsed.data.operatorNote);
    res.json(run);
  });

  app.post("/api/agent/safety-check", requireAgentIngest(), async (req, res) => {
    const parsed = validateBody(agentSafetyCheckSchema, req.body);
    if (!parsed.ok) return res.status(400).json(parsed.error);

    if (parsed.data.runId) {
      const run = await storage.getRun(parsed.data.runId);
      if (!run) {
        return res.status(400).json({ error: `Run with ID ${parsed.data.runId} was not found` });
      }

      // When a safety check yields hold-for-approval, automatically move the
      // run into pending-approval so operators can act on it via the dashboard.
      const runPatch: Partial<import("@shared/schema").InsertRun> = {
        safetyDecision: parsed.data.decision,
        updatedAt: new Date().toISOString(),
      };
      if (parsed.data.decision === "hold-for-approval" && run.status !== "pending-approval") {
        runPatch.status = "pending-approval";
      }
      await storage.updateRun(parsed.data.runId, runPatch);
      publishWorkspaceEvent("run-updated");
    }

    const check = await storage.createSafetyCheck(toInsertSafetyCheckFromAgent(parsed.data));
    publishWorkspaceEvent("safety-check-created");
    logActivity("safety_check.created", "safety_check", check.id, `Safety check created: decision='${check.decision}' env='${check.targetEnv}'`);
    res.status(201).json(check);
  });

  app.post("/api/agent/lesson", requireAgentIngest(), async (req, res) => {
    const parsed = validateBody(agentLessonSchema, req.body);
    if (!parsed.ok) return res.status(400).json(parsed.error);

    const lesson = await storage.createLesson(toInsertLessonFromAgent(parsed.data));
    publishWorkspaceEvent("lesson-created");
    logActivity("lesson.created", "lesson", lesson.id, `Lesson created: '${lesson.title}'`);
    res.status(201).json(lesson);
  });

  app.post("/api/agent/review", requireAgentIngest(), async (req, res) => {
    const parsed = validateBody(agentReviewSchema, req.body);
    if (!parsed.ok) return res.status(400).json(parsed.error);

    if (parsed.data.runId) {
      const run = await storage.getRun(parsed.data.runId);
      if (!run) {
        return res.status(400).json({ error: `Run with ID ${parsed.data.runId} was not found` });
      }
    }

    const review = await storage.createReview(toInsertReviewFromAgent(parsed.data));
    publishWorkspaceEvent("review-created");
    logActivity("review.created", "review", review.id, `Review created: status='${review.resultStatus}'`);
    res.status(201).json(review);
  });

  app.post("/api/agent/run/finish", requireAgentIngest(), async (req, res) => {
    const parsed = validateBody(agentRunFinishSchema, req.body);
    if (!parsed.ok) return res.status(400).json(parsed.error);

    const run = await storage.updateRun(
      parsed.data.runId,
      toRunPatchFromAgentProgress(parsed.data, parsed.data.status ?? "passed"),
    );
    if (!run) return res.status(404).json({ error: "Run not found" });
    publishWorkspaceEvent("run-updated");
    logActivity("run.finished", "run", run.id, `Run finished with status '${run.status}'`, parsed.data.operatorNote);
    res.json(run);
  });

  app.get("/api/scenarios", async (_req, res) => {
    const scenarios = await storage.getScenarios();
    res.json(scenarios);
  });

  app.get("/api/scenarios/:id", async (req, res) => {
    const scenario = await storage.getScenario(req.params.id);
    if (!scenario) return res.status(404).json({ error: "Scenario not found" });
    res.json(scenario);
  });

  app.post("/api/scenarios", requireRole("editor"), async (req, res) => {
    const parsed = validateBody(insertScenarioSchema, req.body);
    if (!parsed.ok) return res.status(400).json(parsed.error);

    const scenario = await storage.createScenario(parsed.data);
    publishWorkspaceEvent("scenario-created");
    logActivity("scenario.created", "scenario", scenario.id, `Scenario created: '${scenario.title}'`);
    res.status(201).json(scenario);
  });

  // PATCH /api/scenarios/:id — partial update for a scenario
  // Pattern adapted from Paperclip: mutations use partial Zod schemas so only
  // provided fields are changed and at least one field must be supplied.
  app.patch("/api/scenarios/:id", requireRole("editor"), async (req, res, next) => {
    const scenarioUpdateSchema = insertScenarioSchema
      .partial()
      .refine((p) => Object.keys(p).length > 0, { message: "At least one field must be provided" });
    const parsed = validateBody(scenarioUpdateSchema, req.body);
    if (!parsed.ok) return res.status(400).json(parsed.error);

    const scenarioId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const existing = await storage.getScenario(scenarioId);
    if (!existing) return next(new HttpError(404, "Scenario not found"));

    const scenario = await storage.updateScenario(scenarioId, parsed.data);
    if (!scenario) return next(new HttpError(404, "Scenario not found"));
    publishWorkspaceEvent("scenario-created"); // reuses scenario-created to trigger list refresh
    logActivity("scenario.updated", "scenario", scenario.id, `Scenario updated: '${scenario.title}'`);
    res.json(scenario);
  });

  app.get("/api/runs", async (_req, res) => {
    const runs = await storage.getRuns();
    res.json(runs);
  });

  app.get("/api/runs/:id", async (req, res) => {
    const run = await storage.getRun(req.params.id);
    if (!run) return res.status(404).json({ error: "Run not found" });
    res.json(run);
  });

  app.post("/api/runs", requireRole("editor"), async (req, res) => {
    const parsed = validateBody(insertRunSchema, req.body);
    if (!parsed.ok) return res.status(400).json(parsed.error);

    const run = await storage.createRun(parsed.data);
    publishWorkspaceEvent("run-created");
    logActivity("run.created", "run", run.id, `Run created for scenario ${run.scenarioId}`, run.operatorNote);
    res.status(201).json(run);
  });

  app.patch("/api/runs/:id", requireRole("editor"), async (req, res) => {
    const parsed = validateBody(runUpdateSchema, req.body);
    if (!parsed.ok) return res.status(400).json(parsed.error);

    const runId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const run = await storage.updateRun(runId, parsed.data);
    if (!run) return res.status(404).json({ error: "Run not found" });
    publishWorkspaceEvent("run-updated");
    logActivity("run.updated", "run", run.id, `Run updated: status='${run.status}'`, run.operatorNote);
    res.json(run);
  });

  // POST /api/runs/:id/cancel — explicit cancellation endpoint.
  // Inspired by Paperclip's board-level "pause/cancel any agent run" capability.
  // Setting status to "failed" surfaces a named cancel action rather than
  // requiring callers to PATCH with an arbitrary status string.
  app.post("/api/runs/:id/cancel", requireRole("editor"), async (req, res, next) => {
    const runId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const existing = await storage.getRun(runId);
    if (!existing) return next(new HttpError(404, "Run not found"));

    const terminalStatuses = new Set(["passed", "failed"]);
    if (terminalStatuses.has(existing.status)) {
      return next(new HttpError(409, `Run is already in terminal status '${existing.status}' and cannot be cancelled`));
    }

    const note = typeof req.body?.reason === "string" && req.body.reason.trim()
      ? req.body.reason.trim()
      : "Cancelled by operator";
    const run = await storage.updateRun(runId, {
      status: "failed",
      operatorNote: note,
      updatedAt: new Date().toISOString(),
    });
    publishWorkspaceEvent("run-updated");
    logActivity("run.cancelled", "run", runId, `Run cancelled: '${note}'`, note);
    res.json(run);
  });

  // POST /api/runs/:id/approve — approve a run that is in pending-approval state.
  // The run transitions to 'running' so execution can continue. An optional
  // approval_note is recorded and a log entry is written.
  app.post("/api/runs/:id/approve", requireRole("editor"), async (req, res, next) => {
    const runId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const existing = await storage.getRun(runId);
    if (!existing) return next(new HttpError(404, "Run not found"));

    if (existing.status !== "pending-approval") {
      return next(new HttpError(409, `Run is not in 'pending-approval' state (current: '${existing.status}')`))
    }

    const note = typeof req.body?.note === "string" && req.body.note.trim()
      ? req.body.note.trim()
      : "Approved by operator";
    const run = await storage.updateRun(runId, {
      status: "running",
      approvalNote: note,
      updatedAt: new Date().toISOString(),
    });
    publishWorkspaceEvent("run-updated");
    logActivity("run.approved", "run", runId, `Run approved: '${note}'`, note);
    res.json(run);
  });

  // POST /api/runs/:id/reject — reject a run that is in pending-approval state.
  // The run transitions to 'failed'. An optional rejection note is recorded.
  app.post("/api/runs/:id/reject", requireRole("editor"), async (req, res, next) => {
    const runId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const existing = await storage.getRun(runId);
    if (!existing) return next(new HttpError(404, "Run not found"));

    if (existing.status !== "pending-approval") {
      return next(new HttpError(409, `Run is not in 'pending-approval' state (current: '${existing.status}')`))
    }

    const note = typeof req.body?.note === "string" && req.body.note.trim()
      ? req.body.note.trim()
      : "Rejected by operator";
    const run = await storage.updateRun(runId, {
      status: "failed",
      approvalNote: note,
      updatedAt: new Date().toISOString(),
    });
    publishWorkspaceEvent("run-updated");
    logActivity("run.rejected", "run", runId, `Run rejected: '${note}'`, note);
    res.json(run);
  });

  app.get("/api/safety-checks", async (_req, res) => {
    const checks = await storage.getSafetyChecks();
    res.json(checks);
  });

  app.get("/api/safety-checks/:id", async (req, res) => {
    const check = await storage.getSafetyCheck(req.params.id);
    if (!check) return res.status(404).json({ error: "Safety check not found" });
    res.json(check);
  });

  app.post("/api/safety-checks", requireRole("editor"), async (req, res) => {
    const parsed = validateBody(insertSafetyCheckSchema, req.body);
    if (!parsed.ok) return res.status(400).json(parsed.error);

    const { runId, decision, ...rest } = parsed.data;

    if (runId) {
      const run = await storage.getRun(runId);
      if (!run) {
        return res.status(400).json({ error: `Run with ID ${runId} was not found` });
      }

      // Automatically move run to pending-approval if the safety decision requires it.
      const runPatch: Partial<import("@shared/schema").InsertRun> = {
        safetyDecision: decision,
        updatedAt: new Date().toISOString(),
      };
      if (decision === "hold-for-approval" && run.status !== "pending-approval") {
        runPatch.status = "pending-approval";
      }
      await storage.updateRun(runId, runPatch);
    }

    const check = await storage.createSafetyCheck({
      ...rest,
      runId: runId || null,
      decision,
    });
    publishWorkspaceEvent("safety-check-created");
    logActivity("safety_check.created", "safety_check", check.id, `Safety check created: decision='${check.decision}' env='${check.targetEnv}'`);
    res.status(201).json(check);
  });

  app.get("/api/lessons", async (_req, res) => {
    const lessons = await storage.getLessons();
    res.json(lessons);
  });

  app.get("/api/lessons/:id", async (req, res) => {
    const lesson = await storage.getLesson(req.params.id);
    if (!lesson) return res.status(404).json({ error: "Lesson not found" });
    res.json(lesson);
  });

  app.post("/api/lessons", requireRole("editor"), async (req, res) => {
    const parsed = validateBody(insertLessonSchema, req.body);
    if (!parsed.ok) return res.status(400).json(parsed.error);

    const lesson = await storage.createLesson(parsed.data);
    publishWorkspaceEvent("lesson-created");
    logActivity("lesson.created", "lesson", lesson.id, `Lesson created: '${lesson.title}'`);
    res.status(201).json(lesson);
  });

  // PATCH /api/lessons/:id — partial update for a lesson
  app.patch("/api/lessons/:id", requireRole("editor"), async (req, res, next) => {
    const lessonUpdateSchema = insertLessonSchema
      .partial()
      .refine((p) => Object.keys(p).length > 0, { message: "At least one field must be provided" });
    const parsed = validateBody(lessonUpdateSchema, req.body);
    if (!parsed.ok) return res.status(400).json(parsed.error);

    const lessonId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const existing = await storage.getLesson(lessonId);
    if (!existing) return next(new HttpError(404, "Lesson not found"));

    const lesson = await storage.updateLesson(lessonId, parsed.data);
    if (!lesson) return next(new HttpError(404, "Lesson not found"));
    publishWorkspaceEvent("lesson-created"); // triggers list refresh
    logActivity("lesson.updated", "lesson", lesson.id, `Lesson updated: '${lesson.title}'`);
    res.json(lesson);
  });

  app.get("/api/reviews", async (_req, res) => {
    const reviews = await storage.getReviews();
    res.json(reviews);
  });

  app.get("/api/reviews/:id", async (req, res) => {
    const review = await storage.getReview(req.params.id);
    if (!review) return res.status(404).json({ error: "Review not found" });
    res.json(review);
  });

  app.post("/api/reviews", requireRole("editor"), async (req, res) => {
    const parsed = validateBody(insertReviewSchema, req.body);
    if (!parsed.ok) return res.status(400).json(parsed.error);

    const review = await storage.createReview(parsed.data);
    publishWorkspaceEvent("review-created");
    logActivity("review.created", "review", review.id, `Review created: status='${review.resultStatus}'`);
    res.status(201).json(review);
  });

  // PATCH /api/reviews/:id — partial update for a review
  app.patch("/api/reviews/:id", requireRole("editor"), async (req, res, next) => {
    const reviewUpdateSchema = insertReviewSchema
      .partial()
      .refine((p) => Object.keys(p).length > 0, { message: "At least one field must be provided" });
    const parsed = validateBody(reviewUpdateSchema, req.body);
    if (!parsed.ok) return res.status(400).json(parsed.error);

    const reviewId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const existing = await storage.getReview(reviewId);
    if (!existing) return next(new HttpError(404, "Review not found"));

    const review = await storage.updateReview(reviewId, parsed.data);
    if (!review) return next(new HttpError(404, "Review not found"));
    publishWorkspaceEvent("review-created"); // triggers list refresh
    logActivity("review.updated", "review", review.id, `Review updated: status='${review.resultStatus}'`);
    res.json(review);
  });

  app.get("/api/stats", async (_req, res) => {
    const [runtimeInfo, scenarios, runs, lessons, reviews, safetyChecks] = await Promise.all([
      storage.getRuntimeInfo(),
      storage.getScenarios(),
      storage.getRuns(),
      storage.getLessons(),
      storage.getReviews(),
      storage.getSafetyChecks(),
    ]);

    const runsByStatus = runs.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const lessonsByStatus = lessons.reduce((acc, l) => {
      acc[l.status] = (acc[l.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const errorCategories = lessons.reduce((acc, l) => {
      acc[l.taxonomyL1] = (acc[l.taxonomyL1] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    res.json({
      runtime: runtimeInfo.runtime,
      persistence: runtimeInfo.persistence,
      databaseConfigured: runtimeInfo.databaseConfigured,
      agentIngest: runtimeInfo.agentIngest,
      totalScenarios: scenarios.length,
      totalRuns: runs.length,
      totalLessons: lessons.length,
      totalReviews: reviews.length,
      totalSafetyChecks: safetyChecks.length,
      runsByStatus,
      lessonsByStatus,
      errorCategories,
      recentRuns: runs.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
    });
  });

  return httpServer;
}
