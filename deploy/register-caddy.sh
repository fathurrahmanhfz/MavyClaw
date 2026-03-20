#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-}"
UPSTREAM_HOST="${UPSTREAM_HOST:-127.0.0.1}"
UPSTREAM_PORT="${UPSTREAM_PORT:-5000}"
CADDYFILE_PATH="${CADDYFILE_PATH:-/etc/caddy/Caddyfile}"
TMP_FILE="$(mktemp)"
BACKUP_PATH="${CADDYFILE_PATH}.bak"

cleanup() {
  rm -f "${TMP_FILE}"
}
trap cleanup EXIT

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "This script must run as root." >&2
    exit 1
  fi
}

validate_inputs() {
  if [[ -z "${DOMAIN}" ]]; then
    echo "Set DOMAIN, for example: DOMAIN=mavyclaw.example.com" >&2
    exit 1
  fi

  if ! [[ "${UPSTREAM_PORT}" =~ ^[0-9]+$ ]] || (( UPSTREAM_PORT < 1 || UPSTREAM_PORT > 65535 )); then
    echo "UPSTREAM_PORT must be a valid TCP port." >&2
    exit 1
  fi

  if [[ "${UPSTREAM_HOST}" != "127.0.0.1" && "${UPSTREAM_HOST}" != "::1" && "${UPSTREAM_HOST}" != "localhost" ]]; then
    echo "UPSTREAM_HOST should stay local unless the operator explicitly adapts this helper." >&2
    exit 1
  fi
}

require_caddy() {
  if ! command -v caddy >/dev/null 2>&1; then
    echo "Caddy is not installed." >&2
    exit 1
  fi

  if ! command -v systemctl >/dev/null 2>&1; then
    echo "systemd is required for this helper." >&2
    exit 1
  fi

  if [[ ! -f "${CADDYFILE_PATH}" ]]; then
    echo "Caddyfile not found at ${CADDYFILE_PATH}." >&2
    exit 1
  fi
}

write_candidate_config() {
  cp "${CADDYFILE_PATH}" "${TMP_FILE}"

  if ! grep -q "^[[:space:]]*${DOMAIN}[[:space:]]*{" "${TMP_FILE}"; then
    cat >> "${TMP_FILE}" <<EOF

${DOMAIN} {
    encode gzip zstd
    reverse_proxy ${UPSTREAM_HOST}:${UPSTREAM_PORT}
}
EOF
  fi
}

reload_with_rollback() {
  cp "${CADDYFILE_PATH}" "${BACKUP_PATH}"
  cp "${TMP_FILE}" "${CADDYFILE_PATH}"

  if caddy validate --config "${CADDYFILE_PATH}" && systemctl reload caddy; then
    return 0
  fi

  echo "Caddy validation or reload failed. Rolling back the config." >&2
  cp "${BACKUP_PATH}" "${CADDYFILE_PATH}"
  caddy validate --config "${CADDYFILE_PATH}"
  systemctl reload caddy || true
  exit 1
}

main() {
  require_root
  validate_inputs
  require_caddy
  write_candidate_config
  reload_with_rollback

  echo "Caddy config registered for ${DOMAIN} -> ${UPSTREAM_HOST}:${UPSTREAM_PORT}"
}

main "$@"
