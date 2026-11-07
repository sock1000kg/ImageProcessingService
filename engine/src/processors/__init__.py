"""Processor registry module for Engine Worker."""
from typing import Optional
from ..config import settings
from .base import BaseProcessor
from .image_redact import ImageRedactProcessor, InvalidInputFileError
from .video_redact import VideoRedactProcessor, VideoMetadata, VideoProbe
from .whitelist import WhitelistManager, WhitelistReferenceError
from .face_embedding import FaceEmbedder
from .plate_ocr import PlateWhitelistManager, PlateOCRRecognizer, normalize_plate_text


def get_processor_registry(pool_type: Optional[str] = None) -> dict[str, BaseProcessor]:
    """Factory creating and registering available job processors for the current pool.

    - For video-workers (consumer 'video-workers' / stream 'VIDEO_JOBS'): registers 'video-redact'.
    - For image-workers (consumer 'image-workers' / stream 'IMAGE_JOBS'): registers 'image-redact'.
    - If pool_type == 'all' or in testing: registers both.
    """
    registry: dict[str, BaseProcessor] = {}

    is_video = (pool_type == "video") or (pool_type is None and settings.is_video_pool)
    is_image = (pool_type == "image") or (pool_type is None and not settings.is_video_pool)
    is_all = (pool_type == "all")

    if is_image or is_all:
        registry["image-redact"] = ImageRedactProcessor(
            model_name=settings.yolo_model_name,
            face_embedding_model=settings.face_embedding_model,
            imgsz=settings.yolo_imgsz,
        )

    if is_video or is_all:
        registry["video-redact"] = VideoRedactProcessor(
            model_name=settings.yolo_model_name,
            face_embedding_model=settings.face_embedding_model,
            imgsz=settings.yolo_imgsz,
            ffmpeg_bin=settings.ffmpeg_bin,
            ffprobe_bin=settings.ffprobe_bin,
            tracker_config=settings.video_tracker,
        )

    return registry


__all__ = [
    "BaseProcessor",
    "ImageRedactProcessor",
    "VideoRedactProcessor",
    "VideoMetadata",
    "VideoProbe",
    "InvalidInputFileError",
    "WhitelistReferenceError",
    "WhitelistManager",
    "FaceEmbedder",
    "PlateWhitelistManager",
    "PlateOCRRecognizer",
    "normalize_plate_text",
    "get_processor_registry",
]
