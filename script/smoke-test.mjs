import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";

const rootDir = resolve(dirname(new URL(import.meta.url).pathname), "..");
const mode = process.env.SMOKE_MODE ?? "prod-file";
const defaultPort = mode === "dev-memory" ? "5071" : mode === "prod-postgres" ? "5073" : "5072";
const port = Number(process.env.SMOKE_PORT ?? defaultPort);
const dataFile = resolve(rootDir, `.runtime/smoke-${mode}.json`);
const logPrefix = `[smoke:${mode}]`;
const databaseUrl = mode === "prod-postgres"
  ? (process.env.DATABASE_URL ?? "postgresql://mavyclaw:mavyclaw@127.0.0.1:5432/mavyclaw")
  : process.env.DATABASE_URL;
const demoAuthUsername = process.env.DEMO_AUTH_USERNAME || "demo-admin";
const demoAuthPassword = process.env.DEMO_AUTH_PASSWORD || "demo-admin";
const demoAuthRole = process.env.DEMO_AUTH_ROLE || "admin";
const agentIngestToken = process.env.AGENT_INGEST_TOKEN || `smoke-agent-token-${mode}`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const cookieJar = new Map();

function cookieHeader() {
  return Array.from(cookieJar.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function storeCookies(response) {
  const raw = response.headers.get("set-cookie");
  if (!raw) {
    return;
  }

  const cookie = raw.split(", ").map((part, index, array) => {
    if (index > 0 && !array[index].includes("=")) {
      return `, ${part}`;
    }
    return part;
  }).join("");

  const firstPair = cookie.split(";")[0];
  const separatorIndex = firstPair.indexOf("=");
  if (separatorIndex > 0) {
    const name = firstPair.slice(0, separatorIndex);
    const value = firstPair.slice(separatorIndex + 1);
    cookieJar.set(name, value);
  }
}

async function fetchJson(path, init = {}) {
  const headers = new Headers(init.headers || {});
  const cookie = cookieHeader();
  if (cookie) {
    headers.set("cookie", cookie);
  }

  const response = await fetch(`http://127.0.0.1:${port}${path}`, { ...init, headers });
  storeCookies(response);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return { response, body, text };
}

async function expectLiveWorkspaceUpdate(timeoutMs = 5000) {
  const response = await fetch(`http://127.0.0.1:${port}/api/live`, {
    headers: {
      Accept: "text/event-stream",
      cookie: cookieHeader(),
    },
  });

  assert(response.ok, `Live stream failed: ${response.status}`);
  assert(response.body, "Live stream body is missing");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const start = Date.now();
  let buffer = "";

  try {
    while (Date.now() - start < timeoutMs) {
      const readPromise = reader.read();
      const timeoutPromise = delay(Math.min(1000, timeoutMs));
      const winner = await Promise.race([
        readPromise.then((result) => ({ kind: "read", result })),
        timeoutPromise.then(() => ({ kind: "timeout" })),
      ]);

      if (winner.kind === "timeout") {
        continue;
      }

      const { done, value } = winner.result;
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      if (buffer.includes("event: workspace-update") && buffer.includes("data:")) {
        return;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  throw new Error("Did not receive workspace-update event in time");
}

async function waitForServer(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const { response } = await fetchJson("/api/health");
      if (response.ok) {
        return;
      }
    } catch {
      // retry until timeout
    }
    await delay(250);
  }

  throw new Error("Server did not become ready in time");
}

function startServer() {
  const env = {
    ...process.env,
    PORT: String(port),
    DATA_FILE: dataFile,
    AUTH_MODE: process.env.AUTH_MODE || "demo",
    DEMO_AUTH_USERNAME: demoAuthUsername,
    DEMO_AUTH_PASSWORD: demoAuthPassword,
    DEMO_AUTH_ROLE: demoAuthRole,
    COOKIE_SECURE: process.env.COOKIE_SECURE || "false",
    AGENT_INGEST_TOKEN: agentIngestToken,
    AGENT_INGEST_BASE_URL: process.env.AGENT_INGEST_BASE_URL || `http://127.0.0.1:${port}`,
  };

  if (databaseUrl) {
    env.DATABASE_URL = databaseUrl;
  } else {
    delete env.DATABASE_URL;
  }

  let command;
  let args;

  if (mode === "dev-memory") {
    env.NODE_ENV = "development";
    env.STORAGE_BACKEND = "memory";
    command = process.execPath;
    args = [resolve(rootDir, "node_modules/.bin/tsx"), "server/index.ts"];
  } else {
    env.NODE_ENV = "production";
    env.STORAGE_BACKEND = mode === "prod-postgres" ? "postgres" : "file";
    command = process.execPath;
    args = [resolve(rootDir, "dist/index.cjs")];
  }

  const child = spawn(command, args, {
    cwd: rootDir,
    env,
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk) => process.stdout.write(`${logPrefix} ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`${logPrefix} ${chunk}`));

  return child;
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    // process may already be gone
  }

  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(5000),
  ]);

  if (child.exitCode === null) {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      // process may already be gone
    }
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      delay(2000),
    ]);
  }
}

async function run() {
  if (mode === "prod-file" && existsSync(dataFile)) {
    rmSync(dataFile, { force: true });
  }

  if (mode === "prod-postgres") {
    const reset = spawn("psql", [databaseUrl, "-c", "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;"], {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stderr = "";
    for await (const chunk of reset.stderr) {
      stderr += chunk.toString();
    }

    const exitCode = await new Promise((resolve) => reset.on("close", resolve));
    if (exitCode !== 0) {
      throw new Error(`Failed to reset PostgreSQL smoke database: ${stderr}`);
    }
  }

  let server = startServer();
  await waitForServer();

  try {
    const health = await fetchJson("/api/health");
    assert(health.response.ok, `Health failed: ${health.text}`);
    assert(health.body.app === "MavyClaw", "Unexpected app name");

    const sessionBeforeLogin = await fetchJson("/api/session");
    assert(sessionBeforeLogin.response.ok, `Session endpoint failed: ${sessionBeforeLogin.text}`);
    assert(sessionBeforeLogin.body.authenticated === false, "Expected unauthenticated session before login");

    const unauthorizedCreate = await fetchJson("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioId: "sc-001",
        status: "planned",
        operatorNote: "Unauthorized create attempt",
        evidence: null,
        safetyDecision: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    });
    assert(unauthorizedCreate.response.status === 401, `Expected write without login to return 401, received ${unauthorizedCreate.response.status}`);

    const login = await fetchJson("/api/session/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: demoAuthUsername, password: demoAuthPassword }),
    });
    assert(login.response.ok, `Login failed: ${login.text}`);
    assert(login.body.user.role === demoAuthRole, "Unexpected logged-in role");

    if (mode === "dev-memory") {
      assert(health.body.runtime === "memory", `Expected memory runtime, received ${health.body.runtime}`);
      assert(health.body.persistence === "ephemeral", `Expected ephemeral persistence, received ${health.body.persistence}`);
    } else if (mode === "prod-postgres") {
      assert(health.body.runtime === "postgres", `Expected postgres runtime, received ${health.body.runtime}`);
      assert(health.body.persistence === "database", `Expected database persistence, received ${health.body.persistence}`);
      assert(health.body.databaseConfigured === true, "Expected databaseConfigured=true for postgres runtime");
      assert(health.body.dataFile === null, `Expected no data file for postgres runtime, received ${health.body.dataFile}`);
    } else {
      assert(health.body.runtime === "file", `Expected file runtime, received ${health.body.runtime}`);
      assert(health.body.persistence === "disk", `Expected disk persistence, received ${health.body.persistence}`);
      assert(health.body.dataFile === dataFile, `Expected data file ${dataFile}, received ${health.body.dataFile}`);
    }

    const agentStatus = await fetchJson("/api/agent/status");
    assert(agentStatus.response.ok, `Agent status failed: ${agentStatus.text}`);
    assert(agentStatus.body.configured === true, "Expected agent ingest to be configured in smoke mode");
    assert(agentStatus.body.mode === "token", `Expected token mode, received ${agentStatus.body.mode}`);

    const statsBefore = await fetchJson("/api/stats");
    assert(statsBefore.response.ok, `Stats failed: ${statsBefore.text}`);
    assert(statsBefore.body.agentIngest.configured === true, "Expected stats to expose configured agent ingest");
    const runsBefore = statsBefore.body.totalRuns;
    const lessonsBefore = statsBefore.body.totalLessons;
    const reviewsBefore = statsBefore.body.totalReviews;
    const safetyBefore = statsBefore.body.totalSafetyChecks;

    const liveUpdatePromise = expectLiveWorkspaceUpdate();

    const payload = {
      scenarioId: "sc-001",
      status: "running",
      operatorNote: `Smoke test ${mode} ${randomUUID()}`,
      evidence: "Runtime smoke test evidence",
      safetyDecision: "allow-read-only",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const createRun = await fetchJson("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    assert(createRun.response.status === 201, `Run creation failed: ${createRun.text}`);
    assert(createRun.body.operatorNote === payload.operatorNote, "Created run note mismatch");
    await liveUpdatePromise;

    const statsAfterCreate = await fetchJson("/api/stats");
    assert(statsAfterCreate.body.totalRuns === runsBefore + 1, "Run count did not increment after create");

    const helperRunStart = spawn(process.execPath, [resolve(rootDir, "script/agent-ingest.mjs"), "run-start", "--json", JSON.stringify({
      taskTitle: `Agent helper smoke ${mode}`,
      operatorNote: "Agent helper started a run",
      evidence: "Agent helper smoke evidence",
      safetyDecision: "allow-read-only"
    })], {
      cwd: rootDir,
      env: {
        ...process.env,
        AGENT_INGEST_TOKEN: agentIngestToken,
        AGENT_INGEST_BASE_URL: `http://127.0.0.1:${port}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let helperStdout = "";
    let helperStderr = "";
    for await (const chunk of helperRunStart.stdout) {
      helperStdout += chunk.toString();
    }
    for await (const chunk of helperRunStart.stderr) {
      helperStderr += chunk.toString();
    }
    const helperExitCode = await new Promise((resolve) => helperRunStart.on("close", resolve));
    assert(helperExitCode === 0, `Agent helper failed: ${helperStderr}`);
    const helperResponse = JSON.parse(helperStdout);
    assert(helperResponse.ok === true, "Expected helper command to succeed");
    const agentRunId = helperResponse.body.id;
    assert(agentRunId, "Expected helper command to return a run id");

    const progressResponse = await fetch(`http://127.0.0.1:${port}/api/agent/run/progress`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${agentIngestToken}`,
      },
      body: JSON.stringify({
        runId: agentRunId,
        status: "blocked",
        operatorNote: "Waiting on smoke verification",
      }),
    });
    assert(progressResponse.ok, `Agent progress failed: ${await progressResponse.text()}`);

    const safetyResponse = await fetch(`http://127.0.0.1:${port}/api/agent/safety-check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${agentIngestToken}`,
      },
      body: JSON.stringify({
        runId: agentRunId,
        targetEnv: "sandbox",
        actionMode: "write",
        affectedAssets: "Smoke dataset",
        minVerification: "Run smoke assertions",
        recoveryPath: "Delete the smoke records",
        decision: "allow-guarded-write",
        reason: "Smoke path only touches test data",
      }),
    });
    assert(safetyResponse.ok, `Agent safety check failed: ${await safetyResponse.text()}`);

    const lessonResponse = await fetch(`http://127.0.0.1:${port}/api/agent/lesson`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${agentIngestToken}`,
      },
      body: JSON.stringify({
        title: "Smoke lesson",
        context: "Agent ingest smoke verification",
        taxonomyL1: "workflow",
        taxonomyL2: "workflow/agent-ingest",
        symptom: "Need confidence that token-based ingest works",
        rootCause: "New helper and endpoints were added",
        impact: "Would lose agent lifecycle records without verification",
        prevention: "Keep smoke coverage for the ingest path",
        status: "verified",
        promotion: "workflow",
      }),
    });
    assert(lessonResponse.ok, `Agent lesson failed: ${await lessonResponse.text()}`);

    const reviewResponse = await fetch(`http://127.0.0.1:${port}/api/agent/review`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${agentIngestToken}`,
      },
      body: JSON.stringify({
        runId: agentRunId,
        taskGoal: "Verify agent ingest smoke path",
        finalResult: "The helper and token-based endpoints completed successfully",
        resultStatus: "completed",
        evidence: "Smoke assertions passed across all ingest endpoints",
        whatWorked: "Single helper command for start, direct token posts for follow-up events",
        whatFailed: "No failure during smoke verification",
        nearMiss: "Could have shipped the helper without end-to-end coverage",
        safestNextStep: "Keep the ingest path covered in smoke tests",
      }),
    });
    assert(reviewResponse.ok, `Agent review failed: ${await reviewResponse.text()}`);

    const finishResponse = await fetch(`http://127.0.0.1:${port}/api/agent/run/finish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${agentIngestToken}`,
      },
      body: JSON.stringify({
        runId: agentRunId,
        status: "passed",
        operatorNote: "Smoke verification complete",
        evidence: "Agent ingest helper and endpoints passed",
      }),
    });
    assert(finishResponse.ok, `Agent finish failed: ${await finishResponse.text()}`);

    const statsAfterAgentFlow = await fetchJson("/api/stats");
    assert(statsAfterAgentFlow.body.totalRuns === runsBefore + 2, "Expected agent flow to add one more run");
    assert(statsAfterAgentFlow.body.totalSafetyChecks === safetyBefore + 1, "Expected agent flow to add one safety check");
    assert(statsAfterAgentFlow.body.totalLessons === lessonsBefore + 1, "Expected agent flow to add one lesson");
    assert(statsAfterAgentFlow.body.totalReviews === reviewsBefore + 1, "Expected agent flow to add one review");

    const exported = await fetchJson("/api/workspace/export");
    assert(exported.response.ok, `Workspace export failed: ${exported.text}`);
    assert(exported.body.snapshot.runs.length === runsBefore + 2, "Exported snapshot did not include the created runs");

    const filteredSnapshot = {
      ...exported.body.snapshot,
      runs: exported.body.snapshot.runs.filter((item) => item.id === createRun.body.id),
      safetyChecks: [],
      lessons: exported.body.snapshot.lessons.slice(0, 1),
      reviews: [],
    };

    const imported = await fetchJson("/api/workspace/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ snapshot: filteredSnapshot }),
    });
    assert(imported.response.ok, `Workspace import failed: ${imported.text}`);

    const statsAfterImport = await fetchJson("/api/stats");
    assert(statsAfterImport.body.totalRuns === 1, "Workspace import did not replace runs with the imported snapshot");
    assert(statsAfterImport.body.totalLessons === 1, "Workspace import did not replace lessons with the imported snapshot");

    const importedRuns = await fetchJson("/api/runs");
    assert(importedRuns.body.length === 1, "Expected exactly one imported run after workspace restore");
    assert(importedRuns.body[0].id === createRun.body.id, "Imported run does not match exported workspace snapshot");

    const invalidRun = await fetchJson("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "planned" }),
    });
    assert(invalidRun.response.status === 400, `Expected invalid payload to return 400, received ${invalidRun.response.status}`);

    // ── New PATCH endpoints (Paperclip-inspired) ──────────────────────────────

    // 1. PATCH /api/scenarios/:id — partial scenario update
    const patchScenario = await fetchJson("/api/scenarios/sc-001", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ readiness: "needs-review" }),
    });
    assert(patchScenario.response.ok, `PATCH scenario failed: ${patchScenario.text}`);
    assert(patchScenario.body.readiness === "needs-review", "Scenario readiness did not update");
    assert(patchScenario.body.id === "sc-001", "Scenario PATCH changed the wrong record");

    // 2. PATCH /api/runs/:id/cancel — explicit cancel endpoint
    const cancelRunId = importedRuns.body[0].id;
    const cancelRun = await fetchJson(`/api/runs/${cancelRunId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Cancelled in smoke test" }),
    });
    assert(cancelRun.response.ok, `Run cancel failed: ${cancelRun.text}`);
    assert(cancelRun.body.status === "failed", `Expected cancelled run status to be 'failed', got '${cancelRun.body.status}'`);
    assert(cancelRun.body.operatorNote === "Cancelled in smoke test", "Cancel reason not stored");

    // Cancelling an already-terminal run should return 409
    const doubleCancel = await fetchJson(`/api/runs/${cancelRunId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Should be rejected" }),
    });
    assert(doubleCancel.response.status === 409, `Expected 409 for double-cancel, got ${doubleCancel.response.status}`);

    // ── Approval workflow smoke coverage ─────────────────────────────────────

    // Create a fresh run to test the approval workflow.
    const approvalRun = await fetchJson("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioId: "sc-001",
        status: "running",
        operatorNote: "Approval workflow smoke test",
        evidence: null,
        safetyDecision: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    });
    assert(approvalRun.response.status === 201, `Approval run creation failed: ${approvalRun.text}`);
    const approvalRunId = approvalRun.body.id;

    // Manually put run into pending-approval via PATCH.
    const setApprovalPending = await fetchJson(`/api/runs/${approvalRunId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "pending-approval" }),
    });
    assert(setApprovalPending.response.ok, `Setting pending-approval status failed: ${setApprovalPending.text}`);
    assert(setApprovalPending.body.status === "pending-approval", "Run status was not set to pending-approval");

    // Approve the run — should transition to 'running'.
    const approveResult = await fetchJson(`/api/runs/${approvalRunId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "Looks safe, proceeding" }),
    });
    assert(approveResult.response.ok, `Run approve failed: ${approveResult.text}`);
    assert(approveResult.body.status === "running", `Expected approved run to be 'running', got '${approveResult.body.status}'`);
    assert(approveResult.body.approvalNote === "Looks safe, proceeding", "Approval note not stored");

    // Approving a non-pending-approval run should return 409.
    const badApprove = await fetchJson(`/api/runs/${approvalRunId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert(badApprove.response.status === 409, `Expected 409 for approve on non-pending-approval run, got ${badApprove.response.status}`);

    // Create a second run and test rejection.
    const rejectRun = await fetchJson("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scenarioId: "sc-001",
        status: "pending-approval",
        operatorNote: "Rejection smoke test",
        evidence: null,
        safetyDecision: "hold-for-approval",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    });
    assert(rejectRun.response.status === 201, `Rejection run creation failed: ${rejectRun.text}`);
    const rejectRunId = rejectRun.body.id;

    const rejectResult = await fetchJson(`/api/runs/${rejectRunId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "Too risky for this environment" }),
    });
    assert(rejectResult.response.ok, `Run reject failed: ${rejectResult.text}`);
    assert(rejectResult.body.status === "failed", `Expected rejected run to be 'failed', got '${rejectResult.body.status}'`);
    assert(rejectResult.body.approvalNote === "Too risky for this environment", "Rejection note not stored");

    // Rejecting a non-pending-approval run should return 409.
    const badReject = await fetchJson(`/api/runs/${rejectRunId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert(badReject.response.status === 409, `Expected 409 for reject on non-pending-approval run, got ${badReject.response.status}`);

    // Check activity log has approval events.
    const activityAfterApproval = await fetchJson("/api/activity?entityType=run");
    assert(activityAfterApproval.response.ok, `Activity log fetch after approval failed: ${activityAfterApproval.text}`);
    const approvedEntry = activityAfterApproval.body.find((e) => e.action === "run.approved");
    assert(Boolean(approvedEntry), "Expected run.approved activity log entry after approval");
    const rejectedEntry = activityAfterApproval.body.find((e) => e.action === "run.rejected");
    assert(Boolean(rejectedEntry), "Expected run.rejected activity log entry after rejection");

    // 3. PATCH /api/lessons/:id — partial lesson update
    const allLessons = await fetchJson("/api/lessons");
    assert(allLessons.body.length > 0, "Expected at least one lesson for PATCH test");
    const firstLessonId = allLessons.body[0].id;
    const patchLesson = await fetchJson(`/api/lessons/${firstLessonId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "hypothesis" }),
    });
    assert(patchLesson.response.ok, `PATCH lesson failed: ${patchLesson.text}`);
    assert(patchLesson.body.status === "hypothesis", "Lesson status did not update");
    assert(patchLesson.body.id === firstLessonId, "Lesson PATCH changed the wrong record");

    // 4. PATCH /api/reviews/:id — partial review update
    const allReviews = await fetchJson("/api/reviews");
    if (allReviews.body.length > 0) {
      const firstReviewId = allReviews.body[0].id;
      const patchReview = await fetchJson(`/api/reviews/${firstReviewId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resultStatus: "on-hold" }),
      });
      assert(patchReview.response.ok, `PATCH review failed: ${patchReview.text}`);
      assert(patchReview.body.resultStatus === "on-hold", "Review resultStatus did not update");
    }

    // 5. Empty PATCH body should return 400
    const emptyPatch = await fetchJson("/api/scenarios/sc-001", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert(emptyPatch.response.status === 400, `Expected 400 for empty PATCH body, got ${emptyPatch.response.status}`);

    if (mode === "prod-file" || mode === "prod-postgres") {
      await stopServer(server);
      server = startServer();
      await waitForServer();

      const sessionAfterRestart = await fetchJson("/api/session");
      assert(sessionAfterRestart.body.authenticated === false, "Expected session to reset after restart in smoke test");

      const loginAfterRestart = await fetchJson("/api/session/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: demoAuthUsername, password: demoAuthPassword }),
      });
      assert(loginAfterRestart.response.ok, `Re-login after restart failed: ${loginAfterRestart.text}`);

      const statsAfterRestart = await fetchJson("/api/stats");
      // After import the snapshot has 1 run and 1 lesson. Before restart, the smoke
      // test adds 2 more runs (approvalRun + rejectRun), so the persisted state has 3
      // runs total. Lessons remain at 1 (no new lessons are created after import).
      assert(statsAfterRestart.body.totalRuns === 3, `${mode} import state did not survive restart`);
      assert(statsAfterRestart.body.totalLessons === 1, `${mode} imported lesson state did not survive restart`);

      const runs = await fetchJson("/api/runs");
      // The imported run's operatorNote was changed by the cancel step, so match by id.
      const created = runs.body.find((item) => item.id === createRun.body.id);
      assert(Boolean(created), "Created run was not found after restart");
    }

    // ── Activity Log smoke coverage ───────────────────────────────────────

    // 1. GET /api/activity — should return recent entries (we just ran a full flow)
    const activityAll = await fetchJson("/api/activity");
    assert(activityAll.response.ok, `GET /api/activity failed: ${activityAll.text}`);
    assert(Array.isArray(activityAll.body), "Expected activity log to be an array");
    assert(activityAll.body.length > 0, "Expected at least one activity log entry after smoke flow");

    // All entries should have required fields
    const firstEntry = activityAll.body[0];
    assert(typeof firstEntry.id === "string", "Activity log entry missing id");
    assert(typeof firstEntry.action === "string", "Activity log entry missing action");
    assert(typeof firstEntry.entityType === "string", "Activity log entry missing entityType");
    assert(typeof firstEntry.summary === "string", "Activity log entry missing summary");
    assert(typeof firstEntry.occurredAt === "string", "Activity log entry missing occurredAt");

    // 2. Filter by entityType=run
    const activityRuns = await fetchJson("/api/activity?entityType=run");
    assert(activityRuns.response.ok, `GET /api/activity?entityType=run failed: ${activityRuns.text}`);
    assert(Array.isArray(activityRuns.body), "Expected filtered activity to be an array");
    assert(
      activityRuns.body.every((e) => e.entityType === "run"),
      "entityType filter returned non-run entries"
    );
    assert(activityRuns.body.length > 0, "Expected at least one run activity entry");

    // 3. Filter by entityType + entityId
    const firstRunEntry = activityRuns.body[0];
    const activityByEntityId = await fetchJson(`/api/activity?entityType=run&entityId=${firstRunEntry.entityId}`);
    assert(activityByEntityId.response.ok, `GET /api/activity?entityId filter failed: ${activityByEntityId.text}`);
    assert(Array.isArray(activityByEntityId.body), "Expected entityId-filtered activity to be an array");
    assert(
      activityByEntityId.body.every((e) => e.entityId === firstRunEntry.entityId),
      "entityId filter returned entries with wrong entityId"
    );

    // 4. Limit param
    const activityLimited = await fetchJson("/api/activity?limit=1");
    assert(activityLimited.response.ok, `GET /api/activity?limit=1 failed: ${activityLimited.text}`);
    assert(activityLimited.body.length <= 1, "Limit param did not restrict results");

    // 5. GET /api/activity/:id — fetch a specific entry
    const activityById = await fetchJson(`/api/activity/${firstEntry.id}`);
    assert(activityById.response.ok, `GET /api/activity/:id failed: ${activityById.text}`);
    assert(activityById.body.id === firstEntry.id, "Activity log entry id mismatch");

    // 6. Non-existent entry should return 404
    const notFoundEntry = await fetchJson("/api/activity/does-not-exist");
    assert(notFoundEntry.response.status === 404, `Expected 404 for missing activity entry, got ${notFoundEntry.response.status}`);

    // 7. Activity log should be newest-first (if > 1 entry)
    if (activityAll.body.length > 1) {
      assert(
        activityAll.body[0].occurredAt >= activityAll.body[activityAll.body.length - 1].occurredAt,
        "Activity log is not sorted newest-first"
      );
    }

    // ── Wave 4: Cost tracking smoke coverage ───────────────────────────────────────────────────────

    // 1. GET /api/cost-events — initially empty
    const costEventsBefore = await fetchJson("/api/cost-events");
    assert(costEventsBefore.response.ok, `GET /api/cost-events failed: ${costEventsBefore.text}`);
    assert(Array.isArray(costEventsBefore.body), "Expected cost events to be an array");
    const costCountBefore = costEventsBefore.body.length;

    // 2. GET /api/cost-events/summary — should return a summary with zero events
    const costSummaryBefore = await fetchJson("/api/cost-events/summary");
    assert(costSummaryBefore.response.ok, `GET /api/cost-events/summary failed: ${costSummaryBefore.text}`);
    assert(typeof costSummaryBefore.body.totalEvents === "number", "Cost summary missing totalEvents");
    assert(typeof costSummaryBefore.body.totalTokens === "number", "Cost summary missing totalTokens");
    assert(typeof costSummaryBefore.body.estimatedTotalCostUsd === "number", "Cost summary missing estimatedTotalCostUsd");

    // 3. POST /api/agent/cost-event — agent-reported cost event
    const costEventPayload = {
      provider: "openai",
      model: "gpt-4o",
      promptTokens: 1200,
      completionTokens: 350,
      totalTokens: 1550,
      estimatedCostUsd: "0.0155",
      operationLabel: "smoke-safety-check",
    };
    const agentCostResponse = await fetch(`http://127.0.0.1:${port}/api/agent/cost-event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${agentIngestToken}`,
      },
      body: JSON.stringify(costEventPayload),
    });
    const agentCostText = await agentCostResponse.text();
    assert(agentCostResponse.ok, `Agent cost-event failed: ${agentCostText}`);
    const agentCostBody = JSON.parse(agentCostText);
    assert(agentCostBody.provider === "openai", "Cost event provider mismatch");
    assert(agentCostBody.model === "gpt-4o", "Cost event model mismatch");
    assert(agentCostBody.totalTokens === 1550, "Cost event totalTokens mismatch");
    assert(agentCostBody.estimatedCostUsd === "0.0155", "Cost event estimatedCostUsd mismatch");
    const costEventId = agentCostBody.id;
    assert(costEventId, "Expected agent cost-event to return an id");

    // 4. GET /api/cost-events — should now have one more event
    const costEventsAfter = await fetchJson("/api/cost-events");
    assert(costEventsAfter.response.ok, `GET /api/cost-events after create failed: ${costEventsAfter.text}`);
    assert(costEventsAfter.body.length === costCountBefore + 1, "Expected cost events count to increment after agent post");

    // 5. GET /api/cost-events/:id — fetch by id
    const costEventById = await fetchJson(`/api/cost-events/${costEventId}`);
    assert(costEventById.response.ok, `GET /api/cost-events/:id failed: ${costEventById.text}`);
    assert(costEventById.body.id === costEventId, "Cost event id mismatch");

    // 6. Non-existent cost event should return 404
    const missingCostEvent = await fetchJson("/api/cost-events/does-not-exist");
    assert(missingCostEvent.response.status === 404, `Expected 404 for missing cost event, got ${missingCostEvent.response.status}`);

    // 7. GET /api/cost-events/summary — summary should now show the new event
    const costSummaryAfter = await fetchJson("/api/cost-events/summary");
    assert(costSummaryAfter.response.ok, `GET /api/cost-events/summary after create failed: ${costSummaryAfter.text}`);
    assert(costSummaryAfter.body.totalEvents === costCountBefore + 1, "Cost summary totalEvents did not increment");
    assert(costSummaryAfter.body.totalTokens >= 1550, "Cost summary totalTokens did not include new event");
    assert(costSummaryAfter.body.byModel["gpt-4o"] !== undefined, "Cost summary byModel missing gpt-4o");
    assert(costSummaryAfter.body.byProvider["openai"] !== undefined, "Cost summary byProvider missing openai");

    // 8. Stats endpoint should include costSummary and pendingApprovalCount
    const statsWithCost = await fetchJson("/api/stats");
    assert(statsWithCost.response.ok, `GET /api/stats failed: ${statsWithCost.text}`);
    assert(typeof statsWithCost.body.pendingApprovalCount === "number", "Stats missing pendingApprovalCount");
    assert(statsWithCost.body.costSummary !== undefined, "Stats missing costSummary");
    assert(typeof statsWithCost.body.costSummary.totalEvents === "number", "Stats costSummary missing totalEvents");

    // 9. Activity log should record cost_event.created
    const costActivity = await fetchJson("/api/activity?entityType=cost_event");
    assert(costActivity.response.ok, `GET /api/activity?entityType=cost_event failed: ${costActivity.text}`);
    const costActivityEntry = costActivity.body.find((e) => e.action === "cost_event.created");
    assert(Boolean(costActivityEntry), "Expected cost_event.created activity log entry");

    // 10. Agent cost-event with linked runId should validate run existence
    const badCostEvent = await fetch(`http://127.0.0.1:${port}/api/agent/cost-event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${agentIngestToken}`,
      },
      body: JSON.stringify({
        runId: "does-not-exist",
        provider: "anthropic",
        model: "claude-3-5-sonnet",
        totalTokens: 500,
      }),
    });
    assert(badCostEvent.status === 400, `Expected 400 for cost event with invalid runId, got ${badCostEvent.status} body=${await badCostEvent.text()}`);

    console.log(`${logPrefix} Smoke test passed`);
  } finally {
    await stopServer(server);
  }
}

run().catch((error) => {
  console.error(`${logPrefix} ${error.stack || error.message}`);
  process.exit(1);
});
