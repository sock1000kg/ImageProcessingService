# Backend throughput: notes for future optimisation

Scratch notes (2026-11-05), not a plan. Found while benchmarking the picked models on the laptop cluster
(`infra/bench/run.sh`, max set, 3 workers, preload).

## Observation

- Drain throughput at 1280 px fell from 1,893 img/min (base model, 31 Oct) to 1,528 img/min (YOLO26n, 5 Nov), although
  the engine's own processing time per image got faster (p50 71 → 62 ms). Workers were busy less of the time
  (average CPU 837 m → 669 m): they wait on something outside processing.
- During the runs `web` sits at its CPU limit (~495 m of 500 m, `infra/app/web/deployment.yaml`); Postgres, NATS and
  MinIO stay well under theirs.
- Confirmed (5 Nov, laptop cluster, 1280 px, 3 workers, preload):

  | Run                                        | Drain         | End-to-end    | Worker CPU (avg) |
  | ------------------------------------------ | ------------- | ------------- | ---------------- |
  | Base model, 31 Oct (old `web` image)       | 1,893 img/min | 1,287 img/min | 837 m            |
  | Base model, today (control, `web` 0.5 CPU) | 1,635         | 917           | 794 m            |
  | YOLO26n, today, `web` 0.5 CPU              | 1,528         | 869           | 669 m            |
  | **YOLO26n, today, `web` 2 CPU**            | **1,982**     | **1,382**     | 828 m            |

  Same engine image throughout; the engine's processing time per image is unchanged (62–71 ms). Giving `web` 2 CPU
  alone makes the pipeline faster than it was on 31 Oct: `web` (CPU-bound at its 0.5 limit) is the bottleneck.

## Why (job-event path, `web/backend/src/messaging.ts`)

Events are handled strictly one at a time (`for await … await handleEventMessage(message)`), and the workers send several
events per image. Per event:

1. `getJob` in `handleEventMessage`, then `getJob` again in `applyJobEvent` (`services/batch.service.ts`).
2. On COMPLETED: `storage.statObject` on the result (size tracking for the media library, new since 31 Oct).
3. `updateJobState` in Postgres.
4. On COMPLETED / FAILED: `checkAndCleanBatchWhitelist` = `getBatch` + `getJobsByBatchId` (all jobs of the batch), for
   every finished image, even when the batch has no whitelist.

That is 4–6 sequential DB / MinIO round trips per image in a single Node process capped at 0.5 CPU.

## Options (cheapest first)

| Change                                                                                                                                  | Effect                                                 | Owner        |
| --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------ |
| Raise `web`'s CPU limit (0.5 → 1–2 cores), or run 2 replicas (the NATS durable consumer shares events between them)                     | removes the throttling; no code change                 | Infra        |
| Pass the already-loaded job into `applyJobEvent` (one `getJob` less)                                                                    | 1 round trip less per event                            | Web          |
| Skip the whitelist check when the batch has no whitelist; otherwise count non-terminal jobs with one query instead of loading every job | 1–2 round trips less per finished image                | Web          |
| Engine sends the result size in the COMPLETED event, so `web` needs no `statObject`                                                     | 1 MinIO call less per image; contract change (`docs/`) | Engine + Web |
| Handle events concurrently (bounded, e.g. 16 in flight), keeping each job's events in order (partition by job id)                       | throughput no longer bound by round-trip latency       | Web          |
| Upload path: `multer` memory storage and one request per file; batched or streamed uploads                                              | faster batch upload (end-to-end throughput)            | Web          |

Also seen: the hard-coded per-account rate limits (20 batches / 300 uploads per minute) blocked the benchmark; they are now
`RATE_LIMIT_BATCHES_PER_MINUTE` / `RATE_LIMIT_UPLOADS_PER_MINUTE` (defaults unchanged), raised in the laptop overlay only.
