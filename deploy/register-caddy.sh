#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-}"
UPSTREAM_HOST="${UPSTREAM_HOST:-127.0.0.1}"
UPSTREAM_PORT="${UPSTREAM_PORT:-5000}"
CADDYFILE_PATH="${CADDYFILE_PATH:-/etc/caddy/Caddyfile}"

if [[ -z "${DOMAIN}" ]]; then
  echo "Set DOMAIN, for example: DOMAIN=mavyclaw.example.com" >&2
  exit 1
fi

if [[ "${EUID}" -ne 0 ]]; then
  echo "This script must run as root." >&2
  exit 1
fi

if ! command -v caddy >/dev/null 2>&1; then
  echo "Caddy is not installed." >&2
  exit 1
fi

TMP_FILE="$(mktemp)"
cp "${CADDYFILE_PATH}" "${TMP_FILE}"

if ! grep -q "${DOMAIN}" "${TMP_FILE}"; then
  cat >> "${TMP_FILE}" <<EOF

${DOMAIN} {
    encode gzip zstd
    reverse_proxy ${UPSTREAM_HOST}:${UPSTREAM_PORT}
}
EOF
fi

caddy validate --config "${TMP_FILE}"
cp "${TMP_FILE}" "${CADDYFILE_PATH}"
systemctl reload caddy
rm -f "${TMP_FILE}"

echo "Caddy config registered for ${DOMAIN} -> ${UPSTREAM_HOST}:${UPSTREAM_PORT}"
