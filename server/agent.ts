import type { Request, RequestHandler } from "express";
import { z } from "zod";
import type {
  InsertLesson,
  InsertReview,
  InsertRun,
  InsertSafetyCheck,
  InsertScenario,
} from "@shared/schema";

const runStatusSchema = z.enum(["planned", "running", "blocked", "passed", "failed"]);
const safetyDecisionSchema = z.enum([
  "allow-read-only",
  "allow-guarded-write",
  "hold-for-approval",
  "deny",
]);

const agentScenarioInputSchema = z.object({
  title: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional(),
  difficulty: z.enum(["easy", "medium", "hard", "critical"]).optional(),
  description: z.string().trim().min(1).optional(),
  objective: z.string().trim().min(1).optional(),
  acceptanceCriteria: z.string().trim().min(1).optional(),
  safeSteps: z.string().trim().min(1).optional(),
  antiPatterns: z.string().trim().min(1).optional(),
  verificationChecklist: z.string().trim().min(1).optional(),
  targetEvidence: z.string().trim().min(1).optional(),
  primaryRisk: z.string().trim().min(1).optional(),
  readiness: z.enum(["ready", "draft", "needs-review"]).optional(),
});

export const agentRunStartSchema = z
  .object({
    scenarioId: z.string().trim().min(1).optional(),
    taskTitle: z.string().trim().min(1).optional(),
    scenario: agentScenarioInputSchema.optional(),
    status: runStatusSchema.optional(),
    operatorNote: z.string().trim().min(1).optional(),
    evidence: z.string().trim().min(1).nullable().optional(),
    safetyDecision: safetyDecisionSchema.nullable().optional(),
    createdAt: z.string().trim().min(1).optional(),
    updatedAt: z.string().trim().min(1).optional(),
  })
  .refine((payload) => Boolean(payload.scenarioId || payload.taskTitle || payload.scenario?.title), {
    message: "scenarioId, taskTitle, or scenario.title is required",
  });

export const agentRunProgressSchema = z
  .object({
    runId: z.string().trim().min(1),
    status: runStatusSchema.optional(),
    operatorNote: z.string().trim().min(1).nullable().optional(),
    evidence: z.string().trim().min(1).nullable().optional(),
    safetyDecision: safetyDecisionSchema.nullable().optional(),
    updatedAt: z.string().trim().min(1).optional(),
  })
  .refine(
    (payload) =>
      payload.status !== undefined ||
      payload.operatorNote !== undefined ||
      payload.evidence !== undefined ||
      payload.safetyDecision !== undefined,
    {
      message: "At least one run field must be provided",
    },
  );

export const agentRunFinishSchema = z.object({
  runId: z.string().trim().min(1),
  status: runStatusSchema.optional(),
  operatorNote: z.string().trim().min(1).nullable().optional(),
  evidence: z.string().trim().min(1).nullable().optional(),
  safetyDecision: safetyDecisionSchema.nullable().optional(),
  updatedAt: z.string().trim().min(1).optional(),
});

export const agentSafetyCheckSchema = z.object({
  runId: z.string().trim().min(1).nullable().optional(),
  targetEnv: z.string().trim().min(1),
  actionMode: z.enum(["read-only", "write"]),
  affectedAssets: z.string().trim().min(1),
  minVerification: z.string().trim().min(1),
  recoveryPath: z.string().trim().min(1),
  decision: safetyDecisionSchema,
  reason: z.string().trim().min(1),
  createdAt: z.string().trim().min(1).optional(),
});

export const agentLessonSchema = z.object({
  title: z.string().trim().min(1),
  context: z.string().trim().min(1),
  taxonomyL1: z.string().trim().min(1),
  taxonomyL2: z.string().trim().min(1).nullable().optional(),
  symptom: z.string().trim().min(1),
  rootCause: z.string().trim().min(1),
  impact: z.string().trim().min(1),
  prevention: z.string().trim().min(1),
  status: z.enum(["verified", "partial", "hypothesis"]),
  promotion: z.enum(["memory only", "checklist", "workflow", "skill"]),
  createdAt: z.string().trim().min(1).optional(),
});

export const agentReviewSchema = z.object({
  runId: z.string().trim().min(1).nullable().optional(),
  taskGoal: z.string().trim().min(1),
  finalResult: z.string().trim().min(1),
  resultStatus: z.enum(["completed", "partial", "on-hold", "failed"]),
  evidence: z.string().trim().min(1),
  whatWorked: z.string().trim().min(1),
  whatFailed: z.string().trim().min(1),
  nearMiss: z.string().trim().min(1),
  safestNextStep: z.string().trim().min(1),
  createdAt: z.string().trim().min(1).optional(),
});

function nowIso() {
  return new Date().toISOString();
}

function configuredToken() {
  return process.env.AGENT_INGEST_TOKEN?.trim() || "";
}

function extractToken(req: Request) {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }

  const headerToken = req.headers["x-agent-ingest-token"];
  if (typeof headerToken === "string") {
    return headerToken.trim();
  }

  return "";
}

