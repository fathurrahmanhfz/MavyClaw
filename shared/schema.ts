import { pgTable, text, varchar, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

// ── Scenarios ──
export const scenarios = pgTable("scenarios", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  category: text("category").notNull(),
  difficulty: text("difficulty").notNull(), // easy | medium | hard | critical
  description: text("description").notNull(),
  objective: text("objective").notNull(),
  acceptanceCriteria: text("acceptance_criteria").notNull(),
  safeSteps: text("safe_steps").notNull(),
  antiPatterns: text("anti_patterns").notNull(),
  verificationChecklist: text("verification_checklist").notNull(),
  targetEvidence: text("target_evidence").notNull(),
  primaryRisk: text("primary_risk").notNull(),
  readiness: text("readiness").notNull(), // ready | draft | needs-review
});

export const insertScenarioSchema = createInsertSchema(scenarios).omit({ id: true });
export type InsertScenario = z.infer<typeof insertScenarioSchema>;
export type Scenario = typeof scenarios.$inferSelect;

// ── Runs ──
export const runs = pgTable("runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  scenarioId: varchar("scenario_id").notNull(),
  status: text("status").notNull(), // planned | running | blocked | passed | failed
  operatorNote: text("operator_note"),
  evidence: text("evidence"),
  safetyDecision: text("safety_decision"), // allow-read-only | allow-guarded-write | hold-for-approval | deny
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertRunSchema = createInsertSchema(runs).omit({ id: true });
export type InsertRun = z.infer<typeof insertRunSchema>;
export type Run = typeof runs.$inferSelect;

// ── Safety Checks ──
export const safetyChecks = pgTable("safety_checks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id"),
  targetEnv: text("target_env").notNull(), // production | staging | dev | sandbox
  actionMode: text("action_mode").notNull(), // read-only | write
  affectedAssets: text("affected_assets").notNull(),
  minVerification: text("min_verification").notNull(),
  recoveryPath: text("recovery_path").notNull(),
  decision: text("decision").notNull(), // allow-read-only | allow-guarded-write | hold-for-approval | deny
  reason: text("reason").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertSafetyCheckSchema = createInsertSchema(safetyChecks).omit({ id: true });
export type InsertSafetyCheck = z.infer<typeof insertSafetyCheckSchema>;
export type SafetyCheck = typeof safetyChecks.$inferSelect;

// ── Lessons ──
export const lessons = pgTable("lessons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  context: text("context").notNull(),
  taxonomyL1: text("taxonomy_l1").notNull(),
  taxonomyL2: text("taxonomy_l2"),
  symptom: text("symptom").notNull(),
  rootCause: text("root_cause").notNull(),
  impact: text("impact").notNull(),
  prevention: text("prevention").notNull(),
  status: text("status").notNull(), // verified | partial | hypothesis
  promotion: text("promotion").notNull(), // memory only | checklist | workflow | skill
  createdAt: text("created_at").notNull(),
});

export const insertLessonSchema = createInsertSchema(lessons).omit({ id: true });
export type InsertLesson = z.infer<typeof insertLessonSchema>;
export type Lesson = typeof lessons.$inferSelect;

// ── Reviews ──
export const reviews = pgTable("reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id"),
  taskGoal: text("task_goal").notNull(),
  finalResult: text("final_result").notNull(),
  resultStatus: text("result_status").notNull(), // completed | partial | on-hold | failed
  evidence: text("evidence").notNull(),
  whatWorked: text("what_worked").notNull(),
  whatFailed: text("what_failed").notNull(),
  nearMiss: text("near_miss").notNull(),
  safestNextStep: text("safest_next_step").notNull(),
  createdAt: text("created_at").notNull(),
});

export const insertReviewSchema = createInsertSchema(reviews).omit({ id: true });
export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Review = typeof reviews.$inferSelect;
