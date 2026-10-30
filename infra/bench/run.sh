#!/usr/bin/env bash
# Baseline benchmark runner for the imgproc image pipeline.
#
# Usage:
#   run.sh [--workers N | --autoscale [--min M] [--max N]] [--api URL] [--out DIR] [--timeout SECONDS]
#
# Options:
#   --workers N         Fixed replica mode (N: 1 to 6). Annotates ScaledObject,
#                       waits for N Ready pods, runs warm-up batch of 2xN images.
#   --autoscale         Autoscale mode with optional min/max replicas (1 to 6).
#   --min M             Minimum replicas for autoscale mode (0 to 6, default: current ScaledObject value, e.g. 0).
#   --max N             Maximum replicas for autoscale mode (1 to 6, default: current ScaledObject value, e.g. 3).
#   --api URL           Base URL of Web API (default: starts kubectl port-forward svc/web).
#   --out DIR           Output directory for benchmark results
#                       (default: infra/bench/results/<UTC timestamp>-<mode>/).
#   --timeout SECONDS   Maximum time to wait for jobs to complete (default: 1800).
#   -h, --help          Show this help message and exit.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATASET_DIR="$SCRIPT_DIR/dataset"
IMAGES_DIR="$DATASET_DIR/images"
IMAGES_TXT="$DATASET_DIR/images.txt"

usage() {
  cat <<'EOF'
Usage: run.sh [--workers N | --autoscale [--min M] [--max N]] [--api URL] [--out DIR] [--timeout SECONDS]

Runs the baseline image pipeline benchmark (100 images in 5 batches of 20).

Options:
  --workers N         Fixed replica mode (N: 1 to 6). Annotates ScaledObject,
                      waits for N Ready pods, runs warm-up batch of 2xN images.
  --autoscale         Autoscale mode with optional min/max replicas (1 to 6).
  --min M             Minimum replicas for autoscale mode (0 to 6, default: current ScaledObject value, e.g. 0).
  --max N             Maximum replicas for autoscale mode (1 to 6, default: current ScaledObject value, e.g. 3).
  --api URL           Base URL of Web API (default: starts kubectl port-forward svc/web).
  --out DIR           Output directory for benchmark results
                      (default: infra/bench/results/<UTC timestamp>-<mode>/).
  --timeout SECONDS   Maximum time to wait for jobs to complete (default: 1800).
  -h, --help          Show this help message and exit.
EOF
}

# -----------------------------------------------------------------------------
# 1. Option parsing
# -----------------------------------------------------------------------------
MODE=""
WORKERS=""
AUTOSCALE_MIN=""
AUTOSCALE_MAX=""
API_URL=""
OUT_DIR=""
TIMEOUT=1800

