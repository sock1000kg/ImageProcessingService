"""Abstract Base Processor Interface."""
from abc import ABC, abstractmethod
from typing import Tuple, Dict, Any, Optional, Callable
import cv2
import numpy as np

DEFAULT_CONFIDENCE_THRESHOLDS: Dict[str, float] = {"face": 0.17, "plate": 0.11}
DEFAULT_REVIEW_THRESHOLD: float = 0.25
DEFAULT_REDACTION_STRENGTHS: Dict[str, int] = {"blur": 15, "pixelate": 8}


def parse_confidence_thresholds(params: Optional[Dict[str, Any]] = None) -> Dict[str, float]:
    """Parse class-specific confidence thresholds from job params.

    Why: Reads params.confidenceThresholds mapping and falls back to
    default thresholds (face: 0.17, plate: 0.11) when omitted.
    """
    params = params or {}
    new_thresholds = params.get("confidenceThresholds")

    if isinstance(new_thresholds, dict) and "face" in new_thresholds and new_thresholds["face"] is not None:
        face = float(new_thresholds["face"])
    else:
        face = DEFAULT_CONFIDENCE_THRESHOLDS["face"]

    if isinstance(new_thresholds, dict) and "plate" in new_thresholds and new_thresholds["plate"] is not None:
        plate = float(new_thresholds["plate"])
    else:
        plate = DEFAULT_CONFIDENCE_THRESHOLDS["plate"]

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
