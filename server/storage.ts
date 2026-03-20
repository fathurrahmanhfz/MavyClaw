import {
  scenarios,
  runs,
  safetyChecks,
  lessons,
  reviews,
  activityLogs,
  type Scenario,
  type InsertScenario,
  type Run,
  type InsertRun,
  type SafetyCheck,
  type InsertSafetyCheck,
  type Lesson,
  type InsertLesson,
  type Review,
  type InsertReview,
  type ActivityLog,
  type InsertActivityLog,
} from "@shared/schema";
import { getAgentIntegrationStatus } from "./agent";
import { randomUUID } from "crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export type StorageRuntime = "memory" | "file" | "postgres";

export interface AgentIntegrationStatus {
  configured: boolean;
  mode: "disabled" | "token";
  endpointPrefix: string;
  helperCommand: string;
  authHeader: string | null;
  baseUrlHint: string | null;
}

export interface StorageRuntimeInfo {
  runtime: StorageRuntime;
  persistence: "ephemeral" | "disk" | "database";
  databaseConfigured: boolean;
  dataFile: string | null;
  agentIngest: AgentIntegrationStatus;
}

export interface StorageSnapshot {
  scenarios: Scenario[];
  runs: Run[];
  safetyChecks: SafetyCheck[];
  lessons: Lesson[];
  reviews: Review[];
  activityLogs: ActivityLog[];
}

