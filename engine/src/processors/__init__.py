"""Processor registry module for Engine Worker."""
from ..config import settings
from .base import BaseProcessor
from .image_redact import ImageRedactProcessor, InvalidInputFileError


def get_processor_registry() -> dict[str, BaseProcessor]:
    """Factory creating and registering available job processors for the current pool.

    For image-workers (subject 'jobs.image'), registers only 'image-redact'.
    Any unsupported job type will return None and trigger UNSUPPORTED_JOB_TYPE error.
    """
    registry: dict[str, BaseProcessor] = {
        "image-redact": ImageRedactProcessor(model_name=settings.yolo_model_name, imgsz=settings.yolo_imgsz),
    }
    return registry


__all__ = [
    "BaseProcessor",
    "ImageRedactProcessor",
    "InvalidInputFileError",
    "get_processor_registry",
]
