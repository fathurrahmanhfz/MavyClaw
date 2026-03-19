# MavyClaw

MavyClaw is an open-source benchmark operations workspace for AI agent teams that need structured scenario tracking, run monitoring, safety review workflows, lesson capture, and operational review dashboards.

MavyClaw helps teams evaluate agent readiness, document execution quality, review operational risks, and organize benchmark evidence in one interface built with React, TypeScript, Express, and PostgreSQL-ready data models.

## Why MavyClaw

MavyClaw is designed for teams that want more than a simple chat interface. It provides a practical control surface for benchmark-oriented agent operations, with a workflow centered on scenarios, runs, safety gates, reviews, and lessons learned.

Key benefits:
- Structured benchmark scenario catalog for realistic agent testing
- Run tracking for execution history and operational notes
- Safety gate workflow before risky actions
- Lesson capture for failure analysis and continuous improvement
- Review records for quality assessment and governance
- Dashboard view for operational visibility and recent benchmark activity
- Modern TypeScript full-stack architecture suitable for iteration and extension

## Core features

### Scenario catalog
MavyClaw includes a scenario catalog interface for organizing benchmark scenarios by title, description, category, difficulty, and readiness. This helps teams prepare realistic AI agent evaluation cases instead of relying on ad hoc prompts.

### Run monitoring
The run workflow supports tracking individual benchmark runs, reviewing statuses, and attaching operational notes. This makes it easier to analyze how an agent behaved across repeated trials.

### Safety gate center
MavyClaw includes a Safety Gate Center for evaluating target environment, action mode, affected assets, minimum verification requirements, recovery path, and approval decisions before risky actions move forward.

### Lessons learned repository
Teams can document lessons and error categories so benchmark failures become reusable operational knowledge instead of one-off incidents.

### Reviews and operational visibility
MavyClaw includes review flows and a dashboard that summarizes scenarios, runs, lessons, reviews, safety checks, run status distribution, lesson status distribution, and error categories.

## Product workflow

A typical MavyClaw workflow looks like this:
1. Create or curate benchmark scenarios.
2. Run the agent against selected scenarios.
3. Record run status and notes.
4. Apply safety gate review before risky changes.
5. Capture lessons learned and classify failures.
6. Store review results and monitor the dashboard.

## Tech stack

- React 18
- TypeScript
- Vite
- Express 5
- TanStack Query
- Tailwind CSS
- Radix UI
- Drizzle ORM
- PostgreSQL-compatible database

## Architecture overview

MavyClaw uses a TypeScript full-stack structure with:
- `client/` for the React frontend
- `server/` for the Express API and runtime entrypoint
- `shared/` for shared schema definitions
- `script/` for build scripts

The API exposes resources for:
- scenarios
- runs
- safety checks
- lessons
- reviews
- dashboard stats

## Who MavyClaw is for

MavyClaw is a strong fit for:
- AI ops teams
- agent evaluation teams
- benchmark and QA workflows
- internal tooling teams
- engineering managers who need structured operational evidence
- teams building safer agent deployment workflows

## Quick start

### Requirements
- Node.js 20+
- npm 10+
- PostgreSQL-compatible database for development or testing

### Local setup
1. Clone the repository.
2. Copy `.env.example` to `.env`.
3. Fill in `DATABASE_URL` with a safe non-production database.
4. Run `npm install`.
5. Run `npm run dev`.

### Production-like build
```bash
npm run build
npm run start
```

## Environment variables

Required minimum environment variable:
- `DATABASE_URL`

Example:
```env
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

## Database safety

This project includes Drizzle configuration and expects a valid `DATABASE_URL`. Do not run database-changing commands against production without explicit approval and verification.

## What is included in this public repository

- Public source code snapshot
- Frontend and backend application code
- Shared schema and build scripts
- Public setup instructions
- Environment template

## What is intentionally excluded

- Secrets and credentials
- Personal recovery materials
- Internal restoration artifacts
- Paperclip-related deployment work
- Installed dependencies and build outputs

## Extending MavyClaw

You can extend MavyClaw by:
- adding richer benchmark taxonomies
- integrating external agent run sources
- adding approval workflows
- building analytics for benchmark trends
- connecting deployment and verification pipelines

## SEO and discoverability summary

MavyClaw is positioned as an open-source AI agent benchmark operations workspace, AI ops dashboard, agent evaluation system, safety review workflow, and lessons learned tracker for benchmark-driven teams.

## License

MIT

## FAQ

### What is MavyClaw?
MavyClaw is an open-source benchmark operations workspace for AI agent teams that need structured tracking for scenarios, runs, safety checks, lessons, and reviews.

### Is MavyClaw a chat agent?
No. MavyClaw is better described as an operational workspace and dashboard for agent benchmarking, oversight, and evaluation.

### Can I use MavyClaw with my own database?
Yes. MavyClaw is designed to work with a PostgreSQL-compatible database via `DATABASE_URL`.

### Is this repository safe to share publicly?
Yes. This public package excludes secrets, internal recovery artifacts, and private restoration materials.
