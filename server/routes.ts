import type { Express } from "express";
import { type Server } from "http";
import { z } from "zod";
import {
  insertLessonSchema,
  insertReviewSchema,
  insertRunSchema,
  insertSafetyCheckSchema,
  insertScenarioSchema,
} from "@shared/schema";
import { storage } from "./storage";

const runUpdateSchema = insertRunSchema
  .partial()
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field must be provided to update a run",
  });

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
  app.get("/api/health", async (_req, res) => {
    const runtimeInfo = await storage.getRuntimeInfo();

    res.json({
      status: "ok",
      app: "MavyClaw",
      runtime: runtimeInfo.runtime,
      persistence: runtimeInfo.persistence,
      databaseConfigured: runtimeInfo.databaseConfigured,
      dataFile: runtimeInfo.dataFile,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    });
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

  app.post("/api/scenarios", async (req, res) => {
    const parsed = validateBody(insertScenarioSchema, req.body);
    if (!parsed.ok) return res.status(400).json(parsed.error);

    const scenario = await storage.createScenario(parsed.data);
    res.status(201).json(scenario);
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

  app.post("/api/runs", async (req, res) => {
    const parsed = validateBody(insertRunSchema, req.body);
    if (!parsed.ok) return res.status(400).json(parsed.error);

    const run = await storage.createRun(parsed.data);
    res.status(201).json(run);
  });

  app.patch("/api/runs/:id", async (req, res) => {
    const parsed = validateBody(runUpdateSchema, req.body);
    if (!parsed.ok) return res.status(400).json(parsed.error);

    const run = await storage.updateRun(req.params.id, parsed.data);
    if (!run) return res.status(404).json({ error: "Run not found" });
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

  app.post("/api/safety-checks", async (req, res) => {
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

  app.post("/api/lessons", async (req, res) => {
    const parsed = validateBody(insertLessonSchema, req.body);
    if (!parsed.ok) return res.status(400).json(parsed.error);

    const lesson = await storage.createLesson(parsed.data);
    res.status(201).json(lesson);
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

  app.post("/api/reviews", async (req, res) => {
    const parsed = validateBody(insertReviewSchema, req.body);
    if (!parsed.ok) return res.status(400).json(parsed.error);

    const review = await storage.createReview(parsed.data);
    res.status(201).json(review);
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