print_node_cpu_warning() {
  local count="$1"
  echo "WARNING: Node 'home-server' has 4 CPU threads shared with the rest of the stack (web, Postgres, MinIO, NATS)." >&2
  echo "         Running with $count workers means extra workers mostly compete for CPU (expected result, not a failure)." >&2
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --workers)
      [ "$#" -ge 2 ] || { echo "ERROR: missing value for --workers" >&2; exit 1; }
      MODE="fixed"
      WORKERS="$2"
      if [[ ! "$WORKERS" =~ ^[0-9]+$ ]]; then
        echo "ERROR: --workers must be an integer between 1 and 6 (got '$WORKERS')" >&2
        exit 1
      fi
      if [ "$WORKERS" -gt 6 ]; then
        echo "ERROR: --workers ($WORKERS) exceeds maximum allowed limit of 6. Memory risk: 6 × 1.5Gi limit ≈ 9Gi approaches node free memory (~7.5GB); running more workers could OOM other pods." >&2
        exit 1
      fi
      if [ "$WORKERS" -lt 1 ]; then
        echo "ERROR: --workers must be between 1 and 6 (got '$WORKERS')" >&2
        exit 1
      fi
      shift 2
      ;;
    --autoscale)
      MODE="autoscale"
      shift 1
      ;;
    --min)
      [ "$#" -ge 2 ] || { echo "ERROR: missing value for --min" >&2; exit 1; }
      val="$2"
      if [[ ! "$val" =~ ^[0-9]+$ ]]; then
        echo "ERROR: --min must be an integer >= 0 (got '$val')" >&2
        exit 1
      fi
      if [ "$val" -gt 6 ]; then
        echo "ERROR: --min ($val) exceeds maximum allowed limit of 6. Memory risk: 6 × 1.5Gi limit ≈ 9Gi approaches node free memory (~7.5GB); running more workers could OOM other pods." >&2
        exit 1
      fi
      AUTOSCALE_MIN="$val"
      shift 2
      ;;
    --max)
      [ "$#" -ge 2 ] || { echo "ERROR: missing value for --max" >&2; exit 1; }
      val="$2"
      if [[ ! "$val" =~ ^[0-9]+$ ]]; then
        echo "ERROR: --max must be an integer >= 1 (got '$val')" >&2
        exit 1
      fi
      if [ "$val" -lt 1 ]; then
        echo "ERROR: --max must be at least 1 (got '$val')" >&2
        exit 1
      fi
      if [ "$val" -gt 6 ]; then
        echo "ERROR: --max ($val) exceeds maximum allowed limit of 6. Memory risk: 6 × 1.5Gi limit ≈ 9Gi approaches node free memory (~7.5GB); running more workers could OOM other pods." >&2
        exit 1
      fi
      AUTOSCALE_MAX="$val"
      shift 2
      ;;
    --api)
      [ "$#" -ge 2 ] || { echo "ERROR: missing value for --api" >&2; exit 1; }
      API_URL="$2"
      shift 2
      ;;
    --out)
      [ "$#" -ge 2 ] || { echo "ERROR: missing value for --out" >&2; exit 1; }
      OUT_DIR="$2"
      shift 2
      ;;
    --timeout)
      [ "$#" -ge 2 ] || { echo "ERROR: missing value for --timeout" >&2; exit 1; }
      TIMEOUT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ -z "$MODE" ]; then
  echo "ERROR: Either --workers N (1-6) or --autoscale must be specified." >&2
  usage >&2
  exit 1
fi

if [ "$MODE" = "fixed" ] && { [ -n "$AUTOSCALE_MIN" ] || [ -n "$AUTOSCALE_MAX" ]; }; then
  echo "ERROR: --min and --max can only be used with --autoscale" >&2
  exit 1
fi

if [ "$MODE" = "autoscale" ] && [ -n "$AUTOSCALE_MIN" ] && [ -n "$AUTOSCALE_MAX" ]; then
  if [ "$AUTOSCALE_MIN" -gt "$AUTOSCALE_MAX" ]; then
    echo "ERROR: --min ($AUTOSCALE_MIN) cannot be greater than --max ($AUTOSCALE_MAX)" >&2
    exit 1
  fi
fi

if [ "$MODE" = "fixed" ] && [ "$WORKERS" -ge 4 ]; then
  print_node_cpu_warning "$WORKERS"
fi

KUBE_CONTEXT="${KUBE_CONTEXT:-default}"
KUBECTL=(kubectl --context "$KUBE_CONTEXT" -n imgproc)

ORIGINAL_MIN=""
ORIGINAL_MAX=""
PATCHED_SCALEDOBJECT=0

if [ "$MODE" = "autoscale" ]; then
  # Read current ScaledObject values if needed or to record them
  orig_min="$("${KUBECTL[@]}" get scaledobject image-worker -o jsonpath='{.spec.minReplicaCount}' 2>/dev/null || true)"
  orig_max="$("${KUBECTL[@]}" get scaledobject image-worker -o jsonpath='{.spec.maxReplicaCount}' 2>/dev/null || true)"
  ORIGINAL_MIN="${orig_min:-0}"
  ORIGINAL_MAX="${orig_max:-3}"

  if [ -z "$AUTOSCALE_MIN" ]; then
    AUTOSCALE_MIN="$ORIGINAL_MIN"
  fi
  if [ -z "$AUTOSCALE_MAX" ]; then
    AUTOSCALE_MAX="$ORIGINAL_MAX"
  fi

  if [ "$AUTOSCALE_MIN" -gt "$AUTOSCALE_MAX" ]; then
    echo "ERROR: --min ($AUTOSCALE_MIN) cannot be greater than --max ($AUTOSCALE_MAX)" >&2
    exit 1
  fi
  if [ "$AUTOSCALE_MAX" -gt 6 ]; then
    echo "ERROR: --max ($AUTOSCALE_MAX) exceeds maximum allowed limit of 6. Memory risk: 6 × 1.5Gi limit ≈ 9Gi approaches node free memory (~7.5GB); running more workers could OOM other pods." >&2
    exit 1
  fi

  if [ "$AUTOSCALE_MAX" -ge 4 ]; then
    print_node_cpu_warning "$AUTOSCALE_MAX"
  fi
