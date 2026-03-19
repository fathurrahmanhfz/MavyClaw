# MavyClaw

<div align="center">

**A benchmark operations workspace for AI agent teams**

Organize scenarios, track runs, review safety decisions, capture lessons learned, and close the loop with structured post-task reviews.

</div>

---

## What MavyClaw is

MavyClaw is a benchmark ops workspace for teams that have outgrown ad hoc benchmarking in chat threads, scattered docs, and one-off spreadsheets.

If your team runs agent benchmarks, records execution outcomes, makes safety-sensitive decisions, reviews failures, and wants reusable operational memory, MavyClaw gives you a concrete starting point instead of a blank canvas.

## Why this repo is worth installing

Most agent teams eventually run into the same problems:

- benchmark scenarios live in too many places
- run history is incomplete or inconsistent
- safety decisions happen in chat and disappear later
- lessons from failures do not become reusable process knowledge
- post-task reviews have no standard format
- dashboards are built too late, after the data is already messy

MavyClaw brings those workflows into one app with a structure that is already useful on day one.

This repository is valuable if you want to stand up an internal benchmark operations workspace quickly, understand the shape of a practical agent ops tool, or use it as a foundation for a more tailored system.

## At a glance

| Area | What it covers |
| --- | --- |
| Scenario catalog | Structured benchmark scenarios with objectives, acceptance criteria, safe steps, anti-patterns, and verification targets |
| Benchmark runs | Run creation, status tracking, operator notes, evidence, and safety decision linkage |
| Safety gate | Pre-action review for environment, action mode, affected assets, recovery path, and gate decision |
| Lessons learned | Failure context, symptoms, root cause, impact, prevention, and promotion level |
| Post-task review | Final result, verification evidence, what worked, what failed, near-miss, and safest next step |
| Dashboard | Operational summary across scenarios, runs, lessons, reviews, safety checks, and recent benchmark activity |

## Core workflow

MavyClaw is built around a simple operational loop:

1. Define benchmark scenarios.
2. Run the benchmark against a chosen scenario.
3. Record status, operator notes, and evidence.
4. Apply a safety gate before risky actions.
5. Capture lessons learned from failures or near-misses.
6. Complete a structured post-task review.
7. Monitor aggregate signals from the dashboard.

---

## Features

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

## Who this is for

MavyClaw is a strong fit for:

- AI agent ops teams
- evaluation and benchmarking teams
- internal tooling teams
- engineering managers who want clearer operational evidence
- teams designing safer workflows for agent execution

It is a poor fit if you are specifically looking for a fully finished enterprise platform with production persistence, auth, role management, and complete multi-user workflows already in place.

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

## Repository status

This public repository is currently best described as a polished public prototype.

What is already in place:
- working frontend and backend app structure
- seeded sample data for immediate exploration
- structured operational workflows across scenarios, runs, safety, lessons, and reviews
- API payload validation for create and update flows
- health endpoint for runtime checks
- public CI for typecheck and production build

What is not finished yet:
- database-backed persistence as the default runtime
- authentication and multi-user support
- broader automated test coverage beyond the current quality gate
- full production hardening

That means the repo is already useful for internal evaluation, demos, product exploration, and extension work, but it should not be presented as a finished production platform.

## Technical highlights

- TypeScript full-stack application
- React frontend with Vite
- Express API backend
- TanStack Query for data fetching
- Tailwind CSS and Radix UI for interface primitives
- Drizzle ORM schema foundation
- PostgreSQL-compatible database path prepared for future persistence
- Zod-based request validation
- GitHub Actions CI for typecheck and build

---

## Project structure

```text
client/   React frontend
server/   Express API and runtime entrypoint
shared/   Shared schema and types
script/   Build scripts
```

## Quick start

### Requirements

- Node.js 20+
- npm 10+

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
- `DATABASE_URL`

Example:

```env
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

Important note:

The current public snapshot still runs without an active database because the default runtime uses seeded in-memory storage. `DATABASE_URL` is included as part of the path toward PostgreSQL-backed persistence.

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

The API currently includes basic payload validation for create and update flows, plus runtime health reporting.

## Design principles behind the repo

MavyClaw is built around a few practical ideas:

- benchmark work should be structured, not improvised
- safety review should be visible, not implicit
- failures should become reusable knowledge
- post-task reflection should produce operational improvement
- dashboards should reflect process data, not just output metrics

---

## Current limitations

Before adopting the repo more broadly, keep these limits in mind:

- runtime data is not yet persisted by default
- there is no authentication layer yet
- there is no role or permission model yet
- the current quality gate is useful but still minimal
- some production concerns remain intentionally out of scope for the public prototype stage

## Suggested next extensions

Teams adopting MavyClaw will likely want to add:

- PostgreSQL-backed persistence
- auth and role-based access
- benchmark import/export flows
- richer run analytics
- approval workflows
- attachments or richer evidence handling
- stronger automated test coverage
- production deployment and environment management

## Safety note

Do not point experimental database changes or risky operational actions at production without explicit verification and approval.

## License

MIT
