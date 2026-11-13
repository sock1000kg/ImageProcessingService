"""Plate whitelist accuracy: does the Engine keep the owner's plate and redact everyone else's?

Uses the Engine's own ``PlateOCRRecognizer`` (read + confidence) and ``PlateWhitelistManager.is_plate_match`` (the
matcher), on the Vietnamese plates of ``eval_ocr.py`` (trungdinh-val + uet-handread, one-line and two-line mixed).

Every plate is its own owner: its labelled text is the whitelist entry, and its crop is the "photo of the owner's car".
No repeated captures are needed, because the matcher only sees one OCR text and one whitelist entry.

- **True accept**: whitelist = [the plate's own text]. Counted as kept when OCR confidence >= 0.50 and the matcher says yes
  (the same gate as ``PlateWhitelistManager.evaluate_plate``). The cost of a miss is an owner's plate being blurred.
- **False whitelist**: whitelist = [another plate's text]. Counted when that stranger's plate would be left unblurred.
  This is the privacy leak. Reported per single-entry whitelist and for whitelists of k random other plates.
- **Matcher only**: the same false-whitelist test with the labelled text in place of OCR, so matcher leniency
  (``is_plate_match`` fuzzy rules) is separated from OCR mistakes.

Usage, from the repo root, after ``engine/training/ocr/fetch.sh`` and ``infra/bench/dataset/fetch.sh --set max``:
    engine/.venv/bin/python engine/training/ocr/eval_whitelist.py
Writes ``results/whitelist.json``.
"""

import argparse
import json
import sys
from collections import Counter
from math import comb
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from eval_ocr import load_sets  # noqa: E402  (also puts engine/ on sys.path)
from src.processors.plate_ocr import DEFAULT_MIN_CONFIDENCE, PlateOCRRecognizer, PlateWhitelistManager  # noqa: E402

KS = (1, 5, 20)


def read_all(items, limit):
    """OCR every crop once with the Engine's recogniser. Returns [(gt text, ocr text, confidence, line count)]."""
    recognizer = PlateOCRRecognizer()
    rows = []
    for crop, gt, n_lines in items[:limit] if limit else items:
        text, conf = recognizer.recognize(crop)
        rows.append((gt, text, conf, n_lines))
    return rows


def p_matched_by_random_whitelist(n_others, n_matching, k):
    """Chance that k whitelist entries drawn from n_others distinct other plates include at least one that matches."""
    if n_others < k:
        return None
    return 1 - comb(n_others - n_matching, k) / comb(n_others, k)


def score(rows, min_conf, match=PlateWhitelistManager.is_plate_match):
    """``match(read text, {whitelist text}) -> (bool, text)``; the Engine's matcher unless an ablation passes its own."""
    texts = sorted({gt for gt, *_ in rows})
    n = len(rows)

    # True accept, with the exact-string baseline for comparison.
    accept = exact = 0
    by_lines = {1: [0, 0], 2: [0, 0]}
    for gt, ocr, conf, n_lines in rows:
        ok = conf >= min_conf and match(ocr, {gt})[0]
        accept += ok
        exact += conf >= min_conf and ocr == gt
        by_lines[n_lines][0] += ok
        by_lines[n_lines][1] += 1

    # False whitelist: every plate against every other distinct text.
    leak_ocr = leak_gt = pairs = 0
    exposed_ocr = exposed_gt = 0  # plates matched by at least one other plate
    prob = {"ocr": {k: [] for k in KS}, "gt": {k: [] for k in KS}}
    examples = []
    for gt, ocr, conf, _ in rows:
        others = [t for t in texts if t != gt]
        m_ocr = m_gt = 0
        for other in others:
            if conf >= min_conf and match(ocr, {other})[0]:
                m_ocr += 1
                if len(examples) < 12:
                    examples.append({"plate": gt, "read_as": ocr, "whitelist_entry": other})
            if match(gt, {other})[0]:
                m_gt += 1
        pairs += len(others)
        leak_ocr += m_ocr
        leak_gt += m_gt
        exposed_ocr += m_ocr > 0
        exposed_gt += m_gt > 0
        for k in KS:
            for key, m in (("ocr", m_ocr), ("gt", m_gt)):
                p = p_matched_by_random_whitelist(len(others), m, k)
                if p is not None:
                    prob[key][k].append(p)

    mean = lambda xs: sum(xs) / len(xs) if xs else None  # noqa: E731
    return {
        "plates": n,
        "distinct_texts": len(texts),
        "two_line": by_lines[2][1],
        "true_accept": round(accept / n, 4),
        "true_accept_exact_only": round(exact / n, 4),
        "true_accept_one_line": round(by_lines[1][0] / max(1, by_lines[1][1]), 4),
        "true_accept_two_line": round(by_lines[2][0] / max(1, by_lines[2][1]), 4),
        "stranger_pairs": pairs,
        "false_whitelist_pair_rate_ocr": leak_ocr / pairs,
        "false_whitelist_pair_rate_matcher_only": leak_gt / pairs,
        "plates_matched_by_some_other_ocr": round(exposed_ocr / n, 4),
        "plates_matched_by_some_other_matcher_only": round(exposed_gt / n, 4),
        "stranger_leak_by_whitelist_size_ocr": {k: round(mean(v), 5) for k, v in prob["ocr"].items()},
        "stranger_leak_by_whitelist_size_matcher_only": {k: round(mean(v), 5) for k, v in prob["gt"].items()},
        "examples": examples,
    }


def main():
    parser = argparse.ArgumentParser(description="Plate whitelist true-accept and false-whitelist rates.")
    parser.add_argument("--limit", type=int, default=0, help="Use only the first N plates of each set.")
    parser.add_argument("--min-confidence", type=float, default=DEFAULT_MIN_CONFIDENCE)
    args = parser.parse_args()

    sets = load_sets()
    all_rows, results = [], {}
    for name, items in sets.items():
        rows = read_all(items, args.limit)
        all_rows += rows
        results[name] = score(rows, args.min_confidence)
    # Strangers can come from either set, so the combined line is the one to quote.
    results["combined"] = score(all_rows, args.min_confidence)
    results["combined"]["line_mix"] = dict(Counter(n for *_, n in all_rows))

    out = HERE / "results/whitelist.json"
    out.write_text(json.dumps(results, indent=1, ensure_ascii=False) + "\n")
    for name, r in results.items():
        print(f"\n== {name}: {r['plates']} plates, {r['distinct_texts']} distinct texts, {r['two_line']} two-line")
        print(
            f"  owner kept: {r['true_accept']:.1%} (exact-string only {r['true_accept_exact_only']:.1%}; "
            f"one-line {r['true_accept_one_line']:.1%}, two-line {r['true_accept_two_line']:.1%})"
        )
        print(
            f"  stranger leaked, 1-plate whitelist: OCR {r['false_whitelist_pair_rate_ocr']:.4%} "
            f"| matcher alone {r['false_whitelist_pair_rate_matcher_only']:.4%}  ({r['stranger_pairs']} pairs)"
        )
        print(
            f"  plates matched by at least one other plate: OCR {r['plates_matched_by_some_other_ocr']:.1%} "
            f"| matcher alone {r['plates_matched_by_some_other_matcher_only']:.1%}"
        )
        print(f"  stranger leaked, k random plates (OCR): {r['stranger_leak_by_whitelist_size_ocr']}")
        for ex in r["examples"][:5]:
            print(f"    e.g. {ex}")


if __name__ == "__main__":
    main()
