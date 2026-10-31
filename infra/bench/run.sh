#!/usr/bin/env bash
# Baseline benchmark runner for the imgproc image pipeline.
#
# Usage:
#   run.sh [--workers N | --autoscale [--min M] [--max N]] [--dataset small|large|max] [--parallel P] [--preload]
#          [--confidence X] [--save-detections] [--machine NAME] [--api URL] [--out DIR] [--timeout SECONDS]
#
# Options:
#   --workers N         Fixed replica mode (N: 1 to 6). Annotates ScaledObject,
#                       waits for N Ready pods, runs warm-up batch of 2xN images.
#   --autoscale         Autoscale mode with optional min/max replicas (1 to 6).
#   --min M             Minimum replicas for autoscale mode (0 to 6, default: current ScaledObject value, e.g. 0).
#   --max N             Maximum replicas for autoscale mode (1 to 6, default: current ScaledObject value, e.g. 3).
#   --dataset small|large|max  Image set: small = 100 images / 5 batches (default), large = 1000 images / 50 batches,
#                       max = 3726 images (dataset/images-max.txt; fetch with dataset/fetch.sh --set max).
#   --parallel P        Upload up to P batches at the same time (default: 1 = one after another).
#   --preload           Fixed mode only: pause workers at 0, upload every batch so the jobs wait in the queue,
#                       then release N workers. Measures how fast the workers drain a full queue.
#   --confidence X      Detection confidence threshold (0.0 to 1.0; passes confidenceThreshold in batch config).
#   --save-detections   Export bounding boxes and scores into detections.jsonl via PostgreSQL.
#   --machine NAME      Machine/node name for results directory (default: worker pod node name).
#   --api URL           Base URL of Web API (default: starts kubectl port-forward svc/web).
#   --out DIR           Output directory for benchmark results
#                       (default: infra/bench/results/<machine>-<YYYYMMDD>[-1000|-max]/<UTC>-<mode>/).
#   --timeout SECONDS   Maximum time to wait for jobs to complete (default: 1800, large dataset: 7200, max dataset: 27000).
#   -h, --help          Show this help message and exit.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATASET_DIR="$SCRIPT_DIR/dataset"
IMAGES_DIR="$DATASET_DIR/images"
IMAGES_TXT="$DATASET_DIR/images.txt"
EXPECTED_IMAGES=100
BATCH_SIZE=20