export interface ActivityLogFilter {
  entityType?: string;
  entityId?: string;
  limit?: number;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function defaultDataFilePath() {
  return resolve(process.cwd(), process.env.DATA_FILE ?? ".runtime/mavyclaw-data.json");
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function requestedStorageRuntime(): StorageRuntime {
  const requested = process.env.STORAGE_BACKEND?.toLowerCase();

  if (requested === "memory" || requested === "file" || requested === "postgres") {
    return requested;
  }

  if (process.env.DATABASE_URL) {
    return "postgres";
  }

  return process.env.NODE_ENV === "production" ? "file" : "memory";
}

export interface IStorage {
  getRuntimeInfo(): Promise<StorageRuntimeInfo>;
  exportSnapshot(): Promise<StorageSnapshot>;
  importSnapshot(snapshot: StorageSnapshot): Promise<void>;

  // Scenarios
  getScenarios(): Promise<Scenario[]>;
  getScenario(id: string): Promise<Scenario | undefined>;
  createScenario(s: InsertScenario): Promise<Scenario>;
  updateScenario(id: string, data: Partial<InsertScenario>): Promise<Scenario | undefined>;

  // Runs
  getRuns(): Promise<Run[]>;
  getRun(id: string): Promise<Run | undefined>;
  createRun(r: InsertRun): Promise<Run>;
  updateRun(id: string, data: Partial<InsertRun>): Promise<Run | undefined>;

  // Safety Checks
  getSafetyChecks(): Promise<SafetyCheck[]>;
  getSafetyCheck(id: string): Promise<SafetyCheck | undefined>;
  createSafetyCheck(sc: InsertSafetyCheck): Promise<SafetyCheck>;

  // Lessons
  getLessons(): Promise<Lesson[]>;
  getLesson(id: string): Promise<Lesson | undefined>;
  createLesson(l: InsertLesson): Promise<Lesson>;
  updateLesson(id: string, data: Partial<InsertLesson>): Promise<Lesson | undefined>;

  // Reviews
  getReviews(): Promise<Review[]>;
  getReview(id: string): Promise<Review | undefined>;
  createReview(r: InsertReview): Promise<Review>;
  updateReview(id: string, data: Partial<InsertReview>): Promise<Review | undefined>;

  // Activity Log
  getActivityLogs(filter?: ActivityLogFilter): Promise<ActivityLog[]>;
  getActivityLog(id: string): Promise<ActivityLog | undefined>;
  createActivityLog(entry: InsertActivityLog): Promise<ActivityLog>;
}

export class MemStorage implements IStorage {
  protected scenarios: Map<string, Scenario> = new Map();
  protected runs: Map<string, Run> = new Map();
  protected safetyChecks: Map<string, SafetyCheck> = new Map();
  protected lessons: Map<string, Lesson> = new Map();
  protected reviews: Map<string, Review> = new Map();
  protected activityLogEntries: Map<string, ActivityLog> = new Map();

  constructor(shouldSeed = true) {
    if (shouldSeed) {
      this.seed();
    }
  }

  // ── Scenarios ──
  async getScenarios() { return Array.from(this.scenarios.values()); }
  async getScenario(id: string) { return this.scenarios.get(id); }
  async createScenario(s: InsertScenario): Promise<Scenario> {
    const id = randomUUID();
    const scenario: Scenario = { ...s, id };
    this.scenarios.set(id, scenario);
    this.persistSnapshot();
    return scenario;
  }
  async updateScenario(id: string, data: Partial<InsertScenario>): Promise<Scenario | undefined> {
    const scenario = this.scenarios.get(id);
    if (!scenario) return undefined;
    const updated: Scenario = { ...scenario, ...stripUndefined(data as Record<string, unknown>) as Partial<InsertScenario> };
    this.scenarios.set(id, updated);
    this.persistSnapshot();
    return updated;
  }

  // ── Runs ──
  async getRuns() { return Array.from(this.runs.values()); }
  async getRun(id: string) { return this.runs.get(id); }
  async createRun(r: InsertRun): Promise<Run> {
    const id = randomUUID();
    const run: Run = {
      ...r,
      id,
      operatorNote: r.operatorNote ?? null,
      evidence: r.evidence ?? null,
      safetyDecision: r.safetyDecision ?? null,
      approvalNote: r.approvalNote ?? null,
    };
    this.runs.set(id, run);
    this.persistSnapshot();
    return run;
  }
  async updateRun(id: string, data: Partial<InsertRun>): Promise<Run | undefined> {
    const run = this.runs.get(id);
    if (!run) return undefined;
    const updated = { ...run, ...data, updatedAt: new Date().toISOString() };
    this.runs.set(id, updated);
    this.persistSnapshot();
    return updated;
  }

  // ── Safety Checks ──
  async getSafetyChecks() { return Array.from(this.safetyChecks.values()); }
  async getSafetyCheck(id: string) { return this.safetyChecks.get(id); }
  async createSafetyCheck(sc: InsertSafetyCheck): Promise<SafetyCheck> {
    const id = randomUUID();
    const check: SafetyCheck = {
      ...sc,
      id,
      runId: sc.runId ?? null,
    };
    this.safetyChecks.set(id, check);
    this.persistSnapshot();
    return check;
  }

  // ── Lessons ──
  async getLessons() { return Array.from(this.lessons.values()); }
  async getLesson(id: string) { return this.lessons.get(id); }
  async createLesson(l: InsertLesson): Promise<Lesson> {
    const id = randomUUID();
    const lesson: Lesson = {
      ...l,
      id,
      taxonomyL2: l.taxonomyL2 ?? null,
    };
    this.lessons.set(id, lesson);
    this.persistSnapshot();
    return lesson;
  }
  async updateLesson(id: string, data: Partial<InsertLesson>): Promise<Lesson | undefined> {
    const lesson = this.lessons.get(id);
    if (!lesson) return undefined;
    const updated: Lesson = { ...lesson, ...stripUndefined(data as Record<string, unknown>) as Partial<InsertLesson> };
    this.lessons.set(id, updated);
    this.persistSnapshot();
    return updated;
  }

  // ── Reviews ──
  async getReviews() { return Array.from(this.reviews.values()); }
  async getReview(id: string) { return this.reviews.get(id); }
  async createReview(r: InsertReview): Promise<Review> {
    const id = randomUUID();
    const review: Review = {
      ...r,
      id,
      runId: r.runId ?? null,
    };
    this.reviews.set(id, review);
    this.persistSnapshot();
    return review;
  }
  async updateReview(id: string, data: Partial<InsertReview>): Promise<Review | undefined> {
    const review = this.reviews.get(id);
    if (!review) return undefined;
    const updated: Review = { ...review, ...stripUndefined(data as Record<string, unknown>) as Partial<InsertReview> };
    this.reviews.set(id, updated);
    this.persistSnapshot();
    return updated;
  }

  // ── Activity Log ──
  async getActivityLogs(filter?: ActivityLogFilter): Promise<ActivityLog[]> {
    let entries = Array.from(this.activityLogEntries.values())
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    if (filter?.entityType) {
      entries = entries.filter((e) => e.entityType === filter.entityType);
    }
    if (filter?.entityId) {
      entries = entries.filter((e) => e.entityId === filter.entityId);
    }
    if (filter?.limit !== undefined && filter.limit > 0) {
      entries = entries.slice(0, filter.limit);
    }
    return entries;
  }

  async getActivityLog(id: string): Promise<ActivityLog | undefined> {
    return this.activityLogEntries.get(id);
  }

  async createActivityLog(entry: InsertActivityLog): Promise<ActivityLog> {
    const id = randomUUID();
    const log: ActivityLog = {
      ...entry,
      id,
      entityId: entry.entityId ?? null,
      actorNote: entry.actorNote ?? null,
    };
    this.activityLogEntries.set(id, log);
    this.persistSnapshot();
    return log;
  }

  async getRuntimeInfo(): Promise<StorageRuntimeInfo> {
    return {
      runtime: "memory",
      persistence: "ephemeral",
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      dataFile: null,
      agentIngest: getAgentIntegrationStatus(),
    };
  }

  async exportSnapshot(): Promise<StorageSnapshot> {
    return clone(this.snapshot());
  }

  async importSnapshot(snapshot: StorageSnapshot): Promise<void> {
    this.restore(clone(snapshot));
    this.persistSnapshot();
  }

  protected persistSnapshot() {
    // Memory storage is intentionally ephemeral.
  }

  protected snapshot(): StorageSnapshot {
    return {
      scenarios: Array.from(this.scenarios.values()),
      runs: Array.from(this.runs.values()),
      safetyChecks: Array.from(this.safetyChecks.values()),
      lessons: Array.from(this.lessons.values()),
      reviews: Array.from(this.reviews.values()),
      activityLogs: Array.from(this.activityLogEntries.values()),
    };
  }

  protected restore(snapshot: StorageSnapshot) {
    this.scenarios = new Map(snapshot.scenarios.map((item) => [item.id, item]));
    this.runs = new Map(snapshot.runs.map((item) => [item.id, item]));
    this.safetyChecks = new Map(snapshot.safetyChecks.map((item) => [item.id, item]));
    this.lessons = new Map(snapshot.lessons.map((item) => [item.id, item]));
    this.reviews = new Map(snapshot.reviews.map((item) => [item.id, item]));
    this.activityLogEntries = new Map((snapshot.activityLogs ?? []).map((item) => [item.id, item]));
  }

  // ── Seed ──
  protected seed() {
    // --- 8 Scenarios ---
    const scenarioData: (InsertScenario & { id: string })[] = [
      {
        id: "sc-001",
        title: "Next.js Prisma Schema Drift",
        category: "software-engineering",
        difficulty: "medium",
        description: "The Prisma schema changed on the dev branch, but the migration has not been applied in staging. The app crashes when querying the new model.",
        objective: "Identify drift between the Prisma schema and the actual database, then synchronize them safely.",
        acceptanceCriteria: "The migration completes without data loss, the app can query the new model, and the smoke test passes.",
        safeSteps: "1. Bandingkan schema.prisma vs database introspect\n2. Buat migration draft\n3. Review SQL yang dihasilkan\n4. Jalankan di sandbox dulu\n5. Verifikasi dengan query test",
        antiPatterns: "Running db push directly in staging without reviewing SQL. Dropping columns without a backup. Ignoring foreign key constraints.",
        verificationChecklist: "prisma migrate status is clean, the new model query succeeds, zero data loss",
        targetEvidence: "prisma migrate status output, successful query log, running app screenshot",
        primaryRisk: "Data loss if the migration order is wrong or introduces a breaking change",
        readiness: "ready",
      },
      {
        id: "sc-002",
        title: "IPv6 DNS Resolution Failure",
        category: "network",
        difficulty: "hard",
        description: "The VPS resolves the database hostname only to IPv6, but IPv6 connectivity is unavailable, causing the connection to fail.",
        objective: "Diagnose and fix DNS resolution so the database connection succeeds from the VPS.",
        acceptanceCriteria: "The database connection succeeds over IPv4 and the fallback mechanism is documented.",
        safeSteps: "1. Cek DNS resolution (dig AAAA vs A)\n2. Tes konektivitas TCP per AF\n3. Konfigurasi preferensi IPv4\n4. Verifikasi koneksi database\n5. Dokumentasi perubahan",
        antiPatterns: "Blaming the firewall before checking DNS. Whitelisting an internal IP. Changing global network configuration.",
        verificationChecklist: "DNS resolves to IPv4, TCP connect succeeds, database query OK",
        targetEvidence: "dig output, telnet/nc test, psql connection log",
        primaryRisk: "A misdiagnosis can trigger unnecessary firewall changes",
        readiness: "ready",
      },
      {
        id: "sc-003",
        title: "Environment Variable Mismatch",
        category: "config",
        difficulty: "easy",
        description: "The local env file differs from production, causing the payment gateway feature to be disabled.",
        objective: "Audit and synchronize environment variables across local, staging, and production.",
        acceptanceCriteria: "All required env vars exist in each environment and no secrets are exposed.",
        safeSteps: "1. List semua env yang dipakai app\n2. Bandingkan per environment\n3. Identifikasi yang missing\n4. Tambahkan dengan value yang benar\n5. Restart service & test",
        antiPatterns: "Copy-pasting the entire .env across environments. Hardcoding secrets in source code. Committing .env to git.",
        verificationChecklist: "Env audit script is green, payment gateway test passes, secret scan is clean",
        targetEvidence: "Env diff output, test transaction log, git-secrets scan result",
        primaryRisk: "Secret leakage if environment variables are handled incorrectly",
        readiness: "ready",
      },
      {
        id: "sc-004",
        title: "Nginx Reverse Proxy Routing Error",
        category: "deploy",
        difficulty: "medium",
        description: "After deployment, the /api/* path is served as static files by Nginx instead of being proxied to the backend.",
        objective: "Fix the Nginx configuration so API routing works correctly without downtime.",
        acceptanceCriteria: "API endpoints return JSON, the frontend is still served statically, and there is zero downtime.",
        safeSteps: "1. Back up the current Nginx configuration\n2. Review location blocks\n3. Fix the proxy_pass directive\n4. Run nginx -t to validate syntax\n5. Reload Nginx instead of restarting it",
        antiPatterns: "Restarting Nginx without testing the config. Editing files in /etc/nginx directly without a backup.",
        verificationChecklist: "nginx -t pass, curl /api/health returns JSON, frontend loads, SSL intact",
        targetEvidence: "nginx -t output, curl response, browser screenshot",
        primaryRisk: "Downtime if the config is wrong and Nginx is restarted",
        readiness: "ready",
      },
      {
        id: "sc-005",
        title: "Missing Binary Dependency in CI",
        category: "dependency",
        difficulty: "easy",
        description: "The CI build fails because the sharp module cannot install and needs libvips, which is missing from the base image.",
        objective: "Fix the CI pipeline so native dependencies install correctly.",
        acceptanceCriteria: "The CI build is green, image processing works, and build time does not increase significantly.",
        safeSteps: "1. Identify the missing dependency\n2. Check for a pure-JS alternative\n3. Update the Dockerfile or CI config\n4. Test the build on a separate branch\n5. Merge after it is green",
        antiPatterns: "Installing dependencies globally on the production server. Skipping image optimization. Downgrading a library without evaluation.",
        verificationChecklist: "CI is green, the image resize test passes, build time < 5 minutes",
        targetEvidence: "CI log, test output, build timing",
        primaryRisk: "Could affect an otherwise stable image build if the Dockerfile changes",
        readiness: "ready",
      },
      {
        id: "sc-006",
        title: "Unsafe Migration on a Multi-Million-Row Table",
        category: "data",
        difficulty: "critical",
        description: "ALTER TABLE ADD COLUMN with a default value on a 5-million-row table can lock the table for minutes.",
        objective: "Run the migration without downtime and without prolonged table locks.",
        acceptanceCriteria: "The new column is available, there is zero downtime, and lock time stays under 1 second.",
        safeSteps: "1. Analyze the migration SQL\n2. Use ADD COLUMN without a default first\n3. Backfill in batches\n4. Set the default after backfill completes\n5. Monitor lock wait",
        antiPatterns: "Running ALTER TABLE with DEFAULT in a single command. Executing during peak traffic. Having no rollback plan.",
        verificationChecklist: "Lock monitoring is clean, the column exists and is populated, app queries are OK, latency is normal",
        targetEvidence: "pg_stat_activity during migration, row count before/after, latency graph",
        primaryRisk: "A table lock causes downtime and cascading timeouts",
        readiness: "ready",
      },
      {
        id: "sc-007",
        title: "Data Validation Pipeline Corrupt",
        category: "data",
        difficulty: "hard",
        description: "The ETL pipeline receives data with a changed date format from the source, causing 12% of records to fail parsing.",
        objective: "Fix the pipeline so it tolerates format variation and can recover the data that already arrived.",
        acceptanceCriteria: "The pipeline handles multiple formats, corrupt data is recovered, and alerting is in place.",
        safeSteps: "1. Sample corrupt data for analysis\n2. Identify every format variation\n3. Update the parser with fallback logic\n4. Re-process failed batches\n5. Add monitoring and alerts",
        antiPatterns: "Forcing parsing with a single format. Dropping failed records without logging. Fixing directly in production.",
        verificationChecklist: "Parse rate reaches 100%, recovered data matches, alert trigger test is OK",
        targetEvidence: "Before/after parse rate, recovered record count, alert log",
        primaryRisk: "Data loss if recovery is wrong or the parser remains brittle",
        readiness: "ready",
      },
      {
        id: "sc-008",
        title: "Observability Gap: No Smoke Test Post-Deploy",
        category: "testing",
        difficulty: "medium",
        description: "The deploy succeeds but there is no automated smoke test, so a bug is detected 2 hours later by a user.",
        objective: "Implement automated smoke tests that run immediately after each deploy.",
        acceptanceCriteria: "Smoke tests run in under 30 seconds post-deploy, and failed deploys automatically roll back.",
        safeSteps: "1. Identify critical paths\n2. Write the smoke test script\n3. Integrate it into the deploy pipeline\n4. Add auto-rollback on failure\n5. Test with an intentional failure",
        antiPatterns: "Adding too many smoke tests so they become slow. Flaky tests. Skipping smoke tests because the change looks small.",
        verificationChecklist: "Smoke test run < 30s, covers auth + API + DB, rollback works",
        targetEvidence: "Smoke test log, rollback test result, pipeline config",
        primaryRisk: "False positives can trigger unnecessary rollbacks",
        readiness: "needs-review",
      },
    ];

    for (const s of scenarioData) {
      this.scenarios.set(s.id, s as Scenario);
    }

    // --- 6 Runs ---
    const runData: (InsertRun & { id: string })[] = [
      {
        id: "run-001",
        scenarioId: "sc-001",
        status: "passed",
        operatorNote: "Migration succeeded in sandbox, all query tests are green. Total duration was 12 minutes.",
        evidence: "prisma migrate status: clean, 3/3 query tests passed",
        safetyDecision: "allow-guarded-write",
        createdAt: "2026-03-15T10:00:00Z",
        updatedAt: "2026-03-15T10:12:00Z",
      },
      {
        id: "run-002",
        scenarioId: "sc-002",
        status: "passed",
        operatorNote: "IPv6 issue confirmed. The DNS preference was updated to IPv4-first successfully.",
        evidence: "dig A succeeded, psql connect OK, latency is normal",
        safetyDecision: "allow-read-only",
        createdAt: "2026-03-15T14:00:00Z",
        updatedAt: "2026-03-15T14:25:00Z",
      },
      {
        id: "run-003",
        scenarioId: "sc-004",
        status: "failed",
        operatorNote: "Nginx config has a syntax error in the try_files directive. It needs another revision.",
        evidence: "nginx -t failed: unexpected } at line 42",
        safetyDecision: "deny",
        createdAt: "2026-03-16T09:00:00Z",
        updatedAt: "2026-03-16T09:08:00Z",
      },
      {
        id: "run-004",
        scenarioId: "sc-006",
        status: "blocked",
        operatorNote: "Waiting for approval to run the staging migration because the table has complex foreign key constraints.",
        evidence: null,
        safetyDecision: "hold-for-approval",
        createdAt: "2026-03-17T08:00:00Z",
        updatedAt: "2026-03-17T08:05:00Z",
      },
      {
        id: "run-005",
        scenarioId: "sc-003",
        status: "running",
        operatorNote: "Auditing environment variables across 3 environments.",
        evidence: null,
        safetyDecision: "allow-read-only",
        createdAt: "2026-03-18T10:00:00Z",
        updatedAt: "2026-03-18T10:30:00Z",
      },
      {
        id: "run-006",
        scenarioId: "sc-007",
        status: "planned",
        operatorNote: "Scheduled for tomorrow. A data sample from the source is needed first.",
        evidence: null,
        safetyDecision: null,
        createdAt: "2026-03-18T16:00:00Z",
        updatedAt: "2026-03-18T16:00:00Z",
      },
    ];

    for (const r of runData) {
      this.runs.set(r.id, r as Run);
    }

    // --- 6 Safety Checks ---
    const safetyData: (InsertSafetyCheck & { id: string })[] = [
      {
        id: "sg-001",
        runId: "run-001",
        targetEnv: "sandbox",
        actionMode: "write",
        affectedAssets: "Database schema, users and orders tables",
        minVerification: "prisma migrate status, query test per model",
        recoveryPath: "Roll back the migration with prisma migrate reset in sandbox",
        decision: "allow-guarded-write",
        reason: "Target is sandbox, the recovery path is clear, and the migration has been reviewed",
        createdAt: "2026-03-15T09:55:00Z",
      },
      {
        id: "sg-002",
        runId: "run-002",
        targetEnv: "dev",
        actionMode: "read-only",
        affectedAssets: "DNS config, network stack",
        minVerification: "Run dig and nc tests before making any change",
        recoveryPath: "Restore /etc/resolv.conf from backup",
        decision: "allow-read-only",
        reason: "Diagnosis only, with no writes to system config",
        createdAt: "2026-03-15T13:55:00Z",
      },
      {
        id: "sg-003",
        runId: "run-003",
        targetEnv: "staging",
        actionMode: "write",
        affectedAssets: "Nginx config, web routing",
        minVerification: "nginx -t sebelum reload",
        recoveryPath: "Restore dari backup config di /etc/nginx/backup/",
        decision: "deny",
        reason: "The config contains syntax errors and must be fixed before being applied",
        createdAt: "2026-03-16T08:55:00Z",
      },
      {
        id: "sg-004",
        runId: "run-004",
        targetEnv: "staging",
        actionMode: "write",
        affectedAssets: "transactions table (5M rows), with foreign keys to orders and users",
        minVerification: "Lock monitoring, row count before/after, latency baseline",
        recoveryPath: "Run ALTER TABLE DROP COLUMN if it fails, then restore from the daily backup",
        decision: "hold-for-approval",
        reason: "Large table with complex foreign keys, requiring approval and a maintenance window",
        createdAt: "2026-03-17T07:55:00Z",
      },
      {
        id: "sg-005",
        runId: "run-005",
        targetEnv: "production",
        actionMode: "read-only",
        affectedAssets: "Environment variables across all environments",
        minVerification: "No writes, audit only",
        recoveryPath: "N/A - read only",
        decision: "allow-read-only",
        reason: "An env audit changes nothing, so it is safe for production",
        createdAt: "2026-03-18T09:55:00Z",
      },
      {
        id: "sg-006",
        runId: null,
        targetEnv: "sandbox",
        actionMode: "write",
        affectedAssets: "Pipeline ETL, staging database",
        minVerification: "Sample data test, parse rate check",
        recoveryPath: "Re-run the pipeline from the latest checkpoint",
        decision: "allow-guarded-write",
        reason: "The target is sandbox, the pipeline can be rerun, and the data is non-production",
        createdAt: "2026-03-18T15:00:00Z",
      },
    ];

    for (const sc of safetyData) {
      this.safetyChecks.set(sc.id, sc as SafetyCheck);
    }

    // --- 5 Lessons ---
    const lessonData: (InsertLesson & { id: string })[] = [
      {
        id: "les-001",
        title: "Database connection failed because of IPv6-only resolution",
        context: "A sandbox VPS attempted to access an external database, but the hostname resolved only to IPv6",
        taxonomyL1: "network",
        taxonomyL2: "network/ipv6",
        symptom: "The server failed to connect to the database during schema sync",
        rootCause: "The database hostname resolved only to IPv6, but IPv6 connectivity was unavailable from the VPS",
        impact: "Schema operations failed, so the app could stay up but could not migrate",
        prevention: "Check DNS family and TCP connectivity before concluding the issue is allowlisting or firewall related",
        status: "verified",
        promotion: "workflow",
        createdAt: "2026-03-18T08:00:00Z",
      },
      {
        id: "les-002",
        title: "Misdiagnosed IP allowlist for an external database",
        context: "The bot suggested allowlisting the internal server IP 10.11.6.206, which is a private IP",
        taxonomyL1: "safety",
        taxonomyL2: "safety/prod-write-risk",
        symptom: "An internal IP was suggested as a database allowlist candidate",
        rootCause: "It failed to distinguish a private host IP from the server public egress IP",
        impact: "The user could take action that does not solve the problem",
        prevention: "Always check hostname -I and the public IP before suggesting any network allowlist",
        status: "verified",
        promotion: "checklist",
        createdAt: "2026-03-18T08:30:00Z",
      },
      {
        id: "les-003",
        title: "Prisma schema drift after merging branches",
        context: "Two branches changed schema.prisma at the same time, and CI did not catch the merge conflict",
        taxonomyL1: "workflow",
        taxonomyL2: "workflow/skipped-verification",
        symptom: "prisma migrate status shows a pending migration that does not match the schema",
        rootCause: "CI does not run prisma validate after merge",
        impact: "The deploy failed in staging and required a manual rollback",
        prevention: "Add prisma validate and prisma migrate status to post-merge CI",
        status: "verified",
        promotion: "workflow",
        createdAt: "2026-03-16T14:00:00Z",
      },
      {
        id: "les-004",
        title: "A deploy without smoke tests caused a 2-hour bug window",
        context: "A feature flag was active in production, but the new endpoint had not been deployed, so users got a 404",
        taxonomyL1: "testing",
        taxonomyL2: "testing/no-smoke-check",
        symptom: "Users reported a 404 on the new feature, and ops did not detect it until reports came in",
        rootCause: "There were no automated post-deploy smoke tests checking critical endpoints",
        impact: "There were 2 hours of partial downtime, a poor user experience, and reputational impact",
        prevention: "Require smoke tests on critical paths immediately after deploy, with auto-rollback on failure",
        status: "partial",
        promotion: "workflow",
        createdAt: "2026-03-14T09:00:00Z",
      },
      {
        id: "les-005",
        title: "Table lock during ALTER TABLE on a large table",
        context: "A migration added a column with a default value to a 5M-row table in staging",
        taxonomyL1: "data",
        taxonomyL2: "data/unsafe-migration",
        symptom: "Query timeouts cascaded and staging was down for 3 minutes",
        rootCause: "ALTER TABLE with DEFAULT on a large table acquired an ACCESS EXCLUSIVE lock",
        impact: "Staging went down and all queries were blocked during the migration",
        prevention: "Use ADD COLUMN without a default, then backfill in batches, then set the default",
        status: "hypothesis",
        promotion: "skill",
        createdAt: "2026-03-17T11:00:00Z",
      },
    ];

    for (const l of lessonData) {
      this.lessons.set(l.id, l as Lesson);
    }

    // --- 4 Reviews ---
    const reviewData: (InsertReview & { id: string })[] = [
      {
        id: "rev-001",
        runId: "run-001",
        taskGoal: "Synchronize the Prisma schema with the sandbox database",
        finalResult: "The migration succeeded, all query tests passed, and there was zero data loss",
        resultStatus: "completed",
        evidence: "prisma migrate status: clean, 3/3 query assertions passed, row count unchanged",
        whatWorked: "A staged approach worked: review SQL first, run in sandbox, then verify",
        whatFailed: "No failure occurred",
        nearMiss: "Almost ran db push directly without reviewing the generated SQL",
        safestNextStep: "Apply the same pattern to staging after sandbox validation",
        createdAt: "2026-03-15T10:15:00Z",
      },
      {
        id: "rev-002",
        runId: "run-002",
        taskGoal: "Diagnose and fix the database connection from the VPS",
        finalResult: "The IPv6 issue was identified and the IPv4 preference configuration succeeded",
        resultStatus: "completed",
        evidence: "dig A: resolved, psql connect: OK, latency 12ms (normal)",
        whatWorked: "Systematic DNS diagnosis by address family before jumping to conclusions",
        whatFailed: "Initially suspected the firewall, which was the wrong diagnostic path",
        nearMiss: "Almost suggested allowlisting an internal IP that would not solve the problem",
        safestNextStep: "Document the DNS preference setting and monitor the connection for 24 hours",
        createdAt: "2026-03-15T14:30:00Z",
      },
      {
        id: "rev-003",
        runId: "run-003",
        taskGoal: "Fix Nginx routing so /api/* is proxied correctly",
        finalResult: "The config failed syntax validation and needs another iteration",
        resultStatus: "failed",
        evidence: "nginx -t: syntax error at line 42",
        whatWorked: "The safety gate prevented applying an incorrect config",
        whatFailed: "Location block ordering was wrong and the try_files directive conflicted with proxy_pass",
        nearMiss: "Without testing with nginx -t, the config could have been applied and caused downtime",
        safestNextStep: "Review the Nginx documentation for location block precedence, then fix and retest",
        createdAt: "2026-03-16T09:15:00Z",
      },
      {
        id: "rev-004",
        runId: null,
        taskGoal: "Set up the observability stack for the sandbox lab",
        finalResult: "Basic logging is in place, but alerting is not finished yet",
        resultStatus: "partial",
        evidence: "Logs stream to stdout, the Prometheus endpoint is available, and Grafana is not configured yet",
        whatWorked: "Structured logging in JSON format made parsing easier",
        whatFailed: "Alerting rules were too complex for the first iteration",
        nearMiss: "Almost used the production Grafana instance for sandbox logs",
        safestNextStep: "Simplify alerting rules, use a separate local Grafana instance, and iterate gradually",
        createdAt: "2026-03-17T15:00:00Z",
      },
    ];

    for (const r of reviewData) {
      this.reviews.set(r.id, r as Review);
    }
  }
}

class FileStorage extends MemStorage {
  constructor(private readonly filePath: string) {
    super(false);
    this.initialize();
  }

  override async getRuntimeInfo(): Promise<StorageRuntimeInfo> {
    return {
      runtime: "file",
      persistence: "disk",
      databaseConfigured: Boolean(process.env.DATABASE_URL),
      dataFile: this.filePath,
      agentIngest: getAgentIntegrationStatus(),
    };
  }

  protected override persistSnapshot() {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(clone(this.snapshot()), null, 2));
  }

  private initialize() {
    mkdirSync(dirname(this.filePath), { recursive: true });

    if (!existsSync(this.filePath)) {
      this.seed();
      this.persistSnapshot();
      return;
    }

    try {
      const raw = readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<StorageSnapshot>;
      const hasArrays =
        Array.isArray(parsed.scenarios) &&
        Array.isArray(parsed.runs) &&
        Array.isArray(parsed.safetyChecks) &&
        Array.isArray(parsed.lessons) &&
        Array.isArray(parsed.reviews);

      if (!hasArrays) {
        throw new Error("Invalid runtime snapshot shape");
      }

      this.restore({
        scenarios: parsed.scenarios ?? [],
        runs: parsed.runs ?? [],
        safetyChecks: parsed.safetyChecks ?? [],
        lessons: parsed.lessons ?? [],
        reviews: parsed.reviews ?? [],
        activityLogs: parsed.activityLogs ?? [],
      });
    } catch {
      this.seed();
      this.persistSnapshot();
    }
  }
}

class PostgresStorage extends MemStorage {
  private readonly pool: Pool;
  private readonly db;
  private readonly ready: Promise<void>;

