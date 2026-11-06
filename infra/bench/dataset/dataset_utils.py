"""Helpers describing the benchmark dataset, shared by the throughput benchmark (run.sh, fetch.sh) and the accuracy
scorer (engine/training/accuracy/evaluate.py).

    python3 dataset_utils.py --list-images <manifest>   # local file name of every image in a manifest (run.sh)
"""

import os
import re
import sys
from typing import Any, List


def manifest_path_to_filename(manifest_path: str) -> str:
    """Map manifest path to local image filename.

    WIDER FACE and Dataset/Test images retain their basename.
    Dataset/Valid images are prefixed with 'valid_' to prevent collisions
    with duplicate filenames in Dataset/Test.
    """
    base = os.path.basename(manifest_path)
    if "Dataset/Valid/" in manifest_path:
        return f"valid_{base}"
    return base


def _pure_python_sharpness(grid: List[List[float]]) -> float:
    """Compute Laplacian variance with reflect padding on 64x64 float grid."""
    laps = []
    for r in range(64):
        rm1 = r - 1 if r > 0 else 1
        rp1 = r + 1 if r < 63 else 62
        row_r = grid[r]
        row_rm1 = grid[rm1]
        row_rp1 = grid[rp1]
        for c in range(64):
            cm1 = c - 1 if c > 0 else 1
            cp1 = c + 1 if c < 63 else 62
            val = float(row_rm1[c] + row_rp1[c] + row_r[cm1] + row_r[cp1] - 4.0 * row_r[c])
            laps.append(val)
    mean = sum(laps) / len(laps)
    var = sum((x - mean) ** 2 for x in laps) / len(laps)
    return float(var)


def compute_sharpness(img_or_crop: Any) -> float:
    """Compute measured sharpness on a cropped face image.

    Crop is converted to grayscale, resized to 64x64 (bilinear), filtered with
    the 3x3 Laplacian kernel [[0, 1, 0], [1, -4, 1], [0, 1, 0]] (reflect padding),
    and the variance of the result is returned.
    Supports PIL Image, 2D numpy array, or 2D list of pixel intensities.
    """
    try:
        from PIL import Image
    except ImportError:
        import glob
        _site_pkgs = glob.glob(
            os.path.join(
                os.path.dirname(__file__), "..", ".cache", "accuracy-venv", "lib", "python*", "site-packages"
            )
        )
        if _site_pkgs and _site_pkgs[0] not in sys.path:
            sys.path.insert(0, _site_pkgs[0])
        try:
            from PIL import Image
        except ImportError:
            Image = None

    try:
        import numpy as np
    except ImportError:
        import glob
        _site_pkgs = glob.glob(
            os.path.join(
                os.path.dirname(__file__), "..", ".cache", "accuracy-venv", "lib", "python*", "site-packages"
            )
        )
        if _site_pkgs and _site_pkgs[0] not in sys.path:
            sys.path.insert(0, _site_pkgs[0])
        try:
            import numpy as np
        except ImportError:
            np = None

    if Image is not None and isinstance(img_or_crop, Image.Image):
        if img_or_crop.mode != "L":
            img_or_crop = img_or_crop.convert("L")
        if img_or_crop.size != (64, 64):
            resample = getattr(Image, "Resampling", Image).BILINEAR
            img_or_crop = img_or_crop.resize((64, 64), resample=resample)
        if np is not None:
            arr = np.array(img_or_crop, dtype=np.float64)
            padded = np.pad(arr, 1, mode="reflect")
            lap = (
                padded[:-2, 1:-1]
                + padded[2:, 1:-1]
                + padded[1:-1, :-2]
                + padded[1:-1, 2:]
                - 4.0 * padded[1:-1, 1:-1]
            )
            return float(np.var(lap))
        else:
            raw_pixels = list(img_or_crop.getdata())
            grid = [
                [float(raw_pixels[r * 64 + c]) for c in range(64)] for r in range(64)
            ]
            return _pure_python_sharpness(grid)

    if np is not None and isinstance(img_or_crop, np.ndarray):
        if img_or_crop.shape != (64, 64):
            if Image is not None:
                im = Image.fromarray(img_or_crop.astype(np.uint8)).convert("L")
                resample = getattr(Image, "Resampling", Image).BILINEAR
                im = im.resize((64, 64), resample=resample)
                arr = np.array(im, dtype=np.float64)
            else:
                raise ValueError("Resizing numpy array to (64, 64) requires Pillow")
        else:
            arr = img_or_crop.astype(np.float64)
        padded = np.pad(arr, 1, mode="reflect")
        lap = (
            padded[:-2, 1:-1]
            + padded[2:, 1:-1]
            + padded[1:-1, :-2]
            + padded[1:-1, 2:]
            - 4.0 * padded[1:-1, 1:-1]
        )
        return float(np.var(lap))

    # Fallback for 2D list of numbers
    if isinstance(img_or_crop, list) and len(img_or_crop) > 0 and isinstance(img_or_crop[0], list):
        if len(img_or_crop) == 64 and len(img_or_crop[0]) == 64:
            return _pure_python_sharpness(img_or_crop)
        elif Image is not None and np is not None:
            arr = np.array(img_or_crop, dtype=np.uint8)
            im = Image.fromarray(arr).convert("L")
            resample = getattr(Image, "Resampling", Image).BILINEAR
            im = im.resize((64, 64), resample=resample)
            return compute_sharpness(im)
        else:
            raise ValueError("Input 2D list must be 64x64 when Pillow/numpy are not available")

    raise TypeError(f"Unsupported input type for compute_sharpness: {type(img_or_crop)}")


def main() -> None:
    if len(sys.argv) != 3 or sys.argv[1] != "--list-images":
        sys.exit("usage: dataset_utils.py --list-images <manifest>")
    if not os.path.isfile(sys.argv[2]):
        sys.exit(f"ERROR: Manifest file not found: {sys.argv[2]}")
    with open(sys.argv[2], "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if len(parts) < 2:
                continue
            # manifest lines are "<path> <sha256>" (or "<sha256> <path>")
            src_path = parts[1] if re.fullmatch(r"[0-9a-fA-F]{64}", parts[0]) else parts[0]
            print(manifest_path_to_filename(src_path))


if __name__ == "__main__":
    main()
