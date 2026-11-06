"""Kaggle-side runner (filled in by push.sh): copies the datasets to a writable folder, then runs train.py.

push.sh replaces __TRAIN_PY_B64__ with train.py (base64), __TRAIN_ARGS__ with the train.py arguments (JSON) and
__ULTRALYTICS__ with the Ultralytics version to install.
An argument naming a file that exists anywhere under /kaggle/input (e.g. uploaded weights) is replaced by its path.
Output: /kaggle/working/runs/<experiment>/<run>/, downloaded by `kaggle kernels output`.
"""

import base64
import json
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

TRAIN_PY = base64.b64decode("__TRAIN_PY_B64__").decode()
TRAIN_ARGS = json.loads("""__TRAIN_ARGS__""")
INPUT = Path("/kaggle/input")
DATA = Path("/tmp/datasets")  # writable: train.py moves crowd images aside and writes tiles

for name in ("wider-face", "vn-plate"):
    folders = [p for p in INPUT.rglob(name) if (p / "images").is_dir()]
    if folders:  # Kaggle extracts uploaded zips
        shutil.copytree(folders[0], DATA / name)
    else:
        zipfile.ZipFile(next(INPUT.rglob(f"{name}-yolo.zip"))).extractall(DATA)
    print(name, sum(1 for _ in (DATA / name / "images" / "train").iterdir()), "train images", flush=True)

inputs = {p.name: str(p) for p in INPUT.rglob("*") if p.is_file()}
args = [inputs.get(a, a) for a in TRAIN_ARGS]
Path("/kaggle/working/train.py").write_text(TRAIN_PY)
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "ultralytics==__ULTRALYTICS__"], check=True)
subprocess.run(
    [sys.executable, "/kaggle/working/train.py", *args, "--data-dir", str(DATA)],
    check=True,
    cwd="/kaggle/working",
    env={**os.environ, "PYTHONUNBUFFERED": "1"},
)
