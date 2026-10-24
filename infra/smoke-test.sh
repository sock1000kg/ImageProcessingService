#!/usr/bin/env bash
# Smoke-test ImageProcessing environment on the Lab-sock cluster.
#
#   infra/smoke-test.sh
#   infra/smoke-test.sh --public    # also checks the Cloudflare hostname
#
# Prints PASS/FAIL per check and exits non-zero if anything failed.
set -uo pipefail

NATS_BOX_IMAGE="natsio/nats-box:0.20.0"
MC_IMAGE="socknot1000kg/minio:RELEASE.2025-10-15T17-29-55Z"
POSTGRES_IMAGE="bitnami/postgresql@sha256:ec3840dfcf0caf786877a67d83bc3ebb0c042fd92445c062ec89c51245290942"

FAILURES=0
SKIPPED=0

usage() {
  cat <<'EOF'
usage: smoke-test.sh [--public]

  --public  additionally GET the result through the public Cloudflare hostname

Note: the smoke message may briefly wake a pool via KEDA, and that's harmless.
EOF
}

pass() {
  echo "PASS: $*"
}

fail() {
  echo "FAIL: $*"
  FAILURES=$((FAILURES + 1))
}

skip() {
  echo "SKIP: $*"
  SKIPPED=$((SKIPPED + 1))
}

die() {
  echo "smoke-test.sh: $*" >&2
  exit 2
}

usage_die() {
  usage >&2
  die "$*"
}

KUBE_CONTEXT="${KUBE_CONTEXT:-}"
KUBECTL=(kubectl)
if [ -n "$KUBE_CONTEXT" ]; then
  KUBECTL+=(--context "$KUBE_CONTEXT")
fi

PUBLIC=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --public)
      PUBLIC=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage_die "unknown argument: $1"
      ;;
  esac
done

NS="imgproc"
HOST="imgproc.sock1000kg.io.vn"

TEST_UUID="$(date +%s)-$$"
TEST_KEY="smoke-$TEST_UUID/hello.txt"
TEST_BODY="hello imgproc $TEST_UUID"

POD_OVERRIDES='{"spec":{"nodeSelector":{"kubernetes.io/hostname":"home-server"}}}'

secret_value() {
  local secret="$1" key="$2"
  "${KUBECTL[@]}" -n "$NS" get secret "$secret" -o jsonpath="{.data.$key}" | base64 -d
}

POSTGRES_CHECK_SCRIPT=$(cat <<'EOS'
set -e
psql -h "${POSTGRES_HOST:-postgresql}" -p "${POSTGRES_PORT:-5432}" -tAc 'SELECT 1'
EOS
)

check_postgres() {
  local pgpass out
  pgpass="$(secret_value imgproc-postgres password)"
  if out=$("${KUBECTL[@]}" -n "$NS" run pg-smoke --rm -i --restart=Never \
      --image="$POSTGRES_IMAGE" --overrides="$POD_OVERRIDES" \
      --env="PGPASSWORD=$pgpass" --env=PGUSER=imgproc --env=PGDATABASE=imgproc \
      --command -- /bin/sh -c "$POSTGRES_CHECK_SCRIPT" 2>&1); then
    # kubectl >= 1.31 prepends an attach banner to the output, so match the psql line itself
    if printf '%s\n' "$out" | grep -qx '1'; then
      pass "postgres: SELECT 1 on imgproc/postgresql returned 1"
    else
      fail "postgres: unexpected psql output: $out"
    fi
  else
    fail "postgres: psql failed: $out"
  fi
}

