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
      assert(statsAfterRestart.body.totalRuns === 1, `${mode} import state did not survive restart`);
      assert(statsAfterRestart.body.totalLessons === 1, `${mode} imported lesson state did not survive restart`);

      const runs = await fetchJson("/api/runs");
      const created = runs.body.find((item) => item.operatorNote === payload.operatorNote);
      assert(Boolean(created), "Created run was not found after restart");
    }

    console.log(`${logPrefix} Smoke test passed`);
  } finally {
    await stopServer(server);
  }
}

run().catch((error) => {
  console.error(`${logPrefix} ${error.stack || error.message}`);
  process.exit(1);
});
