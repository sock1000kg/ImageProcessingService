"""Configuration management for Engine Worker Service."""
import os
import uuid
from pydantic import BaseModel, Field


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
    minio_access_key: str = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    minio_secret_key: str = os.getenv("MINIO_SECRET_KEY", "minioadmin")
    minio_secure: bool = os.getenv("MINIO_SECURE", "false").lower() in ("true", "1", "yes")

    # Model weights directory & default model
    models_dir: str = os.getenv("MODELS_DIR", "./models")
    yolo_model_name: str = os.getenv("YOLO_MODEL_NAME", "yolov8n-oiv7.pt")
    # YOLO input size in px (multiple of 32). Larger finds smaller faces/plates but is slower.
    yolo_imgsz: int = int(os.getenv("YOLO_IMGSZ", "640"))

    # Resilience & Fault Tolerance
    max_attempts: int = int(os.getenv("MAX_ATTEMPTS", "3"))
    job_deadline_seconds: int = int(os.getenv("JOB_DEADLINE_SECONDS", "300"))


settings = Settings()
