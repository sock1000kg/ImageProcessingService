#!/usr/bin/env bash
# Demonstration of independent autoscaling of Video and Image worker pools in imgproc.
#
# Note: The video phase only passes once the engine has a video processor (Phase 2).
#
# Usage:
#   infra/scaling-demo.sh [--video N] [--image N] [--image-file PATH] [--csv PATH] [--timeout SECONDS]
#
# What "PASS" means:
#   1. Preflight: ScaledObjects exist and READY; both pools start at 0 replicas.
#   2. Phase Video: video-worker desired replicas reach min(1, --video) while image-worker desired
#      stays 0 for the whole phase, and then the Video consumer drains to 0.
#   3. Phase Image: image-worker desired replicas reach min(3, ceil(--image/5)), video-worker
#      desired does not increase during the phase, and the Image consumer drains to 0.
#   4. Scale to zero: both worker Deployments scale back down to 0 replicas.
#
# Sample image generator (Python stdlib only, <= 100 KB):
#   python3 -c 'import zlib, struct; w, h = 640, 480; raw = bytearray(); [raw.extend([0] + [255 if 50<=x<=200 and 50<=y<=150 else int(255*y/h) if not (300<=x<=500 and 200<=y<=350 or 100<=x<=250 and 300<=y<=420) else 0, int(255*x/w) if not (50<=x<=200 and 50<=y<=150 or 100<=x<=250 and 300<=y<=420) else 255 if 300<=x<=500 and 200<=y<=350 else 0, 128 if not (50<=x<=200 and 50<=y<=150 or 300<=x<=500 and 200<=y<=350) else 0 if not (100<=x<=250 and 300<=y<=420) else 255 for x in range(w)]) for y in range(h)]; chunk = lambda t, d: struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff); open("infra/demo/sample.png", "wb").write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b""))'
#
set -euo pipefail

usage() {
  cat <<'EOF'
usage: scaling-demo.sh [--video N] [--image N] [--image-file PATH] [--csv PATH] [--timeout SECONDS]

Demonstrates independent autoscaling of Video and Image worker pools in imgproc.

Options:
  --video N             Number of Video jobs to publish (default: 6)
  --image N             Number of Image jobs to publish (default: 15)
  --image-file PATH     Path to sample input image (default: infra/demo/sample.png)
  --csv PATH            Optional path to write scaling time series CSV
  --timeout SECONDS     Timeout per phase in seconds (default: 600)
  -h, --help            Show this help message and exit

PASS criteria:
  - Phase Video: video-worker desired reaches min(1, --video), image-worker desired stays 0,
    and Video consumer drains to 0.
  - Phase Image: image-worker desired reaches min(3, ceil(--image/5)), video-worker
    desired does not increase, and Image consumer drains to 0.
  - Scale to zero: both worker Deployments scale back down to 0 replicas.
EOF
}

# -----------------------------------------------------------------------------
# 1. Argument parsing & environment validation
# -----------------------------------------------------------------------------

VIDEO_COUNT=6
IMAGE_COUNT=15
IMAGE_FILE="infra/demo/sample.png"
CSV_PATH=""
TIMEOUT=600

while [ "$#" -gt 0 ]; do
  case "$1" in
    --video)
      [ "$#" -ge 2 ] || { echo "scaling-demo.sh: missing value for --video" >&2; exit 1; }
      VIDEO_COUNT="$2"
      shift 2
      ;;
    --image)
      [ "$#" -ge 2 ] || { echo "scaling-demo.sh: missing value for --image" >&2; exit 1; }
      IMAGE_COUNT="$2"
      shift 2
      ;;
    --image-file)
      [ "$#" -ge 2 ] || { echo "scaling-demo.sh: missing value for --image-file" >&2; exit 1; }
      IMAGE_FILE="$2"
      shift 2
      ;;
    --csv)
      [ "$#" -ge 2 ] || { echo "scaling-demo.sh: missing value for --csv" >&2; exit 1; }
      CSV_PATH="$2"
      shift 2
      ;;
    --timeout)
      [ "$#" -ge 2 ] || { echo "scaling-demo.sh: missing value for --timeout" >&2; exit 1; }
      TIMEOUT="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "scaling-demo.sh: unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