  constructor(private readonly databaseUrl: string) {
    super();
    this.pool = new Pool({ connectionString: databaseUrl });
    this.db = drizzle(this.pool);
    this.ready = this.initialize();
  }

  override async getRuntimeInfo(): Promise<StorageRuntimeInfo> {
    await this.ready;
    return {
      runtime: "postgres",
      persistence: "database",
      databaseConfigured: true,
      dataFile: null,
      agentIngest: getAgentIntegrationStatus(),
    };
  }

  override async exportSnapshot(): Promise<StorageSnapshot> {
    await this.ready;
    const [scenarioRows, runRows, safetyRows, lessonRows, reviewRows, activityRows] = await Promise.all([
      this.db.select().from(scenarios).orderBy(scenarios.id),
      this.db.select().from(runs).orderBy(runs.createdAt),
      this.db.select().from(safetyChecks).orderBy(safetyChecks.createdAt),
      this.db.select().from(lessons).orderBy(lessons.createdAt),
      this.db.select().from(reviews).orderBy(reviews.createdAt),
      this.db.select().from(activityLogs).orderBy(activityLogs.occurredAt),
    ]);

    return {
      scenarios: scenarioRows,
      runs: runRows,
      safetyChecks: safetyRows,
      lessons: lessonRows,
      reviews: reviewRows,
      activityLogs: activityRows,
    };
  }

