#!/bin/sh
# Provision the ImageProcessing MinIO buckets.
# Shared by the Kubernetes setup Job (infra/app/minio/setup-job.yaml) and the
# local docker-compose service `minio-setup` (infra/docker-compose.yaml).
#
# Idempotent: buckets are created with --ignore-existing, the results bucket has
# anonymous access revoked (set to none), and any lifecycle rule left by an older
# release is removed. Retention is the web's job (RETENTION_DAYS), because it must
# delete the database rows together with the objects. Exits non-zero on real errors.
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

# Objects are kept until the web deletes them. Remove any expiry rule an earlier
# release imported; `|| true` because a bucket without rules makes mc exit non-zero.
remove_lifecycle() {
  bucket="$1"
  log "bucket $bucket: remove lifecycle rules (retention is handled by the web)"
  mc_cli ilm rule rm --all --force "$MINIO_ALIAS/$bucket" >/dev/null 2>&1 || true
}

main() {
  [ -n "$MINIO_ROOT_USER" ] || fail "MINIO_ROOT_USER is not set"
  [ -n "$MINIO_ROOT_PASSWORD" ] || fail "MINIO_ROOT_PASSWORD is not set"

  MC_CONFIG_DIR="$(mktemp -d)"
  export MC_CONFIG_DIR
  trap 'rm -rf "$MC_CONFIG_DIR"' EXIT INT TERM

  wait_for_server

  for bucket in uploads results; do
    log "bucket $bucket: create if missing"
    mc_cli mb --ignore-existing "$MINIO_ALIAS/$bucket"
  done

  # Revoke anonymous policy on results bucket (presigned S3 URLs are used instead).
  # Setting to none ensures that re-running this setup Job revokes an already-applied policy.
  log "bucket results: set anonymous access to none"
  mc_cli anonymous set none "$MINIO_ALIAS/results"

  for bucket in uploads results; do
    remove_lifecycle "$bucket"
  done

  log "buckets and access policy are up to date, no lifecycle rule remains"
}

main "$@"
