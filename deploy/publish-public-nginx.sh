#!/usr/bin/env bash
set -euo pipefail

PUBLIC_PORT="${PUBLIC_PORT:-3005}"
UPSTREAM_HOST="${UPSTREAM_HOST:-127.0.0.1}"
UPSTREAM_PORT="${UPSTREAM_PORT:-5000}"
CONF_NAME="${CONF_NAME:-mavyclaw-public}"
PUBLIC_HOST="${PUBLIC_HOST:-}"
OPEN_FIREWALL="${OPEN_FIREWALL:-1}"
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
  if ! [[ "${PUBLIC_PORT}" =~ ^[0-9]+$ ]] || (( PUBLIC_PORT < 1 || PUBLIC_PORT > 65535 )); then
    echo "PUBLIC_PORT must be a valid TCP port." >&2
    exit 1
  fi

  if ! [[ "${UPSTREAM_PORT}" =~ ^[0-9]+$ ]] || (( UPSTREAM_PORT < 1 || UPSTREAM_PORT > 65535 )); then
    echo "UPSTREAM_PORT must be a valid TCP port." >&2
    exit 1
  fi

  if (( PUBLIC_PORT == UPSTREAM_PORT )); then
    echo "PUBLIC_PORT must differ from UPSTREAM_PORT so Nginx can publish the local app safely." >&2
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
    listen ${PUBLIC_PORT};
    listen [::]:${PUBLIC_PORT};
    server_name _;

    client_max_body_size 10m;

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

maybe_open_firewall() {
  if [[ "${OPEN_FIREWALL}" != "1" ]]; then
    return 0
  fi

  if ! command -v ufw >/dev/null 2>&1; then
    return 0
  fi

  if ufw status 2>/dev/null | grep -q "Status: active"; then
    ufw allow "${PUBLIC_PORT}/tcp" >/dev/null
  fi
}

print_summary() {
  local display_host="${PUBLIC_HOST:-<public-ip>}"
  cat <<EOF
Nginx public publisher ready.
Public URL: http://${display_host}:${PUBLIC_PORT}
Local upstream: http://${UPSTREAM_HOST}:${UPSTREAM_PORT}
Live updates: /api/live stays unbuffered through Nginx
EOF
}

main() {
  require_root
  validate_inputs
  require_nginx
  write_config
  reload_with_rollback
  maybe_open_firewall
  print_summary
}

main "$@"