  override async importSnapshot(snapshot: StorageSnapshot): Promise<void> {
    await this.ready;
    await this.pool.query("BEGIN");

    try {
      await this.pool.query("TRUNCATE TABLE activity_logs, reviews, lessons, safety_checks, runs, scenarios");

      if (snapshot.scenarios.length) {
        await this.db.insert(scenarios).values(snapshot.scenarios);
      }
      if (snapshot.runs.length) {
        await this.db.insert(runs).values(snapshot.runs);
      }
      if (snapshot.safetyChecks.length) {
        await this.db.insert(safetyChecks).values(snapshot.safetyChecks);
      }
      if (snapshot.lessons.length) {
        await this.db.insert(lessons).values(snapshot.lessons);
      }
      if (snapshot.reviews.length) {
        await this.db.insert(reviews).values(snapshot.reviews);
      }
      if (snapshot.activityLogs?.length) {
        await this.db.insert(activityLogs).values(snapshot.activityLogs);
      }

      await this.pool.query("COMMIT");
    } catch (error) {
      await this.pool.query("ROLLBACK");
      throw error;
    }
  }

  override async getActivityLogs(filter?: ActivityLogFilter): Promise<ActivityLog[]> {
    await this.ready;
    let query = this.db.select().from(activityLogs).$dynamic();
    if (filter?.entityType) {
      query = query.where(eq(activityLogs.entityType, filter.entityType));
    }
    // Note: entityId filter applied post-fetch when entityType is also set,
    // since drizzle dynamic where chains require care with multiple conditions.
    // For simplicity and safety we apply both in memory after the DB fetch.
    const rows = await query.orderBy(activityLogs.occurredAt);
    let filtered = rows.reverse(); // newest first
    if (filter?.entityType) {
      filtered = filtered.filter((r) => r.entityType === filter.entityType);
    }
    if (filter?.entityId) {
      filtered = filtered.filter((r) => r.entityId === filter.entityId);
    }
    if (filter?.limit !== undefined && filter.limit > 0) {
      filtered = filtered.slice(0, filter.limit);
    }
    return filtered;
  }

