#!/usr/bin/env bash
# Deface benchmark runner for image anonymization comparison.
# Measures per-image face detection & blurring performance over the dataset images (100 small / 1000 large).
#
# Usage:
#   deface.sh [--cpu] [--dataset small|large|max] [--threshold X] [--scale WxH] [--save-detections]
#             [--machine NAME] [--images DIR] [--out DIR]
#
# Options:
#   --cpu           Force CPU execution (CPUExecutionProvider)
#   --dataset small|large|max  Image set: small = 100 images (default), large = 1000 images (dataset/images-1000/),
#                   max = 3726 images (dataset/images-max/, fetched and hash-verified with dataset/fetch.sh --set max)
#   --threshold X   Confidence threshold for CenterFace (0.0 to 1.0, default: 0.2)
#   --scale WxH     Input scale for CenterFace, e.g. 640x480 (default: full resolution)
#   --save-detections  Write detections.jsonl with image sizes, boxes, and scores
#   --machine NAME  Machine or node name (default: detected hostname or worker node)
#   --images DIR    Images directory (default: infra/bench/dataset/images, images-1000 for large, images-max for max)
#   --out DIR       Output directory for results
#                   (default: results/<machine>-<set>/deface/<full|WxH>/<UTC>-deface-<gpu|cpu>/)
#   -h, --help      Show this help message and exit
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BENCH_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEFAULT_IMAGES_DIR="$BENCH_DIR/dataset/images"
CACHE_DIR="$BENCH_DIR/.cache"
VENV_DIR="$CACHE_DIR/deface-venv"

usage() {
  cat <<'EOF'
Usage: deface.sh [--cpu] [--dataset small|large|max] [--threshold X] [--scale WxH] [--save-detections]
                 [--machine NAME] [--images DIR] [--out DIR]

Runs the Deface comparison benchmark on the dataset images (small = 100, large = 1000, max = 3726).

Options:
  --cpu           Force CPU execution (CPUExecutionProvider)
  --dataset small|large|max  Image set: small = 100 images (default), large = 1000 images, max = 3726 images
                  (fetched and hash-verified with dataset/fetch.sh --set max)
  --threshold X   Confidence threshold for CenterFace (0.0 to 1.0, default: 0.2)
  --scale WxH     Input scale for CenterFace, e.g. 640x480 (default: full resolution)
  --save-detections  Write detections.jsonl with image sizes, boxes, and scores
  --machine NAME  Machine or node name (default: detected hostname or worker node)
  --images DIR    Images directory (default: infra/bench/dataset/images, images-1000 for large, images-max for max)
  --out DIR       Output directory for results
                  (default: results/<machine>-<set>/deface/<full|WxH>/<UTC>-deface-<gpu|cpu>/)
  -h, --help      Show this help message and exit
EOF
}

CPU_MODE=0
MACHINE=""
IMAGES_DIR=""
OUT_DIR=""
DATASET="small"
THRESHOLD="0.2"
SCALE=""
SAVE_DETECTIONS=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --cpu)
      CPU_MODE=1
      shift
      ;;
    --machine)
      [ "$#" -ge 2 ] || { echo "ERROR: missing value for --machine" >&2; exit 1; }
      MACHINE="$2"
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
    --threshold)
      [ "$#" -ge 2 ] || { echo "ERROR: missing value for --threshold" >&2; exit 1; }
      THRESHOLD="$2"
      if ! python3 -c "import sys; v = float(sys.argv[1]); sys.exit(0 if 0.0 <= v <= 1.0 else 1)" "$THRESHOLD" 2>/dev/null; then
        echo "ERROR: --threshold must be a number between 0 and 1 (got '$THRESHOLD')" >&2
        exit 1
      fi
      shift 2
      ;;
    --scale)
      [ "$#" -ge 2 ] || { echo "ERROR: missing value for --scale" >&2; exit 1; }
      SCALE="$2"
      if [[ ! "$SCALE" =~ ^[0-9]+x[0-9]+$ ]]; then
        echo "ERROR: --scale must be in WxH format, e.g. 640x480 (got '$SCALE')" >&2
        exit 1
      fi
      shift 2
      ;;
    --save-detections)
      SAVE_DETECTIONS=1
      shift 1
      ;;
    --images)
      [ "$#" -ge 2 ] || { echo "ERROR: missing value for --images" >&2; exit 1; }
      IMAGES_DIR="$2"
      shift 2
      ;;
    --out)
      [ "$#" -ge 2 ] || { echo "ERROR: missing value for --out" >&2; exit 1; }
      OUT_DIR="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [ "$DATASET" = "large" ]; then
  if [ -z "$IMAGES_DIR" ]; then
    # Downloads what is missing and verifies all 1000 hashes against images-1000.txt (no network when already verified)
    bash "$BENCH_DIR/dataset/fetch.sh" --set large
    IMAGES_DIR="$BENCH_DIR/dataset/images-1000"
  fi
