#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  check_lark_cli.sh

Checks that lark-cli and the PRD review commands used by this skill are available:
  - docs +fetch
  - drive file.comments list
  - drive +inspect
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if ! command -v lark-cli >/dev/null 2>&1; then
  echo "ERROR: lark-cli not found in PATH." >&2
  echo "Install or activate lark-cli, then rerun this script." >&2
  exit 127
fi

LARK_CLI_PATH="$(command -v lark-cli)"
echo "lark-cli: ${LARK_CLI_PATH}"

check_help() {
  local label="$1"
  shift
  if "$@" --help >/dev/null 2>&1; then
    echo "ok: ${label}"
  else
    echo "ERROR: missing or broken command: ${label}" >&2
    echo "Try:" >&2
    echo "  lark-cli --help | rg -i 'docs|drive|comment'" >&2
    echo "  lark-cli docs --help" >&2
    echo "  lark-cli drive --help" >&2
    return 1
  fi
}

check_help "docs +fetch" lark-cli docs +fetch
check_help "drive file.comments list" lark-cli drive file.comments list
check_help "drive +inspect" lark-cli drive +inspect

echo "lark-cli review fetch prerequisites are available."
