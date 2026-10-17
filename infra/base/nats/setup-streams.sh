#!/bin/sh
# Provision the ImageProcessing NATS JetStream topology.
# Shared by the Kubernetes setup Job (infra/base/nats/setup-job.yaml) and the
# local docker-compose service `nats-setup` (infra/docker-compose.yaml).
#
# Idempotent: existing streams/consumers are edited in place, nothing is
# deleted. Exits non-zero on real errors.
set -eu

NATS_URL="${NATS_URL:-nats://nats:4222}"
WAIT_TIMEOUT_SECONDS="${WAIT_TIMEOUT_SECONDS:-120}"

log() {
  echo "[nats-setup] $*"
}

fail() {
  echo "[nats-setup] ERROR: $*" >&2
  exit 1
}

nats_cli() {
  nats --server "$NATS_URL" "$@"
}

wait_for_server() {
  waited=0
  while [ "$waited" -lt "$WAIT_TIMEOUT_SECONDS" ]; do
    if nats_cli rtt >/dev/null 2>&1; then
      log "NATS server reachable at $NATS_URL"
      return 0
    fi
    waited=$((waited + 2))
    sleep 2
  done
  fail "timed out after ${WAIT_TIMEOUT_SECONDS}s waiting for NATS at $NATS_URL"
}

# write_stream_config <file> <stream> <subjects-json-array> <retention>
write_stream_config() {
  cat >"$1" <<EOF
{
  "name": "$2",
  "subjects": [$3],
  "retention": "$4",
  "storage": "file",
  "discard": "old",
  "num_replicas": 1,
  "max_consumers": -1,
  "max_msgs_per_subject": -1,
  "max_msgs": -1,
  "max_bytes": -1,
  "max_age": 0,
  "max_msg_size": -1,
  "duplicate_window": 120000000000
}
EOF
}

# write_consumer_config <file> <durable> <ack_wait_ns> <max_deliver> <max_ack_pending>
write_consumer_config() {
  cat >"$1" <<EOF
{
  "durable_name": "$2",
  "deliver_policy": "all",
  "ack_policy": "explicit",
  "ack_wait": $3,
  "max_deliver": $4,
  "max_ack_pending": $5,
  "max_waiting": 512,
  "replay_policy": "instant"
}
EOF
}

# write_event_consumer_config <file> <durable> <ack_wait_ns> <max_deliver>
write_event_consumer_config() {
  cat >"$1" <<EOF
{
  "durable_name": "$2",
  "deliver_policy": "all",
  "ack_policy": "explicit",
  "ack_wait": $3,
  "max_deliver": $4,
  "max_ack_pending": 1000,
  "max_waiting": 512,
  "replay_policy": "instant"
}
EOF
}

ensure_stream() {
  stream="$1"
  config="$2"
  if nats_cli stream info "$stream" >/dev/null 2>&1; then
    log "stream $stream exists -> edit"
    nats_cli stream edit "$stream" --config "$config" -f >/dev/null
  else
    log "stream $stream missing -> add"
    nats_cli stream add --config "$config" >/dev/null
  fi
}

ensure_consumer() {
  stream="$1"
  consumer="$2"
  config="$3"
  if nats_cli consumer info "$stream" "$consumer" >/dev/null 2>&1; then
    log "consumer $stream/$consumer exists -> edit"
    nats_cli consumer edit "$stream" "$consumer" --config "$config" -f >/dev/null
  else
    log "consumer $stream/$consumer missing -> add"
    nats_cli consumer add "$stream" "$consumer" --config "$config" >/dev/null
  fi
}

main() {
  wait_for_server

  workdir="$(mktemp -d)"
  trap 'rm -rf "$workdir"' EXIT INT TERM

  # AI pool: heavy inference jobs
  write_stream_config "$workdir/ai_jobs.json" "AI_JOBS" \
    '"jobs.ai", "jobs.ai.>"' "workqueue"
  # Image pool: fast image tasks
  write_stream_config "$workdir/image_jobs.json" "IMAGE_JOBS" \
    '"jobs.image", "jobs.image.>"' "workqueue"
  # Fan-out events to the backend
  write_stream_config "$workdir/job_events.json" "JOB_EVENTS" \
    '"jobs.events", "jobs.events.>", "jobs.progress", "jobs.completed", "jobs.failed"' "workqueue"

  # ack_wait: AI 5m (slow models), image 1m, events 30s
  write_consumer_config "$workdir/ai_workers.json" "ai-workers" \
    300000000000 5 1000
  write_consumer_config "$workdir/image_workers.json" "image-workers" \
    60000000000 5 1000
  write_event_consumer_config "$workdir/backend_job_events.json" "backend-job-events" \
    30000000000 10

  ensure_stream "AI_JOBS" "$workdir/ai_jobs.json"
  ensure_stream "IMAGE_JOBS" "$workdir/image_jobs.json"
  ensure_stream "JOB_EVENTS" "$workdir/job_events.json"

  ensure_consumer "AI_JOBS" "ai-workers" "$workdir/ai_workers.json"
  ensure_consumer "IMAGE_JOBS" "image-workers" "$workdir/image_workers.json"
  ensure_consumer "JOB_EVENTS" "backend-job-events" "$workdir/backend_job_events.json"

  log "streams and consumers are up to date"
}

main "$@"
