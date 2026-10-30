#!/usr/bin/env python3
"""Summarizes baseline image pipeline benchmark runs and generates Markdown reports.

Python 3 stdlib only. No pip dependencies.
Usage:
    python3 summarize.py <results_dir> [<results_dir> ...]
"""

import csv
import json
import os
import re
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
    min_replicas = meta.get("min_replicas")
    max_replicas_meta = meta.get("max_replicas")
    original_min = meta.get("original_min")
    original_max = meta.get("original_max")
    container_image = meta.get("container_image", "unknown")
    cpu_limit = meta.get("cpu_limit", "unknown")
    memory_limit = meta.get("memory_limit", "unknown")
    node_name = meta.get("node_name", "unknown")
    node_cpu_count = meta.get("node_cpu_count") or meta.get("cpu_count")
    gpu = meta.get("gpu", "none")
    images_txt_hash = meta.get("images_txt_hash", "unknown")
    meta_start = meta.get("start_time", "")
    meta_end = meta.get("end_time", "")

    # Check for deface run (per_image.csv)
    per_image_path = os.path.join(res_dir, "per_image.csv")
    jobs_path = os.path.join(res_dir, "jobs.csv")

    if not os.path.isfile(jobs_path) and os.path.isfile(per_image_path):
        mode = meta.get("mode", "deface")
        total_images = 0
        failed_count = 0
        proc_times: List[float] = []
        with open(per_image_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                total_images += 1
                try:
                    proc_times.append(float(row.get("duration_ms", 0.0)))
                except (ValueError, TypeError):
                    pass
        model_load_time = float(meta.get("model_load_time_seconds", 0.0))
        total_duration = float(meta.get("total_duration_seconds", (sum(proc_times) / 1000.0) if proc_times else 0.0))
        proc_p50 = percentile(proc_times, 50)
        proc_p95 = percentile(proc_times, 95)
        proc_max = max(proc_times) if proc_times else 0.0
        throughput = (total_images / (total_duration / 60.0)) if total_duration > 0 else 0.0
        provider = meta.get("execution_provider", "CPU")
        target_device = meta.get("target_device", "cpu")

        return {
            "dir_name": dir_name,
            "res_dir": res_dir,
            "mode": mode,
            "provider": provider,
            "target_device": target_device,
            "model_load_time": model_load_time,
            "worker_count": 1,
            "min_replicas": None,
            "max_replicas_meta": None,
            "original_min": None,
            "original_max": None,
            "container_image": meta.get("tool", "deface"),
            "cpu_limit": "N/A",
            "memory_limit": "N/A",
            "node_name": meta.get("machine", node_name),
            "node_cpu_count": node_cpu_count if node_cpu_count is not None else "unknown",
            "gpu": gpu,
            "images_txt_hash": "N/A",
            "start_time": meta.get("start_time", ""),
            "end_time": meta.get("end_time", ""),
            "total_images": total_images,
            "failed_count": failed_count,
            "duration_sec": total_duration,
            "throughput": throughput,
            "thpt_per_worker": throughput,
            "proc_p50": proc_p50,
            "proc_p95": proc_p95,
            "proc_max": proc_max,
            "e2e_p50": 0.0,
            "e2e_p95": 0.0,
            "e2e_max": 0.0,
            "peak_cpu": 0.0,
            "avg_cpu": 0.0,
            "peak_mem": 0.0,
            "avg_mem": 0.0,
            "max_replicas": 1,
            "time_to_ready": None,
            "time_back_to_min": None,
            "time_back_to_zero": None,
        }

    if mode == "autoscale":
        if min_replicas is None or max_replicas_meta is None:
            m = re.search(r"autoscale-(\d+)-(\d+)", dir_name)
            if m:
                min_replicas = int(m.group(1))
                max_replicas_meta = int(m.group(2))
            else:
                if min_replicas is None:
                    min_replicas = 0
                if max_replicas_meta is None:
                    max_replicas_meta = 3
    elif mode == "fixed":
        if worker_count is None:
            m = re.search(r"fixed-(\d+)w?", dir_name)
            if m:
                worker_count = int(m.group(1))

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
    peak_ready = max_replicas
    if peak_ready == 0:
        if mode == "fixed" and worker_count:
            peak_ready = int(worker_count)
        elif mode == "autoscale" and max_replicas_meta:
            peak_ready = int(max_replicas_meta)
        else:
            peak_ready = 1

    thpt_per_worker = (throughput / peak_ready) if peak_ready > 0 else 0.0

    target_min = min_replicas if min_replicas is not None else 0
    time_to_ready: Optional[float] = None
    time_back_to_min: Optional[float] = None

    if mode == "autoscale" and t_first:
        # Time to first worker Ready (cold start only when min == 0)
        if target_min == 0:
            ready_events = [r for r in rep_samples if r[2] >= 1]
            if ready_events:
                first_ready_time = min(r[0] for r in ready_events)
                time_to_ready = max(0.0, (first_ready_time - t_first).total_seconds())
        else:
            time_to_ready = None

        # Time back to min replicas after jobs completed
        if t_last:
            after_jobs = [r for r in rep_samples if r[0] >= t_last]
            min_events = [r for r in after_jobs if r[1] == target_min and r[2] == target_min]
            if not min_events:
                peak_times = [r[0] for r in rep_samples if r[2] == max_replicas and r[2] > target_min]
                if peak_times:
                    after_peak = [r for r in rep_samples if r[0] > max(peak_times)]
                    min_events = [r for r in after_peak if r[1] == target_min and r[2] == target_min]
            if min_events:
                min_time = min(r[0] for r in min_events)
                time_back_to_min = max(0.0, (min_time - t_last).total_seconds())

    return {
        "dir_name": dir_name,
        "res_dir": res_dir,
        "mode": mode,
        "worker_count": worker_count,
        "min_replicas": min_replicas,
        "max_replicas_meta": max_replicas_meta,
        "original_min": original_min,
        "original_max": original_max,
        "container_image": container_image,
        "cpu_limit": cpu_limit,
        "memory_limit": memory_limit,
        "node_name": node_name,
        "node_cpu_count": node_cpu_count if node_cpu_count is not None else "unknown",
        "gpu": gpu,
        "images_txt_hash": images_txt_hash,
        "start_time": meta_start,
        "end_time": meta_end,
        "total_images": total_images,
        "failed_count": failed_count,
        "duration_sec": duration_sec,
        "throughput": throughput,
        "thpt_per_worker": thpt_per_worker,
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
        "time_back_to_min": time_back_to_min,
        "time_back_to_zero": time_back_to_min,
    }


def write_single_summary(data: Dict[str, Any]) -> str:
    """Format single run summary Markdown and write to summary.md in results dir."""
    summary_file = os.path.join(data["res_dir"], "summary.md")
    if data["mode"] == "deface" and os.path.isfile(summary_file):
        with open(summary_file, "r", encoding="utf-8") as f:
            return f.read()

    if data["mode"] == "fixed":
        mode_str = f"fixed {data['worker_count']}"
    elif data["mode"] == "autoscale":
        mode_str = f"autoscale {data['min_replicas']}→{data['max_replicas_meta']}"
    else:
        mode_str = data["mode"]

    md = f"""# Benchmark Summary: {data['dir_name']}

## Run Context
| Parameter | Value |
| --- | --- |
| **Mode** | {mode_str} |
| **Container Image** | `{data['container_image']}` |
| **CPU Limit** | {data['cpu_limit']} |
| **Memory Limit** | {data['memory_limit']} |
| **Node** | {data['node_name']} |
| **Node CPU Count** | {data['node_cpu_count']} |
| **GPU** | {data['gpu']} |
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
| **Throughput per Worker** | **{data['thpt_per_worker']:.2f} images/min/worker** |

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
        t_min = f"{data['time_back_to_min']:.2f} s" if data['time_back_to_min'] is not None else "N/A"
        md += f"""
## Autoscale Dynamics
| Metric | Value |
| --- | --- |
| **Time to first worker Ready (cold start)** | {t_rdy} |
| **Max Replicas Reached** | {data['max_replicas']} |
| **Time to scale back to min (cooldown)** | {t_min} |
"""

    with open(summary_file, "w", encoding="utf-8") as f:
        f.write(md)
    return md


def format_combined_table(all_data: List[Dict[str, Any]]) -> str:
    """Format comparison Markdown table for multiple runs."""
    lines = [
        "## Benchmark Comparison Summary",
        "",
        "| Run | Mode | Range | Images | Failed | Throughput (img/min) | Thpt/Worker (img/min) | E2E Latency p50 | E2E Latency p95 | Proc Time p50 | Proc Time p95 | Peak CPU | Avg CPU/Worker | Peak RAM | Cold Start | Time back to min |",
        "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ]

    has_deface = False
    for d in all_data:
        if d.get("mode") == "deface":
            has_deface = True
            m_label = f"Deface ({d.get('provider', d.get('target_device', 'CPU'))})"
            r_label = "-"
            e2e_50 = "-"
            e2e_95 = "-"
            proc_50 = f"{d['proc_p50']:.0f}ms"
            proc_95 = f"{d['proc_p95']:.0f}ms"
            pk_cpu = "-"
            avg_cpu = "-"
            pk_mem = "-"
            c_start = f"{d.get('model_load_time', 0.0):.2f}s"
            s_down = "-"
            thpt_w = f"{d['thpt_per_worker']:.2f}"
        else:
            m_label = d["mode"].capitalize()
            r_label = f"{d['worker_count']}" if d["mode"] == "fixed" else f"{d['min_replicas']}→{d['max_replicas_meta']}"
            e2e_50 = f"{d['e2e_p50'] / 1000.0:.2f}s"
            e2e_95 = f"{d['e2e_p95'] / 1000.0:.2f}s"
            proc_50 = f"{d['proc_p50']:.0f}ms"
            proc_95 = f"{d['proc_p95']:.0f}ms"
            pk_cpu = f"{d['peak_cpu']:.0f}m"
            avg_cpu = f"{d['avg_cpu']:.0f}m"
            pk_mem = f"{d['peak_mem']:.0f}MiB"
            c_start = f"{d['time_to_ready']:.1f}s" if d["time_to_ready"] is not None else "-"
            s_down = f"{d['time_back_to_min']:.1f}s" if d["time_back_to_min"] is not None else "-"
            thpt_w = f"{d['thpt_per_worker']:.2f}"

        lines.append(
            f"| `{d['dir_name']}` | {m_label} | {r_label} | {d['total_images']} | {d['failed_count']} | "
            f"**{d['throughput']:.2f}** | {thpt_w} | {e2e_50} | {e2e_95} | {proc_50} | {proc_95} | "
            f"{pk_cpu} | {avg_cpu} | {pk_mem} | {c_start} | {s_down} |"
        )

    if has_deface:
        lines.append("")
        lines.append(
            "> **Note**: faces only (no plates), local files, no queue/upload, "
            "so compare with our `processingTimeMs`, not our end-to-end time."
        )

    return "\n".join(lines)


def resolve_run_dirs(inputs: List[str]) -> Tuple[List[str], Optional[str]]:
    """Resolve input paths into benchmark run directories and machine folder."""
    run_dirs: List[str] = []
    target_machine_folder: Optional[str] = None

    for item in inputs:
        item = os.path.abspath(item)
        if not os.path.isdir(item):
            continue
        # Direct run dir has jobs.csv or per_image.csv
        if os.path.isfile(os.path.join(item, "jobs.csv")) or os.path.isfile(os.path.join(item, "per_image.csv")):
            run_dirs.append(item)
        else:
            # Check for run subdirectories
            subdirs = [
                os.path.join(item, c)
                for c in sorted(os.listdir(item))
                if os.path.isdir(os.path.join(item, c))
                and (
                    os.path.isfile(os.path.join(item, c, "jobs.csv"))
                    or os.path.isfile(os.path.join(item, c, "per_image.csv"))
                    or os.path.isfile(os.path.join(item, c, "meta.json"))
                )
            ]
            if subdirs:
                target_machine_folder = item
                run_dirs.extend(subdirs)
            else:
                run_dirs.append(item)

    if not target_machine_folder and run_dirs:
        parents = {os.path.dirname(d) for d in run_dirs}
        if len(parents) == 1:
            target_machine_folder = parents.pop()

    # Deduplicate while preserving order
    seen = set()
    unique_dirs = []
    for d in run_dirs:
        if d not in seen:
            seen.add(d)
            unique_dirs.append(d)

    return unique_dirs, target_machine_folder


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python3 summarize.py <results_dir_or_machine_folder> [<results_dir> ...]", file=sys.stderr)
        sys.exit(1)

    dirs, machine_folder = resolve_run_dirs(sys.argv[1:])
    dirs = [d for d in dirs if os.path.isdir(d)]
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

    if machine_folder:
        comp_file = os.path.join(machine_folder, "comparison.md")
        with open(comp_file, "w", encoding="utf-8") as f:
            f.write(combined + "\n")
        print(f"Wrote combined comparison table to {comp_file}")


if __name__ == "__main__":
    main()
