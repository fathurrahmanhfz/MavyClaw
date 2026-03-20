# Agent Setup Playbook

This playbook explains how an AI agent should install, verify, and publish MavyClaw on a VPS or similar host.

Use this document together with:

- `docs/deployment-contract.md`
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
- `AUTH_MODE=demo` with a real secret and strong password
- `TRUST_PROXY=1`
- `COOKIE_SECURE=auto`
- publish through Nginx, Caddy, or Cloudflare Tunnel
- supervise with systemd on a VPS

## Setup procedure

### 1. Clone and install

Manual path:

```bash
git clone https://github.com/fathurrahmanhfz/MavyClaw.git
cd MavyClaw
npm install
cp .env.example .env
```

Automated VPS path:

```bash
sudo APP_DIR=/opt/mavyclaw \
  APP_USER=mavyclaw \
  APP_GROUP=mavyclaw \
  HOST_VALUE=127.0.0.1 \
  PORT_VALUE=5000 \
  STORAGE_BACKEND_VALUE=file \
  bash deploy/install-vps.sh
```

Behavior notes for the helper:

- it currently targets Debian or Ubuntu style hosts with `apt-get` and `systemd`
- it preserves an existing `.env` unless `FORCE_OVERWRITE_ENV=1` is set
- it prefers `npm ci` when `package-lock.json` is present
- it creates the runtime data directory before starting the service

### 2. Set environment values

For a production-style VPS with file persistence:

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

For a PostgreSQL-backed deployment:

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
BASE_URL=http://127.0.0.1:5000 EXPECTED_RUNTIME=file EXPECTED_PERSISTENCE=disk bash deploy/verify-deployment.sh
```

Expected behavior:

- file deployment reports `runtime: file` and `persistence: disk`
- PostgreSQL deployment reports `runtime: postgres` and `persistence: database`
- memory mode is acceptable for local development only, not for production-style deployment

### 6. Publish the service

#### Option A: Nginx

Use `deploy/nginx/mavyclaw.conf.example` and point the upstream to `127.0.0.1:5000`.

For a scripted registration on a VPS:

```bash
sudo DOMAIN=mavyclaw.example.com UPSTREAM_HOST=127.0.0.1 UPSTREAM_PORT=5000 bash deploy/register-nginx.sh
```

Behavior notes for the helper:

- it expects a local upstream such as `127.0.0.1`, `::1`, or `localhost`
- it writes a backup of the prior config when one exists
- it validates Nginx and rolls back if reload fails
- it keeps `/api/live` unbuffered so the dashboard can continue to refresh automatically

#### Option B: Caddy

Use `deploy/caddy/Caddyfile.example` for automatic HTTPS when DNS points to the server.

For a scripted registration on a VPS:

```bash
sudo DOMAIN=mavyclaw.example.com UPSTREAM_HOST=127.0.0.1 UPSTREAM_PORT=5000 bash deploy/register-caddy.sh
```

Behavior notes for the helper:

- it expects a local upstream such as `127.0.0.1`, `::1`, or `localhost`
- it writes a backup of the current Caddyfile before replacing it
- it validates Caddy and rolls back if reload fails
- it keeps `/api/live` streaming so the dashboard can continue to refresh automatically

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

### Option D: direct public binding

This is the least preferred option and should be used only when the operator explicitly accepts the trade-off.

If direct binding is chosen:

- use a strong `SESSION_SECRET`
- use a strong password
- keep the firewall limited to the app port you intentionally expose
- prefer a temporary evaluation environment rather than a long-lived production deployment

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
- run the helper scripts blindly without checking whether the host actually uses Debian or Ubuntu style packaging, Nginx, Caddy, or systemd
