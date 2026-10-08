"""Processor registry module."""
from .base import BaseProcessor
from .yolo_detector import YoloDetectorProcessor
from .image_converter import ImageConverterProcessor


def get_processor_registry() -> dict[str, BaseProcessor]:
    """Factory creating and registering all available job processors."""
    return {
        "object-detection": YoloDetectorProcessor(),
        "image-convert": ImageConverterProcessor(),
    }


__all__ = ["BaseProcessor", "YoloDetectorProcessor", "ImageConverterProcessor", "get_processor_registry"]