usage() {
  cat <<'EOF'
Usage: run.sh [--workers N | --autoscale [--min M] [--max N]] [--dataset small|large|max] [--parallel P] [--preload]
              [--confidence X] [--imgsz N] [--save-detections] [--machine NAME] [--api URL] [--out DIR] [--timeout SECONDS]

Runs the baseline image pipeline benchmark (batches of 20 images: small = 100 images / 5 batches, large = 1000 images / 50 batches, max = 3726 images).

Options:
  --workers N         Fixed replica mode (N: 1 to 6). Annotates ScaledObject,
                      waits for N Ready pods, runs warm-up batch of 2xN images.
  --autoscale         Autoscale mode with optional min/max replicas (1 to 6).
  --min M             Minimum replicas for autoscale mode (0 to 6, default: current ScaledObject value, e.g. 0).
  --max N             Maximum replicas for autoscale mode (1 to 6, default: current ScaledObject value, e.g. 3).
  --dataset small|large|max  Image set: small = 100 images (default), large = 1000 images, max = 3726 images (fetch with dataset/fetch.sh --set max).
  --parallel P        Upload up to P batches at the same time (default: 1 = one after another).
  --preload           Fixed mode only: pause workers at 0, upload every batch so the jobs wait in the queue,
                      then release N workers. Measures how fast the workers drain a full queue.
  --confidence X      Detection confidence threshold (0.0 to 1.0; passes confidenceThreshold in batch config).
  --imgsz N           YOLO input size (multiple of 32, e.g. 640, 960, 1280; default: leave deployment as-is = 640).
  --save-detections   Export bounding boxes and scores into detections.jsonl via PostgreSQL.
  --machine NAME      Machine/node name for results directory (default: worker pod node name).
  --api URL           Base URL of Web API (default: starts kubectl port-forward svc/web).
  --out DIR           Output directory for benchmark results
                      (default: infra/bench/results/<machine>-<set>/<imgsz>px/<UTC>-<mode>/).
  --timeout SECONDS   Maximum time to wait for jobs to complete (default: 1800, large dataset: 7200, max dataset: 27000).
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
MACHINE=""
API_URL=""
OUT_DIR=""
TIMEOUT=""
DATASET="small"
PARALLEL=1
PRELOAD=0
CONFIDENCE=""
SAVE_DETECTIONS=0
IMGSZ=""
PREV_YOLO_IMGSZ=""
PATCHED_IMGSZ=0

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
    --machine)
      [ "$#" -ge 2 ] || { echo "ERROR: missing value for --machine" >&2; exit 1; }
      MACHINE="$2"
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
    --dataset)
      [ "$#" -ge 2 ] || { echo "ERROR: missing value for --dataset" >&2; exit 1; }
      DATASET="$2"
      if [ "$DATASET" != "small" ] && [ "$DATASET" != "large" ] && [ "$DATASET" != "max" ]; then
        echo "ERROR: --dataset must be 'small', 'large', or 'max' (got '$DATASET')" >&2
        exit 1
      fi
      shift 2
      ;;
    --parallel)
      [ "$#" -ge 2 ] || { echo "ERROR: missing value for --parallel" >&2; exit 1; }
      PARALLEL="$2"
      if [[ ! "$PARALLEL" =~ ^[0-9]+$ ]] || [ "$PARALLEL" -lt 1 ]; then
        echo "ERROR: --parallel must be an integer >= 1 (got '$PARALLEL')" >&2
        exit 1
      fi
      shift 2
      ;;
    --preload)
      PRELOAD=1
      shift 1
      ;;
    --confidence)
      [ "$#" -ge 2 ] || { echo "ERROR: missing value for --confidence" >&2; exit 1; }
      CONFIDENCE="$2"
      if ! python3 -c "import sys; v = float(sys.argv[1]); sys.exit(0 if 0.0 <= v <= 1.0 else 1)" "$CONFIDENCE" 2>/dev/null; then
        echo "ERROR: --confidence must be a number between 0 and 1 (got '$CONFIDENCE')" >&2
        exit 1
      fi
      shift 2
      ;;
    --imgsz)
      [ "$#" -ge 2 ] || { echo "ERROR: missing value for --imgsz" >&2; exit 1; }
      val="$2"
      if [[ ! "$val" =~ ^[0-9]+$ ]] || [ "$val" -le 0 ] || [ $((val % 32)) -ne 0 ]; then
        echo "ERROR: --imgsz must be a positive integer multiple of 32 (got '$val')" >&2
        exit 1
      fi
      IMGSZ="$val"
      shift 2
      ;;
    --save-detections)
      SAVE_DETECTIONS=1
      shift 1
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

if [ "$PRELOAD" -eq 1 ] && [ "$MODE" != "fixed" ]; then
  echo "ERROR: --preload only works with --workers N (fixed mode); autoscale needs the workers to scale up from the queue." >&2
  exit 1
fi

if [ "$DATASET" = "large" ]; then
  IMAGES_DIR="$DATASET_DIR/images-1000"
  IMAGES_TXT="$DATASET_DIR/images-1000.txt"
  EXPECTED_IMAGES=1000
  TIMEOUT="${TIMEOUT:-7200}"
elif [ "$DATASET" = "max" ]; then
  IMAGES_DIR="$DATASET_DIR/images-max"
  IMAGES_TXT="$DATASET_DIR/images-max.txt"
  EXPECTED_IMAGES=3726
  TIMEOUT="${TIMEOUT:-27000}"
fi
TIMEOUT="${TIMEOUT:-1800}"
NUM_BATCHES=$(((EXPECTED_IMAGES + BATCH_SIZE - 1) / BATCH_SIZE))

