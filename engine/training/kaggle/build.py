"""Build the Kaggle kernel folder for push.sh: run.py (runner.py with train.py and its arguments filled in) and
kernel-metadata.json. Usage: build.py <out-dir> <user> <kernel-name> <dataset,dataset> <ultralytics version>
<train.py args...>"""

import base64
import json
import sys
from pathlib import Path

out, user, name, datasets, ultralytics, *args = sys.argv[1:]
here = Path(__file__).resolve().parent
run = (here / "runner.py").read_text()
run = run.replace("__TRAIN_PY_B64__", base64.b64encode((here.parent / "train.py").read_bytes()).decode())
run = run.replace("__TRAIN_ARGS__", json.dumps(args)).replace("__ULTRALYTICS__", ultralytics)
Path(out, "run.py").write_text(run)
meta = {
    "id": f"{user}/{name}",
    "title": name,
    "code_file": "run.py",
    "language": "python",
    "kernel_type": "script",
    "is_private": True,
    "enable_gpu": True,
    "enable_internet": True,
    "dataset_sources": [f"{user}/{d}" for d in datasets.split(",")],
    "competition_sources": [],
    "kernel_sources": [],
}
Path(out, "kernel-metadata.json").write_text(json.dumps(meta, indent=1))
