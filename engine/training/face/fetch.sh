#!/usr/bin/env bash
# Download and unpack LFW (Labeled Faces in the Wild, original images, 13,233 photos of 5,749 people) into
# engine/training/datasets/lfw/raw/lfw/<person>/<photo>.jpg (gitignored). Same file scikit-learn's fetch_lfw_* uses.
# Source: figshare file 5976018 = lfw.tgz, a mirror of http://vis-www.cs.umass.edu/lfw (the official site did not load
# for us). Terms: no licence is stated by the authors or the mirrors; see docs/datasets.md. The images stay local.
set -euo pipefail
dir="$(cd "$(dirname "$0")/.." && pwd)/datasets/lfw"
sha=055f7d9c632d7370e6fb4afc7468d40f970c34a80d4c6f50ffec63f5a8d536c0
mkdir -p "$dir/raw"
if [ ! -d "$dir/raw/lfw" ]; then
  curl -fSL -o "$dir/lfw.tgz.tmp" https://ndownloader.figshare.com/files/5976018
  echo "$sha  $dir/lfw.tgz.tmp" | sha256sum -c -
  mv "$dir/lfw.tgz.tmp" "$dir/lfw.tgz"
  tar -xzf "$dir/lfw.tgz" -C "$dir/raw"
fi
echo "LFW ready: $(find "$dir/raw/lfw" -name '*.jpg' | wc -l) images"
