#!/usr/bin/env bash
set -euo pipefail

APP_NAME="mavyclaw"
APP_DIR="${APP_DIR:-/opt/mavyclaw}"
APP_USER="${APP_USER:-mavyclaw}"
APP_GROUP="${APP_GROUP:-mavyclaw}"
REPO_URL="${REPO_URL:-https://github.com/fathurrahmanhfz/MavyClaw.git}"
BRANCH="${BRANCH:-main}"
HOST_VALUE="${HOST_VALUE:-127.0.0.1}"
PORT_VALUE="${PORT_VALUE:-5000}"
STORAGE_BACKEND_VALUE="${STORAGE_BACKEND_VALUE:-file}"
DATA_FILE_VALUE="${DATA_FILE_VALUE:-.runtime/mavyclaw-data.json}"
NODE_ENV_VALUE="${NODE_ENV_VALUE:-production}"
DATABASE_URL_VALUE="${DATABASE_URL_VALUE:-}"

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "This script must run as root." >&2
    exit 1
  fi
}

ensure_user() {
  if ! getent group "${APP_GROUP}" >/dev/null; then
    groupadd --system "${APP_GROUP}"
  fi

  if ! id -u "${APP_USER}" >/dev/null 2>&1; then
    useradd --system --gid "${APP_GROUP}" --create-home --home-dir "/home/${APP_USER}" --shell /usr/sbin/nologin "${APP_USER}"
  fi
}

install_base_packages() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y curl git ca-certificates

  if ! command -v node >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
  fi
}

install_app() {
  mkdir -p "${APP_DIR}"

  if [[ ! -d "${APP_DIR}/.git" ]]; then
    git clone --branch "${BRANCH}" "${REPO_URL}" "${APP_DIR}"
  else
    git -C "${APP_DIR}" fetch origin
    git -C "${APP_DIR}" checkout "${BRANCH}"
    git -C "${APP_DIR}" pull --ff-only origin "${BRANCH}"
  fi

  cd "${APP_DIR}"
  npm install
  npm run check
  npm run build
  mkdir -p .runtime
}

write_env() {
  cat > "${APP_DIR}/.env" <<EOF
NODE_ENV=${NODE_ENV_VALUE}
HOST=${HOST_VALUE}
PORT=${PORT_VALUE}
STORAGE_BACKEND=${STORAGE_BACKEND_VALUE}
DATA_FILE=${DATA_FILE_VALUE}
DATABASE_URL=${DATABASE_URL_VALUE}
EOF
}

install_service() {
  cat > /etc/systemd/system/${APP_NAME}.service <<EOF
[Unit]
Description=MavyClaw benchmark operations workspace
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/bin/npm run start
Restart=always
RestartSec=5
User=${APP_USER}
Group=${APP_GROUP}
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

  chown -R "${APP_USER}:${APP_GROUP}" "${APP_DIR}"
  systemctl daemon-reload
  systemctl enable --now ${APP_NAME}.service
}

verify_local_health() {
  local health_url="http://${HOST_VALUE}:${PORT_VALUE}/api/health"
  echo "Waiting for ${health_url}"

  for _ in $(seq 1 40); do
    if curl -fsS "${health_url}" >/tmp/${APP_NAME}-health.json 2>/dev/null; then
      cat /tmp/${APP_NAME}-health.json
      return 0
    fi
    sleep 1
  done

  echo "Local health check did not become ready in time." >&2
  systemctl status ${APP_NAME}.service --no-pager || true
  exit 1
}

print_summary() {
  cat <<EOF

MavyClaw VPS install complete.

App directory: ${APP_DIR}
Systemd service: ${APP_NAME}.service
Bind address: ${HOST_VALUE}:${PORT_VALUE}
Storage backend: ${STORAGE_BACKEND_VALUE}

Next steps:
- Register Nginx: deploy/register-nginx.sh
- Register Caddy: deploy/register-caddy.sh
- Or use Cloudflare Tunnel with deploy/cloudflare/cloudflared-config.example.yml
EOF
}

main() {
  require_root
  ensure_user
  install_base_packages
  install_app
  write_env
  install_service
  verify_local_health
  print_summary
}

main "$@"
