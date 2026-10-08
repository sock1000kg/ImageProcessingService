"""NATS JetStream messaging client for Engine."""
import json
import logging
from datetime import datetime, timezone
import nats
from nats.js.client import JetStreamContext
from .config import settings

logger = logging.getLogger(__name__)


class MessagingClient:
    def __init__(self):
        self.nc = None
        self.js: JetStreamContext = None

    async def connect(self):
        """Connect to NATS server and get JetStream context."""
        logger.info(f"Connecting to NATS at {settings.nats_url}...")
        self.nc = await nats.connect(settings.nats_url)
        self.js = self.nc.jetstream()
        logger.info("Connected to NATS JetStream successfully.")

    async def close(self):
        """Close connection to NATS."""
        if self.nc and not self.nc.is_closed:
            await self.nc.drain()
            logger.info("NATS connection closed.")

    async def emit_progress_event(self, job_id: str, progress: int = 30, stage: str = "PROCESSING"):
        """Emit PROCESSING event to jobs.events."""
        payload = {
            "jobId": job_id,
            "status": "PROCESSING",
            "progress": progress,
            "stage": stage,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await self.js.publish(settings.nats_events_subject, json.dumps(payload).encode())
        logger.debug(f"Emitted PROGRESS event for {job_id} ({progress}%)")

    async def emit_completion_event(self, job_id: str, output_bucket: str, output_key: str, result_summary: dict):
        """Emit COMPLETED event to jobs.events."""
        payload = {
            "jobId": job_id,
            "status": "COMPLETED",
            "progress": 100,
            "stage": "DONE",
            "result": {
                "bucket": output_bucket,
                "key": output_key,
            },
            "resultSummary": result_summary,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await self.js.publish(settings.nats_events_subject, json.dumps(payload).encode())
        logger.info(f"Emitted COMPLETED event for {job_id}")

    async def emit_failure_event(self, job_id: str, error_code: str, error_message: str, stage: str = "PROCESSING"):
        """Emit FAILED event to jobs.events."""
        payload = {
            "jobId": job_id,
            "status": "FAILED",
            "progress": 0,
            "stage": stage,
            "error": {
                "code": error_code,
                "message": error_message,
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await self.js.publish(settings.nats_events_subject, json.dumps(payload).encode())
        logger.error(f"Emitted FAILED event for {job_id}: [{error_code}] {error_message}")
