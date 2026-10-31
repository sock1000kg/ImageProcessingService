#!/usr/bin/env bash
# Fetch and verify the benchmark images (WIDER FACE val + VN license plates).
#   small (default): 100 images (70 + 30), manifest images.txt,       folder images/
#   large:           1000 images (700 + 300), manifest images-1000.txt, folder images-1000/
#   max:             3726 images (3226 + 500), manifest images-max.txt, folder images-max/
#
# Usage:
#   fetch.sh [--set small|large|max] [--labels] [VN_PLATES_DIR]
#
# Options:
#   --set small|large|max  Image set to fetch/verify: small (default), large, or max
#   --labels            Generate normalised dataset/labels-<set>.jsonl annotations
#   VN_PLATES_DIR       Optional local directory containing VN plate images / labels
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CACHE_DIR="$SCRIPT_DIR/.cache"

SET="small"
GENERATE_LABELS=0
VN_PLATES_DIR=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --set)
      [ "$#" -ge 2 ] || { echo "ERROR: missing value for --set" >&2; exit 1; }
      SET="$2"
      shift 2
      ;;
    --labels)
      GENERATE_LABELS=1
      shift 1
      ;;
    -h|--help)
      sed -n '2,14p' "${BASH_SOURCE[0]}"
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
  max)
    IMAGES_DIR="$SCRIPT_DIR/images-max"
    IMAGES_TXT="$SCRIPT_DIR/images-max.txt"
    ;;
  *)
    echo "ERROR: --set must be 'small', 'large', or 'max' (got '$SET')" >&2
    exit 1
    ;;
esac

LABELS_FILE="$SCRIPT_DIR/labels-$SET.jsonl"
VN_LABELS_CACHE="$CACHE_DIR/vn_labels"

# Image counts come from the manifest (WIDER_val/... vs Dataset/... paths)
WIDER_COUNT="$(grep -c 'WIDER_val/' "$IMAGES_TXT" || true)"
VN_COUNT="$(grep -c 'Dataset/' "$IMAGES_TXT" || true)"
TOTAL_COUNT=$((WIDER_COUNT + VN_COUNT))

WIDER_ZIP_URL="https://huggingface.co/datasets/CUHK-CSE/wider_face/resolve/main/data/WIDER_val.zip"
WIDER_CACHE_ZIP="$CACHE_DIR/WIDER_val.zip"

VN_RAW_BASE="https://raw.githubusercontent.com/ng-d-ng-may-tinh-K62-UET-M1/yolo-dataset/main"

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
bench_root = os.path.abspath(os.path.join(os.path.dirname(images_dir), ".."))
sys.path.insert(0, os.path.join(bench_root, "accuracy"))
from evaluate import manifest_path_to_filename

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
        fname = manifest_path_to_filename(src_path)
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
  if [ "$GENERATE_LABELS" -eq 0 ]; then
    exit 0
  fi
elif [ "$status" -eq 1 ]; then
  echo "ERROR: Corrupted images detected in $IMAGES_DIR." >&2
  exit 1
fi

if [ "$status" -ne 0 ]; then
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
bench_root = os.path.abspath(os.path.join(os.path.dirname(images_dir), ".."))
sys.path.insert(0, os.path.join(bench_root, "accuracy"))
from evaluate import manifest_path_to_filename

vn_targets = []

