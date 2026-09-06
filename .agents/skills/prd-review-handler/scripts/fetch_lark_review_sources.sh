#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  fetch_lark_review_sources.sh --doc <doc-url-or-token> --out-dir <review-dir> [options]

Required:
  --doc <doc-url-or-token>       Lark/Feishu doc URL or doc token accepted by `lark-cli docs +fetch --doc`.
  --out-dir <review-dir>         Directory where evidence files should be written, usually a demand's `评审/`.

Options:
  --file-token <token>           Token for comments API. Defaults to token extracted from --doc.
  --file-type <type>             Comment file type. Default: docx.
  --date <YYYY-MM-DD>            Date prefix for output files. Default: current local date.
  --as <user|bot>                Identity forwarded to lark-cli.
  --profile <profile>            lark-cli profile to use.
  --title <title>                Optional title written into metadata.
  --skip-comments                Fetch document content only.
  --skip-doc                     Fetch comments only.

Outputs:
  <date> 飞书最新版本.md
  <date> 飞书最新评论.md
  <date> 飞书拉取摘要.md

The document fetch and comments fetch run in parallel after lark-cli availability is checked.
USAGE
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DOC=""
OUT_DIR=""
FILE_TOKEN=""
FILE_TYPE="docx"
RUN_DATE="$(date +%F)"
AS_IDENTITY=""
PROFILE=""
TITLE=""
SKIP_COMMENTS=0
SKIP_DOC=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --doc)
      DOC="${2:-}"
      shift 2
      ;;
    --out-dir)
      OUT_DIR="${2:-}"
      shift 2
      ;;
    --file-token)
      FILE_TOKEN="${2:-}"
      shift 2
      ;;
    --file-type)
      FILE_TYPE="${2:-}"
      shift 2
      ;;
    --date)
      RUN_DATE="${2:-}"
      shift 2
      ;;
    --as)
      AS_IDENTITY="${2:-}"
      shift 2
      ;;
    --profile)
      PROFILE="${2:-}"
      shift 2
      ;;
    --title)
      TITLE="${2:-}"
      shift 2
      ;;
    --skip-comments)
      SKIP_COMMENTS=1
      shift
      ;;
    --skip-doc)
      SKIP_DOC=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$DOC" || -z "$OUT_DIR" ]]; then
  echo "ERROR: --doc and --out-dir are required." >&2
  usage >&2
  exit 2
fi

