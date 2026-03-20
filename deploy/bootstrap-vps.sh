#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

APP_DIR="${APP_DIR:-/opt/mavyclaw}"
APP_USER="${APP_USER:-mavyclaw}"
APP_GROUP="${APP_GROUP:-mavyclaw}"
REPO_URL="${REPO_URL:-https://github.com/fathurrahmanhfz/MavyClaw.git}"
BRANCH="${BRANCH:-main}"

INTERNAL_HOST="${INTERNAL_HOST:-127.0.0.1}"
INTERNAL_PORT="${INTERNAL_PORT:-5000}"
PUBLIC_PORT="${PUBLIC_PORT:-3005}"
PUBLISH_MODE="${PUBLISH_MODE:-nginx-ip}"
DOMAIN="${DOMAIN:-}"
PUBLIC_IP="${PUBLIC_IP:-}"
OPEN_FIREWALL="${OPEN_FIREWALL:-1}"

STORAGE_BACKEND_VALUE="${STORAGE_BACKEND_VALUE:-file}"
DATA_FILE_VALUE="${DATA_FILE_VALUE:-.runtime/mavyclaw-data.json}"
NODE_ENV_VALUE="${NODE_ENV_VALUE:-production}"
DATABASE_URL_VALUE="${DATABASE_URL_VALUE:-}"
AUTH_MODE_VALUE="${AUTH_MODE_VALUE:-demo}"
SESSION_SECRET_VALUE="${SESSION_SECRET_VALUE:-change-this-session-secret}"
TRUST_PROXY_VALUE="${TRUST_PROXY_VALUE:-1}"
COOKIE_SECURE_VALUE="${COOKIE_SECURE_VALUE:-auto}"
DEMO_AUTH_USERNAME_VALUE="${DEMO_AUTH_USERNAME_VALUE:-demo-admin}"
DEMO_AUTH_PASSWORD_VALUE="${DEMO_AUTH_PASSWORD_VALUE:-demo-admin}"
DEMO_AUTH_ROLE_VALUE="${DEMO_AUTH_ROLE_VALUE:-admin}"
FORCE_OVERWRITE_ENV="${FORCE_OVERWRITE_ENV:-0}"

PUBLIC_URL=""
EXPECTED_RUNTIME="${STORAGE_BACKEND_VALUE}"
EXPECTED_PERSISTENCE="disk"
SMOKE_COMMAND="npm run smoke:prod"

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
    echo "systemd is required for this helper." >&2
    exit 1
  fi
}

validate_inputs() {
  case "${PUBLISH_MODE}" in
    nginx-ip|nginx-domain|none)
      ;;
    *)
      echo "PUBLISH_MODE must be one of: nginx-ip, nginx-domain, none" >&2
      exit 1
      ;;
  esac

  if [[ "${PUBLISH_MODE}" == "nginx-domain" && -z "${DOMAIN}" ]]; then
    echo "Set DOMAIN when PUBLISH_MODE=nginx-domain." >&2
    exit 1
  fi

  if [[ "${STORAGE_BACKEND_VALUE}" == "postgres" ]]; then
    EXPECTED_PERSISTENCE="database"
    SMOKE_COMMAND="npm run smoke:postgres"
  elif [[ "${STORAGE_BACKEND_VALUE}" == "memory" ]]; then
    EXPECTED_PERSISTENCE="ephemeral"
    SMOKE_COMMAND="npm run smoke:dev"
  fi
}

install_nginx_if_needed() {
  if [[ "${PUBLISH_MODE}" != nginx-ip && "${PUBLISH_MODE}" != nginx-domain ]]; then
    return 0
  fi

  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y nginx
  systemctl enable nginx >/dev/null 2>&1 || true
  systemctl start nginx
}

detect_public_ip() {
  if [[ -n "${PUBLIC_IP}" ]]; then
    return 0
  fi

  PUBLIC_IP="$(curl -fsS https://api.ipify.org 2>/dev/null || true)"
  if [[ -z "${PUBLIC_IP}" ]]; then
    PUBLIC_IP="$(curl -fsS https://ifconfig.me 2>/dev/null || true)"
  fi
}

