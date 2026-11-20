# Engine training and benchmarks

Everything that trains or measures the Engine's models, one folder per topic. Each folder's README says how to run it;
its `results/` holds the numbers and the write-up.

| Folder | What it covers | Start here |
| --- | --- | --- |
| [`detection/`](detection) | Training the face + plate detector, and the image benchmark (3,726 WIDER FACE + Vietnamese plate images) | [detection/README.md](detection/README.md) (how), [detection/results/README.md](detection/results/README.md) (the journey and picked models), [detection/bench/comparison.md](detection/bench/comparison.md) (every number) |
| [`whitelist/`](whitelist) | The allow list: faces (LFW: owner kept vs stranger leaked) and plates (OCR text matching) | [whitelist/README.md](whitelist/README.md) (results), [whitelist/benchmarks.md](whitelist/benchmarks.md) (plan and status) |
| [`ocr/`](ocr) | Reading plate text for the plate allow list | [ocr/README.md](ocr/README.md), [ocr/results/README.md](ocr/results/README.md) |
| [`video/`](video) | Video bench: the whole Engine (detection, tracking, allow list, blur) on labelled clips | [video/results/comparison.md](video/results/comparison.md) |

Shared, not in git: `datasets/` (training zips, benchmark sets, the labelled clips), `runs/` (weights and checkpoints),
`kaggle-out/` (Kaggle downloads). The picked models are in [`engine/models/`](../models); the Engine loads them from there.
Where each dataset comes from and what we may do with it: [docs/datasets.md](../../docs/datasets.md). Throughput (not
accuracy): [infra/bench/results/comparison.md](../../infra/bench/results/comparison.md).

Setup (once): `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt` here (~6 GB, PyTorch with CUDA). The
whitelist, OCR and video scripts use the Engine's own code, so they run with `engine/.venv` from the repo root.
