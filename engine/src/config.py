"""Configuration management for Engine Worker Service."""
import os
import uuid
import shutil
from pydantic import BaseModel, Field


def _detect_binary(bin_name: str) -> str:
    """Find FFmpeg/FFprobe: the FFMPEG_BIN/FFPROBE_BIN env var first, then PATH."""
    env_bin = os.getenv(f"{bin_name.upper()}_BIN")
    if env_bin:
        return env_bin
    which_bin = shutil.which(bin_name)
    if which_bin:
        return which_bin
    return bin_name


class Settings(BaseModel):
    # Worker Identity
    worker_id: str = Field(default_factory=lambda: f"worker-{uuid.uuid4().hex[:8]}")
    log_level: str = os.getenv("LOG_LEVEL", "INFO")

    # NATS JetStream Configuration
    nats_url: str = os.getenv("NATS_URL", "nats://localhost:4222")
    nats_stream_name: str = os.getenv("NATS_STREAM_NAME", "IMAGE_JOBS")
    nats_consumer_name: str = os.getenv("NATS_CONSUMER_NAME", "image-workers")
    nats_subjects: list[str] = [
        s.strip() for s in os.getenv("NATS_SUBJECTS", "jobs.image").split(",") if s.strip()
    ]
    nats_events_subject: str = os.getenv("NATS_EVENTS_SUBJECT", "jobs.events")

    # MinIO / S3 Configuration
    minio_endpoint: str = os.getenv("MINIO_ENDPOINT", "localhost:9000")
    minio_access_key: str = os.getenv("MINIO_ACCESS_KEY", "imgproclocal")
    minio_secret_key: str = os.getenv("MINIO_SECRET_KEY", "CHANGE_ME_minio_local")
    minio_secure: bool = os.getenv("MINIO_SECURE", "false").lower() in ("true", "1", "yes")

    # Model weights directory & default model
    models_dir: str = os.getenv("MODELS_DIR", "./models")
    yolo_model_name: str = os.getenv("YOLO_MODEL_NAME", "yolo26n-1280-e20-crowd.pt")
    # YOLO input size in px (multiple of 32). Larger finds smaller faces/plates but is slower.
    yolo_imgsz: int = int(os.getenv("YOLO_IMGSZ", "1280"))
    face_embedding_model: str = os.getenv("FACE_EMBEDDING_MODEL", "w600k_mbf.onnx")

    # Resilience & Fault Tolerance
    max_attempts: int = int(os.getenv("MAX_ATTEMPTS", "3"))
    job_deadline_seconds: int = int(
        os.getenv(
            "JOB_DEADLINE_SECONDS",
            "3600" if "video" in os.getenv("NATS_CONSUMER_NAME", "image-workers").lower() else "300",
        )
    )

    # Phase 2: Video Processing & Tracking Configuration
    ffmpeg_bin: str = Field(default_factory=lambda: _detect_binary("ffmpeg"))
    ffprobe_bin: str = Field(default_factory=lambda: _detect_binary("ffprobe"))
    video_tracker: str = os.getenv("VIDEO_TRACKER", "bytetrack.yaml")

    # Contract §5 & GDPR: Whitelist Biometric Cache Expiration
    whitelist_cache_ttl_seconds: int = int(os.getenv("WHITELIST_CACHE_TTL_SECONDS", "900"))  # Default 15 mins (900s)
    whitelist_max_cache_size: int = int(os.getenv("WHITELIST_MAX_CACHE_SIZE", "1000"))

    @property
    def is_video_pool(self) -> bool:
        """Check if this worker instance is dedicated to the video pool."""
        return "video" in self.nats_consumer_name.lower() or "video" in self.nats_stream_name.lower()


settings = Settings()