export function requireAgentIngest(): RequestHandler {
  return (req, res, next) => {
    const expectedToken = configuredToken();

    if (!expectedToken) {
      return res.status(503).json({ error: "Agent ingest is not configured" });
    }

    const token = extractToken(req);
    if (!token || token !== expectedToken) {
      return res.status(401).json({ error: "Valid agent ingest token required" });
    }

    return next();
  };
}

export function getAgentIntegrationStatus() {
  const configured = Boolean(configuredToken());
  const mode = configured ? ("token" as const) : ("disabled" as const);

  return {
    configured,
    mode,
    endpointPrefix: "/api/agent",
    helperCommand: "npm run agent:ingest -- <event> --payload-file <file.json>",
    authHeader: configured ? "Authorization: Bearer <AGENT_INGEST_TOKEN>" : null,
    baseUrlHint: process.env.AGENT_INGEST_BASE_URL?.trim() || null,
  };
}

export function buildAgentScenario(
  input: z.infer<typeof agentScenarioInputSchema> | undefined,
  taskTitle?: string,
  scenarioHint?: string,
): InsertScenario {
  const title = input?.title ?? taskTitle ?? (scenarioHint ? `Agent task ${scenarioHint}` : "Agent-ingested task");

  return {
    title,
    category: input?.category ?? "agent-ingest",
    difficulty: input?.difficulty ?? "medium",
    description: input?.description ?? "Task imported automatically from an external agent workflow.",
    objective: input?.objective ?? "Track an agent task lifecycle inside MavyClaw without manual form entry.",
    acceptanceCriteria:
      input?.acceptanceCriteria ??
      "The run, safety checks, lessons, and review are recorded accurately inside the workspace.",
    safeSteps:
      input?.safeSteps ??
      "1. Start the run\n2. Record progress\n3. Log safety decisions\n4. Finish the run\n5. Save the review",
    antiPatterns:
      input?.antiPatterns ??
      "Skipping ingest updates, writing directly without a safety check, or finishing a run without evidence.",
    verificationChecklist:
      input?.verificationChecklist ??
      "Run exists, progress is visible, safety decisions are linked, and review is saved.",
    targetEvidence:
      input?.targetEvidence ??
      "Agent notes, progress updates, safety decisions, and a final review record.",
    primaryRisk:
      input?.primaryRisk ??
      "Operational history becomes incomplete when agent activity is not captured in the workspace.",
    readiness: input?.readiness ?? "ready",
  };
}

export function toInsertRunFromAgentStart(
  payload: z.infer<typeof agentRunStartSchema>,
  scenarioId: string,
): InsertRun {
  const createdAt = payload.createdAt ?? nowIso();

  return {
    scenarioId,
    status: payload.status ?? "running",
    operatorNote: payload.operatorNote ?? `Agent run started for ${payload.taskTitle ?? scenarioId}`,
    evidence: payload.evidence ?? null,
    safetyDecision: payload.safetyDecision ?? null,
    createdAt,
    updatedAt: payload.updatedAt ?? createdAt,
  };
}

export function toRunPatchFromAgentProgress(
  payload: z.infer<typeof agentRunProgressSchema> | z.infer<typeof agentRunFinishSchema>,
  fallbackStatus?: z.infer<typeof runStatusSchema>,
): Partial<InsertRun> {
  return {
    status: payload.status ?? fallbackStatus,
    operatorNote: payload.operatorNote,
    evidence: payload.evidence,
    safetyDecision: payload.safetyDecision,
    updatedAt: payload.updatedAt ?? nowIso(),
  };
}

export function toInsertSafetyCheckFromAgent(
  payload: z.infer<typeof agentSafetyCheckSchema>,
): InsertSafetyCheck {
  return {
    runId: payload.runId ?? null,
    targetEnv: payload.targetEnv,
    actionMode: payload.actionMode,
    affectedAssets: payload.affectedAssets,
    minVerification: payload.minVerification,
    recoveryPath: payload.recoveryPath,
    decision: payload.decision,
    reason: payload.reason,
    createdAt: payload.createdAt ?? nowIso(),
  };
}

export function toInsertLessonFromAgent(payload: z.infer<typeof agentLessonSchema>): InsertLesson {
  return {
    title: payload.title,
    context: payload.context,
    taxonomyL1: payload.taxonomyL1,
    taxonomyL2: payload.taxonomyL2 ?? null,
    symptom: payload.symptom,
    rootCause: payload.rootCause,
    impact: payload.impact,
    prevention: payload.prevention,
    status: payload.status,
    promotion: payload.promotion,
    createdAt: payload.createdAt ?? nowIso(),
  };
}

export function toInsertReviewFromAgent(payload: z.infer<typeof agentReviewSchema>): InsertReview {
  return {
    runId: payload.runId ?? null,
    taskGoal: payload.taskGoal,
    finalResult: payload.finalResult,
    resultStatus: payload.resultStatus,
    evidence: payload.evidence,
    whatWorked: payload.whatWorked,
    whatFailed: payload.whatFailed,
    nearMiss: payload.nearMiss,
    safestNextStep: payload.safestNextStep,
    createdAt: payload.createdAt ?? nowIso(),
  };
}
