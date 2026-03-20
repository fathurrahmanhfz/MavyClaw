# MavyClaw

<div align="center">

[![CI](https://github.com/fathurrahmanhfz/MavyClaw/actions/workflows/ci.yml/badge.svg)](https://github.com/fathurrahmanhfz/MavyClaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-Full--stack-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Status](https://img.shields.io/badge/status-public_prototype-7c3aed)](#repository-status)

## A benchmark operations workspace for AI agent teams

Organize benchmark scenarios, track runs, review safety decisions, capture lessons learned, and close the loop with structured post-task reviews.

</div>

---

## What MavyClaw is

MavyClaw is a benchmark operations workspace for teams that have outgrown ad hoc benchmarking in chat threads, scattered notes, and one-off spreadsheets.

If your team runs agent benchmarks, evaluates execution quality, makes safety-sensitive decisions, reviews failures, and wants reusable operational memory, MavyClaw gives you a concrete starting point instead of a blank canvas.

## Why this repo matters

Most agent teams eventually run into the same problems:

- benchmark scenarios live in too many places
- run history is incomplete or inconsistent
- safety decisions happen in chat and disappear later
- lessons from failures never become reusable process knowledge
- post-task reviews have no standard format
- dashboards are built too late, after the operational data is already messy

MavyClaw pulls those workflows into one app with a structure that is already useful from the start.

This repository is valuable if you want to:
- stand up an internal benchmark ops workspace quickly
- understand the shape of a practical agent operations product
- use a real working baseline instead of inventing the entire model from scratch
- extend a lightweight prototype into a more tailored internal system

---

## Quick value snapshot

| You need | MavyClaw gives you |
| --- | --- |
| A place to define evaluation scenarios | A structured scenario catalog with objectives, acceptance criteria, safe steps, anti-patterns, and evidence targets |
| A better way to record benchmark execution | Benchmark runs with statuses, operator notes, evidence, and linked safety decisions |
| A pre-action safety workflow | Safety checks for environment, action mode, affected assets, recovery path, and gate decision |
| A place to retain failure knowledge | Lessons learned with taxonomy, root cause, prevention, and promotion level |
| A consistent review format | Post-task reviews with final result, evidence, what worked, what failed, and safest next step |
| A fast operational overview | Dashboard summaries across scenarios, runs, lessons, reviews, safety checks, and recent activity |

## Core workflow

MavyClaw is built around a simple operational loop:

1. Define benchmark scenarios.
2. Run the benchmark against a selected scenario.
3. Record status, evidence, and operator notes.
4. Apply a safety gate before risky actions.
5. Capture lessons learned from failures or near-misses.
6. Complete a structured post-task review.
7. Monitor aggregate signals from the dashboard.

---

## Product preview

### Dashboard

![MavyClaw dashboard preview](docs/assets/dashboard-screenshot.png)

The dashboard gives a fast operational read on scenario volume, run activity, lessons, reviews, safety checks, and recent benchmark movement.

### Benchmark runs

![MavyClaw benchmark runs preview](docs/assets/runs-screenshot.png)

The runs page makes it easier to review benchmark execution history, execution status, operator notes, and linked evidence in one place.

---

## Feature map

### Scenario catalog
Create and review benchmark scenarios with fields that are actually useful in operational work:

- title and description
- category and difficulty
- readiness state
- objective
- acceptance criteria
- safe steps
- anti-patterns
- verification checklist
- target evidence
- primary risk

### Benchmark runs
Track the lifecycle of benchmark execution from planning to outcome.

You can:
- create a new run
- assign it to a scenario
- update run status
- store operator notes
- attach evidence
- sync safety decisions to related runs

### Safety gate
Use a lightweight safety review before actions with real operational risk.

Safety checks include:
- target environment
- action mode
- affected assets
- minimum verification
- recovery path
- gate decision
- decision rationale

### Lessons learned
Turn failures into reusable knowledge instead of isolated incidents.

Lessons can capture:
- context
- symptom
- root cause
- impact
- prevention
- status
- taxonomy
- promotion level

### Post-task review
Close the loop with a structured review record.

Reviews include:
- task goal
- final result
- result status
- verification evidence
- what worked
- what failed
- near-miss
- safest next step

### Dashboard
Get a fast operational read on the workspace through:
- total scenarios
- total runs
- total lessons
- total reviews
- total safety checks
- run status distribution
- lesson status distribution
- error category breakdown
- recent benchmark runs

---

## Example use cases

MavyClaw is especially useful for teams that want to operationalize work like:

- benchmarking internal coding agents across realistic engineering scenarios
- tracking infrastructure troubleshooting runs and their outcomes
- reviewing risky write operations before execution
- capturing repeated operational failures and turning them into reusable playbooks
- building a safer review loop around benchmark-driven agent deployment
- creating internal evidence trails for evaluation and iteration

## Who this is for

MavyClaw is a strong fit for:

- AI agent ops teams
- evaluation and benchmarking teams
- internal tooling teams
- engineering managers who want clearer operational evidence
- teams designing safer workflows for agent execution

It is a poor fit if you are specifically looking for a fully finished enterprise platform with production persistence, authentication, role management, and complete multi-user workflows already built out.

## Why not just start from scratch

Starting from scratch sounds clean, but in practice it often leads to:

- inconsistent terminology across teams
- unclear run states
- weak or missing safety review practices
- lessons that never become process improvements
- dashboards bolted on too late
- no stable operational data model

MavyClaw gives you a ready-made structure that you can run, inspect, and extend immediately.

---

## Architecture at a glance

```text
                        +----------------------+
                        |      Dashboard       |
                        | stats, status, recaps|
                        +----------+-----------+
                                   |
                                   v
+----------------+      +----------+-----------+      +-------------------+
|   Scenarios    | ---> |      Benchmark Runs  | <--- |    Safety Gate    |
| catalog + risk |      | status, notes, proof |      | review + decision |
+----------------+      +----------+-----------+      +-------------------+
                                   |
                                   v
                        +----------+-----------+
                        | Lessons + Reviews    |
                        | memory + closure     |
                        +----------------------+
```

## Repository status

MavyClaw is already a usable benchmark ops workspace, not just a mock interface.

### Strong today

- working frontend and backend application structure
- seeded workspace data for immediate exploration
- structured flows across scenarios, runs, safety checks, lessons, and reviews
- request validation for create and update flows
- runtime visibility through `/api/health` and `/api/stats`
- file-backed persistence for production-style runs
- repeatable smoke tests for development and production runtime checks
- CI that runs typecheck, build, and smoke validation

### Next maturity step

- PostgreSQL-backed persistence is still not wired in, even if `DATABASE_URL` is set
- authentication and multi-user collaboration are still missing
- scenario-specific test depth can still go further
- full production hardening remains future work

That makes the repo strong for internal evaluation, demos, product exploration, and extension work today, while still leaving clear room for a more enterprise-ready next version.

---

## Technical highlights

- TypeScript full-stack application
- React frontend with Vite
- Express API backend
- TanStack Query for data fetching
- Tailwind CSS and Radix UI for interface primitives
- Zod-based request validation
- runtime-aware health and stats endpoints
- file-backed persistence for production-style runs
- GitHub Actions CI for typecheck, build, and smoke validation

## Project structure

```text
client/        React frontend
server/        Express API and runtime entrypoint
shared/        Shared schema and types
docs/assets/   Public README screenshots
script/        Build scripts
```

---

## Quick start

### Requirements

- Node.js 20+
- npm 10+
- PostgreSQL-compatible database only if you want to continue the future Drizzle/Postgres path

### Local setup

```bash
git clone https://github.com/fathurrahmanhfz/MavyClaw.git
cd MavyClaw
npm install
cp .env.example .env
npm run dev
```

### Production build

```bash
npm run build
npm run start
```

## Environment variables

Supported environment variables:

- `PORT`
- `NODE_ENV`
- `STORAGE_BACKEND`
- `DATA_FILE`
- `DATABASE_URL`

Example:

```env
NODE_ENV=development
PORT=5000
STORAGE_BACKEND=memory
DATA_FILE=.runtime/mavyclaw-data.json
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

Important note:

Development defaults to seeded in-memory storage for fast iteration. Production-style runs now default to file-backed persistence, which keeps created records across restarts. `DATABASE_URL` is still reserved for the future PostgreSQL-backed runtime and does not switch persistence by itself yet.

---

## API notes

Current API surface includes routes for:

- `/api/health`
- `/api/scenarios`
- `/api/runs`
- `/api/safety-checks`
- `/api/lessons`
- `/api/reviews`
- `/api/stats`

The API currently includes basic payload validation for create and update flows, plus runtime health and persistence reporting through `/api/health` and `/api/stats`.

## Public docs

Additional public repo documents:

- [Contributing guide](CONTRIBUTING.md)
- [Roadmap](ROADMAP.md)

## Design principles

MavyClaw is built around a few practical ideas:

- benchmark work should be structured, not improvised
- safety review should be visible, not implicit
- failures should become reusable knowledge
- post-task reflection should produce operational improvement
- dashboards should reflect process data, not just output metrics

---

## Current limitations

Before adopting the repo more broadly, keep these limits in mind:

- development still defaults to in-memory runtime for speed
- PostgreSQL-backed persistence is not implemented yet
- authentication and role-based access are not in place yet
- some production concerns remain intentionally out of scope for the current public stage

## Suggested next extensions

Teams adopting MavyClaw will likely want to add:

- PostgreSQL-backed persistence
- auth and role-based access
- benchmark import and export flows
- richer run analytics
- approval workflows
- attachments or richer evidence handling
- richer scenario-specific automated test coverage
- production deployment and environment management

## Safety note

Do not point experimental database changes or risky operational actions at production without explicit verification and approval.

## License

MIT
