# Agent Setup Playbook

This playbook explains how an AI agent should install, verify, and publish MavyClaw on a VPS or similar host.

Use this document together with:

- `docs/deployment-contract.md`
- `deploy/nginx/mavyclaw.conf.example`
- `deploy/caddy/Caddyfile.example`
- `deploy/cloudflare/cloudflared-config.example.yml`
- `deploy/systemd/mavyclaw.service.example`

## Goal

Given only the repository URL, an agent should be able to:

- install the application safely
- choose a persistence mode intentionally
- publish it in a secure way
- verify the runtime honestly
- leave the system in a maintainable state

## Decision order

The agent should decide in this order:

1. What host is this running on?
2. Is the target local development, internal VPS, or production-style public deployment?
3. Is PostgreSQL available and intended?
4. Should publishing use Nginx, Caddy, or Cloudflare Tunnel?
5. What process supervisor will keep the app running?
6. What verification can be run before declaring success?

## Recommended default choices

If no stronger requirement is provided, the safest defaults are:

- `NODE_ENV=production`
- `HOST=127.0.0.1`
- `PORT=5000`
- `STORAGE_BACKEND=file`
- `DATA_FILE=.runtime/mavyclaw-data.json`
- publish through Nginx, Caddy, or Cloudflare Tunnel
- supervise with systemd on a VPS

## Setup procedure

### 1. Clone and install

```bash
git clone https://github.com/fathurrahmanhfz/MavyClaw.git
cd MavyClaw
npm install
cp .env.example .env
```

### 2. Set environment values

For a production-style VPS with file persistence:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=5000
STORAGE_BACKEND=file
DATA_FILE=.runtime/mavyclaw-data.json
```

For a PostgreSQL-backed deployment:

```env
NODE_ENV=production
HOST=127.0.0.1
PORT=5000
STORAGE_BACKEND=postgres
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

### 3. Build and verify locally

```bash
npm run check
npm run build
npm run smoke:prod
```

If PostgreSQL is intended:

```bash
npm run smoke:postgres
```

### 4. Start the service

For a manual check:

```bash
npm run start
```

For a persistent VPS deployment, prefer a service manager such as systemd.

### 5. Verify runtime honesty

The agent must verify:

```bash
curl http://127.0.0.1:5000/api/health
curl http://127.0.0.1:5000/api/stats
```

Expected behavior:

- file deployment reports `runtime: file` and `persistence: disk`
- PostgreSQL deployment reports `runtime: postgres` and `persistence: database`
- memory mode is acceptable for local development only, not for production-style deployment

### 6. Publish the service

#### Option A: Nginx

Use `deploy/nginx/mavyclaw.conf.example` and point the upstream to `127.0.0.1:5000`.

#### Option B: Caddy

Use `deploy/caddy/Caddyfile.example` for automatic HTTPS when DNS points to the server.

#### Option C: Cloudflare Tunnel

Use `deploy/cloudflare/cloudflared-config.example.yml`.

This is especially useful when the operator wants the origin to remain private and avoid exposing the raw VPS service publicly.

### 7. Verify public access

After the proxy or tunnel is attached, the agent should verify:

- the hostname resolves
- HTTPS works when configured
- the homepage loads
- `/api/health` is reachable through the published route when intended

## Publishing strategy guidance

### Choose Nginx when

- the host already uses Nginx
- the operator wants explicit proxy control
- multiple apps will share one VPS gateway

### Choose Caddy when

- the operator wants simpler setup
- automatic HTTPS is preferred
- the environment is straightforward and domain-based

### Choose Cloudflare Tunnel when

- the operator wants a safer origin posture
- inbound exposure should be minimized
- the service should be reachable without directly exposing the app port

Quick tunnels are not a production answer. Use a real tunnel for durable deployment.

## Process supervision guidance

On a VPS, prefer systemd.

The agent should ensure:

- automatic restart on crash
- automatic start on reboot
- logs are accessible
- the working directory is stable

## Persistence guidance

### Use file mode when

- PostgreSQL is unavailable
- a lightweight single-host deployment is acceptable
- backup will include the runtime data file

### Use PostgreSQL when

- durable database persistence is available
- the operator expects a stronger production posture
- the agent can verify real connectivity before claiming success

### Use workspace export/import when

- moving between environments
- creating backups
- restoring test data
- seeding a new environment safely

## Final success report format

A capable agent should leave behind a final deployment summary containing:

- repository URL used
- commit or branch deployed
- runtime mode
- persistence mode
- bind host and port
- public hostname
- publish method used
- process supervisor used
- verification commands run
- unresolved risks, if any

## Minimum safe behavior

The agent should never:

- claim success before checking `/api/health`
- expose the raw app port without intent
- call a memory deployment production-ready
- say PostgreSQL is active without verifying it
- skip local verification and rely only on a public page load
