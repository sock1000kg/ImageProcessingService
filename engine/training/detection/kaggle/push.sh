#!/usr/bin/env bash
# Run train.py on a Kaggle GPU (T4) in the background.
#
#   bash kaggle/push.sh <kernel-name> [--dataset <kaggle-dataset>]... [--ultralytics VERSION] -- <train.py arguments>
#   bash kaggle/push.sh imgproc-yolo11s-960-e12 -- --experiment yolo11s-960 --run e12 --base yolo11s.pt --imgsz 960 \
#     --epochs 12 --batch 4 --tile-crowds
#
# Needs the Kaggle CLI (~/.kaggle/venv/bin/kaggle) logged in, and the private dataset
# <user>/imgproc-face-plate-yolo (wider-face-yolo.zip + vn-plate-yolo.zip). --dataset (repeatable; old name --weights)
# adds another dataset: one holding a .pt to start from (pass its file name to --base and the runner finds it), or one
# holding a YOLO folder <name>/images/train for train.py --extra <name>:<copies>. Example, the dashcam fine-tune:
#   bash kaggle/push.sh imgproc-yolo26s-e5-dashcam --dataset imgproc-dashcam-plates --dataset imgproc-yolo26s-plates-frozen-x3 \
#     -- --experiment yolo26s-1280 --run e5-dashcam --base yolo26s-e5-plates-frozen-x3.pt --epochs 5 --batch 8 \
#     --workers 4 --close-mosaic 1 --optimizer SGD --lr0 0.001 --freeze 11 --tile-crowds --plate-copies 3 \
#     --extra dashcam-plates:4
# --ultralytics: the version
# installed on Kaggle (default 8.4.202 = requirements.txt; the first runs used 8.3.253; YOLO26 needs >= 8.4.0).
# Then: kaggle kernels status <user>/<kernel-name>; when COMPLETE:
#   kaggle kernels output <user>/<kernel-name> -p ../kaggle-out && cp -r ../kaggle-out/runs/<experiment>/<run> ../runs/<experiment>/
# Run from engine/training/detection (paths above are relative to it).
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
    --dataset|--weights) datasets="$datasets,$2"; shift 2 ;;
    --ultralytics) ultralytics=$2; shift 2 ;;
    *) echo "usage: push.sh <kernel-name> [--dataset <dataset>]... [--ultralytics VERSION] -- <train.py args>" >&2; exit 1 ;;
  esac
done
shift

user=$($KAGGLE config view | sed -n 's/^- username: //p')
dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
python3 kaggle/build.py "$dir" "$user" "$name" "$datasets" "$ultralytics" "$@"
$KAGGLE kernels push -p "$dir" --accelerator NvidiaTeslaT4
