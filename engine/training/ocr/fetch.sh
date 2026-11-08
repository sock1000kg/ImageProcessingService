#!/usr/bin/env bash
# Download the Vietnamese plate character dataset used by eval_ocr.py into engine/training/datasets/ (gitignored).
# Source: trungdinh22/License-Plate-Recognition, "Character Detection Dataset" (OCR.zip, 132 MB, licence not stated),
# so the images stay local and only results are committed.
set -euo pipefail
cd "$(dirname "$0")/../datasets"
ID=1bPux9J0e1mz-_Jssx4XX1-wPGamaS8mI
SHA=7f6d33ec04b81fb73114c45bdc4b5690d02fd8f981c9729cd6167776d56e3ace
if [ ! -f vn-plate-ocr.zip ]; then
  # confirm=t skips Drive's "too large to scan for viruses" page.
  curl -fSL -o vn-plate-ocr.zip.tmp "https://drive.usercontent.google.com/download?id=$ID&export=download&confirm=t"
  mv vn-plate-ocr.zip.tmp vn-plate-ocr.zip
fi
echo "$SHA  vn-plate-ocr.zip" | sha256sum -c -
rm -rf vn-plate-ocr && mkdir vn-plate-ocr && unzip -q vn-plate-ocr.zip -d vn-plate-ocr
echo "Ready: $(pwd)/vn-plate-ocr/OCR (images/{train,val}, labels/{train,val})"
