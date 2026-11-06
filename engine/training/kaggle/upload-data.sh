#!/usr/bin/env bash
# Upload the training zips to the private Kaggle dataset push.sh trains from (<user>/imgproc-face-plate-yolo).
#
#   bash kaggle/upload-data.sh [folder]      # default: datasets/ (wider-face-yolo.zip, vn-plate-yolo.zip)
#
# Creates the dataset the first time, otherwise adds a new version. Kaggle unzips the zips on its side.
set -euo pipefail
cd "$(dirname "$0")/.."
KAGGLE=${KAGGLE:-$HOME/.kaggle/venv/bin/kaggle}
src=$(realpath "${1:-datasets}")
for z in wider-face-yolo.zip vn-plate-yolo.zip; do
  [ -f "$src/$z" ] || { echo "missing $src/$z" >&2; exit 1; }
done

user=$($KAGGLE config view | sed -n 's/^- username: //p')
dir=$(mktemp -d)
trap 'rm -rf "$dir"' EXIT
ln -s "$src/wider-face-yolo.zip" "$src/vn-plate-yolo.zip" "$dir/"
echo "{\"title\": \"imgproc face plate yolo\", \"id\": \"$user/imgproc-face-plate-yolo\", \"licenses\": [{\"name\": \"other\"}]}" \
  > "$dir/dataset-metadata.json"
if $KAGGLE datasets status "$user/imgproc-face-plate-yolo" > /dev/null 2>&1; then
  $KAGGLE datasets version -p "$dir" -m "update training zips"
else
  $KAGGLE datasets create -p "$dir"
fi
