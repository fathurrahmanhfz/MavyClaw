# Deployment Contract for AI Agents

This repository should be treated as an internal service first and a public application second.

AI agents that receive this repository URL are expected to follow this contract when installing, running, or publishing MavyClaw on a VPS, cloud VM, container host, or similar environment.

## Primary rule

Run MavyClaw on an internal port and publish it through a reverse proxy or secure tunnel.

Do not expose the application port directly to the public internet unless the operator explicitly accepts that risk.

## Runtime contract

The application supports three runtime storage modes:

- `memory` for fast local iteration
- `file` for persistent disk-backed storage without PostgreSQL
- `postgres` for database-backed persistence

Runtime behavior must be verified through these endpoints after startup:

- `GET /api/health`
- `GET /api/stats`

Agents must not claim a successful deployment until `/api/health` reports the expected runtime and persistence mode.

## Required environment decisions

Agents must set or evaluate these environment variables:

- `NODE_ENV`
- `PORT`
- `HOST`
- `STORAGE_BACKEND`
- `DATA_FILE`
- `DATABASE_URL`

Recommended production defaults:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=5000
STORAGE_BACKEND=file
DATA_FILE=.runtime/mavyclaw-data.json
```

If PostgreSQL is available and intended, agents should prefer:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=5000
STORAGE_BACKEND=postgres
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

## Binding and network policy

### Safe default

Use `HOST=127.0.0.1` so the application is reachable only from the local machine or reverse proxy.

### Public publishing

For public access, publish MavyClaw through one of these:

- Nginx reverse proxy
- Caddy reverse proxy
- secure tunnel such as Cloudflare Tunnel

### Firewall expectation

Agents should prefer this network posture:

- open only 80 and 443 publicly when using a reverse proxy
- do not open the application port publicly
- keep database ports private unless there is an explicit managed-network requirement

## Startup sequence for agents

An agent installing this repository should follow this order:

1. Clone the repository.
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env` and set production-safe values.
4. Build with `npm run build`.
5. Start the application with `npm run start` or a process manager.
6. Verify `GET /api/health` locally.
7. Verify `GET /api/stats` locally.
8. Attach the app to a reverse proxy or secure tunnel.
9. Validate the public route.
10. Record the final runtime mode, persistence mode, public hostname, and process supervisor.

## Minimum verification checklist

Agents should complete all of the following before declaring success:

- `npm run check`
- `npm run build`
- `npm run smoke:prod`
- `npm run smoke:postgres` when PostgreSQL is intentionally configured
- local `GET /api/health` returns `200`
- local `GET /api/stats` returns `200`
- the public hostname resolves correctly
- the reverse proxy returns the application successfully over HTTPS when configured

## Reverse proxy expectations

### Subdomain-first policy

Prefer a dedicated subdomain such as:

- `mavyclaw.example.com`
- `benchops.example.com`

This is preferred over path-based routing because it avoids frontend asset, cookie, and header confusion for generic AI agent deployments.

### Internal upstream target

Agents should target the local service, for example:

- `http://127.0.0.1:5000`

## Persistence rules

### PostgreSQL path

Use PostgreSQL when durable relational persistence is available and intended.

Agents must confirm that `/api/health` reports:

- `runtime: postgres`
- `persistence: database`

### File fallback path

When PostgreSQL is not available, file-backed persistence is the preferred production fallback.

Agents must confirm that `/api/health` reports:

- `runtime: file`
- `persistence: disk`

The data file path should be preserved across restarts and included in backup policy.

### Workspace portability

For backup, migration, or environment transfer, agents may use:

- `GET /api/workspace/export`
- `POST /api/workspace/import`

Agents should treat workspace export/import as a supported portability mechanism, not as an emergency-only fallback.

## Process supervision

For VPS deployments, agents should prefer a supervisor such as:

- systemd
- Docker with restart policies
- another managed process runner with auto-restart and logs

The process should restart automatically after reboot or crash.

## Logging expectations

Agents should preserve:

- application stdout and stderr logs
- reverse proxy access logs when available
- reverse proxy error logs when available

## Unsafe behavior to avoid

Agents should avoid the following unless explicitly requested:

- exposing the raw application port directly to the internet
- claiming PostgreSQL is active without checking `/api/health`
- using in-memory storage for a production-style deployment
- pointing experimental writes at production databases without explicit approval
- declaring deployment success before verifying the public URL

## Human-readable deployment outcome

A successful agent deployment report should include:

- runtime mode
- persistence mode
- internal bind host and port
- public hostname
- reverse proxy or tunnel type
- process supervisor used
- verification commands run
- remaining risks or follow-up items

## Repository reference files

Agents should also consult:

- `deploy/install-vps.sh`
- `deploy/register-nginx.sh`
- `deploy/register-caddy.sh`
- `deploy/nginx/mavyclaw.conf.example`
- `deploy/caddy/Caddyfile.example`
- `deploy/cloudflare/cloudflared-config.example.yml`
- `deploy/systemd/mavyclaw.service.example`
- `docs/agent-setup-playbook.md`
- `README.md`

These helpers are conservative on purpose:

- `deploy/install-vps.sh` assumes a Debian or Ubuntu style host with `apt-get` and `systemd`
- `deploy/register-nginx.sh` and `deploy/register-caddy.sh` expect a local upstream and include validation plus rollback behavior
- existing deployment-specific values such as `.env` should be preserved unless the operator intentionally overwrites them