NATS_CHECK_SCRIPT=$(cat <<'EOS'
set -e
[ -n "${1:-}" ] || { echo "missing arg (expected the smoke test id)" >&2; exit 2; }
NATS_URL="${NATS_URL:-nats://nats:4222}"
VIDEO_WORKERS_ACTIVE="${VIDEO_WORKERS_ACTIVE:-0}"
IMAGE_WORKERS_ACTIVE="${IMAGE_WORKERS_ACTIVE:-0}"

for s in VIDEO_JOBS IMAGE_JOBS JOB_EVENTS; do
  nats --server "$NATS_URL" stream info "$s" >/dev/null || exit 10
done
nats --server "$NATS_URL" consumer info VIDEO_JOBS video-workers >/dev/null || exit 11
nats --server "$NATS_URL" consumer info IMAGE_JOBS image-workers >/dev/null || exit 12
nats --server "$NATS_URL" consumer info JOB_EVENTS backend-job-events >/dev/null || exit 13

# When workers are active, draining via the same durable consumer races with workers.
# In that case, verifying stream and consumer existence above is sufficient.
if [ "$VIDEO_WORKERS_ACTIVE" = "0" ]; then
  nats --server "$NATS_URL" pub jobs.video "{\"smoke\":\"$1\"}" >/dev/null || exit 14
  nats --server "$NATS_URL" consumer next VIDEO_JOBS video-workers --count 1 --ack >/dev/null || exit 17
  left_video=$(nats --server "$NATS_URL" stream info VIDEO_JOBS -j | sed -n 's/^ *"messages": *\([0-9]*\),*$/\1/p')
  [ "$left_video" = "0" ] || exit 20
else
  echo "SKIP: video-workers running, pool drain skipped"
fi

if [ "$IMAGE_WORKERS_ACTIVE" = "0" ]; then
  nats --server "$NATS_URL" pub jobs.image "{\"smoke\":\"$1\"}" >/dev/null || exit 15
  nats --server "$NATS_URL" consumer next IMAGE_JOBS image-workers --count 1 --ack >/dev/null || exit 18
  left_img=$(nats --server "$NATS_URL" stream info IMAGE_JOBS -j | sed -n 's/^ *"messages": *\([0-9]*\),*$/\1/p')
  [ "$left_img" = "0" ] || exit 21
else
  echo "SKIP: image-workers running, pool drain skipped"
fi

# JOB_EVENTS check: publish and drain one message
nats --server "$NATS_URL" pub jobs.events "{\"smoke\":\"$1\"}" >/dev/null || exit 16
nats --server "$NATS_URL" consumer next JOB_EVENTS backend-job-events --count 1 --ack >/dev/null || exit 19

# When no workers are running, verify JOB_EVENTS stream is completely drained
if [ "$VIDEO_WORKERS_ACTIVE" = "0" ] && [ "$IMAGE_WORKERS_ACTIVE" = "0" ]; then
  left_evt=$(nats --server "$NATS_URL" stream info JOB_EVENTS -j | sed -n 's/^ *"messages": *\([0-9]*\),*$/\1/p')
  [ "$left_evt" = "0" ] || exit 22
fi

echo NATS_OK
EOS
)

check_nats() {
  local out
  local video_active=0 image_active=0
  local video_ready image_ready
  video_ready="$("${KUBECTL[@]}" -n "$NS" get deploy video-worker -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo 0)"
  image_ready="$("${KUBECTL[@]}" -n "$NS" get deploy image-worker -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo 0)"
  [ "${video_ready:-0}" -gt 0 ] 2>/dev/null && video_active=1
  [ "${image_ready:-0}" -gt 0 ] 2>/dev/null && image_active=1

  if out=$("${KUBECTL[@]}" -n "$NS" run nats-smoke --rm -i --restart=Never \
      --image="$NATS_BOX_IMAGE" --overrides="$POD_OVERRIDES" \
      --env="VIDEO_WORKERS_ACTIVE=$video_active" --env="IMAGE_WORKERS_ACTIVE=$image_active" \
      --command -- /bin/sh -c "$NATS_CHECK_SCRIPT" sh "$TEST_UUID" 2>&1); then
    if echo "$out" | grep -q "NATS_OK"; then
      if [ "$video_active" -eq 1 ] || [ "$image_active" -eq 1 ]; then
        pass "nats: stream/consumer exist (worker pools running)"
        [ "$video_active" -eq 1 ] && skip "nats: video-worker pool drain (workers running)"
        [ "$image_active" -eq 1 ] && skip "nats: image-worker pool drain (workers running)"
      else
        pass "nats: streams/consumers present, publish+ack round-trip, streams empty"
      fi
    else
      fail "nats: unexpected output: $out"
    fi
  else
    fail "nats: check failed: $out"
  fi
}

