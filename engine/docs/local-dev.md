# Hướng dẫn Kiểm thử & Phát triển Cục bộ (Local Development)

> **Mục tiêu:** Giúp thành viên phụ trách Engine có thể lập trình, chạy thử và kiểm chứng toàn bộ luồng xử lý của Worker trên máy tính cá nhân mà **không cần chạy Web Frontend/Backend và không cần cài cụm Kubernetes**.

---

## 1. Kiến trúc môi trường kiểm thử cục bộ (Mock Environment)

Khi phát triển độc lập, bạn chỉ cần 2 dịch vụ nền:
1. **MinIO:** Để upload ảnh test và kiểm tra ảnh kết quả.
2. **NATS JetStream:** Để nhận lệnh job và phát sự kiện tiến độ.

```text
[ Script bơm test job ] ──(Bắn job)──► [ NATS JetStream ]
                                                │
                                                ▼ (Lắng nghe job)
[ File ảnh mẫu ] ──────► [ MinIO ] ◄──── [ Python Worker ]
                                                │
                                                ▼ (Phát event)
[ Script theo dõi ] ◄──(Nhận event)── [ NATS JetStream ]
```

---

## 2. File `docker-compose.local.yml`

Tạo một file `docker-compose.local.yml` tại thư mục `engine/` để bật nhanh NATS JetStream và MinIO:

```yaml
version: '3.8'

services:
  nats:
    image: nats:latest
    container_name: local-nats
    ports:
      - "4222:4222"   # NATS client port
      - "8222:8222"   # NATS HTTP monitoring port
    command: ["-js", "-m", "8222"] # Bật tính năng JetStream (-js)

  minio:
    image: minio/minio:latest
    container_name: local-minio
    ports:
      - "9000:9000"   # S3 API
      - "9001:9001"   # MinIO Web Console
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"

  minio-init:
    image: minio/mc:latest
    depends_on:
      - minio
    entrypoint: >
      /bin/sh -c "
      sleep 2;
      /usr/bin/mc alias set local http://minio:9000 minioadmin minioadmin;
      /usr/bin/mc mb local/uploads local/results --ignore-existing;
      /usr/bin/mc anonymous set download local/results;
      echo 'MinIO buckets created successfully!';
      exit 0;
      "
```

### Cách chạy:
```bash
docker compose -f docker-compose.local.yml up -d
```
* **MinIO Console:** Truy cập `http://localhost:9001` (user: `minioadmin`, pass: `minioadmin`).
* **NATS Monitoring:** Truy cập `http://localhost:8222`.

---

## 3. Script kiểm thử độc lập (Producer & Consumer Mock)

Để kiểm tra xem worker của bạn đã hoạt động chuẩn chưa mà không cần Backend, hãy tạo file `tests/mock_publisher.py`:

```python
# engine/tests/mock_publisher.py
import asyncio
import json
import uuid
import nats
from minio import Minio

MINIO_ENDPOINT = "localhost:9000"
MINIO_ACCESS_KEY = "minioadmin"
MINIO_SECRET_KEY = "minioadmin"
NATS_URL = "nats://localhost:4222"

async def main():
    # 1. Khởi tạo MinIO client và upload một ảnh test
    s3 = Minio(MINIO_ENDPOINT, access_key=MINIO_ACCESS_KEY, secret_key=MINIO_SECRET_KEY, secure=False)
    
    job_id = str(uuid.uuid4())
    input_key = f"{job_id}/input.jpg"
    output_key = f"{job_id}/result.jpg"
    
    # Tạo một ảnh dummy hoặc lấy ảnh có sẵn để upload
    print(f"[*] Uploading test image to MinIO: uploads/{input_key}...")
    s3.fput_object("uploads", input_key, "tests/sample.jpg")

    # 2. Kết nối NATS
    nc = await nats.connect(NATS_URL)
    js = nc.jetstream()

    # 3. Đảm bảo Stream tồn tại
    try:
        await js.add_stream(name="AI_JOBS", subjects=["jobs.ai"])
        await js.add_stream(name="JOB_EVENTS", subjects=["jobs.events"])
    except Exception:
        pass

    # 4. Lắng nghe event trả về từ worker
    async def event_handler(msg):
        data = json.loads(msg.data.decode())
        print(f"[EVENT RECEIVED] Job {data.get('jobId')} -> Status: {data.get('status')}")
        if data.get("status") == "COMPLETED":
            print(f"[SUCCESS] Result Summary: {json.dumps(data.get('resultSummary'), indent=2)}")
        await msg.ack()

    await js.subscribe("jobs.events", cb=event_handler)

    # 5. Gửi lệnh Job vào NATS
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
            "confidenceThreshold": 0.4
        }
    }

    print(f"[*] Publishing job {job_id} to 'jobs.ai'...")
    await js.publish("jobs.ai", json.dumps(payload).encode())

    print("[*] Waiting for worker events (press Ctrl+C to stop)...")
    while True:
        await asyncio.sleep(1)

if __name__ == "__main__":
    asyncio.run(main())
```

---

## 4. Checklist kiểm tra chất lượng Worker trước khi bàn giao

- [ ] **Khởi động:** Model AI được nạp vào bộ nhớ trước khi lắng nghe hàng đợi NATS.
- [ ] **Xử lý tuần tự/song song:** Nhận message $\rightarrow$ phát event `PROCESSING` $\rightarrow$ xử lý $\rightarrow$ upload MinIO.
- [ ] **Bảo đảm tính toàn vẹn (ACK):** Chỉ gửi tín hiệu ACK cho JetStream sau khi đã upload xong kết quả lên bucket `results`.
- [ ] **Bắt lỗi an toàn (Try-Catch):** Nếu gặp ảnh hỏng, phát event `FAILED` có mã lỗi rõ ràng và không làm crash tiến trình Python của Worker.
- [ ] **RAM ổn định:** Chạy liên tiếp 20–30 ảnh thử nghiệm, kiểm tra xem RAM của tiến trình Python có bị rò rỉ (memory leak) tăng dần đều hay không.