run_install_helper() {
  APP_DIR="${APP_DIR}" \
  APP_USER="${APP_USER}" \
  APP_GROUP="${APP_GROUP}" \
  REPO_URL="${REPO_URL}" \
  BRANCH="${BRANCH}" \
  HOST_VALUE="${INTERNAL_HOST}" \
  PORT_VALUE="${INTERNAL_PORT}" \
  STORAGE_BACKEND_VALUE="${STORAGE_BACKEND_VALUE}" \
  DATA_FILE_VALUE="${DATA_FILE_VALUE}" \
  NODE_ENV_VALUE="${NODE_ENV_VALUE}" \
  DATABASE_URL_VALUE="${DATABASE_URL_VALUE}" \
  AUTH_MODE_VALUE="${AUTH_MODE_VALUE}" \
  SESSION_SECRET_VALUE="${SESSION_SECRET_VALUE}" \
  TRUST_PROXY_VALUE="${TRUST_PROXY_VALUE}" \
  COOKIE_SECURE_VALUE="${COOKIE_SECURE_VALUE}" \
  DEMO_AUTH_USERNAME_VALUE="${DEMO_AUTH_USERNAME_VALUE}" \
  DEMO_AUTH_PASSWORD_VALUE="${DEMO_AUTH_PASSWORD_VALUE}" \
  DEMO_AUTH_ROLE_VALUE="${DEMO_AUTH_ROLE_VALUE}" \
  FORCE_OVERWRITE_ENV="${FORCE_OVERWRITE_ENV}" \
  bash "${SCRIPT_DIR}/install-vps.sh"
}

run_smoke_validation() {
  cd "${APP_DIR}"
  eval "${SMOKE_COMMAND}"
}

publish_application() {
  case "${PUBLISH_MODE}" in
    nginx-ip)
      detect_public_ip
      PUBLIC_HOST="${PUBLIC_IP}" \
      PUBLIC_PORT="${PUBLIC_PORT}" \
      UPSTREAM_HOST="${INTERNAL_HOST}" \
      UPSTREAM_PORT="${INTERNAL_PORT}" \
      OPEN_FIREWALL="${OPEN_FIREWALL}" \
      bash "${SCRIPT_DIR}/publish-public-nginx.sh"
      if [[ -n "${PUBLIC_IP}" ]]; then
        PUBLIC_URL="http://${PUBLIC_IP}:${PUBLIC_PORT}"
      else
        PUBLIC_URL="http://<public-ip>:${PUBLIC_PORT}"
      fi
      ;;
    nginx-domain)
      DOMAIN="${DOMAIN}" \
      UPSTREAM_HOST="${INTERNAL_HOST}" \
      UPSTREAM_PORT="${INTERNAL_PORT}" \
      bash "${SCRIPT_DIR}/register-nginx.sh"
      PUBLIC_URL="http://${DOMAIN}"
      ;;
    none)
      PUBLIC_URL=""
      ;;
  esac
}

verify_local_runtime() {
  BASE_URL="http://${INTERNAL_HOST}:${INTERNAL_PORT}" \
  EXPECTED_RUNTIME="${EXPECTED_RUNTIME}" \
  EXPECTED_PERSISTENCE="${EXPECTED_PERSISTENCE}" \
  bash "${SCRIPT_DIR}/verify-deployment.sh"
}

verify_published_route() {
  if [[ -z "${PUBLIC_URL}" ]]; then
    return 0
  fi

  local local_public_url="http://127.0.0.1:${PUBLIC_PORT}/api/health"
  curl -fsS --max-time 10 "${local_public_url}" >/dev/null

  if [[ "${PUBLIC_URL}" == *"<public-ip>"* ]]; then
    return 0
  fi

  curl -fsS --max-time 10 "${PUBLIC_URL}/api/health" >/dev/null || {
    echo "Warning: the public URL did not respond from the host itself. The reverse proxy may be fine, but a provider firewall or security group may still need to allow the port." >&2
  }
}

print_summary() {
  cat <<EOF

MavyClaw bootstrap complete.

| Item | Status |
| --- | --- |
| Local app | http://${INTERNAL_HOST}:${INTERNAL_PORT} |
| Public URL | ${PUBLIC_URL:-not-published} |
| Storage | ${STORAGE_BACKEND_VALUE} |
| Data file | ${DATA_FILE_VALUE} |
| Auth | ${DEMO_AUTH_USERNAME_VALUE} / ${DEMO_AUTH_PASSWORD_VALUE} |
| Publish mode | ${PUBLISH_MODE} |
| Smoke test | ${SMOKE_COMMAND} |

Notes:
- The app stays internal on ${INTERNAL_HOST}:${INTERNAL_PORT}.
- The public route is published separately when PUBLISH_MODE is not none.
- Change demo credentials and SESSION_SECRET before long-lived public use.
- If public access still fails, open the chosen public port in the VPS provider firewall or security group.

Suggested public access check:
${PUBLIC_URL:-No public URL was configured.}
EOF
}

main() {
  require_root
  require_supported_host
  validate_inputs
  install_nginx_if_needed
  run_install_helper
  run_smoke_validation
  publish_application
  verify_local_runtime
  verify_published_route
  print_summary
}

main "$@"
