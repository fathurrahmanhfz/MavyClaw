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
FORCE_OVERWRITE_ENV="${FORCE_OVERWRITE_ENV:-0}"

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "This script must run as root." >&2
    exit 1
  fi
}

require_supported_host() {
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "This helper currently supports Debian or Ubuntu style hosts with apt-get." >&2
    exit 1
  fi

  if ! command -v systemctl >/dev/null 2>&1; then
    echo "systemd is required for this helper. Use the manual path or adapt the service setup for this host." >&2
    exit 1
  fi
}

validate_port() {
  if ! [[ "${PORT_VALUE}" =~ ^[0-9]+$ ]] || (( PORT_VALUE < 1 || PORT_VALUE > 65535 )); then
    echo "PORT_VALUE must be a valid TCP port." >&2
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

  if [[ -f package-lock.json ]]; then
    npm ci
  else
    npm install
  fi

  npm run check
  npm run build
  mkdir -p .runtime
}

ensure_data_path() {
  local data_dir

  if [[ "${DATA_FILE_VALUE}" = /* ]]; then
    data_dir="$(dirname "${DATA_FILE_VALUE}")"
  else
    data_dir="${APP_DIR}/$(dirname "${DATA_FILE_VALUE}")"
  fi

  mkdir -p "${data_dir}"
}

write_env() {
  local env_path="${APP_DIR}/.env"
  local backup_path="${APP_DIR}/.env.bak"

  if [[ -f "${env_path}" && "${FORCE_OVERWRITE_ENV}" != "1" ]]; then
    echo "Preserving existing ${env_path}. Set FORCE_OVERWRITE_ENV=1 to replace it." >&2
    return 0
  fi

  if [[ -f "${env_path}" ]]; then
    cp "${env_path}" "${backup_path}"
  fi

  cat > "${env_path}" <<EOF
NODE_ENV=${NODE_ENV_VALUE}
HOST=${HOST_VALUE}
PORT=${PORT_VALUE}
STORAGE_BACKEND=${STORAGE_BACKEND_VALUE}
DATA_FILE=${DATA_FILE_VALUE}
DATABASE_URL=${DATABASE_URL_VALUE}
EOF
}

install_service() {
  local service_path="/etc/systemd/system/${APP_NAME}.service"
  local backup_path="/etc/systemd/system/${APP_NAME}.service.bak"

  if [[ -f "${service_path}" ]]; then
    cp "${service_path}" "${backup_path}"
  fi

  cat > "${service_path}" <<EOF
[Unit]
Description=MavyClaw benchmark operations workspace
After=network-online.target
Wants=network-online.target

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
  local health_file="/tmp/${APP_NAME}-health.json"
  echo "Waiting for ${health_url}"

  rm -f "${health_file}"

  for _ in $(seq 1 40); do
    if curl -fsS "${health_url}" >"${health_file}" 2>/dev/null; then
      cat "${health_file}"
      rm -f "${health_file}"
      return 0
    fi
    sleep 1
  done

  echo "Local health check did not become ready in time." >&2
  systemctl status ${APP_NAME}.service --no-pager || true
  rm -f "${health_file}"
  exit 1
}

print_summary() {
  cat <<EOF

MavyClaw VPS install complete.

App directory: ${APP_DIR}
Systemd service: ${APP_NAME}.service
Bind address: ${HOST_VALUE}:${PORT_VALUE}
Storage backend: ${STORAGE_BACKEND_VALUE}

Notes:
- Existing .env is preserved unless FORCE_OVERWRITE_ENV=1 is set.
- This helper expects a Debian or Ubuntu style host with systemd.

Next steps:
- Register Nginx: deploy/register-nginx.sh
- Register Caddy: deploy/register-caddy.sh
- Or use Cloudflare Tunnel with deploy/cloudflare/cloudflared-config.example.yml
EOF
}

main() {
  require_root
  require_supported_host
  validate_port
  ensure_user
  install_base_packages
  install_app
  ensure_data_path
  write_env
  install_service
  verify_local_health
  print_summary
}

main "$@"
