#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const endpointMap = {
  "run-start": "/api/agent/run/start",
  "run-progress": "/api/agent/run/progress",
  "safety-check": "/api/agent/safety-check",
  lesson: "/api/agent/lesson",
  review: "/api/agent/review",
  "run-finish": "/api/agent/run/finish",
};

function printUsage() {
  console.error(`Usage:
  npm run agent:ingest -- <event> --payload-file <file.json>
  npm run agent:ingest -- <event> --json '{"key":"value"}'

Events:
  run-start
  run-progress
  safety-check
  lesson
  review
  run-finish

Optional flags:
  --base-url <url>
  --token <token>
  --payload-file <path>
  --json <json>
  --run-id <id>
  --scenario-id <id>
  --task-title <title>
  --status <status>
  --operator-note <text>
  --evidence <text>
  --safety-decision <decision>`);
}

function parseArgs(argv) {
  const [event, ...rest] = argv;
  if (!event || !endpointMap[event]) {
    printUsage();
    process.exit(1);
  }

  const flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    const current = rest[index];
    if (!current.startsWith("--")) {
      throw new Error(`Unexpected argument: ${current}`);
    }

    const key = current.slice(2);
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }

    flags[key] = value;
    index += 1;
  }

  return { event, flags };
}

async function loadPayload(flags) {
  let payload = {};

  if (flags["payload-file"]) {
    const filePath = resolve(process.cwd(), flags["payload-file"]);
    const raw = await readFile(filePath, "utf8");
    payload = JSON.parse(raw);
  }

  if (flags.json) {
    payload = { ...payload, ...JSON.parse(flags.json) };
  }

  const directMap = {
    "run-id": "runId",
    "scenario-id": "scenarioId",
    "task-title": "taskTitle",
    status: "status",
    "operator-note": "operatorNote",
    evidence: "evidence",
    "safety-decision": "safetyDecision",
  };

  for (const [flagName, fieldName] of Object.entries(directMap)) {
    if (flags[flagName] !== undefined) {
      payload[fieldName] = flags[flagName];
    }
  }

  return payload;
}

async function main() {
  const { event, flags } = parseArgs(process.argv.slice(2));
  const baseUrl = (flags["base-url"] || process.env.AGENT_INGEST_BASE_URL || "http://127.0.0.1:5000").replace(/\/$/, "");
  const token = flags.token || process.env.AGENT_INGEST_TOKEN;

  if (!token) {
    throw new Error("AGENT_INGEST_TOKEN is required. Pass --token or set the environment variable.");
  }

  const payload = await loadPayload(flags);
  const response = await fetch(`${baseUrl}${endpointMap[event]}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    console.error(JSON.stringify({ ok: false, status: response.status, body }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, status: response.status, body }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