elif [ "$DATASET" = "max" ]; then
  if [ -z "$IMAGES_DIR" ]; then
    bash "$BENCH_DIR/dataset/fetch.sh" --set max
    IMAGES_DIR="$BENCH_DIR/dataset/images-max"
  fi
fi
IMAGES_DIR="${IMAGES_DIR:-$DEFAULT_IMAGES_DIR}"

if [ ! -d "$IMAGES_DIR" ]; then
  echo "ERROR: Images directory not found: $IMAGES_DIR" >&2
  exit 1
fi

image_count="$(find "$IMAGES_DIR" -maxdepth 1 -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" \) | wc -l)"
if [ "$image_count" -eq 0 ]; then
  echo "ERROR: No images found in $IMAGES_DIR" >&2
  exit 1
fi

# -----------------------------------------------------------------------------
# 1. Prepare Python virtualenv with pinned deface and onnxruntime-gpu
# -----------------------------------------------------------------------------
mkdir -p "$CACHE_DIR"

if [ ! -f "$VENV_DIR/bin/python" ]; then
  echo "==> Creating virtualenv at $VENV_DIR..."
  python3 -m venv "$VENV_DIR"
fi

if ! "$VENV_DIR/bin/python" -c "import deface, onnxruntime, onnx" 2>/dev/null; then
  echo "==> Installing pinned dependencies (deface==1.5.0, onnxruntime-gpu==1.20.0, onnx==1.23.2)..."
  "$VENV_DIR/bin/pip" install --quiet --upgrade pip
  "$VENV_DIR/bin/pip" install --quiet deface==1.5.0 onnxruntime-gpu==1.20.0 onnx==1.23.2
fi

