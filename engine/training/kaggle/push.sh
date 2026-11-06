#!/usr/bin/env bash
# Run train.py on a Kaggle GPU (T4) in the background.
#
#   bash kaggle/push.sh <kernel-name> [--weights <kaggle-dataset>] [--ultralytics VERSION] -- <train.py arguments>
#   bash kaggle/push.sh imgproc-yolo11s-960-e12 -- --experiment yolo11s-960 --run e12 --base yolo11s.pt --imgsz 960 \
#     --epochs 12 --batch 4 --tile-crowds
#
# Needs the Kaggle CLI (~/.kaggle/venv/bin/kaggle) logged in, and the private dataset
# <user>/imgproc-face-plate-yolo (wider-face-yolo.zip + vn-plate-yolo.zip). --weights adds another dataset, e.g. one
# holding a best.pt to start from: pass its file name to --base and the runner finds it. --ultralytics: the version
# installed on Kaggle (default 8.4.202 = requirements.txt; the first runs used 8.3.253; YOLO26 needs >= 8.4.0).
# Then: kaggle kernels status <user>/<kernel-name>; when COMPLETE:
#   kaggle kernels output <user>/<kernel-name> -p kaggle-out && cp -r kaggle-out/runs/<experiment>/<run> runs/<experiment>/
# Logs are not visible while it runs (Kaggle shows them at the end).
set -euo pipefail
cd "$(dirname "$0")/.."
KAGGLE=${KAGGLE:-$HOME/.kaggle/venv/bin/kaggle}

name=${1:?kernel name}
shift
datasets="imgproc-face-plate-yolo"
ultralytics=8.4.202
while [ "${1:-}" != "--" ]; do
  case "${1:-}" in
    --weights) datasets="$datasets,$2"; shift 2 ;;
    --ultralytics) ultralytics=$2; shift 2 ;;
    *) echo "usage: push.sh <kernel-name> [--weights <dataset>] [--ultralytics VERSION] -- <train.py args>" >&2; exit 1 ;;
  esac
done
shift

user=$($KAGGLE config view | sed -n 's/^- username: //p')
dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
python3 kaggle/build.py "$dir" "$user" "$name" "$datasets" "$ultralytics" "$@"
$KAGGLE kernels push -p "$dir" --accelerator NvidiaTeslaT4
