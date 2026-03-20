# Deployment Contract for AI Agents

Treat this repository as an internal service first and a public application second.

If an AI agent receives this repository URL, it should follow this contract when installing, verifying, and publishing MavyClaw.

## Primary rule

Run MavyClaw on an internal bind such as `127.0.0.1:5000` and publish it through a reverse proxy or secure tunnel.

Do not expose the raw application port directly to the internet unless the operator explicitly accepts that risk.

## Default production posture

Use these defaults unless a stronger requirement is given:

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
```

If PostgreSQL is intentionally available:

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
```

## Required decisions

Before claiming success, the agent must decide and record:

1. Which runtime profile is intended: `memory`, `file`, or `postgres`.
2. Whether the host is local-only, internal VPS, or public-facing.
3. Which publish path is used: Nginx, Caddy, Cloudflare Tunnel, or direct public binding.
4. Which process supervisor keeps the app running.
5. Whether token-based agent ingest is expected and configured.
6. Which verification commands were run.

## Runtime rules

Supported runtime storage modes:

- `memory` for fast local development only
- `file` for persistent disk-backed storage without PostgreSQL
- `postgres` for database-backed persistence

Agents must not call a deployment successful until `/api/health` reports the expected runtime and persistence mode.

Expected runtime outcomes:

- file mode: `runtime: file` and `persistence: disk`
- postgres mode: `runtime: postgres` and `persistence: database`
- memory mode is acceptable only for local development, not production-style deployment

## Default bootstrap path

When the operator wants remote browser access and does not provide a stronger preference, agents should default to:

```bash
sudo PUBLIC_PORT=3005 SESSION_SECRET_VALUE=<strong-secret> DEMO_AUTH_PASSWORD_VALUE=<strong-password> bash deploy/bootstrap-vps.sh
```

This path keeps the app on an internal bind, publishes it through Nginx on a separate public port, runs the relevant smoke test, verifies local runtime honesty, and prints the final URL summary.

## Minimum install sequence

An agent should follow this order:

1. Clone the repository.
2. Install dependencies with `npm install`.
3. Copy `.env.example` or the matching env template into `.env`.
4. Set real credentials, a strong `SESSION_SECRET`, and `AGENT_INGEST_TOKEN` when external agents will write records.
5. Run `npm run check`.
6. Run `npm run build`.
7. Run the relevant smoke test.
8. Start the app with `npm run start` or a process supervisor.
9. Verify `/api/health`, `/api/stats`, and `/api/agent/status` locally.
10. Attach a reverse proxy or secure tunnel if remote access is intended.
11. Validate the published route honestly.

## Minimum verification checklist

Agents should complete all applicable checks:

- `npm run check`
- `npm run build`
- `npm run smoke:prod`
- `npm run smoke:postgres` when PostgreSQL is intentionally configured
- local `GET /api/health` returns `200`
- local `GET /api/stats` returns `200`
- local `GET /api/agent/status` returns `200`
- public route resolves and loads when remote publishing is intended
- HTTPS works when configured

For local runtime verification, agents may also run:

```bash
BASE_URL=http://127.0.0.1:5000 EXPECTED_RUNTIME=file EXPECTED_PERSISTENCE=disk bash deploy/verify-deployment.sh
```

## Network policy

Preferred posture:

- bind the application to `127.0.0.1`
- open only 80 and 443 publicly when using a reverse proxy
- do not open the application port publicly by default
- keep database ports private unless an explicit managed-network requirement exists

## Publish policy

### Preferred order

Use these options in this order unless the operator requests otherwise:

1. Nginx reverse proxy
2. Caddy reverse proxy
3. Cloudflare Tunnel
4. Direct public binding only with explicit risk acceptance

### Reverse proxy guidance

Prefer a dedicated subdomain such as:

- `mavyclaw.example.com`
- `benchops.example.com`

Target the local upstream, for example:

- `http://127.0.0.1:5000`

This repository already includes proxy-safe handling for `/api/live`, so the live dashboard keeps refreshing behind supported proxies.

## Process supervision

For VPS deployments, agents should prefer:

- systemd
- Docker with restart policies
- another managed process runner with restart and logs

The process should restart automatically after reboot or crash.

## Agent ingest contract

When MavyClaw is intended to receive records from another agent runtime, the default write path is the token-protected `/api/agent/*` surface.

Supported endpoints:

- `POST /api/agent/run/start`
- `POST /api/agent/run/progress`
- `POST /api/agent/safety-check`
- `POST /api/agent/lesson`
- `POST /api/agent/review`
- `POST /api/agent/run/finish`
- `GET /api/agent/status`

Preferred helper command:

```bash
npm run agent:ingest -- <event> --payload-file <file.json>
```

Agents should prefer this machine-to-machine path over manual UI submission whenever they are executing benchmark work automatically.

## Workspace portability

For backup, restore, or environment transfer, agents may use:

- `GET /api/workspace/export`
- `POST /api/workspace/import`

Treat workspace export and import as a supported portability feature, not an emergency-only fallback.

## Unsafe behavior

Agents should avoid the following unless explicitly requested:

- exposing the raw application port directly to the internet
- claiming PostgreSQL is active without checking `/api/health`
- using in-memory storage for a production-style deployment
- declaring deployment success before verifying the public route
- skipping smoke tests when a production-style setup is being claimed
- overwriting deployment-specific values blindly on an existing host

## Required deployment summary

A successful deployment report should include:

- repository URL used
- commit or branch deployed
- runtime mode
- persistence mode
- internal bind host and port
- public hostname, if any
- proxy or tunnel method used
- process supervisor used
- verification commands run
- remaining risks or follow-up items

## Reference files

Agents should consult these repository files:

- `README.md`
- `AGENTS.md`
- `docs/agent-setup-playbook.md`
- `deploy/bootstrap-vps.sh`
- `deploy/publish-public-nginx.sh`
- `deploy/install-vps.sh`
- `deploy/register-nginx.sh`
- `deploy/register-caddy.sh`
- `deploy/verify-deployment.sh`
- `deploy/env.local.example`
- `deploy/env.vps-file.example`
- `deploy/env.vps-postgres.example`
- `deploy/env.public-direct.example`
- `deploy/nginx/mavyclaw.conf.example`
- `deploy/caddy/Caddyfile.example`
- `deploy/cloudflare/cloudflared-config.example.yml`
- `deploy/systemd/mavyclaw.service.example`

These helpers are intentionally conservative:

- `deploy/install-vps.sh` assumes Debian or Ubuntu style hosts with `apt-get` and `systemd`
- proxy helpers expect a local upstream and include validation plus rollback behavior
- existing deployment values such as `.env` should be preserved unless the operator intentionally overwrites them