if [ -n "$CONFIDENCE" ]; then
  BATCH_CONFIG_JSON="{\"targets\":[\"face\",\"plate\"],\"style\":\"blur\",\"confidenceThreshold\":$CONFIDENCE}"
else
  BATCH_CONFIG_JSON="{\"targets\":[\"face\",\"plate\"],\"style\":\"blur\"}"
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

KUBE_CONTEXT="${KUBE_CONTEXT:-bench-local}"
if [ "$KUBE_CONTEXT" = "default" ]; then
  echo "ERROR: Refusing to run with context 'default'! The lab context must never be touched." >&2
  exit 1
fi
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

if [ -z "$MACHINE" ]; then
  # Detect worker pod node name, or cluster node name, or default
  detected_node="$("${KUBECTL[@]}" get pod -l app.kubernetes.io/name=image-worker -o jsonpath='{.items[0].spec.nodeName}' 2>/dev/null || true)"
  if [ -z "$detected_node" ]; then
    detected_node="$("${KUBECTL[@]}" get deployment image-worker -o jsonpath='{.spec.template.spec.nodeSelector.kubernetes\.io/hostname}' 2>/dev/null || true)"
  fi
  if [ -z "$detected_node" ]; then
    detected_node="$("${KUBECTL[@]}" get nodes -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
  fi
  MACHINE="${detected_node:-home-server}"
fi

EFFECTIVE_IMGSZ="${IMGSZ:-640}"
SET_TAG="100"
if [ "$DATASET" = "large" ]; then
  SET_TAG="1000"
elif [ "$DATASET" = "max" ]; then
  SET_TAG="max"
fi

if [ -z "$OUT_DIR" ]; then
  if [ "$MODE" = "fixed" ]; then
    OUT_DIR="$SCRIPT_DIR/results/${MACHINE}-${SET_TAG}/${EFFECTIVE_IMGSZ}px/${TIMESTAMP_UTC}-fixed-${WORKERS}w"
  else
    OUT_DIR="$SCRIPT_DIR/results/${MACHINE}-${SET_TAG}/${EFFECTIVE_IMGSZ}px/${TIMESTAMP_UTC}-autoscale-${AUTOSCALE_MIN}-${AUTOSCALE_MAX}"
  fi
fi

mkdir -p "$OUT_DIR"

# -----------------------------------------------------------------------------
# 2. Cleanup trap
# Order: stop sampler -> remove pause annotation -> DELETE batches -> stop port-forward LAST
# -----------------------------------------------------------------------------
PORT_FORWARD_PID=""
SAMPLER_PID=""
UPLOAD_PIDS=()
UPLOAD_TMP=""
ALL_BATCH_IDS=()
RELEASE_TIME=""