# -----------------------------------------------------------------------------
# Setup cluster context, images & pod cleanup trap
# -----------------------------------------------------------------------------
KUBE_CONTEXT="${KUBE_CONTEXT:-default}"
KUBECTL=(kubectl --context "$KUBE_CONTEXT")
NS="imgproc"

NATS_BOX_IMAGE="natsio/nats-box:0.20.0"
MC_IMAGE="socknot1000kg/minio:RELEASE.2025-10-15T17-29-55Z"
POD_OVERRIDES='{"spec":{"nodeSelector":{"kubernetes.io/hostname":"home-server"}}}'

RUN_ID="$(date +%s)-$$"
NATS_POD="nats-demo-$RUN_ID"
MC_POD="mc-demo-$RUN_ID"

cleanup() {
  echo
  echo "Cleaning up helper pods ($NATS_POD, $MC_POD)..."
  "${KUBECTL[@]}" -n "$NS" delete pod "$NATS_POD" "$MC_POD" --ignore-not-found --wait=false >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

# State variables for polling
video_ready=0
video_desired=0
image_ready=0
image_desired=0
video_pending=0
image_pending=0

poll_status() {
  local deploy_raw
  deploy_raw=$("${KUBECTL[@]}" -n "$NS" get deploy video-worker image-worker -o jsonpath='{range .items[*]}{.status.readyReplicas}:{.spec.replicas} {end}' 2>/dev/null || true)
  
  local raw_vid raw_img
  raw_vid=$(echo "$deploy_raw" | awk '{print $1}')
  raw_img=$(echo "$deploy_raw" | awk '{print $2}')

  video_ready="${raw_vid%%:*}"
  video_desired="${raw_vid##*:}"
  [ -z "$video_ready" ] && video_ready=0
  [ -z "$video_desired" ] && video_desired=0

  image_ready="${raw_img%%:*}"
  image_desired="${raw_img##*:}"
  [ -z "$image_ready" ] && image_ready=0
  [ -z "$image_desired" ] && image_desired=0

  local consumer_raw
  consumer_raw=$("${KUBECTL[@]}" -n "$NS" exec "$NATS_POD" -- /bin/sh -c '
    vid=$(nats --server nats:4222 consumer info VIDEO_JOBS video-workers --json 2>/dev/null || echo "{}")
    img=$(nats --server nats:4222 consumer info IMAGE_JOBS image-workers --json 2>/dev/null || echo "{}")
    echo "$vid"
    echo "===DELIMITER==="
    echo "$img"
  ' 2>/dev/null || true)

  local pending_pair
  pending_pair=$(python3 -c "
import sys, json

def find_key(obj, k):
    if not isinstance(obj, dict):
        return 0
    if k in obj:
        return obj[k]
    for v in obj.values():
        if isinstance(v, dict):
            res = find_key(v, k)
            if res != 0:
                return res
    return 0

def calc(s):
    try:
        d = json.loads(s)
        return int(find_key(d, 'num_pending')) + int(find_key(d, 'num_ack_pending'))
    except Exception:
        return 0

raw = sys.stdin.read()
parts = raw.split('===DELIMITER===')
vid_p = calc(parts[0]) if len(parts) > 0 else 0
img_p = calc(parts[1]) if len(parts) > 1 else 0
print(f'{vid_p} {img_p}')
" <<< "$consumer_raw" 2>/dev/null || echo "0 0")

  video_pending=$(echo "$pending_pair" | awk '{print $1}')
  image_pending=$(echo "$pending_pair" | awk '{print $2}')
  [ -z "$video_pending" ] && video_pending=0
  [ -z "$image_pending" ] && image_pending=0
}

# -----------------------------------------------------------------------------
# Step 1: Preflight
# -----------------------------------------------------------------------------
preflight() {
  echo "=== Step 1: Preflight checks ==="
  echo "Checking ScaledObjects video-worker and image-worker are READY..."
  local elapsed=0
  while true; do
    local video_so_ready img_so_ready
    video_so_ready=$("${KUBECTL[@]}" -n "$NS" get scaledobject video-worker -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || true)
    img_so_ready=$("${KUBECTL[@]}" -n "$NS" get scaledobject image-worker -o jsonpath='{.status.conditions[?(@.type=="Ready")].status}' 2>/dev/null || true)

    if [ "$video_so_ready" = "True" ] && [ "$img_so_ready" = "True" ]; then
      echo "ScaledObjects video-worker and image-worker are READY."
      break
    fi

    if [ "$elapsed" -ge "$TIMEOUT" ]; then
      echo "ERROR: ScaledObjects not READY after ${TIMEOUT}s (video: $video_so_ready, image: $img_so_ready)" >&2
      exit 1
    fi

    echo "Preflight: waiting for ScaledObjects to become READY (video: ${video_so_ready:-Unknown}, image: ${img_so_ready:-Unknown})..."
    sleep 5
    elapsed=$((elapsed + 5))
  done

  echo "Checking that worker Deployments start at 0 replicas..."
  elapsed=0
  while true; do
    local deploy_raw raw_vid raw_img r_vid d_vid r_img d_img
    deploy_raw=$("${KUBECTL[@]}" -n "$NS" get deploy video-worker image-worker -o jsonpath='{range .items[*]}{.status.readyReplicas}:{.spec.replicas} {end}' 2>/dev/null || true)
    raw_vid=$(echo "$deploy_raw" | awk '{print $1}')
    raw_img=$(echo "$deploy_raw" | awk '{print $2}')
    r_vid="${raw_vid%%:*}"; d_vid="${raw_vid##*:}"
    r_img="${raw_img%%:*}"; d_img="${raw_img##*:}"
    [ -z "$r_vid" ] && r_vid=0
    [ -z "$d_vid" ] && d_vid=0
    [ -z "$r_img" ] && r_img=0
    [ -z "$d_img" ] && d_img=0

    if [ "$d_vid" -eq 0 ] && [ "$r_vid" -eq 0 ] && [ "$d_img" -eq 0 ] && [ "$r_img" -eq 0 ]; then
      echo "Both worker Deployments are at 0 replicas."
      break
    fi

    if [ "$elapsed" -ge "$TIMEOUT" ]; then
      echo "ERROR: worker Deployments did not scale down to 0 replicas within ${TIMEOUT}s (video: $r_vid/$d_vid, image: $r_img/$d_img)" >&2
      exit 1
    fi

    echo "Preflight: waiting for worker pools to reach 0 replicas (video-worker: $r_vid/$d_vid, image-worker: $r_img/$d_img)..."
    sleep 5
    elapsed=$((elapsed + 5))
  done
}

# -----------------------------------------------------------------------------
# Step 2: Helper pods
# -----------------------------------------------------------------------------
start_helpers() {
  echo
  echo "=== Step 2: Starting long-lived helper pods ==="
  echo "Starting NATS helper pod $NATS_POD..."
  "${KUBECTL[@]}" -n "$NS" run "$NATS_POD" --restart=Never \
    --image="$NATS_BOX_IMAGE" --overrides="$POD_OVERRIDES" \
    --command -- sleep 86400 >/dev/null

  echo "Starting MinIO mc helper pod $MC_POD..."
  "${KUBECTL[@]}" -n "$NS" run "$MC_POD" --restart=Never \
    --image="$MC_IMAGE" --overrides="$POD_OVERRIDES" \
    --command -- sleep 86400 >/dev/null

  echo "Waiting for helper pods to be Ready..."
  "${KUBECTL[@]}" -n "$NS" wait --for=condition=Ready "pod/$NATS_POD" "pod/$MC_POD" --timeout=60s >/dev/null

  echo "Configuring MinIO client in helper pod..."
  local minio_user minio_pass
  minio_user=$("${KUBECTL[@]}" -n "$NS" get secret imgproc-minio -o jsonpath='{.data.rootUser}' | base64 -d)
  minio_pass=$("${KUBECTL[@]}" -n "$NS" get secret imgproc-minio -o jsonpath='{.data.rootPassword}' | base64 -d)

  "${KUBECTL[@]}" -n "$NS" exec "$MC_POD" -- mc alias set local http://minio:9000 "$minio_user" "$minio_pass" >/dev/null
  echo "Helper pods ready."
}

# -----------------------------------------------------------------------------
# Step 3: Inputs & job preparation
# -----------------------------------------------------------------------------
prepare_inputs() {
  echo
  echo "=== Step 3: Preparing inputs ==="
  if [ ! -f "$IMAGE_FILE" ]; then
    echo "ERROR: image file '$IMAGE_FILE' not found" >&2
    exit 1
  fi

  echo "Uploading base image '$IMAGE_FILE' once to uploads/run-$RUN_ID/sample.png..."
  "${KUBECTL[@]}" -n "$NS" cp "$IMAGE_FILE" "$MC_POD:/tmp/sample.png"
  "${KUBECTL[@]}" -n "$NS" exec "$MC_POD" -- mc cp /tmp/sample.png "local/uploads/run-$RUN_ID/sample.png" >/dev/null

  VIDEO_JOB_IDS=()
  for ((i=1; i<=VIDEO_COUNT; i++)); do
    VIDEO_JOB_IDS+=("$(python3 -c 'import uuid; print(uuid.uuid4())')")
  done

  IMAGE_JOB_IDS=()
  for ((i=1; i<=IMAGE_COUNT; i++)); do
    IMAGE_JOB_IDS+=("$(python3 -c 'import uuid; print(uuid.uuid4())')")
  done

  ALL_JOB_IDS=("${VIDEO_JOB_IDS[@]}" "${IMAGE_JOB_IDS[@]}")

  echo "Generated ${#VIDEO_JOB_IDS[@]} Video job IDs and ${#IMAGE_JOB_IDS[@]} Image job IDs (run prefix: run-$RUN_ID)"
  for jid in "${VIDEO_JOB_IDS[@]}"; do
    echo "  Video job: run-$RUN_ID / $jid"
  done
  for jid in "${IMAGE_JOB_IDS[@]}"; do
    echo "  Image job: run-$RUN_ID / $jid"
  done

  echo "Server-side copying input to uploads/<jobId>/input.png for all jobs..."
  printf "%s\n" "${ALL_JOB_IDS[@]}" | "${KUBECTL[@]}" -n "$NS" exec -i "$MC_POD" -- /bin/sh -c '
    base="local/uploads/run-'"$RUN_ID"'/sample.png"
    while IFS= read -r jid; do
      [ -n "$jid" ] || continue
      mc cp "$base" "local/uploads/$jid/input.png" >/dev/null
    done
  '
  echo "All input objects created."
}

# -----------------------------------------------------------------------------
# Step 4: Phase Video
# -----------------------------------------------------------------------------
phase_video_passed=0
target_video_desired=0

run_phase_video() {
  echo
  echo "=== Step 4: Phase Video ($VIDEO_COUNT jobs) ==="
  target_video_desired=$(( VIDEO_COUNT < 1 ? VIDEO_COUNT : 1 ))
  echo "Target video-worker desired replicas: $target_video_desired (min(1, $VIDEO_COUNT))"

  local video_payloads=""
  for jid in "${VIDEO_JOB_IDS[@]}"; do
    video_payloads+=$(cat <<JSON
{"jobId":"$jid","type":"video-redact","input":{"bucket":"uploads","key":"$jid/input.png"},"output":{"bucket":"results","key":"$jid/result.mp4"},"params":{"confidenceThreshold":0.35}}
JSON
)
    video_payloads+=$'\n'
  done

  echo "Publishing $VIDEO_COUNT jobs to jobs.video..."
  printf "%s" "$video_payloads" | "${KUBECTL[@]}" -n "$NS" exec -i "$NATS_POD" -- /bin/sh -c '
    while IFS= read -r line; do
      [ -n "$line" ] || continue
      nats --server nats:4222 pub jobs.video "$line" >/dev/null
    done
  '

  printf "%-8s %-28s %-14s %-28s %-13s\n" "ELAPSED" "VIDEO-WORKER(READY/DESIRED)" "VIDEO-PENDING" "IMAGE-WORKER(READY/DESIRED)" "IMAGE-PENDING"

  local start_time now elapsed ts
  start_time=$(date +%s)
  local video_scaled_up=0
  local image_stayed_zero=1

  while true; do
    now=$(date +%s)
    elapsed=$((now - start_time))
    ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    poll_status

    printf "%-8s %-28s %-14s %-28s %-13s\n" "${elapsed}s" "${video_ready}/${video_desired}" "$video_pending" "${image_ready}/${image_desired}" "$image_pending"
    if [ -n "$CSV_PATH" ]; then
      printf "%s,%s,%s,%s,%s,%s,%s,%s\n" "$ts" "video" "$video_ready" "$video_desired" "$video_pending" "$image_ready" "$image_desired" "$image_pending" >> "$CSV_PATH"
    fi

    if [ "$video_desired" -ge "$target_video_desired" ]; then
      video_scaled_up=1
    fi
    if [ "$image_desired" -gt 0 ]; then
      image_stayed_zero=0
    fi

    if [ "$video_scaled_up" -eq 1 ] && [ "$image_stayed_zero" -eq 1 ] && [ "$video_pending" -eq 0 ]; then
      phase_video_passed=1
      echo "Phase Video PASS: video-worker scaled up to desired=$video_desired, image-worker stayed 0, Video queue drained to 0."
      break
    fi

    if [ "$elapsed" -ge "$TIMEOUT" ]; then
      echo "Phase Video FAIL: timed out after ${TIMEOUT}s (scaled_up=$video_scaled_up, image_stayed_zero=$image_stayed_zero, video_pending=$video_pending)"
      break
    fi

    sleep 5
  done
}

# -----------------------------------------------------------------------------
# Step 5: Phase Image
# -----------------------------------------------------------------------------
phase_image_passed=0
target_image_desired=0

run_phase_image() {
  echo
  echo "=== Step 5: Phase Image ($IMAGE_COUNT jobs) ==="
  local ceil_img=$(( (IMAGE_COUNT + 4) / 5 ))
  target_image_desired=$(( ceil_img < 3 ? ceil_img : 3 ))
  echo "Target image-worker desired replicas: $target_image_desired (min(3, ceil($IMAGE_COUNT/5)))"

  local image_payloads=""
  for jid in "${IMAGE_JOB_IDS[@]}"; do
    image_payloads+=$(cat <<JSON
{"jobId":"$jid","type":"image-redact","input":{"bucket":"uploads","key":"$jid/input.png"},"output":{"bucket":"results","key":"$jid/result.jpg"},"params":{"confidenceThreshold":0.35}}
JSON
)
    image_payloads+=$'\n'
  done

  echo "Publishing $IMAGE_COUNT jobs to jobs.image..."
  printf "%s" "$image_payloads" | "${KUBECTL[@]}" -n "$NS" exec -i "$NATS_POD" -- /bin/sh -c '
    while IFS= read -r line; do
      [ -n "$line" ] || continue
      nats --server nats:4222 pub jobs.image "$line" >/dev/null
    done
  '

  printf "%-8s %-28s %-14s %-28s %-13s\n" "ELAPSED" "VIDEO-WORKER(READY/DESIRED)" "VIDEO-PENDING" "IMAGE-WORKER(READY/DESIRED)" "IMAGE-PENDING"

  local start_time now elapsed ts
  start_time=$(date +%s)
  local image_scaled_up=0
  local video_did_not_increase=1
  local prev_video_desired="$video_desired"

  while true; do
    now=$(date +%s)
    elapsed=$((now - start_time))
    ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    poll_status

    printf "%-8s %-28s %-14s %-28s %-13s\n" "${elapsed}s" "${video_ready}/${video_desired}" "$video_pending" "${image_ready}/${image_desired}" "$image_pending"
    if [ -n "$CSV_PATH" ]; then
      printf "%s,%s,%s,%s,%s,%s,%s,%s\n" "$ts" "image" "$video_ready" "$video_desired" "$video_pending" "$image_ready" "$image_desired" "$image_pending" >> "$CSV_PATH"
    fi

    if [ "$image_desired" -ge "$target_image_desired" ]; then
      image_scaled_up=1
    fi
    if [ "$video_desired" -gt "$prev_video_desired" ]; then
      video_did_not_increase=0
    fi
    prev_video_desired="$video_desired"

    if [ "$image_scaled_up" -eq 1 ] && [ "$video_did_not_increase" -eq 1 ] && [ "$image_pending" -eq 0 ]; then
      phase_image_passed=1
      echo "Phase Image PASS: image-worker scaled up to desired=$image_desired, video-worker desired did not increase, image queue drained to 0."
      break
    fi

    if [ "$elapsed" -ge "$TIMEOUT" ]; then
      echo "Phase Image FAIL: timed out after ${TIMEOUT}s (scaled_up=$image_scaled_up, video_did_not_increase=$video_did_not_increase, image_pending=$image_pending)"
      break
    fi

    sleep 5
  done
}

# -----------------------------------------------------------------------------
# Step 6: Scale to zero
# -----------------------------------------------------------------------------
scale_to_zero_passed=0

run_scale_to_zero() {
  echo
  echo "=== Step 6: Scale to zero (cooldown ~120s, allowing up to 300s) ==="
  printf "%-8s %-28s %-14s %-28s %-13s\n" "ELAPSED" "VIDEO-WORKER(READY/DESIRED)" "VIDEO-PENDING" "IMAGE-WORKER(READY/DESIRED)" "IMAGE-PENDING"

  local start_time now elapsed ts
  start_time=$(date +%s)
  local scale_timeout=300
  [ "$TIMEOUT" -gt 300 ] && scale_timeout="$TIMEOUT"

  while true; do
    now=$(date +%s)
    elapsed=$((now - start_time))
    ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

    poll_status

    printf "%-8s %-28s %-14s %-28s %-13s\n" "${elapsed}s" "${video_ready}/${video_desired}" "$video_pending" "${image_ready}/${image_desired}" "$image_pending"
    if [ -n "$CSV_PATH" ]; then
      printf "%s,%s,%s,%s,%s,%s,%s,%s\n" "$ts" "scale-to-zero" "$video_ready" "$video_desired" "$video_pending" "$image_ready" "$image_desired" "$image_pending" >> "$CSV_PATH"
    fi

    if [ "$video_desired" -eq 0 ] && [ "$video_ready" -eq 0 ] && [ "$image_desired" -eq 0 ] && [ "$image_ready" -eq 0 ]; then
      scale_to_zero_passed=1
      echo "Scale to zero PASS: both worker pools returned to 0 replicas."
      break
    fi

    if [ "$elapsed" -ge "$scale_timeout" ]; then
      echo "Scale to zero FAIL: timed out after ${scale_timeout}s waiting for 0 replicas."
      break
    fi

    sleep 5
  done
}

# -----------------------------------------------------------------------------
# Step 7: Results (informational)
# -----------------------------------------------------------------------------
count_results() {
  echo
  echo "=== Step 7: Results count (informational) ==="
  local total_jobs=${#ALL_JOB_IDS[@]}
  local found_count

  found_count=$("${KUBECTL[@]}" -n "$NS" exec -i "$MC_POD" -- /bin/sh -c '
    found=0
    while IFS= read -r jid; do
      [ -n "$jid" ] || continue
      if mc ls "local/results/$jid/" 2>/dev/null | grep -q "result\."; then
        found=$((found + 1))
      fi
    done
    echo "$found"
  ' <<< "$(printf "%s\n" "${ALL_JOB_IDS[@]}")" 2>/dev/null || echo "0")

  echo "${found_count:-0}/$total_jobs results present"
}

# -----------------------------------------------------------------------------
# Step 8: Summary
# -----------------------------------------------------------------------------
summary() {
  echo
  echo "=== Scaling Demo Summary ==="
  if [ "$phase_video_passed" -eq 1 ]; then
    echo "PASS: Phase Video"
  else
    echo "FAIL: Phase Video"
  fi

  if [ "$phase_image_passed" -eq 1 ]; then
    echo "PASS: Phase Image"
  else
    echo "FAIL: Phase Image"
  fi

  if [ "$scale_to_zero_passed" -eq 1 ]; then
    echo "PASS: Scale to zero"
  else
    echo "FAIL: Scale to zero"
  fi

  if [ "$phase_video_passed" -eq 1 ] && [ "$phase_image_passed" -eq 1 ] && [ "$scale_to_zero_passed" -eq 1 ]; then
    exit 0
  else
    exit 1
  fi
}

# -----------------------------------------------------------------------------
# Main entrypoint
# -----------------------------------------------------------------------------
main() {
  if [ -n "$CSV_PATH" ]; then
    mkdir -p "$(dirname "$CSV_PATH")" 2>/dev/null || true
    echo "timestamp,phase,video_ready,video_desired,video_pending,image_ready,image_desired,image_pending" > "$CSV_PATH"
  fi

  preflight
  start_helpers
  prepare_inputs
  run_phase_video
  run_phase_image
  run_scale_to_zero
  count_results
  summary
}

main "$@"
