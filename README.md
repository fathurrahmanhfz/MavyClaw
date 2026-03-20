# MavyClaw

<div align="center">

[![CI](https://github.com/fathurrahmanhfz/MavyClaw/actions/workflows/ci.yml/badge.svg)](https://github.com/fathurrahmanhfz/MavyClaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-Full--stack-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Status](https://img.shields.io/badge/status-public_prototype-7c3aed)](#repository-status)

## A benchmark operations workspace for AI agent teams

Track benchmark scenarios, execution runs, safety decisions, lessons learned, and post-task reviews in one operational workspace.

</div>

---

## What you get

MavyClaw is a working benchmark ops application for teams running AI agents against real tasks.

It gives you:

- a structured scenario catalog
- run tracking with evidence and operator notes
- a lightweight safety gate before risky actions
- **approval workflow for risky runs**: runs that receive a `hold-for-approval` safety decision automatically enter `pending-approval` state, and operators can approve or reject them via the dashboard or API
- **approval queue view**: the Runs page shows a pending-approval count badge and filter chips so operators can quickly isolate runs waiting for a decision; the Dashboard shows a highlighted banner with a direct link when there are pending items
- **lightweight cost tracking**: agent activity can report token usage and estimated cost per operation via `POST /api/agent/cost-event`; the cost history is readable at `/api/cost-events` and summarized at `/api/cost-events/summary`; when events exist, the Dashboard shows a cost summary card with total tokens, estimated USD, and breakdown by model
- lessons learned and post-task reviews
- token-based agent ingest for machine-to-machine lifecycle updates
- a dashboard that reflects backend data and refreshes live after authenticated workspace changes, including a **recent activity feed** powered by the activity log API
- baseline session access with `viewer`, `editor`, and `admin` roles
- portable deployment paths for local development, VPS file mode, VPS PostgreSQL mode, and direct public binding when explicitly accepted

This repo is meant to be useful immediately, not just serve as a UI mockup.

## Why this repo matters

Most teams hit the same problems when they start benchmarking agents seriously:

- scenarios are scattered across chats, docs, and spreadsheets
- run history is inconsistent or incomplete
- risky decisions happen in chat and disappear later
- failures do not become reusable operational knowledge
- dashboards show output metrics but not process quality
- deployments work on one machine and become ambiguous for everyone else

MavyClaw gives you a baseline that already includes product structure, runtime verification, role protection, and a deployment contract for future operators or AI agents.

## Quick start

### One-command VPS bootstrap

For the default remote-access path that avoids the raw app port and publishes through Nginx on a separate public port, use:

```bash
sudo PUBLIC_PORT=3005 SESSION_SECRET_VALUE=<strong-secret> DEMO_AUTH_PASSWORD_VALUE=<strong-password> bash deploy/bootstrap-vps.sh
```

What this default path does:

- installs MavyClaw on the VPS
- keeps the app internal on `127.0.0.1:5000`
- runs the relevant smoke test before claiming success
- publishes the app through Nginx on a separate public port
- prints the final local and public URLs plus auth summary

If a provider firewall or security group still blocks the chosen public port, open that port on the VPS provider side after bootstrap.

### Requirements

- Node.js 20+
- npm 10+
- PostgreSQL only if you want the PostgreSQL runtime path

### Local development

```bash
git clone https://github.com/fathurrahmanhfz/MavyClaw.git
cd MavyClaw
npm install
cp .env.example .env
npm run dev
```

Open `http://127.0.0.1:5000`.

Default demo credentials from `.env.example`:

- username: `demo-admin`
- password: `demo-admin`

Change those credentials before any shared or public deployment.

### Production build

```bash
npm run build
npm run start
```

### Recommended verification

Run these in order:

```bash
npm run check
npm run build
npm run smoke:prod
npm run smoke:dev
curl http://127.0.0.1:5000/api/agent/status
```

If PostgreSQL is intentionally configured:

```bash
npm run smoke:postgres
```

## Product preview

### Dashboard

![MavyClaw dashboard preview](docs/assets/dashboard-screenshot.png)

The dashboard shows current runtime state, KPI summaries, recent activity, and live refresh behavior when authenticated users change workspace data.

### Benchmark runs

![MavyClaw benchmark runs preview](docs/assets/runs-screenshot.png)

The runs page tracks execution status, operator notes, and evidence in one place.

## Core workflow

1. Define benchmark scenarios.
2. Run work against a chosen scenario.
3. Record evidence, status, and operator notes.
4. Apply a safety gate before risky actions.
   - If the safety decision is `hold-for-approval`, the run enters `pending-approval` state.
   - An operator approves or rejects the run via `POST /api/runs/:id/approve` or `POST /api/runs/:id/reject`.
   - Approval resumes the run (`running`); rejection terminates it (`failed`).
5. Capture lessons learned from failures and near-misses.
6. Close the loop with a structured review.
7. Watch aggregate signals and the recent activity feed on the dashboard.

## Deployment profiles

| Profile | Best for | Storage | Publish strategy |
| --- | --- | --- | --- |
| Local development | Fast iteration | `memory` | local only |
| VPS file mode | Single-host durable setup | `file` | Nginx, Caddy, or tunnel |
| VPS PostgreSQL mode | Production-style persistence | `postgres` | Nginx, Caddy, or tunnel |
| Direct public binding | Short-lived evaluation only | `file` or `postgres` | public app port with explicit risk acceptance |

Ready-to-copy templates:

- `deploy/env.local.example`
- `deploy/env.vps-file.example`
- `deploy/env.vps-postgres.example`
- `deploy/env.public-direct.example`

## Safe remote access

The safest default is:

- bind the app internally with `HOST=127.0.0.1`
- keep `PORT=5000`
- publish through Nginx, Caddy, or Cloudflare Tunnel
- set `TRUST_PROXY=1` when HTTPS is terminated by a reverse proxy or tunnel
- leave `COOKIE_SECURE=auto` for proxy-aware session behavior
- avoid exposing the raw app port unless the operator explicitly accepts that risk

This repo already includes proxy-safe handling for the live dashboard stream on `/api/live`, so live refresh keeps working behind Nginx and Caddy.

## For AI agents

If an AI agent is given this repository URL, it should treat the repo as both:

- the application to install
- the deployment contract to follow
- the machine-to-machine ingest target for benchmark execution records

Minimum expected agent behavior:

1. Clone the repo and install dependencies.
2. Choose the intended runtime profile.
3. Copy the matching env template or `.env.example` into `.env`.
4. Set real credentials, a strong `SESSION_SECRET`, and `AGENT_INGEST_TOKEN`.
5. Run `npm run check`, `npm run build`, and the relevant smoke test.
6. Start the app behind a process supervisor for VPS deployments.
7. Verify `/api/health`, `/api/stats`, and `/api/agent/status` before claiming success.
8. Attach Nginx, Caddy, or a secure tunnel for remote browser access.
9. Use `npm run agent:ingest -- <event> --payload-file <file.json>` as the default write path for external agent workflows.
10. Validate the published route honestly.

Reference documents and helpers:

- [Deployment contract](docs/deployment-contract.md)
- [Agent setup playbook](docs/agent-setup-playbook.md)
- `AGENTS.md`
- `deploy/bootstrap-vps.sh`
- `deploy/publish-public-nginx.sh`
- `deploy/install-vps.sh`
- `deploy/register-nginx.sh`
- `deploy/register-caddy.sh`
- `deploy/verify-deployment.sh`
- `deploy/nginx/mavyclaw.conf.example`
- `deploy/caddy/Caddyfile.example`
- `deploy/cloudflare/cloudflared-config.example.yml`
- `deploy/systemd/mavyclaw.service.example`

## Runtime and auth

## Agent ingest

MavyClaw now includes a token-based ingest layer for external agent workflows.

Set these variables:

- `AGENT_INGEST_TOKEN` for bearer-token authentication to `/api/agent/*`
- `AGENT_INGEST_BASE_URL` as an optional helper default for external runners

Available endpoints:

- `POST /api/agent/run/start`
- `POST /api/agent/run/progress`
- `POST /api/agent/safety-check`
- `POST /api/agent/lesson`
- `POST /api/agent/review`
- `POST /api/agent/run/finish`
- `GET /api/agent/status`

Default helper:

```bash
npm run agent:ingest -- run-start --json '{"taskTitle":"Investigate staging issue"}'
```

### Storage modes

`STORAGE_BACKEND` accepts:

- `memory` for fast local iteration
- `file` for disk-backed persistence without PostgreSQL
- `postgres` for database-backed persistence

Runtime is visible through:

- `GET /api/health`
- `GET /api/stats`

### Auth modes

`AUTH_MODE` accepts:

- `demo` for guarded demo or single-operator setups
- `configured` for explicit environment-defined credentials
- `open` for intentionally open environments only

Roles:

- `viewer` is read-only
- `editor` can create and update workspace records
- `admin` can also import workspace data

## Important environment variables

Core variables:

- `NODE_ENV`
- `HOST`
- `PORT`
- `STORAGE_BACKEND`
- `DATA_FILE`
- `DATABASE_URL`
- `AUTH_MODE`
- `SESSION_SECRET`
- `TRUST_PROXY`
- `COOKIE_SECURE`
- `DEMO_AUTH_USERNAME`
- `DEMO_AUTH_PASSWORD`
- `DEMO_AUTH_ROLE`
- `AUTH_USERNAME`
- `AUTH_PASSWORD`
- `AUTH_ROLE`
- `AGENT_INGEST_TOKEN`
- `AGENT_INGEST_BASE_URL`

Production-style file example:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=5000
STORAGE_BACKEND=file
DATA_FILE=.runtime/mavyclaw-data.json
AUTH_MODE=demo
SESSION_SECRET=replace-with-a-long-random-secret
TRUST_PROXY=1
COOKIE_SECURE=auto
DEMO_AUTH_PASSWORD=replace-with-a-strong-password
```

Production-style PostgreSQL example:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=5000
STORAGE_BACKEND=postgres
DATABASE_URL=postgresql://user:password@host:5432/dbname
AUTH_MODE=demo
SESSION_SECRET=replace-with-a-long-random-secret
TRUST_PROXY=1
COOKIE_SECURE=auto
DEMO_AUTH_PASSWORD=replace-with-a-strong-password
```

## API surface

Current API routes include:

- `/api/health`
- `/api/session`
- `/api/session/login`
- `/api/session/logout`
- `/api/live`
- `/api/workspace/export`
- `/api/workspace/import`
- `/api/activity` — recent activity feed; supports `?entityType=`, `?entityId=`, `?limit=` filters
- `/api/activity/:id`
- `/api/scenarios` (GET, POST, PATCH)
- `/api/runs` (GET, POST, PATCH)
- `/api/runs/:id/cancel` — cancel any non-terminal run
- `/api/runs/:id/approve` — approve a `pending-approval` run; transitions to `running`
- `/api/runs/:id/reject` — reject a `pending-approval` run; transitions to `failed`
- `/api/safety-checks` (GET, POST)
- `/api/lessons` (GET, POST, PATCH)
- `/api/reviews` (GET, POST, PATCH)
- `/api/stats`
- `/api/agent/status`
- `/api/agent/run/start`
- `/api/agent/run/progress`
- `/api/agent/run/finish`
- `/api/agent/safety-check`
- `/api/agent/lesson`
- `/api/agent/review`
- `/api/agent/cost-event` — report token usage and cost for an agent operation
- `/api/cost-events` — list recent cost events; supports `?runId=<id>&limit=N`
- `/api/cost-events/summary` — aggregate totals by model and provider; supports `?runId=<id>`
- `/api/cost-events/:id`

### Approval workflow

When a safety check is submitted with `decision: "hold-for-approval"` (via the UI or agent ingest), the linked run automatically transitions to `pending-approval` status. From there:

```bash
# Approve — resumes the run (status → running)
curl -X POST http://127.0.0.1:5000/api/runs/<runId>/approve \
  -H 'Content-Type: application/json' \
  -b <session-cookie> \
  -d '{"note": "Reviewed and approved"}'

# Reject — terminates the run (status → failed)
curl -X POST http://127.0.0.1:5000/api/runs/<runId>/reject \
  -H 'Content-Type: application/json' \
  -b <session-cookie> \
  -d '{"note": "Too risky for current environment"}'
```

Both endpoints require the `editor` role. Attempting to approve or reject a run that is not in `pending-approval` returns `409`. The decision and note are written to the activity log and visible in the run detail view.

## Technical highlights

- TypeScript full-stack application
- React frontend with Vite
- Express backend
- TanStack Query for data fetching
- Zod-based request validation
- session auth with role-based write protection
- live dashboard refresh through `/api/live`; the activity feed also refreshes live when authenticated
- lightweight approval workflow: `pending-approval` run state, approve/reject endpoints, automatic transition on `hold-for-approval` safety checks
- approval queue improvements: filter chips and pending-approval count badge on the Runs page, highlighted banner with a direct link on the Dashboard
- lightweight cost tracking: `cost_events` table; agent and manual ingest via `POST /api/agent/cost-event` or `POST /api/cost-events`; read via `GET /api/cost-events` and `GET /api/cost-events/summary`; cost summary exposed in `/api/stats` and rendered as a Dashboard card when events exist
- dashboard recent activity feed reading from `/api/activity` with live refresh on `activity-log-created` SSE events
- PostgreSQL runtime auto-activation when `DATABASE_URL` is present unless overridden
- file-backed persistence fallback for production-style setups without PostgreSQL
- workspace export and import for portability
- repeatable smoke tests for development, file runtime, and PostgreSQL runtime (includes approval workflow and cost tracking coverage)
- CI for typecheck, build, and smoke validation

## Project structure

```text
client/        React frontend
server/        Express API and runtime entrypoint
shared/        Shared schema and types
docs/assets/   Public README screenshots
script/        Build and verification scripts
deploy/        VPS, proxy, env, and verification helpers
```

## Public docs

- [Deployment contract](docs/deployment-contract.md)
- [Agent setup playbook](docs/agent-setup-playbook.md)
- [Contributing guide](CONTRIBUTING.md)
- [Roadmap](ROADMAP.md)

## Repository status

MavyClaw is already usable today for:

- internal benchmark operations work
- guarded operator workflows
- demos and product exploration
- VPS-hosted remote browser access through a safer reverse-proxy path
- extension into a more tailored internal system

Remaining maturity work still available:

- richer analytics and reporting
- stronger production packaging and environment management
- formal database migrations and stricter relational constraints
- deeper multi-user administration and enterprise access control

## Safety note

Do not point experimental database changes or risky operational actions at production without explicit verification and approval.

## License

MIT