with open(images_txt, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        path = parts[1] if re.fullmatch(r"[0-9a-f]{64}", parts[0]) else parts[0]
        if path.startswith("Dataset/"):
            vn_targets.append(path)

for path in vn_targets:
    fname = os.path.basename(path)
    dest_name = manifest_path_to_filename(path)
    dest_path = os.path.join(images_dir, dest_name)
    if os.path.isfile(dest_path):
        continue
    if vn_dir and os.path.isdir(vn_dir):
        # Look for the file in the supplied directory or subdirs
        candidate1 = os.path.join(vn_dir, fname)
        candidate2 = os.path.join(vn_dir, path)
        candidate3 = os.path.join(vn_dir, "yolo-dataset", path)
        found = None
        for cand in [candidate1, candidate2, candidate3]:
            if os.path.isfile(cand):
                found = cand
                break
        if found:
            shutil.copyfile(found, dest_path)
            continue

    # Also check sister directories if available
    found_sister = None
    for sister in ["images-1000", "images"]:
        cand = os.path.join(os.path.dirname(images_dir), sister, fname)
        if os.path.isfile(cand):
            found_sister = cand
            break
    if found_sister:
        shutil.copyfile(found_sister, dest_path)
        continue

    # Otherwise download from public GitHub raw
    url = f"{raw_base}/{path}"
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
fi

# -----------------------------------------------------------------------------
# 5. Generate normalised ground truth labels if requested
# -----------------------------------------------------------------------------
if [ "$GENERATE_LABELS" -eq 1 ]; then
  echo "Generating normalised ground truth labels ($LABELS_FILE)..."
  mkdir -p "$VN_LABELS_CACHE"

  WIDER_SPLIT_URL="https://huggingface.co/datasets/CUHK-CSE/wider_face/resolve/main/data/wider_face_split.zip"
  WIDER_SPLIT_CACHE="$CACHE_DIR/wider_face_split.zip"
  if [ ! -f "$WIDER_SPLIT_CACHE" ]; then
    echo "Downloading WIDER FACE validation ground truth (~3.5MB) to $WIDER_SPLIT_CACHE..."
    curl -fsSL "$WIDER_SPLIT_URL" -o "$WIDER_SPLIT_CACHE.tmp"
    mv "$WIDER_SPLIT_CACHE.tmp" "$WIDER_SPLIT_CACHE"
  fi

  echo "Fetching Vietnamese license plate annotation files..."
  python3 - <<'EOF' "$IMAGES_TXT" "$VN_LABELS_CACHE" "$VN_PLATES_DIR" "$VN_RAW_BASE" "$IMAGES_DIR"
import sys, os, re, urllib.request, shutil

images_txt, vn_labels_cache, vn_dir, raw_base, images_dir = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
bench_root = os.path.abspath(os.path.join(os.path.dirname(images_dir), ".."))
sys.path.insert(0, os.path.join(bench_root, "accuracy"))
from evaluate import manifest_path_to_filename

vn_targets = []

with open(images_txt, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        path = parts[1] if re.fullmatch(r"[0-9a-f]{64}", parts[0]) else parts[0]
        if path.startswith("Dataset/"):
            vn_targets.append(path)

for path in vn_targets:
    dest_name = manifest_path_to_filename(path)
    txt_name = os.path.splitext(dest_name)[0] + ".txt"
    dest_path = os.path.join(vn_labels_cache, txt_name)
    if os.path.isfile(dest_path):
        continue
    bname = os.path.splitext(os.path.basename(path))[0]
    # Check if existing base annotation is already cached
    base_cached = os.path.join(vn_labels_cache, bname + ".txt")
    if os.path.isfile(base_cached):
        shutil.copyfile(base_cached, dest_path)
        continue
    src_txt_rel = os.path.splitext(path)[0] + ".txt"
    if vn_dir and os.path.isdir(vn_dir):
        candidate1 = os.path.join(vn_dir, bname + ".txt")
        candidate2 = os.path.join(vn_dir, src_txt_rel)
        candidate3 = os.path.join(vn_dir, "yolo-dataset", src_txt_rel)
        found = None
        for cand in [candidate1, candidate2, candidate3]:
            if os.path.isfile(cand):
                found = cand
                break
        if found:
            shutil.copyfile(found, dest_path)
            continue

    url = f"{raw_base}/{src_txt_rel}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp, open(dest_path, "wb") as out_f:
        out_f.write(resp.read())

print(f"Acquired annotations for {len(vn_targets)} Vietnamese license plate images.")
EOF

  echo "Writing $LABELS_FILE..."
  BENCH_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
  ACCURACY_VENV="$BENCH_ROOT/.cache/accuracy-venv"
  if [ ! -f "$ACCURACY_VENV/bin/python" ]; then
    echo "Creating virtualenv at $ACCURACY_VENV..."
    python3 -m venv "$ACCURACY_VENV"
  fi
  if ! "$ACCURACY_VENV/bin/python" -c "import numpy, PIL" 2>/dev/null; then
    echo "Installing pinned dependencies (numpy==2.2.3, pillow==11.1.0)..."
    "$ACCURACY_VENV/bin/pip" install --quiet --upgrade pip
    "$ACCURACY_VENV/bin/pip" install --quiet numpy==2.2.3 pillow==11.1.0
  fi

  "$ACCURACY_VENV/bin/python" - <<'EOF' "$IMAGES_TXT" "$IMAGES_DIR" "$WIDER_SPLIT_CACHE" "$VN_LABELS_CACHE" "$LABELS_FILE"
import sys, os, re, zipfile, struct, json
from PIL import Image

images_txt, images_dir, wider_zip_path, vn_labels_dir, labels_out = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
bench_root = os.path.abspath(os.path.join(os.path.dirname(images_dir), ".."))
sys.path.insert(0, os.path.join(bench_root, "accuracy"))
from evaluate import manifest_path_to_filename, compute_sharpness

def get_image_size(path):
    with open(path, "rb") as f:
        data = f.read(32)
        if data.startswith(b"\x89PNG\r\n\x1a\n"):
            w, h = struct.unpack(">II", data[16:24])
            return w, h
        f.seek(0)
        header = f.read(2)
        if header == b"\xff\xd8":
            while True:
                marker_data = f.read(2)
                if len(marker_data) < 2:
                    break
                if marker_data[0] != 0xff:
                    break
                marker = marker_data[1]
                while marker == 0xff:
                    m = f.read(1)
                    if not m:
                        break
                    marker = m[0]
                if marker in (0xd9, 0xda):
                    break
                length_bytes = f.read(2)
                if len(length_bytes) < 2:
                    break
                length = struct.unpack(">H", length_bytes)[0]
                if marker in (0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf):
                    sof_data = f.read(5)
                    _p, h, w = struct.unpack(">BHH", sof_data)
                    return w, h
                else:
                    f.seek(length - 2, os.SEEK_CUR)
    raise ValueError(f"Could not determine size for {path}")

gt_wider = {}
with zipfile.ZipFile(wider_zip_path, "r") as z:
    with z.open("wider_face_split/wider_face_val_bbx_gt.txt") as f:
        lines = [line.decode("utf-8").strip() for line in f if line.decode("utf-8").strip()]

i = 0
while i < len(lines):
    img = lines[i]
    count = int(lines[i+1])
    boxes = []
    for b in range(count):
        parts = [int(x) for x in lines[i+2+b].split()]
        boxes.append(parts)
    gt_wider[img] = boxes
    i += 2 + count

records = []
unusable_faces = 0
with open(images_txt, "r", encoding="utf-8") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        src_path = parts[1] if re.fullmatch(r"[0-9a-f]{64}", parts[0]) else parts[0]
        fname = os.path.basename(src_path)
        img_dest = os.path.join(images_dir, fname)

        if src_path.startswith("WIDER_val/"):
            subset = "wider"
            prefix = "WIDER_val/images/" if src_path.startswith("WIDER_val/images/") else "WIDER_val/"
            wider_key = src_path[len(prefix):]
            raw_boxes = gt_wider.get(wider_key, [])
            boxes = []

            img_pil = None
            img_w, img_h = 0, 0
            if os.path.isfile(img_dest):
                try:
                    img_pil = Image.open(img_dest).convert("L")
                    img_w, img_h = img_pil.size
                except Exception:
                    img_pil = None

            for b in raw_boxes:
                x1, y1, w, h = b[:4]
                blur = b[4]
                expression = b[5]
                illumination = b[6]
                invalid = b[7] if len(b) > 7 else 0
                occlusion = b[8]
                pose = b[9]
                x2 = x1 + w
                y2 = y1 + h
                ign = bool(invalid == 1 or w <= 0 or h <= 0)

                sharpness = None
                if img_pil is not None and w > 0 and h > 0:
                    cx1 = max(0, min(img_w, x1))
                    cy1 = max(0, min(img_h, y1))
                    cx2 = max(0, min(img_w, x2))
                    cy2 = max(0, min(img_h, y2))
                    if cx2 > cx1 and cy2 > cy1:
                        crop = img_pil.crop((cx1, cy1, cx2, cy2))
                        sharpness = round(compute_sharpness(crop), 2)
                    else:
                        unusable_faces += 1
                else:
                    unusable_faces += 1

                box_dict = {
                    "label": "face",
                    "box": [x1, y1, x2, y2],
                    "ignore": ign,
                    "attrs": {
                        "blur": blur,
                        "expression": expression,
                        "illumination": illumination,
                        "occlusion": occlusion,
                        "pose": pose,
                    },
                }
                if sharpness is not None:
                    box_dict["sharpness"] = sharpness
                boxes.append(box_dict)
        elif src_path.startswith("Dataset/"):
            subset = "vn"
            dest_name = manifest_path_to_filename(src_path)
            img_dest = os.path.join(images_dir, dest_name)
            img_w, img_h = get_image_size(img_dest)
            txt_name = os.path.splitext(dest_name)[0] + ".txt"
            label_file = os.path.join(vn_labels_dir, txt_name)
            boxes = []
            if os.path.isfile(label_file):
                with open(label_file, "r", encoding="utf-8") as lf:
                    for l in lf:
                        l = l.strip()
                        if not l:
                            continue
                        toks = l.split()
                        if len(toks) >= 5:
                            cx = float(toks[1])
                            cy = float(toks[2])
                            w = float(toks[3])
                            h = float(toks[4])
                            bw = w * img_w
                            bh = h * img_h
                            x1 = (cx * img_w) - (bw / 2.0)
                            y1 = (cy * img_h) - (bh / 2.0)
                            x2 = x1 + bw
                            y2 = y1 + bh
                            ign = bool(bw <= 0 or bh <= 0)
                            boxes.append({
                                "label": "plate",
                                "box": [round(x1, 2), round(y1, 2), round(x2, 2), round(y2, 2)],
                                "ignore": ign,
                            })
        else:
            continue

        records.append({
            "image": src_path,
            "subset": subset,
            "boxes": boxes,
        })

with open(labels_out, "w", encoding="utf-8") as out:
    for rec in records:
        out.write(json.dumps(rec) + "\n")

print(f"Generated {len(records)} normalised ground truth labels in {labels_out}.")
if unusable_faces > 0:
    print(f"Note: {unusable_faces} face(s) had unusable image/crop; sharpness omitted.")
EOF
  echo "Labels generation completed successfully."
fi
