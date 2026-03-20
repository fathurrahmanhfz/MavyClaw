import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";

const rootDir = resolve(dirname(new URL(import.meta.url).pathname), "..");
const mode = process.env.SMOKE_MODE ?? "prod-file";
const defaultPort = mode === "dev-memory" ? "5071" : "5072";
const port = Number(process.env.SMOKE_PORT ?? defaultPort);
const dataFile = resolve(rootDir, `.runtime/smoke-${mode}.json`);
const logPrefix = `[smoke:${mode}]`;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchJson(path, init) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, init);
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return { response, body, text };
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
  };

  let command;
  let args;

  if (mode === "dev-memory") {
    env.NODE_ENV = "development";
    env.STORAGE_BACKEND = "memory";
    command = process.execPath;
    args = [resolve(rootDir, "node_modules/.bin/tsx"), "server/index.ts"];
  } else {
    env.NODE_ENV = "production";
    env.STORAGE_BACKEND = "file";
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

  let server = startServer();
  await waitForServer();

  try {
    const health = await fetchJson("/api/health");
    assert(health.response.ok, `Health failed: ${health.text}`);
    assert(health.body.app === "MavyClaw", "Unexpected app name");

    if (mode === "dev-memory") {
      assert(health.body.runtime === "memory", `Expected memory runtime, received ${health.body.runtime}`);
      assert(health.body.persistence === "ephemeral", `Expected ephemeral persistence, received ${health.body.persistence}`);
    } else {
      assert(health.body.runtime === "file", `Expected file runtime, received ${health.body.runtime}`);
      assert(health.body.persistence === "disk", `Expected disk persistence, received ${health.body.persistence}`);
      assert(health.body.dataFile === dataFile, `Expected data file ${dataFile}, received ${health.body.dataFile}`);
    }

    const statsBefore = await fetchJson("/api/stats");
    assert(statsBefore.response.ok, `Stats failed: ${statsBefore.text}`);
    const runsBefore = statsBefore.body.totalRuns;

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

    const statsAfterCreate = await fetchJson("/api/stats");
    assert(statsAfterCreate.body.totalRuns === runsBefore + 1, "Run count did not increment after create");

    const invalidRun = await fetchJson("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "planned" }),
    });
    assert(invalidRun.response.status === 400, `Expected invalid payload to return 400, received ${invalidRun.response.status}`);

    if (mode === "prod-file") {
      await stopServer(server);
      server = startServer();
      await waitForServer();

      const statsAfterRestart = await fetchJson("/api/stats");
      assert(statsAfterRestart.body.totalRuns === runsBefore + 1, "File persistence did not survive restart");

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
