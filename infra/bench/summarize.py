#!/usr/bin/env python3
"""Summarizes baseline image pipeline benchmark runs and generates Markdown reports.

Python 3 stdlib only. No pip dependencies.
Usage:
    python3 summarize.py <results_dir> [<results_dir> ...]
"""

import csv
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple


def parse_iso(dt_str: str) -> datetime:
    """Parse ISO datetime string, ensuring UTC timezone."""
    dt_str = dt_str.strip()
    if dt_str.endswith("Z"):
        dt_str = dt_str[:-1] + "+00:00"
    dt = datetime.fromisoformat(dt_str)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def percentile(data: List[float], p: float) -> float:
    """Calculate percentile using linear interpolation."""
    if not data:
        return 0.0
    s = sorted(data)
    k = (len(s) - 1) * (p / 100.0)
    f = int(k)
    c = f + 1
    if c < len(s):
        return s[f] + (k - f) * (s[c] - s[f])
    return s[f]


def parse_cpu(cpu_str: str) -> float:
    """Convert Kubernetes CPU string to millicores (m)."""
    cpu_str = cpu_str.strip()
    if not cpu_str:
        return 0.0
    if cpu_str.endswith("m"):
        return float(cpu_str[:-1])
    if cpu_str.endswith("u"):
        return float(cpu_str[:-1]) / 1000.0
    if cpu_str.endswith("n"):
        return float(cpu_str[:-1]) / 1000000.0
    return float(cpu_str) * 1000.0


def parse_memory(mem_str: str) -> float:
    """Convert Kubernetes memory string to MiB."""
    mem_str = mem_str.strip()
    if not mem_str:
        return 0.0
    if mem_str.endswith("Ki"):
        return float(mem_str[:-2]) / 1024.0
    if mem_str.endswith("Mi"):
        return float(mem_str[:-2])
    if mem_str.endswith("Gi"):
        return float(mem_str[:-2]) * 1024.0
    if mem_str.endswith("Ti"):
        return float(mem_str[:-2]) * 1024.0 * 1024.0
    if mem_str.endswith("K") or mem_str.endswith("k"):
        return float(mem_str[:-1]) * 1000.0 / (1024.0 * 1024.0)
    if mem_str.endswith("M"):
        return float(mem_str[:-1]) * 1000000.0 / (1024.0 * 1024.0)
    if mem_str.endswith("G"):
        return float(mem_str[:-1]) * 1000000000.0 / (1024.0 * 1024.0)
    return float(mem_str) / (1024.0 * 1024.0)