MINIO_CHECK_SCRIPT=$(cat <<'EOS'
set -e
[ -n "${1:-}" ] || { echo "missing arg (expected the smoke object key)" >&2; exit 2; }
# Refuse anything that is not exactly smoke-<epoch>-<pid>/hello.txt, i.e. the
# key smoke-test.sh generates. Runs before any mc call, so a lost or mangled
# argument can never turn into a bucket-wide delete.
case "${1:-}" in
  *..*)
    echo "refusing object key containing '..': $1" >&2
    exit 31
    ;;
esac
key_prefix="${1%/hello.txt}"
case "${key_prefix}" in
  smoke-*/*)
    echo "refusing object key with extra path separators: $1" >&2
    exit 32
    ;;
  smoke-*)
    uuid="${key_prefix#smoke-}"
    epoch="${uuid%%-*}"
    pid="${uuid#*-}"
    case "$epoch" in
      "" | *[!0-9]*)
        echo "refusing object key without a numeric smoke id: $1" >&2
        exit 30
        ;;
    esac
    case "$pid" in
      "" | *[!0-9]*)
        echo "refusing object key without a numeric smoke id: $1" >&2
        exit 30
        ;;
    esac
    ;;
  *)
    echo "refusing object key that is not smoke-<id>/hello.txt: $1" >&2
    exit 30
    ;;
esac
export MC_CONFIG_DIR=/tmp/mc
MINIO_URL="${MINIO_URL:-http://minio:9000}"
until mc alias set local "$MINIO_URL" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; do
  echo "waiting for minio" >&2
  sleep 2
done
for b in uploads results; do
  mc stat "local/$b" >/dev/null || exit 20
  rules=$(mc ilm rule ls "local/$b" --json)
  count=$(printf '%s' "$rules" | grep -c '"ID"')
  [ "$count" = "1" ] || exit 21
  # the one rule must be enabled with "Days": 1 (24h TTL);
  # counting rules alone would let a disabled or wrong-TTL rule pass
  printf '%s' "$rules" | grep -q '"Status": *"Enabled"' || exit 24
  printf '%s' "$rules" | grep -qE '"Days": *1([,}]|$)' || exit 25
done
printf '%s' "$BODY" > /tmp/hello.txt
mc cp /tmp/hello.txt "local/results/$1" >/dev/null || exit 22
mc stat "local/results/$1" >/dev/null || exit 23
echo MINIO_OK
EOS
)

MINIO_CLEANUP_SCRIPT=$(cat <<'EOS'
set -e
[ -n "${1:-}" ] || { echo "missing arg (expected the smoke object key)" >&2; exit 2; }
# Refuse anything that is not exactly smoke-<epoch>-<pid>/hello.txt, i.e. the
# key smoke-test.sh generates. Runs before any mc call, so a lost or mangled
# argument can never turn into a bucket-wide delete.
case "${1:-}" in
  *..*)
    echo "refusing object key containing '..': $1" >&2
    exit 31
    ;;
esac
key_prefix="${1%/hello.txt}"
case "${key_prefix}" in
  smoke-*/*)
    echo "refusing object key with extra path separators: $1" >&2
    exit 32
    ;;
  smoke-*)
    uuid="${key_prefix#smoke-}"
    epoch="${uuid%%-*}"
    pid="${uuid#*-}"
    case "$epoch" in
      "" | *[!0-9]*)
        echo "refusing object key without a numeric smoke id: $1" >&2
        exit 30
        ;;
    esac
    case "$pid" in
      "" | *[!0-9]*)
        echo "refusing object key without a numeric smoke id: $1" >&2
        exit 30
        ;;
    esac
    ;;
  *)
    echo "refusing object key that is not smoke-<id>/hello.txt: $1" >&2
    exit 30
    ;;
esac
export MC_CONFIG_DIR=/tmp/mc
MINIO_URL="${MINIO_URL:-http://minio:9000}"
until mc alias set local "$MINIO_URL" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1; do
  sleep 2
done
# remove only the smoke prefix, with the trailing slash so a sibling such as
# smoke-<id>x is never matched; no blanket "|| true", a failure must be visible
mc rm --recursive --force "local/results/$key_prefix/"
EOS
)

