"""Main entrypoint for the Engine Worker Service."""
import asyncio
import json
import logging
import os
import signal
import time
import nats
import nats.errors
from .config import settings
from .storage import StorageClient
from .messaging import MessagingClient
from .processors import get_processor_registry, InvalidInputFileError

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
        self.is_processing = False
        self.current_msg = None

    async def handle_job(self, msg):
        """Process a single job message received from NATS JetStream."""
        self.current_msg = msg
        job_id = "unknown"
        batch_id = None
        num_delivered = getattr(getattr(msg, "metadata", None), "num_delivered", 1)
        job_start_time = time.monotonic()

        # Background heartbeat: send msg.in_progress() periodically so JetStream
        # does not re-deliver long-running AI / image jobs before ack_wait expires.
        # Enforces JOB_DEADLINE_SECONDS to prevent stalled threads from living forever (contract §4).
        async def heartbeat():
            try:
                while True:
                    await asyncio.sleep(15)
                    elapsed = time.monotonic() - job_start_time
                    if elapsed > settings.job_deadline_seconds:
                        logger.critical(
                            f"Job {job_id} exceeded deadline of {settings.job_deadline_seconds}s "
                            f"(elapsed: {elapsed:.1f}s). Exiting worker process per contract §4!"
                        )
                        os._exit(1)
                    try:
                        await msg.in_progress()
                        logger.debug(f"Heartbeat in_progress() sent for job {job_id} (elapsed: {elapsed:.1f}s)")
                    except Exception as err:
                        logger.warning(f"Failed to send in_progress heartbeat: {err}")
            except asyncio.CancelledError:
                pass

        hb_task = asyncio.create_task(heartbeat())

        # Helper to handle transient errors vs final fatal attempt (contract §4)
        async def handle_transient_error(err_code: str, err_msg: str, stage: str):
            if num_delivered < settings.max_attempts:
                logger.warning(
                    f"Transient error on job {job_id} [{err_code}]: {err_msg}. "
                    f"Attempt {num_delivered}/{settings.max_attempts}. NAKing with delay=5s..."
                )
                await msg.nak(delay=5)
            else:
                logger.error(
                    f"Transient error on job {job_id} [{err_code}]: {err_msg}. "
                    f"Final attempt {num_delivered}/{settings.max_attempts} reached. Emitting FAILED and ACKing..."
                )
                await self.messaging.emit_failure_event(
                    job_id, err_code, err_msg, stage=stage, batch_id=batch_id
                )
                await msg.ack()

        try:
            payload = json.loads(msg.data.decode("utf-8"))
            job_id = payload.get("jobId", "unknown")
            batch_id = payload.get("batchId")
            job_type = payload.get("type")
            input_spec = payload.get("input", {})
            output_spec = payload.get("output", {})
            params = payload.get("params", {})

            logger.info(
                f"==> [RECEIVED JOB] ID: {job_id} | Batch: {batch_id} | Type: {job_type} | Attempt: {num_delivered}"
            )

            # Contract §4: If message has been delivered more than MAX_ATTEMPTS, it means previous
            # attempts crashed or timed out. Do NOT process; emit WORKER_CRASHED and ack immediately.
            if num_delivered > settings.max_attempts:
                logger.error(
                    f"Job {job_id} exceeded max attempts ({num_delivered} > {settings.max_attempts}). Emitting WORKER_CRASHED."
                )
                await self.messaging.emit_failure_event(
                    job_id,
                    "WORKER_CRASHED",
                    f"Job crashed or timed out after {settings.max_attempts} attempts",
                    stage="PROCESSING",
                    batch_id=batch_id,
                )
                await msg.ack()
                return

            # 1. Emit PROCESSING event (DOWNLOADING_INPUT)
            await self.messaging.emit_progress_event(
                job_id=job_id, progress=10, stage="DOWNLOADING_INPUT", batch_id=batch_id
            )

            # 2. Download input file from MinIO (offloaded to thread to avoid blocking loop)
            in_bucket = input_spec.get("bucket", "uploads")
            in_key = input_spec.get("key")
            if not in_key:
                await self.messaging.emit_failure_event(
                    job_id, "INVALID_INPUT_FILE", "Missing 'input.key' in job command", stage="DOWNLOADING_INPUT", batch_id=batch_id
                )
                await msg.ack()
                return

            try:
                input_bytes = await asyncio.to_thread(self.storage.download_file, in_bucket, in_key)
            except Exception as e:
                await handle_transient_error("STORAGE_DOWNLOAD_ERROR", str(e), stage="DOWNLOADING_INPUT")
                return

            # 3. Find processor in registry
            processor = self.processors.get(job_type)
            if not processor:
                await self.messaging.emit_failure_event(
                    job_id, "UNSUPPORTED_JOB_TYPE", f"Job type '{job_type}' is not supported by this worker pool.", stage="PROCESSING", batch_id=batch_id
                )
                await msg.ack()
                return

            # 4. Validate output specification
            out_bucket = output_spec.get("bucket", "results")
            out_key = output_spec.get("key")
            if not out_key:
                await self.messaging.emit_failure_event(
                    job_id, "INVALID_INPUT_FILE", "Missing 'output.key' in job command", stage="PROCESSING", batch_id=batch_id
                )
                await msg.ack()
                return

            # 5. Process data in worker thread so CPU-heavy inference doesn't block asyncio event loop
            await self.messaging.emit_progress_event(
                job_id=job_id, progress=40, stage="PROCESSING", batch_id=batch_id
            )
            try:
                output_bytes, result_summary, content_type = await asyncio.to_thread(
                    processor.process, input_bytes, params, out_key
                )
            except InvalidInputFileError as e:
                logger.warning(f"Invalid input file on job {job_id}: {e}")
                await self.messaging.emit_failure_event(
                    job_id, "INVALID_INPUT_FILE", str(e), stage="PROCESSING", batch_id=batch_id
                )
                await msg.ack()
                return
            except Exception as e:
                logger.exception(f"Inference error on job {job_id}: {e}")
                await self.messaging.emit_failure_event(
                    job_id, "MODEL_INFERENCE_ERROR", str(e), stage="PROCESSING", batch_id=batch_id
                )
                await msg.ack()
                return

            # 6. Upload output file to MinIO (offloaded to thread)
            await self.messaging.emit_progress_event(
                job_id=job_id, progress=85, stage="UPLOADING_OUTPUT", batch_id=batch_id
            )
            try:
                await asyncio.to_thread(
                    self.storage.upload_file, out_bucket, out_key, output_bytes, content_type
                )
            except Exception as e:
                await handle_transient_error("STORAGE_UPLOAD_ERROR", str(e), stage="UPLOADING_OUTPUT")
                return

            # 7. Emit COMPLETED event
            await self.messaging.emit_completion_event(
                job_id, out_bucket, out_key, result_summary, batch_id=batch_id
            )

            # 8. ACK to JetStream only after everything is successful!
            await msg.ack()
            logger.info(f"<== [JOB COMPLETED & ACKED] ID: {job_id}")

        except Exception as e:
            logger.exception(f"Unexpected fatal error handling job {job_id}: {e}")
            await handle_transient_error("INTERNAL_WORKER_ERROR", str(e), stage="PROCESSING")
        finally:
            hb_task.cancel()
            try:
                await hb_task
            except asyncio.CancelledError:
                pass
            self.current_msg = None

    async def run(self):
        """Start worker loop and consume jobs."""
        await self.messaging.connect()
        js = self.messaging.js

        logger.info(
            f"Worker [{settings.worker_id}] binding to pre-provisioned consumer '{settings.nats_consumer_name}' "
            f"on stream '{settings.nats_stream_name}'..."
        )

        # Strictly bind to pre-provisioned durable consumer created by Infra
        try:
            sub = await js.pull_subscribe_bind(
                consumer=settings.nats_consumer_name,
                stream=settings.nats_stream_name,
            )
        except Exception as e:
            logger.error(
                f"Failed to bind to pre-provisioned consumer '{settings.nats_consumer_name}' "
                f"on stream '{settings.nats_stream_name}': {e}. Ensure infra setup has run."
            )
            raise

        while self.running:
            try:
                msgs = await sub.fetch(batch=1, timeout=1.0)
                for msg in msgs:
                    self.is_processing = True
                    try:
                        await self.handle_job(msg)
                    finally:
                        self.is_processing = False
            except (nats.errors.TimeoutError, TimeoutError, asyncio.TimeoutError):
                continue
            except Exception as e:
                if self.running:
                    logger.error(f"Error fetching messages: {e}")
                    await asyncio.sleep(1)

        # Graceful shutdown: wait up to 45s for in-flight job to finish before exiting
        shutdown_start = time.monotonic()
        while self.is_processing and (time.monotonic() - shutdown_start < 45):
            logger.info("Graceful shutdown: waiting for in-flight job to finish...")
            await asyncio.sleep(0.5)

        # If job is still processing when grace period is expiring, NAK so another worker picks it up
        if self.is_processing and self.current_msg is not None:
            logger.warning("Grace period ending with active job in-flight. NAKing message per contract §4...")
            try:
                await self.current_msg.nak()
            except Exception as nak_err:
                logger.warning(f"Failed to NAK in-flight message on shutdown: {nak_err}")

        logger.info("Worker loop stopped. Draining connections...")
        await self.messaging.close()

    def stop(self):
        logger.info("Termination signal (SIGTERM/SIGINT) received. Finishing active job and shutting down...")
        self.running = False


def main():
    worker = EngineWorker()

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, worker.stop)
        except (NotImplementedError, AttributeError):
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