  override async getActivityLog(id: string): Promise<ActivityLog | undefined> {
    await this.ready;
    const [record] = await this.db.select().from(activityLogs).where(eq(activityLogs.id, id));
    return record;
  }

  override async createActivityLog(entry: InsertActivityLog): Promise<ActivityLog> {
    await this.ready;
    const [record] = await this.db
      .insert(activityLogs)
      .values({
        ...entry,
        id: randomUUID(),
        entityId: entry.entityId ?? null,
        actorNote: entry.actorNote ?? null,
      })
      .returning();
    return record;
  }

  override async getScenarios(): Promise<Scenario[]> {
    await this.ready;
    return this.db.select().from(scenarios).orderBy(scenarios.id);
  }

  override async getScenario(id: string): Promise<Scenario | undefined> {
    await this.ready;
    const [record] = await this.db.select().from(scenarios).where(eq(scenarios.id, id));
    return record;
  }

  override async createScenario(payload: InsertScenario): Promise<Scenario> {
    await this.ready;
    const [record] = await this.db
      .insert(scenarios)
      .values({ ...payload, id: randomUUID() })
      .returning();
    return record;
  }

  override async updateScenario(id: string, data: Partial<InsertScenario>): Promise<Scenario | undefined> {
    await this.ready;
    const [record] = await this.db
      .update(scenarios)
      .set(stripUndefined(data as Record<string, unknown>))
      .where(eq(scenarios.id, id))
      .returning();
    return record;
  }

