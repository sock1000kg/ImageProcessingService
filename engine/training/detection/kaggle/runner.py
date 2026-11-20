"""Kaggle-side runner (filled in by push.sh): copies every YOLO dataset folder to a writable place, then runs train.py.

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

# Every YOLO folder in the input datasets (<name>/images/train): wider-face, vn-plate and any --extra folder.
# Kaggle extracts uploaded zips; a zip it left packed (<name>-yolo.zip) is extracted here.
for z in INPUT.rglob("*-yolo.zip"):
    zipfile.ZipFile(z).extractall(DATA)
for train_dir in INPUT.rglob("images/train"):
    folder = train_dir.parent.parent
    if not (DATA / folder.name).exists():
        shutil.copytree(folder, DATA / folder.name)
for folder in sorted(p for p in DATA.iterdir() if (p / "images/train").is_dir()):
    print(folder.name, sum(1 for _ in (folder / "images/train").iterdir()), "train images", flush=True)

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