cleanup() {
  local exit_code=$?
  echo "Cleaning up benchmark run..."

  # 0. Stop uploads still in flight (parallel mode)
  for u_pid in ${UPLOAD_PIDS[@]+"${UPLOAD_PIDS[@]}"}; do
    pkill -P "$u_pid" 2>/dev/null || true
    kill "$u_pid" 2>/dev/null || true
  done

  if [ -n "$UPLOAD_TMP" ]; then
    rm -rf "$UPLOAD_TMP"
  fi

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

  # 3b. Restore or unset YOLO_IMGSZ on deployment/image-worker if patched
  if [ "$PATCHED_IMGSZ" -eq 1 ]; then
    if [ -n "$PREV_YOLO_IMGSZ" ]; then
      echo "Restoring deployment/image-worker YOLO_IMGSZ to $PREV_YOLO_IMGSZ..."
      "${KUBECTL[@]}" set env deployment/image-worker "YOLO_IMGSZ=$PREV_YOLO_IMGSZ" 2>/dev/null || true
    else
      echo "Unsetting YOLO_IMGSZ on deployment/image-worker..."
      "${KUBECTL[@]}" set env deployment/image-worker YOLO_IMGSZ- 2>/dev/null || true
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
  echo "Images directory or $(basename "$IMAGES_TXT") not found. Running fetch.sh..."
  bash "$DATASET_DIR/fetch.sh" --set "$DATASET"
fi

IMAGE_FILES=()
while IFS= read -r f || [ -n "$f" ]; do
  [ -z "$f" ] && continue
  IMAGE_FILES+=("$f")
done < <(python3 "$SCRIPT_DIR/accuracy/evaluate.py" --list-images "$IMAGES_TXT")

if [ "${#IMAGE_FILES[@]}" -ne "$EXPECTED_IMAGES" ]; then
  echo "ERROR: Expected $EXPECTED_IMAGES files from $IMAGES_TXT, found ${#IMAGE_FILES[@]}." >&2
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

# Waits until the deployment has exactly $1 Ready pods and no others (incl. Terminating); $2 = number of 2s tries.
wait_exact_replicas() {
  local target="$1" tries="$2"
  spec_replicas=0
  ready_replicas=0
  pod_count=0
  for ((t = 0; t < tries; t++)); do
    spec_replicas="$("${KUBECTL[@]}" get deployment image-worker -o jsonpath='{.spec.replicas}' 2>/dev/null || echo 0)"
    ready_replicas="$("${KUBECTL[@]}" get deployment image-worker -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo 0)"
    pod_count="$("${KUBECTL[@]}" get pods -l app.kubernetes.io/name=image-worker --no-headers 2>/dev/null | grep -c . || true)"
    spec_replicas="${spec_replicas:-0}"
    ready_replicas="${ready_replicas:-0}"
    pod_count="${pod_count:-0}"
    if [ "$spec_replicas" -eq "$target" ] && [ "$ready_replicas" -eq "$target" ] && [ "$pod_count" -eq "$target" ]; then
      return 0
    fi
    sleep 2
  done
  return 1
}

# Appends each worker pod's cumulative CPU seconds (kubelet container_cpu_usage_seconds_total, read through the
# node proxy) to $OUT_DIR/cpu_counters.csv with phase $1 (start|end). Writes nothing if the raw call is forbidden
# or fails; summarize.py then falls back to the sampled kubectl top numbers.
CPU_COUNTERS_WARNED=0
read_cpu_counters() {
  local phase="$1" nodes node raw
  nodes="$("${KUBECTL[@]}" get pods -l app.kubernetes.io/name=image-worker -o jsonpath='{range .items[*]}{.spec.nodeName}{"\n"}{end}' 2>/dev/null | sort -u || true)"
  for node in $nodes; do
    if ! raw="$("${KUBECTL[@]}" get --raw "/api/v1/nodes/$node/proxy/metrics/resource" 2>/dev/null)"; then
      if [ "$CPU_COUNTERS_WARNED" -eq 0 ]; then
        echo "WARNING: cannot read /api/v1/nodes/$node/proxy/metrics/resource; CPU (counters) will fall back to sampled kubectl top." >&2
        CPU_COUNTERS_WARNED=1
      fi
      continue
    fi
    if [ ! -f "$OUT_DIR/cpu_counters.csv" ]; then
      echo "phase,timestamp,node,pod,cpu_seconds" > "$OUT_DIR/cpu_counters.csv"
    fi
    printf '%s\n' "$raw" | awk -v phase="$phase" -v node="$node" -v now="$(date +%s)" '
      /^container_cpu_usage_seconds_total\{/ && /namespace="imgproc"/ && /container="image-worker"/ {
        if (match($0, /pod="[^"]*"/) == 0) next
        pod = substr($0, RSTART + 5, RLENGTH - 6)
        n = split(substr($0, index($0, "} ") + 2), f, " ")
        ts = (n >= 2) ? f[2] / 1000 : now
        printf "%s,%.3f,%s,%s,%s\n", phase, ts, node, pod, f[1]
      }' >> "$OUT_DIR/cpu_counters.csv"
  done
}

# -----------------------------------------------------------------------------
# 5. Cluster setup & Warm-up
# -----------------------------------------------------------------------------
START_TIME="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

if [ -n "$IMGSZ" ]; then
  echo "Configuring YOLO_IMGSZ=$IMGSZ on deployment/image-worker..."
  PREV_YOLO_IMGSZ="$("${KUBECTL[@]}" get deployment image-worker -o jsonpath='{.spec.template.spec.containers[?(@.name=="image-worker")].env[?(@.name=="YOLO_IMGSZ")].value}' 2>/dev/null || true)"
  PATCHED_IMGSZ=1
  "${KUBECTL[@]}" set env deployment/image-worker "YOLO_IMGSZ=$IMGSZ"
fi

verify_worker_imgsz() {
  if [ -z "$IMGSZ" ]; then
    return 0
  fi
  local wait_seconds="${1:-0}"
  if [ "$wait_seconds" -gt 0 ]; then
    echo "Waiting up to ${wait_seconds}s for image-worker pod to become Ready..."
    local ready_seen=0 s
    for ((s = 0; s < wait_seconds; s += 2)); do
      local r_rep
      r_rep="$("${KUBECTL[@]}" get deployment image-worker -o jsonpath='{.status.readyReplicas}' 2>/dev/null || echo 0)"
      r_rep="${r_rep:-0}"
      if [ "$r_rep" -ge 1 ]; then
        ready_seen=1
        break
      fi
      sleep 2
    done
    if [ "$ready_seen" -ne 1 ]; then
      echo "ERROR: image-worker did not reach at least 1 ready replica within ${wait_seconds}s." >&2
      exit 1
    fi
  fi
  # The engine logs "input size <N>px" when it finishes loading YOLO, a few seconds after the pod is Ready, so keep looking for a while.
  echo "Verifying worker input size in image-worker logs (up to 120s)..."
  local found_log=0 t
  for ((t = 0; t < 120 && found_log == 0; t += 3)); do
    for p in $("${KUBECTL[@]}" get pod -l app.kubernetes.io/name=image-worker -o jsonpath='{.items[*].metadata.name}' 2>/dev/null); do
      if "${KUBECTL[@]}" logs "$p" -c image-worker --tail=200 2>/dev/null | grep -q "input size ${IMGSZ}px"; then
        found_log=1
        break
      fi
    done
    [ "$found_log" -eq 1 ] || sleep 3
  done
  if [ "$found_log" -ne 1 ]; then
    echo "ERROR: image-worker does not log 'input size ${IMGSZ}px'. The engine image may be outdated and not support YOLO_IMGSZ." >&2
    exit 1
  fi
  echo "Verified image-worker input size ${IMGSZ}px in logs."
}

if [ "$PRELOAD" -eq 1 ]; then
  # Preload: hold the workers at 0 so every job waits in the queue. No warm-up batch (it would sit behind the queue);
  # the lazy model load happens on each worker's first job after the release. Cleanup removes the pause annotation.
  echo "Preload: pausing ScaledObject/image-worker at 0 replicas..."
  "${KUBECTL[@]}" annotate scaledobject image-worker "autoscaling.keda.sh/paused-replicas=0" --overwrite
  echo "Waiting for deployment/image-worker to reach 0 pods..."
  if ! wait_exact_replicas 0 120; then
    echo "ERROR: image-worker did not reach 0 pods (spec: $spec_replicas, ready: $ready_replicas, pods: $pod_count)." >&2
    exit 1
  fi
  echo "Workers paused at 0."
elif [ "$MODE" = "fixed" ]; then
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
  verify_worker_imgsz

  # Warm-up batch: 2 * WORKERS images
  WARMUP_COUNT=$((2 * WORKERS))
  echo "Sending warm-up batch of $WARMUP_COUNT images..."
  CURL_ARGS=(-fsS -X POST "$API_URL/api/batches" -F "config=$BATCH_CONFIG_JSON")
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
  if [ "$AUTOSCALE_MIN" -gt 0 ]; then
    verify_worker_imgsz
  fi

  # If M > 0, send warm-up batch of 2xM (excluded), like fixed mode, so always-on workers are warm
  if [ "$AUTOSCALE_MIN" -gt 0 ]; then
    WARMUP_COUNT=$((2 * AUTOSCALE_MIN))
    echo "Sending warm-up batch of $WARMUP_COUNT images for $AUTOSCALE_MIN always-on worker(s)..."
    CURL_ARGS=(-fsS -X POST "$API_URL/api/batches" -F "config=$BATCH_CONFIG_JSON")
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
# 7. Submit benchmark batches (batches of 20, up to $PARALLEL uploads at the same time)
# -----------------------------------------------------------------------------
BENCH_BATCH_IDS=()
UPLOAD_TMP="$(mktemp -d "$OUT_DIR/.upload.XXXXXX")"

# CPU counters, start of the processing window: just before the batches are submitted (preload: once the released
# workers are Ready, see below).
if [ "$PRELOAD" -eq 0 ]; then
  read_cpu_counters start
fi

# Uploads batch $1 (0-based) and writes its id to $UPLOAD_TMP/$1.
submit_batch() {
  local b="$1" start_idx=$(($1 * BATCH_SIZE)) idx resp
  local end_idx=$((start_idx + BATCH_SIZE))
  if [ "$end_idx" -gt "$EXPECTED_IMAGES" ]; then
    end_idx="$EXPECTED_IMAGES"
  fi
  local curl_args=(-fsS -X POST "$API_URL/api/batches" -F "config=$BATCH_CONFIG_JSON")
  for ((idx = start_idx; idx < end_idx; idx++)); do
    curl_args+=(-F "files=@$IMAGES_DIR/${IMAGE_FILES[idx]}")
  done
  resp="$(curl "${curl_args[@]}")"
  python3 -c "import sys, json; print(json.load(sys.stdin)['batch']['id'])" <<< "$resp" > "$UPLOAD_TMP/$b"
  echo "Submitted batch $((b + 1))/$NUM_BATCHES: $(cat "$UPLOAD_TMP/$b")"
}

echo "Submitting $EXPECTED_IMAGES images as $NUM_BATCHES batches of $BATCH_SIZE (up to $PARALLEL at a time)..."
upload_failed=0
for ((b = 0; b < NUM_BATCHES; b++)); do
  if [ "$PARALLEL" -le 1 ]; then
    submit_batch "$b"
  else
    while :; do
      running=0
      for u_pid in ${UPLOAD_PIDS[@]+"${UPLOAD_PIDS[@]}"}; do
        if kill -0 "$u_pid" 2>/dev/null; then running=$((running + 1)); fi
      done
      [ "$running" -lt "$PARALLEL" ] && break
      sleep 0.2
    done
    # The subshell must not run this script's cleanup trap when it is killed.
    ( trap - EXIT INT TERM; submit_batch "$b" ) &
    UPLOAD_PIDS+=("$!")
  fi
done
if [ "$PARALLEL" -gt 1 ]; then
  for u_pid in "${UPLOAD_PIDS[@]}"; do
    wait "$u_pid" || upload_failed=1
  done
  UPLOAD_PIDS=()
fi

for ((b = 0; b < NUM_BATCHES; b++)); do
  if [ -s "$UPLOAD_TMP/$b" ]; then
    b_id="$(cat "$UPLOAD_TMP/$b")"
    BENCH_BATCH_IDS+=("$b_id")
    ALL_BATCH_IDS+=("$b_id")
  fi
done
rm -rf "$UPLOAD_TMP"
if [ "$upload_failed" -ne 0 ] || [ "${#BENCH_BATCH_IDS[@]}" -ne "$NUM_BATCHES" ]; then
  echo "ERROR: Uploading batches failed (${#BENCH_BATCH_IDS[@]}/$NUM_BATCHES batches created)." >&2
  exit 1
fi

if [ "$PRELOAD" -eq 1 ]; then
  echo "All $NUM_BATCHES batches queued. Releasing $WORKERS worker(s)..."
  RELEASE_TIME="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  "${KUBECTL[@]}" annotate scaledobject image-worker "autoscaling.keda.sh/paused-replicas=$WORKERS" --overwrite
  echo "Waiting for deployment/image-worker to reach exactly $WORKERS ready replicas (no terminating pods)..."
  if ! wait_exact_replicas "$WORKERS" 300; then
    echo "ERROR: image-worker did not reach exactly $WORKERS ready replicas without terminating pods (spec: $spec_replicas, ready: $ready_replicas, pods: $pod_count)." >&2
    exit 1
  fi
  echo "Workers ready: exactly $WORKERS (0 terminating)."
  verify_worker_imgsz
  read_cpu_counters start
fi

if [ "$MODE" = "autoscale" ] && [ "$AUTOSCALE_MIN" -eq 0 ] && [ -n "$IMGSZ" ]; then
  verify_worker_imgsz 300
fi

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
read_cpu_counters end

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
      replace(to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US'), ' ', 'T') || 'Z' AS created_at,
      replace(to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US'), ' ', 'T') || 'Z' AS updated_at,
      (result_summary->>'processingTimeMs')::int AS processing_time_ms,
      result_summary->>'imageSize' AS image_size,
      original_filename
    FROM jobs
    WHERE batch_id IN ($SQL_IDS)
    ORDER BY created_at ASC;
  \"
" > "$OUT_DIR/jobs.csv"

if [ "$SAVE_DETECTIONS" -eq 1 ]; then
  echo "Exporting detections to $OUT_DIR/detections.jsonl..."
  "${KUBECTL[@]}" exec postgresql-0 -c postgresql -- bash -c "
    PGPASSWORD=\"\$(cat /opt/bitnami/postgresql/secrets/password 2>/dev/null || cat /opt/bitnami/postgresql/secrets/postgres-password 2>/dev/null || echo \"\$POSTGRES_PASSWORD\")\" \
    psql -U imgproc -d imgproc -t -A -c \"
      SELECT json_build_object(
        'job_id', id,
        'original_filename', original_filename,
        'detections', COALESCE(result_summary->'detections', '[]'::jsonb),
        'image_size', result_summary->'imageSize'
      )::text
      FROM jobs
      WHERE batch_id IN ($SQL_IDS)
      ORDER BY created_at ASC;
    \"
  " > "$OUT_DIR/detections.jsonl"
fi

# -----------------------------------------------------------------------------
# 11. Record metadata in meta.json
# -----------------------------------------------------------------------------
echo "Gathering environment metadata..."
CONTAINER_IMAGE="$("${KUBECTL[@]}" get deployment image-worker -o jsonpath='{.spec.template.spec.containers[?(@.name=="image-worker")].image}' 2>/dev/null || echo "unknown")"
CPU_LIMIT="$("${KUBECTL[@]}" get deployment image-worker -o jsonpath='{.spec.template.spec.containers[?(@.name=="image-worker")].resources.limits.cpu}' 2>/dev/null || echo "unknown")"
MEM_LIMIT="$("${KUBECTL[@]}" get deployment image-worker -o jsonpath='{.spec.template.spec.containers[?(@.name=="image-worker")].resources.limits.memory}' 2>/dev/null || echo "unknown")"

NODE_NAME="$("${KUBECTL[@]}" get pod -l app.kubernetes.io/name=image-worker -o jsonpath='{.items[0].spec.nodeName}' 2>/dev/null || true)"
if [ -z "$NODE_NAME" ]; then
  NODE_NAME="$("${KUBECTL[@]}" get deployment image-worker -o jsonpath='{.spec.template.spec.nodeSelector.kubernetes\.io/hostname}' 2>/dev/null || true)"
fi
if [ -z "$NODE_NAME" ]; then
  NODE_NAME="$("${KUBECTL[@]}" get nodes -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || echo "$MACHINE")"
fi

GPU="none"
worker_pod="$("${KUBECTL[@]}" get pod -l app.kubernetes.io/name=image-worker -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true)"
if [ -n "$worker_pod" ]; then
  gpu_out="$("${KUBECTL[@]}" exec "$worker_pod" -c image-worker -- nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -n 1 || true)"
  if [ -n "$gpu_out" ]; then
    GPU="$gpu_out"
  fi
fi

NODE_CPU_COUNT="$("${KUBECTL[@]}" get node "$NODE_NAME" -o jsonpath='{.status.capacity.cpu}' 2>/dev/null || true)"
if [ -z "$NODE_CPU_COUNT" ]; then
  NODE_CPU_COUNT="$(nproc 2>/dev/null || echo "0")"
fi

IMAGES_TXT_HASH="$(sha256sum "$IMAGES_TXT" | awk '{print $1}')"

# Values go in through the environment (not pasted into the code), so empty ones become null.
MODE="$MODE" WORKERS="${WORKERS:-}" AUTOSCALE_MIN="${AUTOSCALE_MIN:-}" AUTOSCALE_MAX="${AUTOSCALE_MAX:-}" \
ORIGINAL_MIN="${ORIGINAL_MIN:-}" ORIGINAL_MAX="${ORIGINAL_MAX:-}" CONTAINER_IMAGE="$CONTAINER_IMAGE" \
CPU_LIMIT="$CPU_LIMIT" MEM_LIMIT="$MEM_LIMIT" NODE_NAME="$NODE_NAME" NODE_CPU_COUNT="$NODE_CPU_COUNT" \
GPU="$GPU" IMAGES_TXT_HASH="$IMAGES_TXT_HASH" START_TIME="$START_TIME" END_TIME="$END_TIME" \
DATASET="$DATASET" PARALLEL="$PARALLEL" PRELOAD="$PRELOAD" RELEASE_TIME="$RELEASE_TIME" \
CONFIDENCE="$CONFIDENCE" SAVE_DETECTIONS="$SAVE_DETECTIONS" EFFECTIVE_IMGSZ="$EFFECTIVE_IMGSZ" \
OUT_DIR="$OUT_DIR" python3 - <<'EOF'
import json
import os

def num(name):
    value = os.environ.get(name, "")
    return int(value) if value.strip() else None

mode = os.environ["MODE"]
autoscale = mode == "autoscale"
conf_val = os.environ.get("CONFIDENCE", "").strip()
confidence_threshold = float(conf_val) if conf_val else 0.35
save_det = os.environ.get("SAVE_DETECTIONS", "0") == "1"

meta = {
    "mode": mode,
    "worker_count": num("WORKERS") if mode == "fixed" else None,
    "min_replicas": num("AUTOSCALE_MIN") if autoscale else None,
    "max_replicas": num("AUTOSCALE_MAX") if autoscale else None,
    "original_min": num("ORIGINAL_MIN") if autoscale else None,
    "original_max": num("ORIGINAL_MAX") if autoscale else None,
    "container_image": os.environ["CONTAINER_IMAGE"],
    "cpu_limit": os.environ["CPU_LIMIT"],
    "memory_limit": os.environ["MEM_LIMIT"],
    "node_name": os.environ["NODE_NAME"],
    "node_cpu_count": num("NODE_CPU_COUNT"),
    "cpu_count": num("NODE_CPU_COUNT"),
    "gpu": os.environ.get("GPU", "none"),
    "images_txt_hash": os.environ["IMAGES_TXT_HASH"],
    "start_time": os.environ["START_TIME"],
    "end_time": os.environ["END_TIME"],
    "dataset": os.environ["DATASET"],
    "parallel": num("PARALLEL"),
    "preload": os.environ["PRELOAD"] == "1",
    "workers_released_at": os.environ["RELEASE_TIME"] or None,
    "confidence_threshold": confidence_threshold,
    "save_detections": save_det,
    "imgsz": num("EFFECTIVE_IMGSZ") or 640,
}
with open(os.path.join(os.environ["OUT_DIR"], "meta.json"), "w", encoding="utf-8") as f:
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
