# Agent Setup Playbook

Use this playbook when an AI agent needs to install, verify, and publish MavyClaw on a VPS or similar host.

Read this together with:

- `README.md`
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

- choose the right runtime profile
- install the app safely
- publish it with a sane security posture
- verify the runtime honestly
- leave behind a maintainable setup

## Decision order

The agent should decide in this order:

1. Is this local development, internal VPS use, or public remote access?
2. Is PostgreSQL actually intended and available?
3. Should publishing use Nginx, Caddy, Cloudflare Tunnel, or direct public binding?
4. Which process supervisor will keep the app running?
5. Which verification will prove the claim honestly?

## Recommended default path

If no stronger requirement exists, use this path:

- `HOST=127.0.0.1`
- `PORT=5000`
- `STORAGE_BACKEND=file`
- `AUTH_MODE=demo` with a strong password
- `SESSION_SECRET` set to a strong random value
- `TRUST_PROXY=1`
- `COOKIE_SECURE=auto`
- publish through Nginx, Caddy, or Cloudflare Tunnel
- supervise with systemd on a VPS

## Fastest safe setup paths

### Local development

```bash
git clone https://github.com/fathurrahmanhfz/MavyClaw.git
cd MavyClaw
npm install
cp deploy/env.local.example .env
npm run dev
```

### VPS with file persistence

```bash
git clone https://github.com/fathurrahmanhfz/MavyClaw.git
cd MavyClaw
npm install
cp deploy/env.vps-file.example .env
npm run check
npm run build
npm run smoke:prod
npm run start
```

### VPS with PostgreSQL

```bash
git clone https://github.com/fathurrahmanhfz/MavyClaw.git
cd MavyClaw
npm install
cp deploy/env.vps-postgres.example .env
npm run check
npm run build
npm run smoke:postgres
npm run start
```

## Automated VPS helper

For Debian or Ubuntu style hosts with `apt-get` and `systemd`, the install helper can bootstrap a baseline setup:

```bash
sudo APP_DIR=/opt/mavyclaw \
  APP_USER=mavyclaw \
  APP_GROUP=mavyclaw \
  HOST_VALUE=127.0.0.1 \
  PORT_VALUE=5000 \
  STORAGE_BACKEND_VALUE=file \
  bash deploy/install-vps.sh
```

Helper behavior:

- preserves an existing `.env` unless `FORCE_OVERWRITE_ENV=1` is set
- prefers `npm ci` when `package-lock.json` exists
- prepares the runtime data directory before start
- assumes a Debian or Ubuntu style host and systemd

## Required environment checks

Before start, confirm these values intentionally:

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

### File-backed production example

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

### PostgreSQL-backed production example

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

## Verification sequence

Run verification in this order:

```bash
npm run check
npm run build
npm run smoke:prod
```

If PostgreSQL is intended:

```bash
npm run smoke:postgres
```

After the app is running, verify locally:

```bash
curl http://127.0.0.1:5000/api/health
curl http://127.0.0.1:5000/api/stats
BASE_URL=http://127.0.0.1:5000 EXPECTED_RUNTIME=file EXPECTED_PERSISTENCE=disk bash deploy/verify-deployment.sh
```

Expected outcome:

- file deployments report `runtime: file` and `persistence: disk`
- PostgreSQL deployments report `runtime: postgres` and `persistence: database`
- memory mode is acceptable only for local development

## Publish the service

### Option A: Nginx

Use `deploy/nginx/mavyclaw.conf.example` and point the upstream to `127.0.0.1:5000`.

For scripted registration:

```bash
sudo DOMAIN=mavyclaw.example.com UPSTREAM_HOST=127.0.0.1 UPSTREAM_PORT=5000 bash deploy/register-nginx.sh
```

Use Nginx when:

- the host already uses Nginx
- explicit proxy control is preferred
- multiple apps share one VPS gateway

### Option B: Caddy

Use `deploy/caddy/Caddyfile.example` when automatic HTTPS and simpler setup are preferred.

For scripted registration:

```bash
sudo DOMAIN=mavyclaw.example.com UPSTREAM_HOST=127.0.0.1 UPSTREAM_PORT=5000 bash deploy/register-caddy.sh
```

Use Caddy when:

- the environment is simple and domain-based
- automatic HTTPS is preferred
- the operator wants fewer moving parts

### Option C: Cloudflare Tunnel

Use `deploy/cloudflare/cloudflared-config.example.yml` when the origin should stay private.

Use Cloudflare Tunnel when:

- inbound exposure should be minimized
- the operator wants a safer origin posture
- the app should be reachable without directly exposing the VPS app port

### Option D: direct public binding

This is the least preferred option.

Use it only when the operator explicitly accepts the trade-off, and then:

- keep a strong `SESSION_SECRET`
- use a strong password
- limit firewall exposure to the intended app port
- prefer a short-lived evaluation environment

## Public verification

After a proxy or tunnel is attached, verify:

- the hostname resolves
- HTTPS works when configured
- the homepage loads
- `/api/health` is reachable through the published route when intended
- login works through the intended public route

## Process supervision

On a VPS, prefer systemd.

The final setup should have:

- automatic restart on crash
- automatic start on reboot
- accessible logs
- a stable working directory

## Persistence guidance

Use file mode when:

- PostgreSQL is unavailable
- a lightweight single-host setup is enough
- the runtime data file will be included in backup policy

Use PostgreSQL when:

- stronger durable persistence is intended
- database connectivity is actually available
- the agent can verify the runtime honestly before claiming success

Use workspace export and import when:

- moving between environments
- creating backups
- restoring test data
- seeding a new environment safely

## Minimum safe behavior

The agent should never:

- claim success before checking `/api/health`
- expose the raw app port without intent
- call a memory deployment production-ready
- claim PostgreSQL is active without verification
- skip local verification and rely only on a public page load
- run helper scripts blindly without checking host compatibility

## Final success report

A capable agent should leave behind a final summary with:

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
