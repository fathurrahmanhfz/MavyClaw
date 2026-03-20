# Agent Ingest Contract

Use this contract when an external AI agent needs to write benchmark lifecycle records into MavyClaw without manual UI interaction.

## Required environment

Set these variables on the MavyClaw server:

- `AGENT_INGEST_TOKEN`
- `AGENT_INGEST_BASE_URL` as an optional helper default

## Authentication

Every write request must include:

```http
Authorization: Bearer <AGENT_INGEST_TOKEN>
```

## Endpoints

### Start a run

`POST /api/agent/run/start`

Minimum payload:

```json
{
  "taskTitle": "Investigate staging deploy failure"
}
```

You may also pass:

- `scenarioId` to attach to an existing scenario
- `scenario` to create a new scenario automatically when no `scenarioId` is provided
- `status`
- `operatorNote`
- `evidence`
- `safetyDecision`

### Progress update

`POST /api/agent/run/progress`

Minimum payload:

```json
{
  "runId": "<run-id>",
  "status": "running",
  "operatorNote": "Collected logs and confirmed the failing step"
}
```

### Safety check

`POST /api/agent/safety-check`

Example payload:

```json
{
  "runId": "<run-id>",
  "targetEnv": "staging",
  "actionMode": "write",
  "affectedAssets": "Nginx config and service reload",
  "minVerification": "nginx -t before reload",
  "recoveryPath": "Restore previous config and reload Nginx",
  "decision": "allow-guarded-write",
  "reason": "Rollback path is clear and the change is bounded"
}
```

### Lesson

`POST /api/agent/lesson`

### Review

`POST /api/agent/review`

### Finish a run

`POST /api/agent/run/finish`

Example payload:

```json
{
  "runId": "<run-id>",
  "status": "passed",
  "operatorNote": "Deploy verified and smoke checks passed",
  "evidence": "health endpoint 200, stats endpoint 200"
}
```

### Status

`GET /api/agent/status`

Use this to verify that token-based ingest is configured before external agents begin posting records.

## Helper CLI

The repository ships with a helper command:

```bash
npm run agent:ingest -- run-start --json '{"taskTitle":"Investigate staging deploy failure"}'
```

The helper reads these environment variables automatically:

- `AGENT_INGEST_TOKEN`
- `AGENT_INGEST_BASE_URL`

It also supports:

- `--payload-file <file.json>`
- `--json '<inline-json>'`
- direct flags such as `--run-id`, `--scenario-id`, `--task-title`, `--status`, `--operator-note`, `--evidence`, and `--safety-decision`

## Recommended sequence

1. `run-start`
2. `run-progress`
3. `safety-check` before risky writes
4. `lesson` when reusable learning appears
5. `review`
6. `run-finish`

This path keeps the dashboard current through live updates and makes MavyClaw usable as an operational sink for autonomous agents.
