#!/usr/bin/env bash
# Smoke-test one ImageProcessing environment on the Lab-sock cluster.
#
#   infra/smoke-test.sh dev
#   infra/smoke-test.sh prod --public    # also checks the Cloudflare hostname
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
usage: smoke-test.sh <dev|prod> [--public]

  --public  additionally GET the result through the public Cloudflare hostname

  --print-pod-specs  print the exact `kubectl run` argument vector of each
                     throwaway pod and exit. This mode never contacts a
                     cluster: kubectl is not invoked at all and credentials are
                     replaced by the literal PRINT_ONLY. Used by
                     infra/verify-smoke-test-offline.sh, which replays the
                     printed vectors through `kubectl run --dry-run=client`.
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

ENV_NAME=""
PUBLIC=0
PRINT_POD_SPECS=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    dev|prod)
      ENV_NAME="$1"
      shift
      ;;
    --public)
      PUBLIC=1
      shift
      ;;
    --print-pod-specs)
      PRINT_POD_SPECS=1
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

[ -n "$ENV_NAME" ] || usage_die "environment must be dev or prod"

case "$ENV_NAME" in
  dev)
    NS="imgproc-dev"
    HOST="imgproc-dev.sock1000kg.io.vn"
    ;;
  prod)
    NS="imgproc-prod"
    HOST="imgproc.sock1000kg.io.vn"
    ;;
esac

TEST_UUID="$(date +%s)-$$"
TEST_KEY="smoke-$TEST_UUID/hello.txt"
TEST_BODY="hello imgproc $ENV_NAME $TEST_UUID"

POD_OVERRIDES='{"spec":{"nodeSelector":{"kubernetes.io/hostname":"home-server"}}}'

# Registered pod specs: a flat list of POD <name> <argc> <arg>... END records
# holding exactly the `kubectl run` argument vector each check executes, so that
# --print-pod-specs can replay it through `kubectl run --dry-run=client`.
POD_SPECS=()

register_pod() {
  local name="$1"
  shift
  POD_SPECS+=("POD" "$name" "$#")
  local arg
  for arg in "$@"; do
    POD_SPECS+=("$arg")
  done
  POD_SPECS+=("END")
}

# Arguments are base64-encoded so multi-line pod scripts survive the
# line-oriented output (records are POD <name> <argc> then ARG <b64> per arg).
print_pod_specs() {
  local i n
  i=0
  while [ "$i" -lt "${#POD_SPECS[@]}" ]; do
    n="${POD_SPECS[$((i + 2))]}"
    echo "POD ${POD_SPECS[$((i + 1))]}"
    i=$((i + 3))
    while [ "$n" -gt 0 ]; do
      printf 'ARG %s\n' "$(printf '%s' "${POD_SPECS[$i]}" | base64 -w0)"
      i=$((i + 1))
      n=$((n - 1))
    done
    echo "END"
    i=$((i + 1))
  done
}

# kube_run <name> [kubectl run args...]
kube_run() {
  local name="$1"
  shift
  if [ "$PRINT_POD_SPECS" -eq 1 ]; then
    # print mode never talks to a cluster
    return 0
  fi
  "${KUBECTL[@]}" -n "$NS" run "$name" --rm -i --restart=Never "$@"
}

# secret_value <secret> <key> — never contacts a cluster in print mode
secret_value() {
  local secret="$1" key="$2"
  if [ "$PRINT_POD_SPECS" -eq 1 ]; then
    printf '%s' "PRINT_ONLY"
    return 0
  fi
  "${KUBECTL[@]}" -n "$NS" get secret "$secret" -o jsonpath="{.data.$key}" | base64 -d
}

check_postgres() {
  local pgpass out
  pgpass="$(secret_value imgproc-postgres password)"
  local -a pod=(--image="$POSTGRES_IMAGE" --overrides="$POD_OVERRIDES" \
    --env="PGPASSWORD=$pgpass" --env=PGUSER=imgproc --env=PGDATABASE=imgproc \
    --command -- /bin/sh -c "$POSTGRES_CHECK_SCRIPT")
  register_pod pg-smoke "${pod[@]}"
  if out=$(kube_run pg-smoke "${pod[@]}" 2>&1); then
    if [ "$(printf '%s' "$out" | tr -d '[:space:]')" = "1" ]; then
      pass "postgres: SELECT 1 on imgproc/postgresql returned 1"
    else
      fail "postgres: unexpected psql output: $out"
    fi
  else
    fail "postgres: psql failed: $out"
  fi
}

