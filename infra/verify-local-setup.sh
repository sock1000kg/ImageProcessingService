#!/usr/bin/env bash
# Verify the setup scripts without a container runtime.
#
# Same coverage as the docker-compose flow (AC #4), but runs the *same*
# infra/base/*/setup-*.sh scripts against a local nats-server / minio / mc:
#
#   nats-server -js -m 8222 -sd /tmp/js &
#   MINIO_ROOT_USER=... MINIO_ROOT_PASSWORD=... minio server /tmp/minio-data &
#   MC_CONFIG_DIR=$(mktemp -d) mc alias set local http://127.0.0.1:9000 <user> <pass>
#   NATS_URL=nats://127.0.0.1:4222 \
#   MINIO_URL=http://127.0.0.1:9000 \
#   MINIO_ROOT_USER=... MINIO_ROOT_PASSWORD=... \
#   bash infra/verify-local-setup.sh
#
# Checks: idempotency of both scripts, consumer ack_wait/max_deliver, exactly one
# 1-day ILM rule per bucket, anonymous GetObject works, anonymous listing denied.
set -uo pipefail

REPO="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
export MC_CONFIG_DIR
MC_CONFIG_DIR="$(mktemp -d)"
export NATS_URL="${NATS_URL:-nats://127.0.0.1:4222}"
export MINIO_URL="${MINIO_URL:-http://127.0.0.1:9000}"
: "${MINIO_ROOT_USER:?set MINIO_ROOT_USER}"
: "${MINIO_ROOT_PASSWORD:?set MINIO_ROOT_PASSWORD}"

FAIL=0
ok() { echo "PASS: $*"; }
no() {
  echo "FAIL: $*"
  FAIL=1
}

for tool in nats mc curl jq; do
  command -v "$tool" >/dev/null 2>&1 || {
    echo "verify-local-setup.sh: $tool not found in PATH" >&2
    exit 2
  }
done

run_twice() {
  local name="$1"
  shift
  local run
  for run in 1 2; do
    if "$@" >/dev/null 2>&1; then
      ok "$name run $run exit 0"
    else
      no "$name run $run exited non-zero"
    fi
  done
}

echo "== script idempotency"
run_twice nats-setup "$REPO/base/nats/setup-streams.sh"
run_twice minio-setup "$REPO/base/minio/setup-buckets.sh"

echo "== stream and consumer settings"
check_consumer() {
  local stream="$1" consumer="$2" want_ack="$3" want_deliver="$4"
  local info ack deliver
  info="$(nats --server "$NATS_URL" consumer info "$stream" "$consumer" -j 2>/dev/null)" || {
    no "consumer $stream/$consumer missing"
    return
  }
  ack="$(echo "$info" | jq -r '.config.ack_wait')"
  deliver="$(echo "$info" | jq -r '.config.max_deliver')"
  if [ "$ack" = "$want_ack" ] && [ "$deliver" = "$want_deliver" ]; then
    ok "$consumer ack_wait=$ack max_deliver=$deliver"
  else
    no "$consumer ack_wait=$ack (want $want_ack), max_deliver=$deliver (want $want_deliver)"
  fi
}
check_consumer AI_JOBS ai-workers 300000000000 5
check_consumer IMAGE_JOBS image-workers 60000000000 5
check_consumer JOB_EVENTS backend-job-events 30000000000 10

echo "== bucket lifecycle"
mc alias set local "$MINIO_URL" "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
for bucket in uploads results; do
  rules="$(mc ilm rule ls "local/$bucket" --json | grep -c '"ID"')"
  days="$(mc ilm rule ls "local/$bucket" --json | jq -r '.config.Rules[0].Expiration.Days')"
  if [ "$rules" = "1" ]; then
    ok "$bucket has exactly 1 ILM rule"
  else
    no "$bucket has $rules ILM rules (want 1)"
  fi
  if [ "$days" = "1" ]; then
    ok "$bucket rule expires after 1 day"
  else
    no "$bucket rule expires after $days days (want 1)"
  fi
done

echo "== anonymous access to results"
UUID="parity-$(date +%s)"
BODY="hello imgproc local $UUID"
HELLO_FILE="$(mktemp)"
printf '%s' "$BODY" >"$HELLO_FILE"
if mc cp "$HELLO_FILE" "local/results/$UUID/hello.txt" >/dev/null 2>&1; then
  ok "uploaded results/$UUID/hello.txt"
else
  no "could not upload the test object"
fi
OUT_FILE="$(mktemp)"
code="$(curl -s -o "$OUT_FILE" -w '%{http_code}' "$MINIO_URL/results/$UUID/hello.txt")"
body="$(cat "$OUT_FILE")"
if [ "$code" = "200" ] && [ "$body" = "$BODY" ]; then
  ok "anonymous GET of the object -> 200 with the expected body"
else
  no "anonymous GET -> $code body='$body'"
fi
code="$(curl -s -o /dev/null -w '%{http_code}' "$MINIO_URL/results/")"
case "$code" in
  403|404) ok "anonymous listing denied ($code)" ;;
  *) no "anonymous listing returned $code (want 403/404)" ;;
esac
if mc rm --recursive --force "local/results/$UUID" >/dev/null 2>&1; then
  ok "cleaned up the test object"
else
  no "could not clean up the test object"
fi
rm -f "$HELLO_FILE" "$OUT_FILE"

echo
if [ "$FAIL" -eq 0 ]; then
  echo "ALL LOCAL SETUP CHECKS PASSED"
else
  echo "SOME LOCAL SETUP CHECKS FAILED"
fi
exit "$FAIL"
