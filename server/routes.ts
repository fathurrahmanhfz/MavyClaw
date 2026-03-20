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
    const runtimeInfo = await storage.getRuntimeInfo();
    res.json({
      status: "ok",
      runtime: runtimeInfo.runtime,
      importedAt: new Date().toISOString(),
    });
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
    res.status(201).json(run);
  });

  app.post("/api/agent/run/progress", requireAgentIngest(), async (req, res) => {
    const parsed = validateBody(agentRunProgressSchema, req.body);
    if (!parsed.ok) return res.status(400).json(parsed.error);

    const run = await storage.updateRun(parsed.data.runId, toRunPatchFromAgentProgress(parsed.data));
    if (!run) return res.status(404).json({ error: "Run not found" });
    publishWorkspaceEvent("run-updated");
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

      await storage.updateRun(parsed.data.runId, {
        safetyDecision: parsed.data.decision,
        updatedAt: new Date().toISOString(),
      });
      publishWorkspaceEvent("run-updated");
    }

    const check = await storage.createSafetyCheck(toInsertSafetyCheckFromAgent(parsed.data));
    publishWorkspaceEvent("safety-check-created");
    res.status(201).json(check);
  });

  app.post("/api/agent/lesson", requireAgentIngest(), async (req, res) => {
    const parsed = validateBody(agentLessonSchema, req.body);
    if (!parsed.ok) return res.status(400).json(parsed.error);

    const lesson = await storage.createLesson(toInsertLessonFromAgent(parsed.data));
    publishWorkspaceEvent("lesson-created");
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
    res.status(201).json(run);
  });

  app.patch("/api/runs/:id", requireRole("editor"), async (req, res) => {
    const parsed = validateBody(runUpdateSchema, req.body);
    if (!parsed.ok) return res.status(400).json(parsed.error);

    const runId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const run = await storage.updateRun(runId, parsed.data);
    if (!run) return res.status(404).json({ error: "Run not found" });
    publishWorkspaceEvent("run-updated");
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

      await storage.updateRun(runId, {
        safetyDecision: decision,
        updatedAt: new Date().toISOString(),
      });
    }

    const check = await storage.createSafetyCheck({
      ...rest,
      runId: runId || null,
      decision,
    });
    publishWorkspaceEvent("safety-check-created");
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