def analyze_dir(res_dir: str) -> Dict[str, Any]:
    """Parse results directory and compute benchmark metrics."""
    res_dir = os.path.abspath(res_dir)
    dir_name = os.path.basename(res_dir)

    # 1. meta.json
    meta: Dict[str, Any] = {}
    meta_path = os.path.join(res_dir, "meta.json")
    if os.path.isfile(meta_path):
        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)

    mode = meta.get("mode", "unknown")
    worker_count = meta.get("worker_count")
    container_image = meta.get("container_image", "unknown")
    cpu_limit = meta.get("cpu_limit", "unknown")
    memory_limit = meta.get("memory_limit", "unknown")
    node_name = meta.get("node_name", "unknown")
    images_txt_hash = meta.get("images_txt_hash", "unknown")
    meta_start = meta.get("start_time", "")
    meta_end = meta.get("end_time", "")

    # 2. jobs.csv
    jobs_path = os.path.join(res_dir, "jobs.csv")
    total_images = 0
    failed_count = 0
    proc_times: List[float] = []
    e2e_latencies: List[float] = []
    created_times: List[datetime] = []
    updated_times: List[datetime] = []

    if os.path.isfile(jobs_path):
        with open(jobs_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                total_images += 1
                status = row.get("status", "").upper()
                if status != "COMPLETED":
                    failed_count += 1

                created_str = row.get("created_at")
                updated_str = row.get("updated_at")
                if created_str and updated_str:
                    c_dt = parse_iso(created_str)
                    u_dt = parse_iso(updated_str)
                    created_times.append(c_dt)
                    updated_times.append(u_dt)
                    e2e_ms = (u_dt - c_dt).total_seconds() * 1000.0
                    e2e_latencies.append(max(0.0, e2e_ms))

                proc_str = row.get("processing_time_ms")
                if proc_str and proc_str.strip():
                    try:
                        proc_times.append(float(proc_str))
                    except ValueError:
                        pass

    # Throughput (images/min from first job created to last job finished)
    if created_times and updated_times:
        t_first = min(created_times)
        t_last = max(updated_times)
        duration_sec = max(0.001, (t_last - t_first).total_seconds())
        throughput = (total_images / duration_sec) * 60.0
    else:
        t_first = None
        t_last = None
        duration_sec = 0.0
        throughput = 0.0

    # Percentiles
    proc_p50 = percentile(proc_times, 50)
    proc_p95 = percentile(proc_times, 95)
    proc_max = max(proc_times) if proc_times else 0.0

    e2e_p50 = percentile(e2e_latencies, 50)
    e2e_p95 = percentile(e2e_latencies, 95)
    e2e_max = max(e2e_latencies) if e2e_latencies else 0.0

    # 3. top.csv
    top_path = os.path.join(res_dir, "top.csv")
    cpus: List[float] = []
    mems: List[float] = []
    if os.path.isfile(top_path):
        with open(top_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                cpu_raw = row.get("cpu", "")
                mem_raw = row.get("memory", "")
                if cpu_raw:
                    cpus.append(parse_cpu(cpu_raw))
                if mem_raw:
                    mems.append(parse_memory(mem_raw))

    peak_cpu = max(cpus) if cpus else 0.0
    avg_cpu = sum(cpus) / len(cpus) if cpus else 0.0
    peak_mem = max(mems) if mems else 0.0
    avg_mem = sum(mems) / len(mems) if mems else 0.0

    # 4. replicas.csv
    replicas_path = os.path.join(res_dir, "replicas.csv")
    rep_samples: List[Tuple[datetime, int, int]] = []
    if os.path.isfile(replicas_path):
        with open(replicas_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                ts_str = row.get("timestamp")
                if not ts_str:
                    continue
                dt = parse_iso(ts_str)
                des = int(row.get("desired", 0) or 0)
                rdy = int(row.get("ready", 0) or 0)
                rep_samples.append((dt, des, rdy))

    max_replicas = max([r[2] for r in rep_samples], default=0)
    time_to_ready: Optional[float] = None
    time_back_to_zero: Optional[float] = None

    if mode == "autoscale" and t_first:
        # Time to first worker Ready
        ready_events = [r for r in rep_samples if r[2] >= 1]
        if ready_events:
            first_ready_time = min(r[0] for r in ready_events)
            time_to_ready = max(0.0, (first_ready_time - t_first).total_seconds())

        # Time back to 0 replicas after jobs completed
        if t_last:
            after_jobs = [r for r in rep_samples if r[0] >= t_last]
            zero_events = [r for r in after_jobs if r[1] == 0 and r[2] == 0]
            if not zero_events:
                peak_times = [r[0] for r in rep_samples if r[2] == max_replicas and r[2] > 0]
                if peak_times:
                    after_peak = [r for r in rep_samples if r[0] > max(peak_times)]
                    zero_events = [r for r in after_peak if r[1] == 0 and r[2] == 0]
            if zero_events:
                zero_time = min(r[0] for r in zero_events)
                time_back_to_zero = max(0.0, (zero_time - t_last).total_seconds())

    return {
        "dir_name": dir_name,
        "res_dir": res_dir,
        "mode": mode,
        "worker_count": worker_count,
        "container_image": container_image,
        "cpu_limit": cpu_limit,
        "memory_limit": memory_limit,
        "node_name": node_name,
        "images_txt_hash": images_txt_hash,
        "start_time": meta_start,
        "end_time": meta_end,
        "total_images": total_images,
        "failed_count": failed_count,
        "duration_sec": duration_sec,
        "throughput": throughput,
        "proc_p50": proc_p50,
        "proc_p95": proc_p95,
        "proc_max": proc_max,
        "e2e_p50": e2e_p50,
        "e2e_p95": e2e_p95,
        "e2e_max": e2e_max,
        "peak_cpu": peak_cpu,
        "avg_cpu": avg_cpu,
        "peak_mem": peak_mem,
        "avg_mem": avg_mem,
        "max_replicas": max_replicas,
        "time_to_ready": time_to_ready,
        "time_back_to_zero": time_back_to_zero,
    }


def write_single_summary(data: Dict[str, Any]) -> str:
    """Format single run summary Markdown and write to summary.md in results dir."""
    mode_str = f"Fixed ({data['worker_count']} worker{'s' if data['worker_count'] != 1 else ''})" if data["mode"] == "fixed" else "Autoscale (0-3 workers)"
    md = f"""# Benchmark Summary: {data['dir_name']}

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | {mode_str} |
| **Container Image** | `{data['container_image']}` |
| **CPU Limit** | {data['cpu_limit']} |
| **Memory Limit** | {data['memory_limit']} |
| **Node** | {data['node_name']} |
| **Dataset Hash** | `{data['images_txt_hash']}` |
| **Start Time** | {data['start_time']} |
| **End Time** | {data['end_time']} |

## Performance & Throughput
| Metric | Value |
| --- | --- |
| **Total Images** | {data['total_images']} |
| **Failed Jobs** | {data['failed_count']} |
| **Total Processing Duration** | {data['duration_sec']:.2f} s |
| **Throughput** | **{data['throughput']:.2f} images/min** |

## Latency
| Phase | p50 | p95 | Max |
| --- | --- | --- | --- |
| **Processing Time (`processingTimeMs`)** | {data['proc_p50']:.1f} ms | {data['proc_p95']:.1f} ms | {data['proc_max']:.1f} ms |
| **End-to-End Latency (`updated_at − created_at`)** | {data['e2e_p50'] / 1000.0:.2f} s ({data['e2e_p50']:.0f} ms) | {data['e2e_p95'] / 1000.0:.2f} s ({data['e2e_p95']:.0f} ms) | {data['e2e_max'] / 1000.0:.2f} s ({data['e2e_max']:.0f} ms) |

## Worker Resources (per worker)
| Resource | Peak | Average |
| --- | --- | --- |
| **CPU** | {data['peak_cpu']:.0f} mCPU | {data['avg_cpu']:.0f} mCPU |
| **Memory (RAM)** | {data['peak_mem']:.1f} MiB | {data['avg_mem']:.1f} MiB |
"""

    if data["mode"] == "autoscale":
        t_rdy = f"{data['time_to_ready']:.2f} s" if data['time_to_ready'] is not None else "N/A"
        t_zero = f"{data['time_back_to_zero']:.2f} s" if data['time_back_to_zero'] is not None else "N/A"
        md += f"""
## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | {t_rdy} |
| **Max Replicas Reached** | {data['max_replicas']} |
| **Time to scale back to 0 (cooldown)** | {t_zero} |
"""

    summary_file = os.path.join(data["res_dir"], "summary.md")
    with open(summary_file, "w", encoding="utf-8") as f:
        f.write(md)
    return md


def format_combined_table(all_data: List[Dict[str, Any]]) -> str:
    """Format comparison Markdown table for multiple runs."""
    lines = [
        "## Benchmark Comparison Summary",
        "",
        "| Run | Mode | Workers | Images | Failed | Throughput (img/min) | E2E Latency p50 | E2E Latency p95 | Proc Time p50 | Proc Time p95 | Peak CPU | Peak RAM | Cold Start | Scale Down 0 |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]

    for d in all_data:
        m_label = d["mode"].capitalize()
        w_label = str(d["worker_count"]) if d["mode"] == "fixed" else "0-3"
        e2e_50 = f"{d['e2e_p50'] / 1000.0:.2f}s"
        e2e_95 = f"{d['e2e_p95'] / 1000.0:.2f}s"
        proc_50 = f"{d['proc_p50']:.0f}ms"
        proc_95 = f"{d['proc_p95']:.0f}ms"
        pk_cpu = f"{d['peak_cpu']:.0f}m"
        pk_mem = f"{d['peak_mem']:.0f}MiB"
        c_start = f"{d['time_to_ready']:.1f}s" if d["time_to_ready"] is not None else "-"
        s_down = f"{d['time_back_to_zero']:.1f}s" if d["time_back_to_zero"] is not None else "-"

        lines.append(
            f"| `{d['dir_name']}` | {m_label} | {w_label} | {d['total_images']} | {d['failed_count']} | "
            f"**{d['throughput']:.2f}** | {e2e_50} | {e2e_95} | {proc_50} | {proc_95} | "
            f"{pk_cpu} | {pk_mem} | {c_start} | {s_down} |"
        )

    return "\n".join(lines)


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python3 summarize.py <results_dir> [<results_dir> ...]", file=sys.stderr)
        sys.exit(1)

    dirs = [d for d in sys.argv[1:] if os.path.isdir(d)]
    if not dirs:
        print("ERROR: No valid results directories provided.", file=sys.stderr)
        sys.exit(1)

    all_data = []
    for d in dirs:
        data = analyze_dir(d)
        write_single_summary(data)
        all_data.append(data)
        print(f"Generated summary: {os.path.join(d, 'summary.md')}")

    combined = format_combined_table(all_data)
    print("\n" + combined + "\n")


if __name__ == "__main__":
    main()
