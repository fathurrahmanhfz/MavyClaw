#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-}"
UPSTREAM_HOST="${UPSTREAM_HOST:-127.0.0.1}"
UPSTREAM_PORT="${UPSTREAM_PORT:-5000}"
CONF_NAME="${CONF_NAME:-mavyclaw}"
NGINX_SITES_AVAILABLE="/etc/nginx/sites-available"
NGINX_SITES_ENABLED="/etc/nginx/sites-enabled"
CONF_PATH="${NGINX_SITES_AVAILABLE}/${CONF_NAME}.conf"
BACKUP_PATH="${CONF_PATH}.bak"
TMP_PATH="$(mktemp)"

cleanup() {
  rm -f "${TMP_PATH}"
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

require_nginx() {
  if ! command -v nginx >/dev/null 2>&1; then
    echo "Nginx is not installed." >&2
    exit 1
  fi

  if ! command -v systemctl >/dev/null 2>&1; then
    echo "systemd is required for this helper." >&2
    exit 1
  fi
}

write_config() {
  mkdir -p "${NGINX_SITES_AVAILABLE}" "${NGINX_SITES_ENABLED}"

  cat > "${TMP_PATH}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location = /api/live {
        proxy_pass http://${UPSTREAM_HOST}:${UPSTREAM_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection "";
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 1h;
        proxy_send_timeout 1h;
    }

    location / {
        proxy_pass http://${UPSTREAM_HOST}:${UPSTREAM_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }
}
EOF

  if [[ -f "${CONF_PATH}" ]]; then
    cp "${CONF_PATH}" "${BACKUP_PATH}"
  fi

  cp "${TMP_PATH}" "${CONF_PATH}"
  ln -sfn "${CONF_PATH}" "${NGINX_SITES_ENABLED}/${CONF_NAME}.conf"
}

reload_with_rollback() {
  if nginx -t && systemctl reload nginx; then
    return 0
  fi

  echo "Nginx validation or reload failed. Rolling back the config." >&2

  if [[ -f "${BACKUP_PATH}" ]]; then
    cp "${BACKUP_PATH}" "${CONF_PATH}"
  else
    rm -f "${CONF_PATH}" "${NGINX_SITES_ENABLED}/${CONF_NAME}.conf"
  fi

  nginx -t
  systemctl reload nginx || true
  exit 1
}

main() {
  require_root
  validate_inputs
  require_nginx
  write_config
  reload_with_rollback

  echo "Nginx config registered for ${DOMAIN} -> ${UPSTREAM_HOST}:${UPSTREAM_PORT}"
  echo "The generated config keeps /api/live unbuffered so live dashboard updates continue to work."
  echo "Add TLS separately or switch to Caddy if you want automatic HTTPS."
}

main "$@"
