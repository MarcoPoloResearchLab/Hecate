#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/deploy.sh [options]

Deploys the LLM Crossword backend through mprlab-gateway and verifies the
split-origin frontend after backend verification succeeds.

Options:
  --gateway-dir <path>       Gateway checkout. Default: $GATEWAY_DIR or sibling ../mprlab-gateway
  --image <value>            Backend image repository. Default: $GHCR_HECATE_API_REPO or ghcr.io/marcopoloresearchlab/llm-crossword-api
  --tag <value>              Release tag to verify. Default: exact v* tag at HEAD
  --skip-image-verify        Skip release tag/latest image digest verification
  --skip-backend             Skip gateway backend deployment
  --skip-pages-verify        Skip public frontend URL verification
  --pages-url <url>          Frontend URL to verify. Default: $PAGES_URL or https://llm-crossword.mprlab.com/
  --help                     Show this help text
USAGE
}

env_or_default() {
  local name="$1"
  local fallback="$2"
  local value=""
  if [[ -v "${name}" ]]; then
    value="${!name}"
  fi
  if [[ -n "${value}" ]]; then
    printf "%s\n" "${value}"
  else
    printf "%s\n" "${fallback}"
  fi
}

GATEWAY_DIR="$(env_or_default GATEWAY_DIR "")"
IMAGE_REPOSITORY="$(env_or_default GHCR_HECATE_API_REPO ghcr.io/marcopoloresearchlab/llm-crossword-api)"
PAGES_URL="$(env_or_default PAGES_URL https://llm-crossword.mprlab.com/)"
TAG="$(env_or_default DEPLOY_TAG "")"
SKIP_IMAGE_VERIFY="false"
SKIP_BACKEND="false"
SKIP_PAGES_VERIFY="false"

image_digest() {
  local image_ref="$1"
  docker buildx imagetools inspect "$image_ref" | awk '/^Digest:/ { print $2; exit }'
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --gateway-dir)
      [[ $# -ge 2 ]] || { echo "error: --gateway-dir requires a value" >&2; exit 1; }
      GATEWAY_DIR="$2"
      shift 2
      ;;
    --image)
      [[ $# -ge 2 ]] || { echo "error: --image requires a value" >&2; exit 1; }
      IMAGE_REPOSITORY="$2"
      shift 2
      ;;
    --tag)
      [[ $# -ge 2 ]] || { echo "error: --tag requires a value" >&2; exit 1; }
      TAG="$2"
      shift 2
      ;;
    --skip-image-verify)
      SKIP_IMAGE_VERIFY="true"
      shift
      ;;
    --skip-backend)
      SKIP_BACKEND="true"
      shift
      ;;
    --skip-pages-verify)
      SKIP_PAGES_VERIFY="true"
      shift
      ;;
    --pages-url)
      [[ $# -ge 2 ]] || { echo "error: --pages-url requires a value" >&2; exit 1; }
      PAGES_URL="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

command -v git >/dev/null 2>&1 || { echo "error: git is required" >&2; exit 1; }

repo_root="$(git rev-parse --show-toplevel)"
cd "${repo_root}"
resolve_gateway_dir() {
  local candidate
  if [[ -n "${GATEWAY_DIR}" ]]; then
    printf "%s\n" "${GATEWAY_DIR}"
    return
  fi
  for candidate in "${repo_root}/../mprlab-gateway" "../mprlab-gateway"; do
    if [[ -d "${candidate}" ]]; then
      printf "%s\n" "${candidate}"
      return
    fi
  done
}

GATEWAY_DIR="$(resolve_gateway_dir)"
[[ -n "${GATEWAY_DIR}" ]] || { echo "error: gateway checkout not found; set GATEWAY_DIR=/path/to/mprlab-gateway or pass --gateway-dir" >&2; exit 1; }
[[ -d "${GATEWAY_DIR}" ]] || { echo "error: gateway checkout not found: ${GATEWAY_DIR}" >&2; exit 1; }

if [[ -z "${TAG}" ]]; then
  TAG="$(git tag --points-at HEAD --list 'v*' --sort=-version:refname | head -n 1)"
fi
[[ -n "${TAG}" ]] || { echo "error: no v* release tag points at HEAD; pass --tag or deploy from a release commit" >&2; exit 1; }

if [[ "${SKIP_IMAGE_VERIFY}" != "true" && "${SKIP_BACKEND}" != "true" ]]; then
  command -v docker >/dev/null 2>&1 || { echo "error: docker is required for image verification" >&2; exit 1; }
  docker buildx version >/dev/null 2>&1 || { echo "error: docker buildx is required for image verification" >&2; exit 1; }
  echo "==> [deploy] Verifying ${IMAGE_REPOSITORY}:latest matches ${TAG}"
  release_digest="$(image_digest "${IMAGE_REPOSITORY}:${TAG}")"
  latest_digest="$(image_digest "${IMAGE_REPOSITORY}:latest")"
  [[ -n "${release_digest}" ]] || { echo "error: could not resolve digest for ${IMAGE_REPOSITORY}:${TAG}" >&2; exit 1; }
  [[ -n "${latest_digest}" ]] || { echo "error: could not resolve digest for ${IMAGE_REPOSITORY}:latest" >&2; exit 1; }
  if [[ "${release_digest}" != "${latest_digest}" ]]; then
    echo "error: ${IMAGE_REPOSITORY}:latest digest ${latest_digest} does not match ${TAG} digest ${release_digest}; run make publish first" >&2
    exit 1
  fi
fi

if [[ "${SKIP_BACKEND}" != "true" ]]; then
  echo "==> [deploy] Deploying LLM Crossword backend through mprlab-gateway"
  timeout --foreground -k 1200s -s SIGKILL 1200s make -C "${GATEWAY_DIR}" deploy TARGET=llm-crossword
fi

if [[ "${SKIP_PAGES_VERIFY}" != "true" ]]; then
  command -v curl >/dev/null 2>&1 || { echo "error: curl is required for frontend verification" >&2; exit 1; }
  echo "==> [deploy] Verifying ${PAGES_URL}"
  timeout -k 60s -s SIGKILL 60s curl --fail --silent --show-error --location --max-time 30 "${PAGES_URL}" >/dev/null
fi

echo "LLM Crossword deploy complete"
