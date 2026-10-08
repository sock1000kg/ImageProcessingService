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
    nats_stream_name: str = os.getenv("NATS_STREAM_NAME", "AI_JOBS")
    nats_consumer_name: str = os.getenv("NATS_CONSUMER_NAME", "ai-workers")
    nats_subjects: list[str] = [
        s.strip() for s in os.getenv("NATS_SUBJECTS", "jobs.ai,jobs.image").split(",")
    ]
    nats_events_subject: str = os.getenv("NATS_EVENTS_SUBJECT", "jobs.events")

    # MinIO / S3 Configuration
    minio_endpoint: str = os.getenv("MINIO_ENDPOINT", "localhost:9000")
    minio_access_key: str = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
    minio_secret_key: str = os.getenv("MINIO_SECRET_KEY", "minioadmin")
    minio_secure: bool = os.getenv("MINIO_SECURE", "false").lower() in ("true", "1", "yes")

    # Model weights directory
    models_dir: str = os.getenv("MODELS_DIR", "./models")


settings = Settings()
