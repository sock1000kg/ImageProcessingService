"""Abstract Base Processor Interface."""
from abc import ABC, abstractmethod
from typing import Tuple, Dict, Any, Optional, Callable

DEFAULT_CONFIDENCE_THRESHOLDS: Dict[str, float] = {"face": 0.17, "plate": 0.11}
DEFAULT_REVIEW_THRESHOLD: float = 0.25


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