if [[ -n "$RUN_DATE" && ! "$RUN_DATE" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
  echo "ERROR: --date must use YYYY-MM-DD format." >&2
  exit 2
fi

if [[ -z "$FILE_TYPE" || ! "$FILE_TYPE" =~ ^[A-Za-z0-9_-]+$ ]]; then
  echo "ERROR: --file-type must contain only letters, numbers, '_' or '-'." >&2
  exit 2
fi

if [[ "$SKIP_COMMENTS" -eq 1 && "$SKIP_DOC" -eq 1 ]]; then
  echo "ERROR: --skip-comments and --skip-doc cannot both be set." >&2
  exit 2
fi

"${SCRIPT_DIR}/check_lark_cli.sh" >/dev/null

extract_token() {
  local value="$1"
  if [[ "$value" =~ /docx/([A-Za-z0-9_-]+) ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
  elif [[ "$value" =~ /doc/([A-Za-z0-9_-]+) ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
  elif [[ "$value" =~ /wiki/([A-Za-z0-9_-]+) ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
  elif [[ "$value" =~ ^[A-Za-z0-9_-]+$ ]]; then
    printf '%s\n' "$value"
  else
    printf '%s\n' ""
  fi
}

if [[ -z "$FILE_TOKEN" ]]; then
  FILE_TOKEN="$(extract_token "$DOC")"
fi

if [[ "$SKIP_COMMENTS" -eq 0 && -z "$FILE_TOKEN" ]]; then
  echo "ERROR: cannot infer --file-token from --doc. Pass --file-token explicitly." >&2
  exit 2
fi

mkdir -p "$OUT_DIR"

DOC_FILE="${OUT_DIR}/${RUN_DATE} 飞书最新版本.md"
COMMENTS_FILE="${OUT_DIR}/${RUN_DATE} 飞书最新评论.md"
SUMMARY_FILE="${OUT_DIR}/${RUN_DATE} 飞书拉取摘要.md"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/prd-review-fetch.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

COMMON_ARGS=()
if [[ -n "$AS_IDENTITY" ]]; then
  COMMON_ARGS+=(--as "$AS_IDENTITY")
fi
if [[ -n "$PROFILE" ]]; then
  COMMON_ARGS+=(--profile "$PROFILE")
fi

DOC_STATUS="skipped"
COMMENTS_STATUS="skipped"
DOC_PID=""
COMMENTS_PID=""

if [[ "$SKIP_DOC" -eq 0 ]]; then
  (
    set -euo pipefail
    if [[ ${#COMMON_ARGS[@]} -gt 0 ]]; then
      lark-cli docs +fetch --api-version v2 --doc "$DOC" --format pretty "${COMMON_ARGS[@]}" >"${TMP_DIR}/doc.body" 2>"${TMP_DIR}/doc.err"
    else
      lark-cli docs +fetch --api-version v2 --doc "$DOC" --format pretty >"${TMP_DIR}/doc.body" 2>"${TMP_DIR}/doc.err"
    fi
    {
      echo "---"
      echo "来源: 飞书文档"
      echo "文档: ${DOC}"
      if [[ -n "$TITLE" ]]; then
        echo "标题: ${TITLE}"
      fi
      echo "拉取时间: ${RUN_DATE}"
      echo "---"
      echo
      cat "${TMP_DIR}/doc.body"
    } >"$DOC_FILE"
  ) &
  DOC_PID=$!
fi

if [[ "$SKIP_COMMENTS" -eq 0 ]]; then
  (
    set -euo pipefail
    PARAMS="{\"file_token\":\"${FILE_TOKEN}\",\"file_type\":\"${FILE_TYPE}\"}"
    if [[ ${#COMMON_ARGS[@]} -gt 0 ]]; then
      lark-cli drive file.comments list --params "$PARAMS" --page-all --format json "${COMMON_ARGS[@]}" >"${TMP_DIR}/comments.body" 2>"${TMP_DIR}/comments.err"
    else
      lark-cli drive file.comments list --params "$PARAMS" --page-all --format json >"${TMP_DIR}/comments.body" 2>"${TMP_DIR}/comments.err"
    fi
    {
      echo "---"
      echo "来源: 飞书评论"
      echo "file_token: ${FILE_TOKEN}"
      echo "file_type: ${FILE_TYPE}"
      echo "拉取时间: ${RUN_DATE}"
      echo "---"
      echo
      echo '```json'
      cat "${TMP_DIR}/comments.body"
      echo
      echo '```'
    } >"$COMMENTS_FILE"
  ) &
  COMMENTS_PID=$!
fi

if [[ -n "$DOC_PID" ]]; then
  if wait "$DOC_PID"; then
    DOC_STATUS="ok"
  else
    DOC_STATUS="failed"
  fi
fi

if [[ -n "$COMMENTS_PID" ]]; then
  if wait "$COMMENTS_PID"; then
    COMMENTS_STATUS="ok"
  else
    COMMENTS_STATUS="failed"
  fi
fi

{
  echo "# 飞书评审材料拉取摘要"
  echo
  echo "| 项目 | 状态 | 文件 |"
  echo "|------|------|------|"
  if [[ "$SKIP_DOC" -eq 0 ]]; then
    echo "| 飞书最新版本 | ${DOC_STATUS} | ${DOC_FILE} |"
  fi
  if [[ "$SKIP_COMMENTS" -eq 0 ]]; then
    echo "| 飞书最新评论 | ${COMMENTS_STATUS} | ${COMMENTS_FILE} |"
  fi
  echo
  echo "- 文档输入：${DOC}"
  echo "- 评论 token：${FILE_TOKEN:-未拉取评论}"
  echo "- 评论 file_type：${FILE_TYPE}"
  echo "- 拉取日期：${RUN_DATE}"
} >"$SUMMARY_FILE"

if [[ "$DOC_STATUS" == "failed" ]]; then
  echo "ERROR: docs +fetch failed. stderr:" >&2
  cat "${TMP_DIR}/doc.err" >&2 || true
fi

if [[ "$COMMENTS_STATUS" == "failed" ]]; then
  echo "ERROR: drive file.comments list failed. stderr:" >&2
  cat "${TMP_DIR}/comments.err" >&2 || true
fi

echo "$SUMMARY_FILE"

if [[ "$DOC_STATUS" == "failed" || "$COMMENTS_STATUS" == "failed" ]]; then
  exit 1
fi