fi

TIMESTAMP_UTC="$(date -u +"%Y%m%d-%H%M%S")"
if [ -z "$OUT_DIR" ]; then
  if [ "$MODE" = "fixed" ]; then
    OUT_DIR="$SCRIPT_DIR/results/${TIMESTAMP_UTC}-fixed-${WORKERS}w"
  else
    OUT_DIR="$SCRIPT_DIR/results/${TIMESTAMP_UTC}-autoscale-${AUTOSCALE_MIN}-${AUTOSCALE_MAX}"
  fi
fi

mkdir -p "$OUT_DIR"

# -----------------------------------------------------------------------------
# 2. Cleanup trap
# Order: stop sampler -> remove pause annotation -> DELETE batches -> stop port-forward LAST
# -----------------------------------------------------------------------------
PORT_FORWARD_PID=""
SAMPLER_PID=""
ALL_BATCH_IDS=()

cleanup() {
  local exit_code=$?
  echo "Cleaning up benchmark run..."

  # 1. Stop metrics sampler
  if [ -n "$SAMPLER_PID" ] && kill -0 "$SAMPLER_PID" 2>/dev/null; then
    echo "Stopping metrics sampler (PID: $SAMPLER_PID)..."
    kill "$SAMPLER_PID" 2>/dev/null || true
    SAMPLER_PID=""
  fi

  # 2. Remove pause annotation on ScaledObject if in fixed mode
  if [ "$MODE" = "fixed" ]; then
    echo "Removing KEDA pause annotation on ScaledObject/image-worker..."
    "${KUBECTL[@]}" annotate scaledobject image-worker autoscaling.keda.sh/paused-replicas- --overwrite 2>/dev/null || true
  fi

  # 3. Restore original min/max replica counts on ScaledObject if patched
  if [ "$PATCHED_SCALEDOBJECT" -eq 1 ]; then
    echo "Restoring ScaledObject/image-worker to minReplicaCount=$ORIGINAL_MIN, maxReplicaCount=$ORIGINAL_MAX..."
    if ! "${KUBECTL[@]}" patch scaledobject image-worker --type=merge -p "{\"spec\":{\"minReplicaCount\":$ORIGINAL_MIN,\"maxReplicaCount\":$ORIGINAL_MAX}}"; then
      echo "ERROR: Failed to restore ScaledObject/image-worker min/max replica counts!" >&2
      echo "Please run the following command manually:" >&2
      echo "kubectl --context $KUBE_CONTEXT -n imgproc patch scaledobject image-worker --type=merge -p '{\"spec\":{\"minReplicaCount\":$ORIGINAL_MIN,\"maxReplicaCount\":$ORIGINAL_MAX}}'" >&2
    fi
  fi

  # 4. Delete benchmark and warm-up batches via API (while port-forward is still alive!)
  if [ -n "$API_URL" ] && [ "${#ALL_BATCH_IDS[@]}" -gt 0 ]; then
    echo "Deleting ${#ALL_BATCH_IDS[@]} benchmark/warm-up batches via API..."
    for b_id in "${ALL_BATCH_IDS[@]}"; do
      if ! curl -fsS -X DELETE "$API_URL/api/batches/$b_id" >/dev/null 2>&1; then
        echo "WARNING: Failed to delete batch $b_id via $API_URL/api/batches/$b_id" >&2
      fi
    done
  fi

  # 5. Stop port-forward LAST
  if [ -n "$PORT_FORWARD_PID" ] && kill -0 "$PORT_FORWARD_PID" 2>/dev/null; then
    echo "Stopping port-forward (PID: $PORT_FORWARD_PID)..."
    kill "$PORT_FORWARD_PID" 2>/dev/null || true
    PORT_FORWARD_PID=""
  fi

  echo "Cleanup complete."
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

# -----------------------------------------------------------------------------
# 3. Verify dataset presence
# -----------------------------------------------------------------------------
if [ ! -d "$IMAGES_DIR" ] || [ ! -f "$IMAGES_TXT" ]; then
  echo "Images directory or images.txt not found. Running fetch.sh..."
  bash "$DATASET_DIR/fetch.sh"
fi

IMAGE_FILES=()
while IFS= read -r line || [ -n "$line" ]; do
  line="$(echo "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  [ -z "$line" ] && continue
  [[ "$line" =~ ^# ]] && continue
  read -r col1 col2 _ <<< "$line"
  if [ "${#col1}" -eq 64 ]; then
    fname="$(basename "$col2")"
  else
    fname="$(basename "$col1")"
  fi
  IMAGE_FILES+=("$fname")
done < "$IMAGES_TXT"

if [ "${#IMAGE_FILES[@]}" -ne 100 ]; then
  echo "ERROR: Expected 100 files from $IMAGES_TXT, found ${#IMAGE_FILES[@]}." >&2
  exit 1
fi

# -----------------------------------------------------------------------------
# 4. Port forward if API URL was not provided
# -----------------------------------------------------------------------------
if [ -z "$API_URL" ]; then
  PORT=3000
  if command -v nc >/dev/null 2>&1 && nc -z 127.0.0.1 3000 2>/dev/null; then
    PORT=33000
  fi
  echo "Starting kubectl port-forward for svc/web on port $PORT..."
  "${KUBECTL[@]}" port-forward svc/web "$PORT:3000" >/dev/null 2>&1 &
  PORT_FORWARD_PID=$!
  API_URL="http://127.0.0.1:$PORT"

  echo "Waiting for Web API at $API_URL/health..."
  ready=0
  for _ in {1..30}; do
    if curl -fsS "$API_URL/health" >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 1
  done
  if [ "$ready" -ne 1 ]; then
    echo "ERROR: Web API did not become ready at $API_URL." >&2
    exit 1
  fi
  echo "Web API is ready."
fi

# -----------------------------------------------------------------------------
# 5. Cluster setup & Warm-up
# -----------------------------------------------------------------------------
START_TIME="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

if [ "$MODE" = "fixed" ]; then
  echo "Setting ScaledObject/image-worker pause annotation to $WORKERS..."
  "${KUBECTL[@]}" annotate scaledobject image-worker "autoscaling.keda.sh/paused-replicas=$WORKERS" --overwrite

  echo "Waiting for deployment/image-worker to reach exactly $WORKERS ready replicas (no terminating pods)..."
  fixed_ready_ok=0
  spec_replicas=0
  ready_replicas=0
  pod_count=0
  for _ in {1..120}; do
    spec_replicas="$("${KUBECTL[@]}" get deployment image-worker -o jsonpath='{.spec.replicas}' 2>/dev/null || echo 0)"
    ready_replicas="$("${KUBECTL[@]}" get deployment image-worker -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo 0)"
    pod_count="$("${KUBECTL[@]}" get pods -l app.kubernetes.io/name=image-worker --no-headers 2>/dev/null | grep -c . || true)"
    spec_replicas="${spec_replicas:-0}"
    ready_replicas="${ready_replicas:-0}"
    pod_count="${pod_count:-0}"
    if [ "$spec_replicas" -eq "$WORKERS" ] && [ "$ready_replicas" -eq "$WORKERS" ] && [ "$pod_count" -eq "$WORKERS" ]; then
      fixed_ready_ok=1
      break
    fi
    sleep 2
  done
  if [ "$fixed_ready_ok" -ne 1 ]; then
    echo "ERROR: image-worker did not reach exactly $WORKERS ready replicas without terminating pods (spec: $spec_replicas, ready: $ready_replicas, pods: $pod_count)." >&2
    exit 1
  fi
  echo "Workers ready: exactly $WORKERS (0 terminating)."

  # Warm-up batch: 2 * WORKERS images
  WARMUP_COUNT=$((2 * WORKERS))
  echo "Sending warm-up batch of $WARMUP_COUNT images..."
  CURL_ARGS=(-fsS -X POST "$API_URL/api/batches" -F "config={\"targets\":[\"face\",\"plate\"],\"style\":\"blur\"}")
  for ((i = 0; i < WARMUP_COUNT; i++)); do
    CURL_ARGS+=(-F "files=@$IMAGES_DIR/${IMAGE_FILES[i]}")
  done
  warmup_resp="$(curl "${CURL_ARGS[@]}")"
  WARMUP_ID="$(python3 -c "import sys, json; print(json.load(sys.stdin)['batch']['id'])" <<< "$warmup_resp")"
  ALL_BATCH_IDS+=("$WARMUP_ID")
  echo "Warm-up batch created: $WARMUP_ID. Waiting for it to reach terminal state..."

  warmup_ok=0
  for _ in {1..300}; do
    batch_info="$(curl -fsS "$API_URL/api/batches/$WARMUP_ID")"
    pending_jobs="$(python3 -c "
import sys, json
data = json.load(sys.stdin)
jobs = data['batch']['jobs']
pending = [j for j in jobs if j.get('status') not in ('COMPLETED', 'FAILED')]
print(len(pending))
" <<< "$batch_info")"
    if [ "$pending_jobs" -eq 0 ]; then
      warmup_ok=1
      break
    fi
    sleep 2
  done
  if [ "$warmup_ok" -ne 1 ]; then
    echo "ERROR: Warm-up batch $WARMUP_ID did not reach terminal state within 600s." >&2
    exit 1
  fi
  echo "Warm-up complete. Model loaded on all workers."
else
  # Autoscale mode: patch ScaledObject if min/max differ from requested
  if [ "$AUTOSCALE_MIN" -ne "$ORIGINAL_MIN" ] || [ "$AUTOSCALE_MAX" -ne "$ORIGINAL_MAX" ]; then
    echo "Patching ScaledObject/image-worker minReplicaCount=$AUTOSCALE_MIN, maxReplicaCount=$AUTOSCALE_MAX..."
    "${KUBECTL[@]}" patch scaledobject image-worker --type=merge -p "{\"spec\":{\"minReplicaCount\":$AUTOSCALE_MIN,\"maxReplicaCount\":$AUTOSCALE_MAX}}"
    PATCHED_SCALEDOBJECT=1
  fi

  # Ensure no pause annotation
  "${KUBECTL[@]}" annotate scaledobject image-worker autoscaling.keda.sh/paused-replicas- --overwrite 2>/dev/null || true

  # Pre-run wait: exactly M pods (same "exactly N" check as fixed mode, including Terminating pods), all Ready
  echo "Waiting for deployment/image-worker to reach exactly $AUTOSCALE_MIN ready replicas (no terminating pods)..."
  autoscale_ready_ok=0
  spec_replicas=0
  ready_replicas=0
  pod_count=0
  for _ in {1..180}; do
    spec_replicas="$("${KUBECTL[@]}" get deployment image-worker -o jsonpath='{.spec.replicas}' 2>/dev/null || echo 0)"
    ready_replicas="$("${KUBECTL[@]}" get deployment image-worker -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo 0)"
    pod_count="$("${KUBECTL[@]}" get pods -l app.kubernetes.io/name=image-worker --no-headers 2>/dev/null | grep -c . || true)"
    spec_replicas="${spec_replicas:-0}"
    ready_replicas="${ready_replicas:-0}"
    pod_count="${pod_count:-0}"
    if [ "$spec_replicas" -eq "$AUTOSCALE_MIN" ] && [ "$ready_replicas" -eq "$AUTOSCALE_MIN" ] && [ "$pod_count" -eq "$AUTOSCALE_MIN" ]; then
      autoscale_ready_ok=1
      break
    fi
    sleep 2
  done
  if [ "$autoscale_ready_ok" -ne 1 ]; then
    echo "ERROR: image-worker did not reach exactly $AUTOSCALE_MIN ready replicas without terminating pods (spec: $spec_replicas, ready: $ready_replicas, pods: $pod_count)." >&2
    exit 1
  fi
  echo "Workers ready: exactly $AUTOSCALE_MIN (0 terminating)."

  # If M > 0, send warm-up batch of 2xM (excluded), like fixed mode, so always-on workers are warm
  if [ "$AUTOSCALE_MIN" -gt 0 ]; then
    WARMUP_COUNT=$((2 * AUTOSCALE_MIN))
    echo "Sending warm-up batch of $WARMUP_COUNT images for $AUTOSCALE_MIN always-on worker(s)..."
    CURL_ARGS=(-fsS -X POST "$API_URL/api/batches" -F "config={\"targets\":[\"face\",\"plate\"],\"style\":\"blur\"}")
    for ((i = 0; i < WARMUP_COUNT; i++)); do
      CURL_ARGS+=(-F "files=@$IMAGES_DIR/${IMAGE_FILES[i]}")
    done
    warmup_resp="$(curl "${CURL_ARGS[@]}")"
    WARMUP_ID="$(python3 -c "import sys, json; print(json.load(sys.stdin)['batch']['id'])" <<< "$warmup_resp")"
    ALL_BATCH_IDS+=("$WARMUP_ID")
    echo "Warm-up batch created: $WARMUP_ID. Waiting for it to reach terminal state..."

    warmup_ok=0
    for _ in {1..300}; do
      batch_info="$(curl -fsS "$API_URL/api/batches/$WARMUP_ID")"
      pending_jobs="$(python3 -c "
import sys, json
data = json.load(sys.stdin)
jobs = data['batch']['jobs']
pending = [j for j in jobs if j.get('status') not in ('COMPLETED', 'FAILED')]
print(len(pending))
" <<< "$batch_info")"
      if [ "$pending_jobs" -eq 0 ]; then
        warmup_ok=1
        break
      fi
      sleep 2
    done
    if [ "$warmup_ok" -ne 1 ]; then
      echo "ERROR: Warm-up batch $WARMUP_ID did not reach terminal state within 600s." >&2
      exit 1
    fi
    echo "Warm-up complete. Model loaded on always-on worker(s)."
  else
    echo "Autoscale starting with 0 active workers (cold start)."
  fi
fi

# -----------------------------------------------------------------------------
# 6. Start background metrics sampling
# -----------------------------------------------------------------------------
echo "Starting resource and replica metrics sampler (every 5s)..."
sample_metrics() {
  echo "timestamp,pod,cpu,memory" > "$OUT_DIR/top.csv"
  echo "timestamp,desired,ready" > "$OUT_DIR/replicas.csv"

  while true; do
    ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

    # top.csv
    top_out="$("${KUBECTL[@]}" top pod -l app.kubernetes.io/name=image-worker --no-headers 2>/dev/null || true)"
    if [ -n "$top_out" ]; then
      while read -r pod cpu mem; do
        if [ -n "$pod" ]; then
          echo "$ts,$pod,$cpu,$mem" >> "$OUT_DIR/top.csv"
        fi
      done <<< "$top_out"
    fi

    # replicas.csv
    rep_out="$("${KUBECTL[@]}" get deployment image-worker -o jsonpath='{.spec.replicas},{.status.readyReplicas}' 2>/dev/null || true)"
    desired="$(printf '%s' "$rep_out" | cut -d',' -f1)"
    ready="$(printf '%s' "$rep_out" | cut -d',' -f2)"
    desired="${desired:-0}"
    ready="${ready:-0}"
    echo "$ts,$desired,$ready" >> "$OUT_DIR/replicas.csv"

    sleep 5
  done
}

sample_metrics &
SAMPLER_PID=$!

# -----------------------------------------------------------------------------
# 7. Submit benchmark batches (5 batches of 20)
# -----------------------------------------------------------------------------
BENCH_BATCH_IDS=()
echo "Submitting 100 images as 5 batches of 20 back-to-back..."

for b in {0..4}; do
  start_idx=$((b * 20))
  CURL_ARGS=(-fsS -X POST "$API_URL/api/batches" -F "config={\"targets\":[\"face\",\"plate\"],\"style\":\"blur\"}")
  for ((i = 0; i < 20; i++)); do
    idx=$((start_idx + i))
    CURL_ARGS+=(-F "files=@$IMAGES_DIR/${IMAGE_FILES[idx]}")
  done

  batch_resp="$(curl "${CURL_ARGS[@]}")"
  b_id="$(python3 -c "import sys, json; print(json.load(sys.stdin)['batch']['id'])" <<< "$batch_resp")"
  echo "Submitted batch $((b + 1))/5: $b_id"
  BENCH_BATCH_IDS+=("$b_id")
  ALL_BATCH_IDS+=("$b_id")
done

# -----------------------------------------------------------------------------
# 8. Wait for all benchmark jobs to become terminal
# -----------------------------------------------------------------------------
echo "Waiting for all benchmark jobs to finish (timeout: ${TIMEOUT}s)..."
start_wait="$(date +%s)"
all_terminal=0

while true; do
  now="$(date +%s)"
  if [ "$((now - start_wait))" -ge "$TIMEOUT" ]; then
    break
  fi

  total_pending=0
  for b_id in "${BENCH_BATCH_IDS[@]}"; do
    b_info="$(curl -fsS "$API_URL/api/batches/$b_id")"
    pending="$(python3 -c "
import sys, json
data = json.load(sys.stdin)
jobs = data['batch']['jobs']
pending = [j for j in jobs if j.get('status') not in ('COMPLETED', 'FAILED')]
print(len(pending))
" <<< "$b_info")"
    total_pending=$((total_pending + pending))
  done

  if [ "$total_pending" -eq 0 ]; then
    all_terminal=1
    break
  fi

  echo "Pending jobs remaining: $total_pending. Sleeping 5s..."
  sleep 5
done

if [ "$all_terminal" -ne 1 ]; then
  echo "ERROR: Benchmark jobs did not reach terminal state within timeout (${TIMEOUT}s)." >&2
  exit 1
fi
echo "All benchmark jobs completed."

END_TIME="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# -----------------------------------------------------------------------------
# 9. Autoscale cooldown monitoring & stop sampler
# In autoscale mode, keep sampling until desired==M && ready==M (timeout 600s).
# Fixed mode stops the sampler immediately.
# -----------------------------------------------------------------------------
if [ "$MODE" = "autoscale" ]; then
  echo "Waiting for image-worker to scale back down to $AUTOSCALE_MIN replicas (cooldown, timeout: 600s)..."
  cooldown_ok=0
  for _ in {1..120}; do
    rep_out="$("${KUBECTL[@]}" get deployment image-worker -o jsonpath='{.spec.replicas},{.status.readyReplicas}' 2>/dev/null || true)"
    des="$(printf '%s' "$rep_out" | cut -d',' -f1)"
    rdy="$(printf '%s' "$rep_out" | cut -d',' -f2)"
    des="${des:-0}"
    rdy="${rdy:-0}"
    if [ "$des" -eq "$AUTOSCALE_MIN" ] && [ "$rdy" -eq "$AUTOSCALE_MIN" ]; then
      cooldown_ok=1
      break
    fi
    sleep 5
  done
  if [ "$cooldown_ok" -ne 1 ]; then
    echo "ERROR: image-worker did not scale back down to $AUTOSCALE_MIN replicas within 600s cooldown." >&2
    exit 1
  fi
  echo "Scale-down to $AUTOSCALE_MIN replicas observed on deployment."

  # Wait until the background sampler has recorded the M/M sample in replicas.csv
  echo "Waiting for sampler to record $AUTOSCALE_MIN/$AUTOSCALE_MIN replicas in $OUT_DIR/replicas.csv (timeout: 30s)..."
  sampler_target_ok=0
  for _ in {1..15}; do
    last_line="$(tail -n 1 "$OUT_DIR/replicas.csv" 2>/dev/null || true)"
    last_des="$(printf '%s' "$last_line" | cut -d',' -f2)"
    last_rdy="$(printf '%s' "$last_line" | cut -d',' -f3)"
    if [ "$last_des" = "$AUTOSCALE_MIN" ] && [ "$last_rdy" = "$AUTOSCALE_MIN" ]; then
      sampler_target_ok=1
      break
    fi
    sleep 2
  done
  if [ "$sampler_target_ok" -ne 1 ]; then
    echo "ERROR: Sampler did not record $AUTOSCALE_MIN/$AUTOSCALE_MIN in replicas.csv within 30s." >&2
    exit 1
  fi
  echo "Sampler recorded $AUTOSCALE_MIN/$AUTOSCALE_MIN in replicas.csv."
fi

if [ -n "$SAMPLER_PID" ] && kill -0 "$SAMPLER_PID" 2>/dev/null; then
  echo "Stopping metrics sampler (PID: $SAMPLER_PID)..."
  kill "$SAMPLER_PID" 2>/dev/null || true
  SAMPLER_PID=""
fi

# -----------------------------------------------------------------------------
# 10. Export jobs.csv from PostgreSQL
# -----------------------------------------------------------------------------
echo "Exporting job rows from PostgreSQL to $OUT_DIR/jobs.csv..."
SQL_IDS="$(printf "'%s'," "${BENCH_BATCH_IDS[@]}" | sed 's/,$//')"

"${KUBECTL[@]}" exec postgresql-0 -c postgresql -- bash -c "
  PGPASSWORD=\"\$(cat /opt/bitnami/postgresql/secrets/password 2>/dev/null || cat /opt/bitnami/postgresql/secrets/postgres-password 2>/dev/null || echo \"\$POSTGRES_PASSWORD\")\" \
  psql -U imgproc -d imgproc --csv -c \"
    SELECT
      id AS job_id,
      batch_id,
      status,
      to_char(created_at, 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS created_at,
      to_char(updated_at, 'YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') AS updated_at,
      (result_summary->>'processingTimeMs')::int AS processing_time_ms,
      result_summary->>'imageSize' AS image_size
    FROM jobs
    WHERE batch_id IN ($SQL_IDS)
    ORDER BY created_at ASC;
  \"
" > "$OUT_DIR/jobs.csv"

# -----------------------------------------------------------------------------
# 11. Record metadata in meta.json
# -----------------------------------------------------------------------------
echo "Gathering environment metadata..."
CONTAINER_IMAGE="$("${KUBECTL[@]}" get deployment image-worker -o jsonpath='{.spec.template.spec.containers[?(@.name=="image-worker")].image}' 2>/dev/null || echo "unknown")"
CPU_LIMIT="$("${KUBECTL[@]}" get deployment image-worker -o jsonpath='{.spec.template.spec.containers[?(@.name=="image-worker")].resources.limits.cpu}' 2>/dev/null || echo "unknown")"
MEM_LIMIT="$("${KUBECTL[@]}" get deployment image-worker -o jsonpath='{.spec.template.spec.containers[?(@.name=="image-worker")].resources.limits.memory}' 2>/dev/null || echo "unknown")"
NODE_NAME="$("${KUBECTL[@]}" get deployment image-worker -o jsonpath='{.spec.template.spec.nodeSelector.kubernetes\.io/hostname}' 2>/dev/null || echo "home-server")"
IMAGES_TXT_HASH="$(sha256sum "$IMAGES_TXT" | awk '{print $1}')"

python3 - <<EOF
import json
meta = {
    "mode": "$MODE",
    "worker_count": $WORKERS if "$MODE" == "fixed" else None,
    "min_replicas": $AUTOSCALE_MIN if "$MODE" == "autoscale" else None,
    "max_replicas": $AUTOSCALE_MAX if "$MODE" == "autoscale" else None,
    "original_min": $ORIGINAL_MIN if "$MODE" == "autoscale" and "$ORIGINAL_MIN" != "" else None,
    "original_max": $ORIGINAL_MAX if "$MODE" == "autoscale" and "$ORIGINAL_MAX" != "" else None,
    "container_image": "$CONTAINER_IMAGE",
    "cpu_limit": "$CPU_LIMIT",
    "memory_limit": "$MEM_LIMIT",
    "node_name": "$NODE_NAME",
    "images_txt_hash": "$IMAGES_TXT_HASH",
    "start_time": "$START_TIME",
    "end_time": "$END_TIME"
}
with open("$OUT_DIR/meta.json", "w", encoding="utf-8") as f:
    json.dump(meta, f, indent=2)
EOF

echo "Run finished. Results saved to $OUT_DIR."

# -----------------------------------------------------------------------------
# 12. Run summary script (only reached on complete success)
# -----------------------------------------------------------------------------
if [ -f "$SCRIPT_DIR/summarize.py" ]; then
  echo "Generating summary..."
  python3 "$SCRIPT_DIR/summarize.py" "$OUT_DIR"
fi
