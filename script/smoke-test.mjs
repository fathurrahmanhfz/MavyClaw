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

    const statsBefore = await fetchJson("/api/stats");
    assert(statsBefore.response.ok, `Stats failed: ${statsBefore.text}`);
    const runsBefore = statsBefore.body.totalRuns;

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

    const exported = await fetchJson("/api/workspace/export");
    assert(exported.response.ok, `Workspace export failed: ${exported.text}`);
    assert(exported.body.snapshot.runs.length === runsBefore + 1, "Exported snapshot did not include the created run");

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