  override async getRuns(): Promise<Run[]> {
    await this.ready;
    return this.db.select().from(runs).orderBy(runs.createdAt);
  }

  override async getRun(id: string): Promise<Run | undefined> {
    await this.ready;
    const [record] = await this.db.select().from(runs).where(eq(runs.id, id));
    return record;
  }

  override async createRun(payload: InsertRun): Promise<Run> {
    await this.ready;
    const [record] = await this.db
      .insert(runs)
      .values({
        ...payload,
        id: randomUUID(),
        operatorNote: payload.operatorNote ?? null,
        evidence: payload.evidence ?? null,
        safetyDecision: payload.safetyDecision ?? null,
      })
      .returning();
    return record;
  }

  override async updateRun(id: string, data: Partial<InsertRun>): Promise<Run | undefined> {
    await this.ready;
    const [record] = await this.db
      .update(runs)
      .set(stripUndefined({
        ...data,
        updatedAt: data.updatedAt ?? new Date().toISOString(),
      }))
      .where(eq(runs.id, id))
      .returning();
    return record;
  }

  override async getSafetyChecks(): Promise<SafetyCheck[]> {
    await this.ready;
    return this.db.select().from(safetyChecks).orderBy(safetyChecks.createdAt);
  }

  override async getSafetyCheck(id: string): Promise<SafetyCheck | undefined> {
    await this.ready;
    const [record] = await this.db.select().from(safetyChecks).where(eq(safetyChecks.id, id));
    return record;
  }