POSTGRES_CHECK_SCRIPT=$(cat <<'EOS'
set -e
psql -h "${POSTGRES_HOST:-postgresql}" -p "${POSTGRES_PORT:-5432}" -tAc 'SELECT 1'
EOS
)

NATS_CHECK_SCRIPT=$(cat <<'EOS'
set -e
[ -n "${1:-}" ] || { echo "missing arg (expected the smoke test id)" >&2; exit 2; }
NATS_URL="${NATS_URL:-nats://nats:4222}"
for s in AI_JOBS IMAGE_JOBS JOB_EVENTS; do
  nats --server "$NATS_URL" stream info "$s" >/dev/null || exit 10
done
nats --server "$NATS_URL" consumer info AI_JOBS ai-workers >/dev/null || exit 11
nats --server "$NATS_URL" consumer info IMAGE_JOBS image-workers >/dev/null || exit 12
nats --server "$NATS_URL" consumer info JOB_EVENTS backend-job-events >/dev/null || exit 13

# publish one message per pool, then drain it with the matching durable consumer
nats --server "$NATS_URL" pub jobs.ai "{\"smoke\":\"$1\"}" >/dev/null || exit 14
nats --server "$NATS_URL" pub jobs.image "{\"smoke\":\"$1\"}" >/dev/null || exit 15
nats --server "$NATS_URL" pub jobs.events "{\"smoke\":\"$1\"}" >/dev/null || exit 16

nats --server "$NATS_URL" consumer next AI_JOBS ai-workers --count 1 --ack >/dev/null || exit 17
nats --server "$NATS_URL" consumer next IMAGE_JOBS image-workers --count 1 --ack >/dev/null || exit 18
nats --server "$NATS_URL" consumer next JOB_EVENTS backend-job-events --count 1 --ack >/dev/null || exit 19

# the streams must be empty again
for s in AI_JOBS IMAGE_JOBS JOB_EVENTS; do
  left=$(nats --server "$NATS_URL" stream info "$s" -j | sed -n 's/^ *"messages": *\([0-9]*\),*$/\1/p')
  [ "$left" = "0" ] || exit 20
done
echo NATS_OK
EOS
)

check_nats() {
  local out
  local -a pod=(--image="$NATS_BOX_IMAGE" --overrides="$POD_OVERRIDES" \
    --command -- /bin/sh -c "$NATS_CHECK_SCRIPT" sh "$TEST_UUID")
  register_pod nats-smoke "${pod[@]}"
  if out=$(kube_run nats-smoke "${pod[@]}" 2>&1); then
    if echo "$out" | grep -q "NATS_OK"; then
      pass "nats: streams/consumers present, publish+ack round-trip, streams empty"
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
  local -a pod=(--image="$MC_IMAGE" --overrides="$POD_OVERRIDES" \
    --env="MINIO_ROOT_USER=$minio_user" --env="MINIO_ROOT_PASSWORD=$minio_pass" \
    --env="BODY=$TEST_BODY" \
    --command -- /bin/sh -c "$MINIO_CHECK_SCRIPT" sh "$TEST_KEY")
  register_pod minio-smoke "${pod[@]}"
  if out=$(kube_run minio-smoke "${pod[@]}" 2>&1); then
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
  local tmp status body list_status
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
  local -a pod=(--image="$MC_IMAGE" --overrides="$POD_OVERRIDES" \
    --env="MINIO_ROOT_USER=$minio_user" --env="MINIO_ROOT_PASSWORD=$minio_pass" \
    --command -- /bin/sh -c "$MINIO_CLEANUP_SCRIPT" sh "$TEST_KEY")
  register_pod minio-cleanup "${pod[@]}"
  kube_run minio-cleanup "${pod[@]}" >/dev/null 2>&1
  echo "-- cleaned up results/$TEST_KEY"
}

main() {
  command -v kubectl >/dev/null 2>&1 || die "kubectl not found in PATH"
  command -v curl >/dev/null 2>&1 || die "curl not found in PATH"

  if [ "$PRINT_POD_SPECS" -eq 1 ]; then
    # Build every pod spec WITHOUT touching the cluster: kube_run() is a no-op
    # and secret_value() returns the literal PRINT_ONLY, so no kubectl call is
    # issued (not even a read) and no real credential ends up in the output.
    check_postgres >/dev/null 2>&1 || true
    check_nats >/dev/null 2>&1 || true
    check_minio >/dev/null 2>&1 || true
    cleanup_object >/dev/null 2>&1 || true
    print_pod_specs
    exit 0
  fi

  echo "== smoke test: $ENV_NAME (namespace $NS, host $HOST)"
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