# onnxruntime-gpu 1.20 needs the CUDA 12 runtime + cuDNN 9. WSL/hosts often have only the driver,
# so the libraries come from NVIDIA's pip wheels inside the venv (GPU mode only).
if [ "$CPU_MODE" -eq 0 ]; then
  if ! "$VENV_DIR/bin/python" -c "import nvidia.cudnn, nvidia.cublas, nvidia.cuda_nvrtc" 2>/dev/null; then
    echo "==> Installing CUDA 12 / cuDNN 9 runtime wheels for onnxruntime-gpu..."
    "$VENV_DIR/bin/pip" install --quiet nvidia-cuda-runtime-cu12==12.4.127 nvidia-cublas-cu12==12.4.5.8 \
      nvidia-cudnn-cu12==9.1.0.70 nvidia-cufft-cu12==11.2.1.3 nvidia-curand-cu12==10.3.5.147 nvidia-cuda-nvrtc-cu12==12.4.127
  fi
  nvidia_libs="$(find "$VENV_DIR" -path "*/site-packages/nvidia/*/lib" -type d | paste -sd: -)"
  export LD_LIBRARY_PATH="${nvidia_libs}${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi

# -----------------------------------------------------------------------------
# 2. Determine machine name and output directory
# -----------------------------------------------------------------------------
if [ -z "$MACHINE" ]; then
  MACHINE="$(uname -n 2>/dev/null || echo "laptop-local")"
fi

SET_TAG="100"
if [ "$DATASET" = "large" ]; then
  SET_TAG="1000"
elif [ "$DATASET" = "max" ]; then
  SET_TAG="max"
fi

SCALE_TAG="${SCALE:-full}"
TARGET_DEVICE="gpu"
if [ "$CPU_MODE" -eq 1 ]; then
  TARGET_DEVICE="cpu"
fi

TIMESTAMP_UTC="$(date -u +"%Y%m%d-%H%M%S")"

if [ -z "$OUT_DIR" ]; then
  OUT_DIR="$BENCH_DIR/results/${MACHINE}-${SET_TAG}/deface/${SCALE_TAG}/${TIMESTAMP_UTC}-deface-${TARGET_DEVICE}"
fi
mkdir -p "$OUT_DIR"

NODE_CPU_COUNT="$(nproc 2>/dev/null || echo "0")"

# -----------------------------------------------------------------------------
# 3. Run deface inference benchmark with timing
# -----------------------------------------------------------------------------
echo "==> Starting deface benchmark (target: $TARGET_DEVICE, images: $image_count)..."

CPU_MODE="$CPU_MODE" TARGET_DEVICE="$TARGET_DEVICE" MACHINE="$MACHINE" \
NODE_CPU_COUNT="$NODE_CPU_COUNT" IMAGES_DIR="$IMAGES_DIR" OUT_DIR="$OUT_DIR" DATASET="$DATASET" \
THRESHOLD="$THRESHOLD" SCALE="$SCALE" SAVE_DETECTIONS="$SAVE_DETECTIONS" \
"$VENV_DIR/bin/python" - <<'EOF'
import csv
import json
import os
import shutil
import sys
import tempfile
import time
from datetime import datetime, timezone

import imageio.v3 as iio
from deface.centerface import CenterFace
from deface.deface import anonymize_frame

cpu_mode = os.environ.get("CPU_MODE") == "1"
target_device = os.environ["TARGET_DEVICE"]
machine = os.environ["MACHINE"]
node_cpu_count = int(os.environ.get("NODE_CPU_COUNT", 0) or 0)
images_dir = os.environ["IMAGES_DIR"]
out_dir = os.environ["OUT_DIR"]
dataset = os.environ["DATASET"]
threshold = float(os.environ.get("THRESHOLD", 0.2))
scale_str = os.environ.get("SCALE", "").strip()
save_detections = os.environ.get("SAVE_DETECTIONS") == "1"

in_shape = None
if scale_str:
    parts = scale_str.lower().split("x")
    in_shape = (int(parts[0]), int(parts[1]))

start_time_iso = datetime.now(timezone.utc).isoformat()

# 1. Model load timing
provider_arg = "CPUExecutionProvider" if cpu_mode else "CUDAExecutionProvider"
t_load_0 = time.perf_counter()
centerface = CenterFace(in_shape=in_shape, override_execution_provider=provider_arg)
model_load_time = time.perf_counter() - t_load_0

actual_provider = centerface.sess.get_providers()[0]
print(f"==> Model loaded in {model_load_time:.3f} s. Active ONNX provider: {actual_provider}")
if not cpu_mode and actual_provider != "CUDAExecutionProvider":
    shutil.rmtree(out_dir, ignore_errors=True)
    sys.exit(f"ERROR: GPU run requested but onnxruntime is using {actual_provider} (CUDA libraries not loadable). "
             "No results written; use --cpu for a CPU run.")

# Collect dataset images sorted by filename
exts = (".jpg", ".jpeg", ".png")
image_files = sorted([f for f in os.listdir(images_dir) if f.lower().endswith(exts)])

temp_out_dir = tempfile.mkdtemp(prefix="deface_out_")
timings = []
detections_records = []

try:
    t_bench_0 = time.perf_counter()
    for idx, fname in enumerate(image_files, 1):
        in_path = os.path.join(images_dir, fname)
        out_path = os.path.join(temp_out_dir, fname)

        t_img_0 = time.perf_counter()
        frame = iio.imread(in_path)
        orig_h, orig_w = frame.shape[:2]
        dets, _ = centerface(frame, threshold=threshold)
        anonymize_frame(
            dets, frame, mask_scale=1.3,
            replacewith="blur", ellipse=True, draw_scores=False,
            replaceimg=None, mosaicsize=20
        )
        iio.imwrite(out_path, frame)
        duration_ms = (time.perf_counter() - t_img_0) * 1000.0
        timings.append((fname, duration_ms))

        if save_detections:
            img_dets = []
            for d in dets:
                img_dets.append({
                    "label": "face",
                    "confidence": round(float(d[4]), 4),
                    "box": [round(float(d[0]), 2), round(float(d[1]), 2), round(float(d[2]), 2), round(float(d[3]), 2)],
                })
            detections_records.append({
                "job_id": None,
                "original_filename": fname,
                "filename": fname,
                "image_size": [int(orig_w), int(orig_h)],
                "detections": img_dets,
            })

    total_duration = time.perf_counter() - t_bench_0
finally:
    shutil.rmtree(temp_out_dir, ignore_errors=True)

if save_detections:
    det_path = os.path.join(out_dir, "detections.jsonl")
    with open(det_path, "w", encoding="utf-8") as f:
        for rec in detections_records:
            f.write(json.dumps(rec) + "\n")

end_time_iso = datetime.now(timezone.utc).isoformat()

# 2. Write per_image.csv
csv_path = os.path.join(out_dir, "per_image.csv")
with open(csv_path, "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["filename", "duration_ms"])
    for fname, ms in timings:
        writer.writerow([fname, f"{ms:.2f}"])

# 3. Compute statistics
proc_times = [ms for _, ms in timings]
proc_times_sorted = sorted(proc_times)

def percentile(s, p):
    if not s:
        return 0.0
    k = (len(s) - 1) * (p / 100.0)
    f = int(k)
    c = f + 1
    if c < len(s):
        return s[f] + (k - f) * (s[c] - s[f])
    return s[f]

p50 = percentile(proc_times_sorted, 50)
p95 = percentile(proc_times_sorted, 95)
p_max = max(proc_times_sorted) if proc_times_sorted else 0.0
throughput = (len(proc_times) / (total_duration / 60.0)) if total_duration > 0 else 0.0

# 4. Write meta.json
meta = {
    "tool": "deface",
    "mode": "deface",
    "version": "1.5.0",
    "target_device": target_device,
    "execution_provider": actual_provider,
    "machine": machine,
    "node_cpu_count": node_cpu_count,
    "model_load_time_seconds": round(model_load_time, 4),
    "total_duration_seconds": round(total_duration, 4),
    "images_count": len(proc_times),
    "dataset": dataset,
    "threshold": threshold,
    "scale": scale_str if scale_str else "full",
    "save_detections": save_detections,
    "start_time": start_time_iso,
    "end_time": end_time_iso,
}
meta_path = os.path.join(out_dir, "meta.json")
with open(meta_path, "w", encoding="utf-8") as f:
    json.dump(meta, f, indent=2)

# 5. Write summary.md
summary_md = f"""# Deface Benchmark Summary

## Run Context
| Parameter | Value |
| --- | --- |
| **Tool** | deface 1.5.0 (CenterFace ONNX) |
| **Target Mode** | {target_device.upper()} |
| **ONNX Execution Provider** | `{actual_provider}` |
| **Machine / Node** | {machine} ({node_cpu_count} CPU threads) |
| **Dataset** | {dataset} |
| **Threshold** | {threshold} |
| **Scale** | {scale_str if scale_str else "full (native resolution)"} |
| **Images Count** | {len(proc_times)} |
| **Start Time** | {start_time_iso} |
| **End Time** | {end_time_iso} |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Model Load Time** | {model_load_time:.3f} s |
| **Total Duration ({len(proc_times)} images)** | {total_duration:.2f} s |
| **Throughput** | **{throughput:.2f} images/min** |

## Per-Image Latency
| Metric | Latency (ms) |
| --- | --- |
| **p50** | {p50:.1f} ms |
| **p95** | {p95:.1f} ms |
| **Max** | {p_max:.1f} ms |

> **Note**: faces only (plates stay unredacted), local files, no queue/upload, so compare with our `processingTimeMs`, not our end-to-end time. The fair speed comparison is the WIDER (faces) subset.
"""

summary_path = os.path.join(out_dir, "summary.md")
with open(summary_path, "w", encoding="utf-8") as f:
    f.write(summary_md)

print("==> Deface benchmark completed:")
print(f"    Total Images: {len(proc_times)}")
print(f"    Model Load:   {model_load_time:.3f} s")
print(f"    Total Time:   {total_duration:.2f} s")
print(f"    Throughput:   {throughput:.2f} img/min")
print(f"    Latency p50:  {p50:.1f} ms | p95: {p95:.1f} ms | Max: {p_max:.1f} ms")
print(f"    Results saved to {out_dir}")
EOF

echo "Done."
