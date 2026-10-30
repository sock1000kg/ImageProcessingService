#!/usr/bin/env bash
# Fetch and verify the benchmark images (WIDER FACE val + VN license plates).
#   small (default): 100 images (70 + 30), manifest images.txt,       folder images/
#   large:           1000 images (700 + 300), manifest images-1000.txt, folder images-1000/
#
# Usage:
#   fetch.sh [--set small|large] [VN_PLATES_DIR]
#
# If VN_PLATES_DIR is provided, VN license plate images are copied from that local directory.
# Otherwise, they are downloaded from the public repository.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CACHE_DIR="$SCRIPT_DIR/.cache"

SET="small"
VN_PLATES_DIR=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --set)
      [ "$#" -ge 2 ] || { echo "ERROR: missing value for --set" >&2; exit 1; }
      SET="$2"
      shift 2
      ;;
    -h|--help)
      sed -n '2,12p' "${BASH_SOURCE[0]}"
      exit 0
      ;;
    *)
      VN_PLATES_DIR="$1"
      shift 1
      ;;
  esac
done

case "$SET" in
  small)
    IMAGES_DIR="$SCRIPT_DIR/images"
    IMAGES_TXT="$SCRIPT_DIR/images.txt"
    ;;
  large)
    IMAGES_DIR="$SCRIPT_DIR/images-1000"
    IMAGES_TXT="$SCRIPT_DIR/images-1000.txt"
    ;;
  *)
    echo "ERROR: --set must be 'small' or 'large' (got '$SET')" >&2
    exit 1
    ;;
esac

# Image counts come from the manifest (WIDER_val/... vs Dataset/Test/... paths)
WIDER_COUNT="$(grep -c 'WIDER_val/' "$IMAGES_TXT" || true)"
VN_COUNT="$(grep -c 'Dataset/Test/' "$IMAGES_TXT" || true)"
TOTAL_COUNT=$((WIDER_COUNT + VN_COUNT))

WIDER_ZIP_URL="https://huggingface.co/datasets/CUHK-CSE/wider_face/resolve/main/data/WIDER_val.zip"
WIDER_CACHE_ZIP="$CACHE_DIR/WIDER_val.zip"

VN_RAW_BASE="https://raw.githubusercontent.com/ng-d-ng-may-tinh-K62-UET-M1/yolo-dataset/main/Dataset/Test"

mkdir -p "$CACHE_DIR" "$IMAGES_DIR"