  override async createSafetyCheck(payload: InsertSafetyCheck): Promise<SafetyCheck> {
    await this.ready;
    const [record] = await this.db
      .insert(safetyChecks)
      .values({
        ...payload,
        id: randomUUID(),
        runId: payload.runId ?? null,
      })
      .returning();
    return record;
  }

  override async getLessons(): Promise<Lesson[]> {
    await this.ready;
    return this.db.select().from(lessons).orderBy(lessons.createdAt);
  }

  override async getLesson(id: string): Promise<Lesson | undefined> {
    await this.ready;
    const [record] = await this.db.select().from(lessons).where(eq(lessons.id, id));
    return record;
  }

  override async createLesson(payload: InsertLesson): Promise<Lesson> {
    await this.ready;
    const [record] = await this.db
      .insert(lessons)
      .values({
        ...payload,
        id: randomUUID(),
        taxonomyL2: payload.taxonomyL2 ?? null,
      })
      .returning();
    return record;
  }

  override async updateLesson(id: string, data: Partial<InsertLesson>): Promise<Lesson | undefined> {
    await this.ready;
    const [record] = await this.db
      .update(lessons)
      .set(stripUndefined(data as Record<string, unknown>))
      .where(eq(lessons.id, id))
      .returning();
    return record;
  }

