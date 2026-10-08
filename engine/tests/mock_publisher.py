"""Mock Publisher Script for standalone Engine testing without Web or K8s."""
import asyncio
import io
import json
import uuid
import nats
from minio import Minio
from PIL import Image, ImageDraw

MINIO_ENDPOINT = "localhost:9000"
MINIO_ACCESS_KEY = "minioadmin"
MINIO_SECRET_KEY = "minioadmin"
NATS_URL = "nats://localhost:4222"


def generate_sample_image() -> bytes:
    """Generate a simple test image with shapes in memory."""
    img = Image.new("RGB", (640, 480), color=(240, 240, 240))
    draw = ImageDraw.Draw(img)
    # Draw a blue rectangle (like a car or bus)
    draw.rectangle([100, 150, 300, 350], fill=(50, 100, 220), outline=(0, 0, 0))
    # Draw a yellow circle
    draw.ellipse([350, 100, 500, 250], fill=(240, 200, 50), outline=(0, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()


async def main():
    print("=== STARTING MOCK ENGINE TEST ===")
    
    # 1. Connect to MinIO
    print(f"[*] Connecting to MinIO at {MINIO_ENDPOINT}...")
    s3 = Minio(MINIO_ENDPOINT, access_key=MINIO_ACCESS_KEY, secret_key=MINIO_SECRET_KEY, secure=False)
    
    if not s3.bucket_exists("uploads"):
        s3.make_bucket("uploads")
    if not s3.bucket_exists("results"):
        s3.make_bucket("results")

    job_id = str(uuid.uuid4())
    input_key = f"{job_id}/input.jpg"
    output_key = f"{job_id}/result.jpg"
    
    # Upload sample image
    image_bytes = generate_sample_image()
    s3.put_object("uploads", input_key, io.BytesIO(image_bytes), len(image_bytes), content_type="image/jpeg")
    print(f"[+] Uploaded test image: uploads/{input_key}")

    # 2. Connect to NATS
    print(f"[*] Connecting to NATS at {NATS_URL}...")
    nc = await nats.connect(NATS_URL)
    js = nc.jetstream()

    # Ensure streams exist
    for stream, subject in [("AI_JOBS", "jobs.ai"), ("JOB_EVENTS", "jobs.events")]:
        try:
            await js.add_stream(name=stream, subjects=[subject])
        except Exception:
            pass

    # 3. Listen for worker events
    done_event = asyncio.Event()

    async def event_handler(msg):
        data = json.loads(msg.data.decode("utf-8"))
        j_id = data.get("jobId")
        status = data.get("status")
        progress = data.get("progress")
        stage = data.get("stage")
        print(f"==> [EVENT FROM WORKER] Job: {j_id} | Status: {status} ({progress}%) | Stage: {stage}")
        
        if status in ("COMPLETED", "FAILED"):
            if status == "COMPLETED":
                print(f"[SUCCESS] Result details: {json.dumps(data.get('resultSummary'), indent=2)}")
                print(f"[+] Output artifact located at: {data.get('result', {}).get('bucket')}/{data.get('result', {}).get('key')}")
            else:
                print(f"[FAILURE] Error info: {json.dumps(data.get('error'), indent=2)}")
            done_event.set()
        await msg.ack()

    await js.subscribe("jobs.events", cb=event_handler)

    # 4. Publish job command
    payload = {
        "jobId": job_id,
        "type": "object-detection",
        "input": {
            "bucket": "uploads",
            "key": input_key
        },
        "output": {
            "bucket": "results",
            "key": output_key
        },
        "params": {
            "confidenceThreshold": 0.3
        }
    }

    print(f"[*] Publishing job command to 'jobs.ai' (Job ID: {job_id})...")
    await js.publish("jobs.ai", json.dumps(payload).encode("utf-8"))

    print("[*] Waiting for worker to process job...")
    try:
        await asyncio.wait_for(done_event.wait(), timeout=30.0)
        print("=== TEST FINISHED SUCCESSFULLY ===")
    except asyncio.TimeoutError:
        print("[!] Timeout: Worker did not respond within 30 seconds.")
    finally:
        await nc.drain()

if __name__ == "__main__":
    asyncio.run(main())