# -----------------------------------------------------------------------------
# Function to verify images in $IMAGES_DIR against $IMAGES_TXT
# Returns:
#   0: all manifest images are present and match checksums
#   1: at least one image is corrupted (hash mismatch)
#   2: one or more images are missing
# -----------------------------------------------------------------------------
check_images_status() {
  python3 - <<'EOF' "$IMAGES_TXT" "$IMAGES_DIR"
import sys, os, re, hashlib

images_txt, images_dir = sys.argv[1], sys.argv[2]
missing = []
corrupted = []
total = 0

with open(images_txt, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        if re.fullmatch(r"[0-9a-f]{64}", parts[0]):
            expected_sha = parts[0].lower()
            src_path = parts[1]
        else:
            src_path = parts[0]
            expected_sha = parts[1].lower()

        total += 1
        fname = os.path.basename(src_path)
        dest_path = os.path.join(images_dir, fname)

        if not os.path.isfile(dest_path):
            missing.append(fname)
            continue

        with open(dest_path, "rb") as img_f:
            actual_sha = hashlib.sha256(img_f.read()).hexdigest().lower()

        if actual_sha != expected_sha:
            corrupted.append((fname, expected_sha, actual_sha))

if corrupted:
    for fname, exp, act in corrupted:
        sys.stderr.write(f"ERROR: Checksum mismatch for {fname}: expected {exp}, got {act}\n")
    sys.exit(1)

if missing or total == 0:
    sys.exit(2)

print(f"All {total} images verified.")
sys.exit(0)
EOF
}

# -----------------------------------------------------------------------------
# Check current state of IMAGES_DIR
# -----------------------------------------------------------------------------
status=0
check_images_status || status=$?

if [ "$status" -eq 0 ]; then
  echo "All $TOTAL_COUNT images already present and verified. No download needed."
  exit 0
elif [ "$status" -eq 1 ]; then
  echo "ERROR: Corrupted images detected in $IMAGES_DIR." >&2
  exit 1
fi

echo "Images missing or incomplete. Fetching sources..."

# -----------------------------------------------------------------------------
# 1. Fetch WIDER FACE validation archive
# -----------------------------------------------------------------------------
if [ ! -f "$WIDER_CACHE_ZIP" ]; then
  echo "Downloading WIDER FACE validation zip (~345MB) to $WIDER_CACHE_ZIP..."
  curl -fsSL "$WIDER_ZIP_URL" -o "$WIDER_CACHE_ZIP.tmp"
  mv "$WIDER_CACHE_ZIP.tmp" "$WIDER_CACHE_ZIP"
fi

# -----------------------------------------------------------------------------
# 2. Extract selected WIDER FACE images
# -----------------------------------------------------------------------------
echo "Extracting $WIDER_COUNT WIDER FACE validation images..."
python3 - <<'EOF' "$IMAGES_TXT" "$WIDER_CACHE_ZIP" "$IMAGES_DIR"
import sys, os, re, zipfile

images_txt, zip_path, images_dir = sys.argv[1], sys.argv[2], sys.argv[3]
wider_targets = {}

with open(images_txt, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        path = parts[1] if re.fullmatch(r"[0-9a-f]{64}", parts[0]) else parts[0]
        if path.startswith("WIDER_val/"):
            wider_targets[path] = os.path.basename(path)

with zipfile.ZipFile(zip_path, "r") as z:
    for src_path, dest_name in wider_targets.items():
        dest_path = os.path.join(images_dir, dest_name)
        with z.open(src_path) as src, open(dest_path, "wb") as dst:
            dst.write(src.read())

print(f"Extracted {len(wider_targets)} WIDER FACE images.")
EOF

# -----------------------------------------------------------------------------
# 3. Fetch or copy Vietnamese license plate images
# -----------------------------------------------------------------------------
echo "Fetching $VN_COUNT Vietnamese license plate images..."
python3 - <<'EOF' "$IMAGES_TXT" "$IMAGES_DIR" "$VN_PLATES_DIR" "$VN_RAW_BASE"
import sys, os, re, urllib.request, shutil

images_txt, images_dir, vn_dir, raw_base = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
vn_targets = []

with open(images_txt, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        path = parts[1] if re.fullmatch(r"[0-9a-f]{64}", parts[0]) else parts[0]
        if path.startswith("Dataset/Test/"):
            vn_targets.append(os.path.basename(path))

for fname in vn_targets:
    dest_path = os.path.join(images_dir, fname)
    if vn_dir and os.path.isdir(vn_dir):
        # Look for the file in the supplied directory or Test subdir
        candidate1 = os.path.join(vn_dir, fname)
        candidate2 = os.path.join(vn_dir, "Dataset", "Test", fname)
        candidate3 = os.path.join(vn_dir, "Test", fname)
        found = None
        for cand in [candidate1, candidate2, candidate3]:
            if os.path.isfile(cand):
                found = cand
                break
        if found:
            shutil.copyfile(found, dest_path)
            continue

    # Otherwise download from public GitHub raw
    url = f"{raw_base}/{fname}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp, open(dest_path, "wb") as out_f:
        out_f.write(resp.read())

print(f"Acquired {len(vn_targets)} Vietnamese license plate images.")
EOF

# -----------------------------------------------------------------------------
# 4. Final verification
# -----------------------------------------------------------------------------
echo "Verifying all $TOTAL_COUNT images..."
check_images_status
echo "Dataset fetch and verification completed successfully."