  override async getReviews(): Promise<Review[]> {
    await this.ready;
    return this.db.select().from(reviews).orderBy(reviews.createdAt);
  }

  override async getReview(id: string): Promise<Review | undefined> {
    await this.ready;
    const [record] = await this.db.select().from(reviews).where(eq(reviews.id, id));
    return record;
  }

  override async createReview(payload: InsertReview): Promise<Review> {
    await this.ready;
    const [record] = await this.db
      .insert(reviews)
      .values({
        ...payload,
        id: randomUUID(),
        runId: payload.runId ?? null,
      })
      .returning();
    return record;
  }

  override async updateReview(id: string, data: Partial<InsertReview>): Promise<Review | undefined> {
    await this.ready;
    const [record] = await this.db
      .update(reviews)
      .set(stripUndefined(data as Record<string, unknown>))
      .where(eq(reviews.id, id))
      .returning();
    return record;
  }

  private async initialize() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS scenarios (
        id varchar PRIMARY KEY,
        title text NOT NULL,
        category text NOT NULL,
        difficulty text NOT NULL,
        description text NOT NULL,
        objective text NOT NULL,
        acceptance_criteria text NOT NULL,
        safe_steps text NOT NULL,
        anti_patterns text NOT NULL,
        verification_checklist text NOT NULL,
        target_evidence text NOT NULL,
        primary_risk text NOT NULL,
        readiness text NOT NULL
      );

      CREATE TABLE IF NOT EXISTS runs (
        id varchar PRIMARY KEY,
        scenario_id varchar NOT NULL,
        status text NOT NULL,
        operator_note text,
        evidence text,
        safety_decision text,
        created_at text NOT NULL,
        updated_at text NOT NULL
      );

      CREATE TABLE IF NOT EXISTS safety_checks (
        id varchar PRIMARY KEY,
        run_id varchar,
        target_env text NOT NULL,
        action_mode text NOT NULL,
        affected_assets text NOT NULL,
        min_verification text NOT NULL,
        recovery_path text NOT NULL,
        decision text NOT NULL,
        reason text NOT NULL,
        created_at text NOT NULL
      );

      CREATE TABLE IF NOT EXISTS lessons (
        id varchar PRIMARY KEY,
        title text NOT NULL,
        context text NOT NULL,
        taxonomy_l1 text NOT NULL,
        taxonomy_l2 text,
        symptom text NOT NULL,
        root_cause text NOT NULL,
        impact text NOT NULL,
        prevention text NOT NULL,
        status text NOT NULL,
        promotion text NOT NULL,
        created_at text NOT NULL
      );

      CREATE TABLE IF NOT EXISTS reviews (
        id varchar PRIMARY KEY,
        run_id varchar,
        task_goal text NOT NULL,
        final_result text NOT NULL,
        result_status text NOT NULL,
        evidence text NOT NULL,
        what_worked text NOT NULL,
        what_failed text NOT NULL,
        near_miss text NOT NULL,
        safest_next_step text NOT NULL,
        created_at text NOT NULL
      );

      CREATE TABLE IF NOT EXISTS activity_logs (
        id varchar PRIMARY KEY,
        action text NOT NULL,
        entity_type text NOT NULL,
        entity_id varchar,
        summary text NOT NULL,
        actor_note text,
        occurred_at text NOT NULL
      );
    `);

    await this.seedIfEmpty();
  }

  private async seedIfEmpty() {
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(scenarios);

    if (count > 0) {
      return;
    }

    const snapshot = this.snapshot();

    await this.db.insert(scenarios).values(snapshot.scenarios).onConflictDoNothing({ target: scenarios.id });
    await this.db.insert(runs).values(snapshot.runs).onConflictDoNothing({ target: runs.id });
    await this.db.insert(safetyChecks).values(snapshot.safetyChecks).onConflictDoNothing({ target: safetyChecks.id });
    await this.db.insert(lessons).values(snapshot.lessons).onConflictDoNothing({ target: lessons.id });
    await this.db.insert(reviews).values(snapshot.reviews).onConflictDoNothing({ target: reviews.id });
  }
}

function createStorage(): IStorage {
  const runtime = requestedStorageRuntime();

  if (runtime === "postgres") {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required when STORAGE_BACKEND=postgres");
    }

    return new PostgresStorage(process.env.DATABASE_URL);
  }

  if (runtime === "file") {
    return new FileStorage(defaultDataFilePath());
  }

  return new MemStorage();
}

export const storage = createStorage();
