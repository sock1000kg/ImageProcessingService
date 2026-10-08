"""Main entrypoint for the Engine Worker Service."""
import asyncio
import json
import logging
import signal
import sys
from .config import settings
from .storage import StorageClient
from .messaging import MessagingClient
from .processors import get_processor_registry

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
)
logger = logging.getLogger("worker")


class EngineWorker:
    def __init__(self):
        self.storage = StorageClient()
        self.messaging = MessagingClient()
        self.processors = get_processor_registry()
        self.running = True

    async def handle_job(self, msg):
        """Process a single job message received from NATS JetStream."""
        job_id = "unknown"
        try:
            payload = json.loads(msg.data.decode("utf-8"))
            job_id = payload.get("jobId", "unknown")
            job_type = payload.get("type")
            input_spec = payload.get("input", {})
            output_spec = payload.get("output", {})
            params = payload.get("params", {})

            logger.info(f"==> [RECEIVED JOB] ID: {job_id} | Type: {job_type}")

            # 1. Emit PROCESSING event
            await self.messaging.emit_progress_event(job_id=job_id, progress=10, stage="DOWNLOADING_INPUT")

            # 2. Download input file from MinIO
            in_bucket = input_spec.get("bucket", "uploads")
            in_key = input_spec.get("key")
            if not in_key:
                raise ValueError("Missing 'input.key' in job command")

            try:
                input_bytes = self.storage.download_file(in_bucket, in_key)
            except Exception as e:
                await self.messaging.emit_failure_event(job_id, "STORAGE_DOWNLOAD_ERROR", str(e), stage="DOWNLOADING_INPUT")
                await msg.ack()
                return

            # 3. Find processor
            processor = self.processors.get(job_type)
            if not processor:
                await self.messaging.emit_failure_event(
                    job_id, "UNSUPPORTED_JOB_TYPE", f"Job type '{job_type}' is not supported.", stage="INFERENCE"
                )
                await msg.ack()
                return

            # 4. Process the data
            await self.messaging.emit_progress_event(job_id=job_id, progress=40, stage="PROCESSING")
            try:
                output_bytes, result_summary, content_type = processor.process(input_bytes, params)
            except Exception as e:
                logger.exception(f"Inference error on job {job_id}: {e}")
                await self.messaging.emit_failure_event(job_id, "MODEL_INFERENCE_ERROR", str(e), stage="PROCESSING")
                await msg.ack()
                return

            # 5. Upload output file to MinIO
            out_bucket = output_spec.get("bucket", "results")
            out_key = output_spec.get("key")
            if not out_key:
                raise ValueError("Missing 'output.key' in job command")

            await self.messaging.emit_progress_event(job_id=job_id, progress=85, stage="UPLOADING_OUTPUT")
            try:
                self.storage.upload_file(out_bucket, out_key, output_bytes, content_type=content_type)
            except Exception as e:
                await self.messaging.emit_failure_event(job_id, "STORAGE_UPLOAD_ERROR", str(e), stage="UPLOADING_OUTPUT")
                await msg.ack()
                return

            # 6. Emit COMPLETED event
            await self.messaging.emit_completion_event(job_id, out_bucket, out_key, result_summary)

            # 7. ACK to JetStream only after everything is successful!
            await msg.ack()
            logger.info(f"<== [JOB COMPLETED & ACKED] ID: {job_id}")

        except Exception as e:
            logger.exception(f"Unexpected fatal error handling job {job_id}: {e}")
            await self.messaging.emit_failure_event(job_id, "INTERNAL_WORKER_ERROR", str(e))
            await msg.ack()

    async def run(self):
        """Start worker loop and consume jobs."""
        await self.messaging.connect()
        js = self.messaging.js

        # Ensure Stream exists (or listen to existing)
        for subject in settings.nats_subjects:
            stream_name = "AI_JOBS" if "ai" in subject else "IMAGE_JOBS"
            try:
                await js.add_stream(name=stream_name, subjects=[subject])
            except Exception:
                pass

        logger.info(f"Worker [{settings.worker_id}] is listening on subjects: {settings.nats_subjects}...")

        # Create pull subscriptions for each subject
        subs = []
        for subject in settings.nats_subjects:
            durable_name = f"{settings.nats_consumer_name}-{subject.replace('.', '-')}"
            sub = await js.pull_subscribe(subject, durable=durable_name)
            subs.append(sub)

        while self.running:
            for sub in subs:
                try:
                    msgs = await sub.fetch(batch=1, timeout=1.0)
                    for msg in msgs:
                        await self.handle_job(msg)
                except nats.errors.TimeoutError:
                    continue
                except Exception as e:
                    if self.running:
                        logger.error(f"Error fetching messages: {e}")
                        await asyncio.sleep(1)

        logger.info("Worker loop stopped. Draining connections...")
        await self.messaging.close()

    def stop(self):
        logger.info("Termination signal received. Shutting down worker...")
        self.running = False


def main():
    worker = EngineWorker()

    loop = asyncio.get_event_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, worker.stop)
        except NotImplementedError:
            # On Windows, add_signal_handler is not fully supported for all signals
            pass

    try:
        loop.run_until_complete(worker.run())
    except KeyboardInterrupt:
        worker.stop()
    finally:
        logger.info("Worker process exited.")


if __name__ == "__main__":
    main()
