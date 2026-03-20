#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://127.0.0.1:5000}"
EXPECTED_RUNTIME="${EXPECTED_RUNTIME:-}"
EXPECTED_PERSISTENCE="${EXPECTED_PERSISTENCE:-}"

require_tools() {
  command -v curl >/dev/null 2>&1 || { echo "curl is required." >&2; exit 1; }
  command -v python3 >/dev/null 2>&1 || { echo "python3 is required." >&2; exit 1; }
}

fetch_json() {
  local path="$1"
  curl -fsS "${BASE_URL}${path}"
}

assert_field() {
  local json="$1"
  local key="$2"
  local expected="$3"

  python3 - "$json" "$key" "$expected" <<'PY'
import json, sys
payload = json.loads(sys.argv[1])
key = sys.argv[2]
expected = sys.argv[3]
value = payload.get(key)
if str(value) != expected:
    raise SystemExit(f"Expected {key}={expected}, got {value}")
PY
}

main() {
  require_tools

  health_json="$(fetch_json /api/health)"
  stats_json="$(fetch_json /api/stats)"

  echo "Health: ${health_json}"
  echo "Stats: ${stats_json}"

  if [[ -n "${EXPECTED_RUNTIME}" ]]; then
    assert_field "${health_json}" "runtime" "${EXPECTED_RUNTIME}"
  fi

  if [[ -n "${EXPECTED_PERSISTENCE}" ]]; then
    assert_field "${health_json}" "persistence" "${EXPECTED_PERSISTENCE}"
  fi

  echo "Verification passed for ${BASE_URL}"
}

main "$@"
