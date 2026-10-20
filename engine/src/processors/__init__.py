"""Processor registry module."""
from ..config import settings
from .base import BaseProcessor
from .image_converter import ImageConverterProcessor


def get_processor_registry() -> dict[str, BaseProcessor]:
    """Factory creating and registering available job processors for the current pool.

    Determines which processor to load based on settings.nats_subjects[0]:
    - 'jobs.ai' -> object-detection (YoloDetectorProcessor)
    - 'jobs.image' -> image-convert (ImageConverterProcessor)
    Avoids importing ultralytics/torch in image-worker to conserve RAM and prevent OOM.
    """
    registry: dict[str, BaseProcessor] = {}
    primary_subject = settings.nats_subjects[0] if settings.nats_subjects else ""

    if "ai" in primary_subject:
        from .yolo_detector import YoloDetectorProcessor
        registry["object-detection"] = YoloDetectorProcessor(model_name=settings.yolo_model_name)
    elif "image" in primary_subject:
        registry["image-convert"] = ImageConverterProcessor()
    else:
        # Fallback if both or unknown subject:
        from .yolo_detector import YoloDetectorProcessor
        registry["object-detection"] = YoloDetectorProcessor(model_name=settings.yolo_model_name)
        registry["image-convert"] = ImageConverterProcessor()

    return registry


__all__ = ["BaseProcessor", "ImageConverterProcessor", "get_processor_registry"]
