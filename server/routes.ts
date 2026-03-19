import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ── Scenarios ──
  app.get("/api/scenarios", async (_req, res) => {
    const scenarios = await storage.getScenarios();
    res.json(scenarios);
  });

  app.get("/api/scenarios/:id", async (req, res) => {
    const scenario = await storage.getScenario(req.params.id);
    if (!scenario) return res.status(404).json({ error: "Skenario tidak ditemukan" });
    res.json(scenario);
  });

  app.post("/api/scenarios", async (req, res) => {
    const scenario = await storage.createScenario(req.body);
    res.status(201).json(scenario);
  });

  // ── Runs ──
  app.get("/api/runs", async (_req, res) => {
    const runs = await storage.getRuns();
    res.json(runs);
  });

  app.get("/api/runs/:id", async (req, res) => {
    const run = await storage.getRun(req.params.id);
    if (!run) return res.status(404).json({ error: "Run tidak ditemukan" });
    res.json(run);
  });

  app.post("/api/runs", async (req, res) => {
    const run = await storage.createRun(req.body);
    res.status(201).json(run);
  });

  app.patch("/api/runs/:id", async (req, res) => {
    const run = await storage.updateRun(req.params.id, req.body);
    if (!run) return res.status(404).json({ error: "Run tidak ditemukan" });
    res.json(run);
  });

  // ── Safety Checks ──
  app.get("/api/safety-checks", async (_req, res) => {
    const checks = await storage.getSafetyChecks();
    res.json(checks);
  });

  app.get("/api/safety-checks/:id", async (req, res) => {
    const check = await storage.getSafetyCheck(req.params.id);
    if (!check) return res.status(404).json({ error: "Safety check tidak ditemukan" });
    res.json(check);
  });

  app.post("/api/safety-checks", async (req, res) => {
    const { runId, decision, ...rest } = req.body;

    // Validasi runId jika provided
    if (runId) {
      const run = await storage.getRun(runId);
      if (!run) {
        return res.status(400).json({ error: `Run dengan ID ${runId} tidak ditemukan` });
      }

      // Sync safetyDecision dan updatedAt ke run terkait
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

  // ── Lessons ──
  app.get("/api/lessons", async (_req, res) => {
    const lessons = await storage.getLessons();
    res.json(lessons);
  });

  app.get("/api/lessons/:id", async (req, res) => {
    const lesson = await storage.getLesson(req.params.id);
    if (!lesson) return res.status(404).json({ error: "Lesson tidak ditemukan" });
    res.json(lesson);
  });

  app.post("/api/lessons", async (req, res) => {
    const lesson = await storage.createLesson(req.body);
    res.status(201).json(lesson);
  });

  // ── Reviews ──
  app.get("/api/reviews", async (_req, res) => {
    const reviews = await storage.getReviews();
    res.json(reviews);
  });

  app.get("/api/reviews/:id", async (req, res) => {
    const review = await storage.getReview(req.params.id);
    if (!review) return res.status(404).json({ error: "Review tidak ditemukan" });
    res.json(review);
  });

  app.post("/api/reviews", async (req, res) => {
    const review = await storage.createReview(req.body);
    res.status(201).json(review);
  });

  // ── Dashboard Stats ──
  app.get("/api/stats", async (_req, res) => {
    const [scenarios, runs, lessons, reviews, safetyChecks] = await Promise.all([
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