check_minio() {
  local minio_user minio_pass out
  minio_user="$(secret_value imgproc-minio rootUser)"
  minio_pass="$(secret_value imgproc-minio rootPassword)"
  if out=$("${KUBECTL[@]}" -n "$NS" run minio-smoke --rm -i --restart=Never \
      --image="$MC_IMAGE" --overrides="$POD_OVERRIDES" \
      --env="MINIO_ROOT_USER=$minio_user" --env="MINIO_ROOT_PASSWORD=$minio_pass" \
      --env="BODY=$TEST_BODY" \
      --command -- /bin/sh -c "$MINIO_CHECK_SCRIPT" sh "$TEST_KEY" 2>&1); then
    if echo "$out" | grep -q "MINIO_OK"; then
      pass "minio: buckets exist, one enabled 1-day-TTL ILM rule each, test object uploaded"
    else
      fail "minio: unexpected output: $out"
    fi
  else
    fail "minio: check failed: $out"
  fi
}

# route_check <base-url> <label>
route_check() {
  local base_url="$1"
  local label="$2"
  local tmp status body list_status web_status
  web_status="$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $HOST" "$base_url/health")"
  if [ "$web_status" = "200" ]; then
    pass "web route ($label): GET /health -> 200"
  else
    fail "web route ($label): GET /health -> $web_status (expected 200)"
  fi
  tmp="$(mktemp)"
  status="$(curl -s -o "$tmp" -w '%{http_code}' -H "Host: $HOST" "$base_url/results/$TEST_KEY")"
  body="$(cat "$tmp")"
  if [ "$status" = "200" ] && [ "$body" = "$TEST_BODY" ]; then
    pass "results route ($label): GET /results/$TEST_KEY -> 200 with expected body"
  else
    fail "results route ($label): GET /results/$TEST_KEY -> $status body='$body'"
  fi
  list_status="$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $HOST" "$base_url/results/")"
  case "$list_status" in
    403|404)
      pass "results route ($label): anonymous listing denied ($list_status)"
      ;;
    *)
      fail "results route ($label): anonymous listing returned $list_status (expected 403/404)"
      ;;
  esac
  rm -f "$tmp"
}

check_route_incluster() {
  local port status
  port=$(( (RANDOM % 10000) + 30000 ))
  echo "-- port-forwarding traefik on localhost:$port"
  "${KUBECTL[@]}" -n traefik port-forward svc/traefik "$port":80 >"/tmp/smoke-pf-$NS.log" 2>&1 &
  local pf_pid=$!
  status=1
  local waited=0
  while [ "$waited" -lt 30 ]; do
    if curl -s -o /dev/null "http://localhost:$port/" 2>/dev/null; then
      status=0
      break
    fi
    sleep 1
    waited=$((waited + 1))
  done
  if [ "$status" -ne 0 ]; then
    kill "$pf_pid" 2>/dev/null
    fail "results route (in-cluster): could not reach traefik via port-forward (see /tmp/smoke-pf-$NS.log)"
    return
  fi
  route_check "http://localhost:$port" "in-cluster"
  kill "$pf_pid" 2>/dev/null
  wait "$pf_pid" 2>/dev/null
}

check_route_public() {
  route_check "https://$HOST" "public"
}

cleanup_object() {
  local minio_user minio_pass
  minio_user="$(secret_value imgproc-minio rootUser 2>/dev/null || true)"
  minio_pass="$(secret_value imgproc-minio rootPassword 2>/dev/null || true)"
  "${KUBECTL[@]}" -n "$NS" run minio-cleanup --rm -i --restart=Never \
    --image="$MC_IMAGE" --overrides="$POD_OVERRIDES" \
    --env="MINIO_ROOT_USER=$minio_user" --env="MINIO_ROOT_PASSWORD=$minio_pass" \
    --command -- /bin/sh -c "$MINIO_CLEANUP_SCRIPT" sh "$TEST_KEY" >/dev/null 2>&1
  echo "-- cleaned up results/$TEST_KEY"
}

main() {
  command -v kubectl >/dev/null 2>&1 || die "kubectl not found in PATH"
  command -v curl >/dev/null 2>&1 || die "curl not found in PATH"

  echo "== smoke test: namespace $NS, host $HOST"
  check_postgres
  check_nats
  check_minio
  check_route_incluster
  if [ "$PUBLIC" -eq 1 ]; then
    check_route_public
  else
    skip "public route check (pass --public after the Cloudflare hostname is configured)"
  fi
  cleanup_object

  echo "== summary: $FAILURES failed, $SKIPPED skipped"
  [ "$FAILURES" -eq 0 ] || exit 1
}

main "$@"
