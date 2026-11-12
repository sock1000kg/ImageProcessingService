"""Abstract Base Processor Interface."""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Tuple, Dict, Any, Optional, Callable
import cv2
import numpy as np

DEFAULT_CONFIDENCE_THRESHOLDS: Dict[str, float] = {"face": 0.17, "plate": 0.11}
DEFAULT_REVIEW_THRESHOLD: float = 0.25
DEFAULT_REDACTION_STRENGTHS: Dict[str, int] = {"blur": 15, "pixelate": 8}


@dataclass(frozen=True)
class DetectionModeConfig:
    mode: str
    model_name: str
    imgsz: int
    confidence_thresholds: Dict[str, float]


def parse_mode_config(
    mode_name: str,
    config_str: str,
    default_model: str = "yolo26n-1280-e20-crowd.pt",
    default_imgsz: int = 1280,
) -> DetectionModeConfig:
    """Parse configuration string in format '<model_name>@<imgsz>:face=<conf>,plate=<conf>'.

    Example:
        'yolo26n-1280-e20-crowd.pt@1280:face=0.17,plate=0.11'
    """
    config_str = (config_str or "").strip()
    model_name = default_model
    imgsz = default_imgsz
    thresholds = dict(DEFAULT_CONFIDENCE_THRESHOLDS)

    if not config_str:
        return DetectionModeConfig(
            mode=mode_name,
            model_name=model_name,
            imgsz=imgsz,
            confidence_thresholds=thresholds,
        )

    # 1. Parse @ separator for model_name
    if "@" in config_str:
        parts = config_str.split("@", 1)
        model_name = parts[0].strip() or default_model
        rest = parts[1].strip()
    else:
        rest = config_str

    # 2. Parse : separator for imgsz and thresholds
    if ":" in rest:
        imgsz_part, thresh_part = rest.split(":", 1)
        imgsz_part = imgsz_part.strip()
        if imgsz_part.isdigit():
            parsed_sz = int(imgsz_part)
            if parsed_sz > 0 and parsed_sz % 32 == 0:
                imgsz = parsed_sz

        for pair in thresh_part.split(","):
            pair = pair.strip()
            if "=" in pair:
                k, v = pair.split("=", 1)
                k = k.strip()
                try:
                    thresholds[k] = float(v.strip())
                except ValueError:
                    pass
    else:
        # Check if rest is an imgsz or model name
        if rest.isdigit():
            parsed_sz = int(rest)
            if parsed_sz > 0 and parsed_sz % 32 == 0:
                imgsz = parsed_sz
        elif "@" not in config_str and rest:
            model_name = rest

    return DetectionModeConfig(
        mode=mode_name,
        model_name=model_name,
        imgsz=imgsz,
        confidence_thresholds=thresholds,
    )


def get_detection_mode_config(mode: Optional[str] = "fast") -> DetectionModeConfig:
    """Resolve DetectionModeConfig for a given mode ('fast', 'accurate', 'max_privacy')."""
    from ..config import settings

    norm_mode = (mode or "fast").lower().strip()
    if norm_mode == "accurate":
        raw_cfg = settings.mode_accurate
        default_model = "yolo26s-1280-e5-plates-frozen-x3.pt"
        return parse_mode_config("accurate", raw_cfg, default_model=default_model)
    elif norm_mode == "max_privacy":
        raw_cfg = settings.mode_max_privacy
        default_model = "yolo26s-1280-e5-plates-frozen-x3.pt"
        return parse_mode_config("max_privacy", raw_cfg, default_model=default_model)
    else:
        raw_cfg = settings.mode_fast
        default_model = "yolo26n-1280-e20-crowd.pt"
        return parse_mode_config("fast", raw_cfg, default_model=default_model)


def parse_confidence_thresholds(
    params: Optional[Dict[str, Any]] = None,
    base_thresholds: Optional[Dict[str, float]] = None,
) -> Dict[str, float]:
    """Parse class-specific confidence thresholds from job params.

    Why: Reads params.confidenceThresholds mapping and falls back to
    base thresholds (or default: face: 0.17, plate: 0.11) when omitted.
    """
    params = params or {}
    new_thresholds = params.get("confidenceThresholds")
    base = base_thresholds or DEFAULT_CONFIDENCE_THRESHOLDS

    if isinstance(new_thresholds, dict) and "face" in new_thresholds and new_thresholds["face"] is not None:
        face = float(new_thresholds["face"])
    else:
        face = float(base.get("face", DEFAULT_CONFIDENCE_THRESHOLDS["face"]))

    if isinstance(new_thresholds, dict) and "plate" in new_thresholds and new_thresholds["plate"] is not None:
        plate = float(new_thresholds["plate"])
    else:
        plate = float(base.get("plate", DEFAULT_CONFIDENCE_THRESHOLDS["plate"]))

    return {"face": face, "plate": plate}


def apply_redaction_style(roi: np.ndarray, style: str, strength: Optional[int] = None) -> np.ndarray:
    """Apply blur, pixelate, or blackout to a single region of interest.

    Complies with Contract §2: strength is relative to ROI dimensions.
    - blackout: pure black pixels.
    - pixelate: strength defines the number of mosaic cells across ROI width
      (default: 8, range: 3-32). Smaller strength means coarser mosaic.
    - blur: Gaussian radius sigma is strength% of ROI width (default: 15, range: 1-50).
    """
    h, w = roi.shape[:2]
    if h <= 0 or w <= 0:
        return roi

    style = style.lower() if isinstance(style, str) else "blur"

    if style == "blackout":
        return np.zeros_like(roi)

    elif style == "pixelate":
        val = strength if (strength is not None and strength > 0) else DEFAULT_REDACTION_STRENGTHS["pixelate"]
        num_cells = max(1, int(val))
        block_size = max(1, int(round(w / num_cells)))
        down_w = max(1, int(round(w / block_size)))
        down_h = max(1, int(round(h / block_size)))
        small = cv2.resize(roi, (down_w, down_h), interpolation=cv2.INTER_LINEAR)
        return cv2.resize(small, (w, h), interpolation=cv2.INTER_NEAREST)

    else:  # blur
        val = strength if (strength is not None and strength > 0) else DEFAULT_REDACTION_STRENGTHS["blur"]
        sigma = float(w) * (float(val) / 100.0)
        sigma = max(0.8, sigma)
        ksize = int(round(sigma * 4))
        if ksize % 2 == 0:
            ksize += 1
        ksize = max(3, ksize)
        return cv2.GaussianBlur(roi, (ksize, ksize), sigma)


class BaseProcessor(ABC):
    @abstractmethod
    def process(
        self,
        input_bytes: bytes,
        params: Dict[str, Any],
        output_key: str = "",
        storage_client: Optional[Any] = None,
        progress_callback: Optional[Callable[[int, str], None]] = None,
    ) -> Tuple[bytes, Dict[str, Any], str]:
        """Process input bytes and return (output_bytes, result_summary, content_type).

        Args:
            input_bytes: The raw bytes downloaded from MinIO.
            params: Optional configuration dictionary from the job message.
            output_key: The output object key (used to determine format like .jpg, .png, .mp4).
            storage_client: StorageClient instance (for whitelist reference downloads).
            progress_callback: Optional callback func(pct: int, stage: str) to report progress.

        Returns:
            output_bytes: The processed file bytes.
            result_summary: Lightweight metadata dict to report back to backend.
            content_type: MIME type of the output file (e.g. 'image/jpeg', 'video/mp4').
        """
        pass
