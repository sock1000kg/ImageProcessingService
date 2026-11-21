"""EgoBlur Gen2 (Meta) as a detector that keeps every box's score, for the benchmarks only (not used by the Engine).

Same steps as EgoBlur's own EgoblurDetector.run(), with its RGB-camera resize (RESIZE_MIN/MAX_GEN2, 1200 px) and NMS 0.5,
but the scores are kept and the threshold is a floor (0.05, like bench.py) so the bench can pick its own operating point.
Needs the EgoBlur checkout and venv in engine/training/.cache/egoblur/ (setup: detection/README.md, "Other tools").
"""

import sys
from pathlib import Path

import numpy as np
import torch

CACHE = Path(__file__).resolve().parents[1] / ".cache" / "egoblur"  # EgoBlur checkout, models, venv (gitignored)
sys.path.insert(0, str(CACHE / "EgoBlur"))

from gen2.script.constants import RESIZE_MAX_GEN2, RESIZE_MIN_GEN2  # noqa: E402
from gen2.script.detectron2.export.torchscript_patch import patch_instances  # noqa: E402
from gen2.script.predictor import PATCH_INSTANCES_FIELDS, ClassID, EgoblurDetector  # noqa: E402

FACE_MODEL = CACHE / "models" / "ego_blur_face_gen2.jit"
PLATE_MODEL = CACHE / "models" / "ego_blur_lp_gen2.jit"


class Detector:
    """detector(rgb image) -> [{"label": "face" | "plate", "conf": float, "box": [x1, y1, x2, y2]}]."""

    def __init__(self, face_path=FACE_MODEL, plate_path=PLATE_MODEL, floor=0.05):
        device = "cuda:0" if torch.cuda.is_available() else "cpu"

        def make(path, cls):
            return EgoblurDetector(model_path=str(path), device=device, detection_class=cls, score_threshold=floor,
                                   nms_iou_threshold=0.5,
                                   resize_aug={"min_size_test": RESIZE_MIN_GEN2, "max_size_test": RESIZE_MAX_GEN2})

        # Face and plate are two separate models in EgoBlur Gen2; None skips one.
        self.models = [(label, make(path, cls)) for label, path, cls in
                       (("face", face_path, ClassID.FACE), ("plate", plate_path, ClassID.LICENSE_PLATE)) if path]
        self.device = device
        # The TorchScript models refer to detectron2's scripted Instances class: register it for the whole run.
        self._patch = patch_instances(fields=PATCH_INSTANCES_FIELDS)
        self._patch.__enter__()

    @torch.no_grad()
    def __call__(self, rgb):
        bgr = np.ascontiguousarray(rgb[..., ::-1].transpose(2, 0, 1))  # EgoBlur takes BGR, channels first
        tensor = torch.from_numpy(bgr).to(self.device).unsqueeze(0)
        out = []
        for label, model in self.models:
            batch, orig_hw, in_hw = model.pre_process(tensor)
            found = model.get_detections(model.inference(batch), 0.0, "", 0.0, in_hw, orig_hw)[0]
            if found is None:
                continue
            boxes, scores = (found.face_bboxes, found.face_scores) if label == "face" else (found.lp_bboxes,
                                                                                             found.lp_scores)
            for box, score in zip(np.asarray(boxes).reshape(-1, 4), np.asarray(scores).reshape(-1)):
                out.append({"label": label, "conf": float(score), "box": [float(v) for v in box]})
        return out
