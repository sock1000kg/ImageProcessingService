#!/bin/bash
# Usage: run_dashcam.sh [tag...]
# Video bench: current vs dashcam-fine-tuned model, both modes, on the benchmark clips (plate test1/test2, face clips).
# Each run: the Engine (prelabel.py --no-upload) writes prelabels/<clip>-<tag>.engine.json, then score.py compares it with
# the saved CVAT labels (prelabels/<clip>.labels.zip). test3/test4 are training data now and are not scored.
set -euo pipefail
T="$(cd "$(dirname "$0")" && pwd)"  # engine/training/video
cd "$T/../.."  # engine/
B=training/datasets/whitelist-videos/bench
V=training/datasets/whitelist-videos
K=training/kaggle-out
declare -A MODEL=(
  [maxcur]="MODE_MAX_PRIVACY=yolo26s-1280-e5-plates-frozen-x3.pt@1280:face=0.06,plate=0.05 max_privacy"
  [maxnew]="MODE_MAX_PRIVACY=$PWD/$K/e5-dashcam-s/runs/yolo26s-1280/e5-dashcam/weights/last.pt@1280:face=0.06,plate=0.05 max_privacy"
  [fastcur]="MODE_FAST=yolo26n-1280-e20-crowd.pt@1280:face=0.17,plate=0.11 fast"
  [fastnew]="MODE_FAST=$PWD/$K/e5-dashcam-n/runs/yolo26n-1280/e5-dashcam/weights/last.pt@1280:face=0.17,plate=0.11 fast"
  [maxneg]="MODE_MAX_PRIVACY=$PWD/$K/e5-dashcam-neg-s/runs/yolo26s-1280/e5-dashcam-neg/weights/last.pt@1280:face=0.06,plate=0.05 max_privacy"
  [fastneg]="MODE_FAST=$PWD/$K/e5-dashcam-neg-n/runs/yolo26n-1280/e5-dashcam-neg/weights/last.pt@1280:face=0.17,plate=0.11 fast"
)
faces() { for r in "$1"/*.jpg; do printf -- '--face-ref %s ' "$r"; done; }
# clip | video | owner args | --full (plates 0.9, faces 0.7)
CLIPS=(
  "plate-test1|$V/plate/video/test1.mp4|--plate $(cat $V/plate/OCR/plateTest1.txt)|0.9"
  "plate-test2|$V/plate/video/test2.mp4|--plate $(cat $V/plate/OCR/plateTest2.txt)|0.9"
  "face-test1|$(ls $V/face/video/test1/*.mp4)|$(faces $V/face/ImageWhitelist/whitelist1)|0.7"
  "face-test2a|$V/face/video/test2/1794658151945_46378725849720999_3243145683243589634.mp4|$(faces $V/face/ImageWhitelist/whitelist2)|0.7"
  "face-test2b|$V/face/video/test2/1794710896425_2594988409725242500_2594988409725242500.mp4|$(faces $V/face/ImageWhitelist/whitelist2)|0.7"
)
mkdir -p $B/scores
for tag in ${@:-maxcur maxnew fastcur fastnew}; do  # tags to run (default: the first four)
  read -r envset mode <<< "${MODEL[$tag]}"
  for c in "${CLIPS[@]}"; do
    IFS='|' read -r clip video owner full <<< "$c"
    [[ -n "${ONLY:-}" && "$clip" != ${ONLY}* ]] && continue  # ONLY=plate: plate clips only
    n="$clip-$tag${SUFFIX:-}"  # SUFFIX=-x: a new run name, the saved runs stay
    # shellcheck disable=SC2086
    env "$envset" MODELS_DIR=models .venv/bin/python training/video/prelabel.py "$video" --mode "$mode" --name "$n" \
      --out $B/prelabels --no-upload ${PRELABEL_ARGS:-} $owner > $B/scores/$n.prelabel.log 2>&1
    .venv/bin/python training/video/score.py "$clip" --engine "$n" --dir $B/prelabels --labels $B/prelabels/$clip.labels.zip \
      --full "$full" --json $B/scores/$n.json > $B/scores/$n.txt
    echo "$n done"
  done
done
echo ALL DONE
