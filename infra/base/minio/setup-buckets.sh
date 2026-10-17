#!/bin/sh
# Provision the ImageProcessing MinIO buckets.
# Shared by the Kubernetes setup Job (infra/base/minio/setup-job.yaml) and the
# local docker-compose service `minio-setup` (infra/docker-compose.yaml).
#
# Idempotent: buckets are created with --ignore-existing, the anonymous policy
# and the whole lifecycle config are replaced (import), so re-runs never
# duplicate rules. Exits non-zero on real errors.
set -eu

MINIO_URL="${MINIO_URL:-http://minio:9000}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-}"
MINIO_ALIAS="${MINIO_ALIAS:-local}"
WAIT_TIMEOUT_SECONDS="${WAIT_TIMEOUT_SECONDS:-120}"
SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"

log() {
  echo "[minio-setup] $*"
}

fail() {
  echo "[minio-setup] ERROR: $*" >&2
  exit 1
}

mc_cli() {
  mc --config-dir "$MC_CONFIG_DIR" "$@"
}

wait_for_server() {
  waited=0
  while [ "$waited" -lt "$WAIT_TIMEOUT_SECONDS" ]; do
    if mc_cli alias set "$MINIO_ALIAS" "$MINIO_URL" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; then
      log "MinIO reachable at $MINIO_URL (alias $MINIO_ALIAS)"
      return 0
    fi
    waited=$((waited + 2))
    sleep 2
  done
  fail "timed out after ${WAIT_TIMEOUT_SECONDS}s waiting for MinIO at $MINIO_URL"
}

apply_bucket_policy() {
  bucket="$1"
  policy="$2"
  log "bucket $bucket: anonymous GetObject-only policy"
  mc_cli anonymous set-json "$policy" "$MINIO_ALIAS/$bucket"
}

apply_lifecycle() {
  bucket="$1"
  log "bucket $bucket: lifecycle (expire after 1 day)"
  mc_cli ilm import "$MINIO_ALIAS/$bucket" <"$SCRIPT_DIR/ilm.json"
}

main() {
  [ -n "$MINIO_ROOT_USER" ] || fail "MINIO_ROOT_USER is not set"
  [ -n "$MINIO_ROOT_PASSWORD" ] || fail "MINIO_ROOT_PASSWORD is not set"
  [ -f "$SCRIPT_DIR/results-policy.json" ] || fail "missing results-policy.json next to this script"
  [ -f "$SCRIPT_DIR/ilm.json" ] || fail "missing ilm.json next to this script"

  MC_CONFIG_DIR="$(mktemp -d)"
  export MC_CONFIG_DIR
  trap 'rm -rf "$MC_CONFIG_DIR"' EXIT INT TERM

  wait_for_server

  for bucket in uploads results; do
    log "bucket $bucket: create if missing"
    mc_cli mb --ignore-existing "$MINIO_ALIAS/$bucket"
  done

  # GetObject only, no ListBucket: object keys are unguessable UUID paths
  apply_bucket_policy results "$SCRIPT_DIR/results-policy.json"

  for bucket in uploads results; do
    apply_lifecycle "$bucket"
  done

  log "buckets, anonymous policy and lifecycle are up to date"
}

main "$@"
