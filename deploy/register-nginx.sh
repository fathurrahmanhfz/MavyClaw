#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-}"
UPSTREAM_HOST="${UPSTREAM_HOST:-127.0.0.1}"
UPSTREAM_PORT="${UPSTREAM_PORT:-5000}"
CONF_NAME="${CONF_NAME:-mavyclaw}"
NGINX_SITES_AVAILABLE="/etc/nginx/sites-available"
NGINX_SITES_ENABLED="/etc/nginx/sites-enabled"
CONF_PATH="${NGINX_SITES_AVAILABLE}/${CONF_NAME}.conf"

if [[ -z "${DOMAIN}" ]]; then
  echo "Set DOMAIN, for example: DOMAIN=mavyclaw.example.com" >&2
  exit 1
fi

if [[ "${EUID}" -ne 0 ]]; then
  echo "This script must run as root." >&2
  exit 1
fi

if ! command -v nginx >/dev/null 2>&1; then
  echo "Nginx is not installed." >&2
  exit 1
fi

mkdir -p "${NGINX_SITES_AVAILABLE}" "${NGINX_SITES_ENABLED}"

cat > "${CONF_PATH}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

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

ln -sfn "${CONF_PATH}" "${NGINX_SITES_ENABLED}/${CONF_NAME}.conf"
nginx -t
systemctl reload nginx

echo "Nginx config registered for ${DOMAIN} -> ${UPSTREAM_HOST}:${UPSTREAM_PORT}"
echo "Add TLS separately or switch to Caddy if you want automatic HTTPS."
