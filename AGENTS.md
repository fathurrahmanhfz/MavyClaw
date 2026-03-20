# AGENTS.md

If you are an AI agent asked to install or publish MavyClaw, use this file as the default execution contract.

## Default VPS path

When the user wants MavyClaw accessible from another browser or device and gives no stronger preference, use this command first:

```bash
sudo PUBLIC_PORT=3005 SESSION_SECRET_VALUE=<strong-secret> DEMO_AUTH_PASSWORD_VALUE=<strong-password> bash deploy/bootstrap-vps.sh
```

This default path is designed to:

- install the app
- keep the app bound internally on `127.0.0.1:5000`
- run the relevant smoke test before claiming success
- publish it through Nginx on a separate public port
- preserve file-backed persistence by default
- verify the runtime honestly before claiming success
- print a final summary containing the public URL candidate

## Default assumptions

Unless the user gives a stronger requirement, assume:

- `PUBLISH_MODE=nginx-ip`
- `INTERNAL_HOST=127.0.0.1`
- `INTERNAL_PORT=5000`
- `PUBLIC_PORT=3005`
- `STORAGE_BACKEND_VALUE=file`
- `AUTH_MODE_VALUE=demo`
- `TRUST_PROXY_VALUE=1`
- `COOKIE_SECURE_VALUE=auto`

## Safer publishing policy

Prefer these publish modes in this order:

1. `nginx-ip` for fast IP-and-port based remote access on a VPS
2. `nginx-domain` when a domain already exists
3. `none` when only local installation is required

Do not default to exposing the raw app port directly to the internet.

## Required verification

Before claiming success, complete these checks:

1. `npm run check`
2. `npm run build`
3. the relevant smoke test through the bootstrap path
4. local `/api/health`
5. local `/api/stats`
6. published route verification when remote access is intended

## Required reporting

A successful handoff must include:

- repository URL used
- commit or branch deployed
- runtime mode
- persistence mode
- internal bind address
- public URL
- auth mode used
- verification commands run
- any remaining network caveat such as provider firewall rules

## When to switch paths

Use `PUBLISH_MODE=nginx-domain DOMAIN=example.com` when the operator already has a domain and wants Nginx-based publishing.

Use `STORAGE_BACKEND_VALUE=postgres DATABASE_URL_VALUE=...` when PostgreSQL is intentionally available and required.

Use `PUBLISH_MODE=none` only when the user wants local-only installation.
