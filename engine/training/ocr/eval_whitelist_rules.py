"""Which fuzzy rule of ``PlateWhitelistManager.is_plate_match`` buys owners, and which one leaks strangers?

``is_plate_match`` (engine/src/processors/plate_ocr.py) accepts a read plate when ANY of these holds. Here each is a
separate switch so it can be tested alone. Exact match is always on.

  canon          read text equals the whitelist text after mapping look-alike characters (O D->0, G->6, B->8, I->1,
                 S->5, Z->2) on both sides
  contain        whitelist text (>= 7 chars) appears inside the read text, as is or after the mapping: screw, bolt or
                 frame characters read next to the plate
  province_tail  both >= 8 chars, the last 5 (or 4) characters are identical and the first two (province) match after
                 the mapping: tolerates a wrong series letter
  fuzzy          province code (2 digits) matches and the edit distance is <= 3 (<= 2 when shorter than 8 chars)
  fuzzy_screw    same, after dropping one extra leading character (a read like ``J67...``)

The rules are re-implemented here so the Engine is untouched. ``main`` first checks that, with the rules the Engine has
(``ENGINE_RULES``), this matcher gives the same answer as the Engine's on every pair; if the Engine's matcher changes,
that check fails. ``province_tail`` was removed from the Engine on 2026-11-12 (it accepted 29D163516 for 29Y23516) and
stays here so the before/after numbers can be reproduced.

Usage, from the repo root: engine/.venv/bin/python engine/training/ocr/eval_whitelist_rules.py
Writes ``results/whitelist_rules.json``.
"""

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from eval_ocr import load_sets  # noqa: E402
from eval_whitelist import read_all, score  # noqa: E402
from src.processors.plate_ocr import DEFAULT_MIN_CONFIDENCE, MAX_FUZZY_EDITS, PlateWhitelistManager, _levenshtein_distance  # noqa: E402

RULES = ("canon", "contain", "province_tail", "fuzzy", "fuzzy_screw")
ENGINE_RULES = set(RULES) - {"province_tail"}
ENGINE_MAX_DIST = MAX_FUZZY_EDITS
CANON = str.maketrans("ODGBISZ", "0068152")


def make_matcher(rules, max_dist=None):
    """A copy of ``PlateWhitelistManager.is_plate_match`` that only applies the rules in ``rules``.

    ``max_dist`` lowers the edit-distance allowance of ``fuzzy`` and ``fuzzy_screw`` (Engine: 3, or 2 under 8 chars)."""
    cap = (lambda n: n) if max_dist is None else (lambda n: min(n, max_dist))

    def match(rec, whitelist):
        if not rec or not whitelist:
            return False, None
        if rec in whitelist:
            return True, rec
        rec_c = rec.translate(CANON)
        for target in whitelist:
            if not target:
                continue
            tgt_c = target.translate(CANON)
            if "canon" in rules and rec_c == tgt_c:
                return True, target
            if "contain" in rules and len(target) >= 7 and (target in rec or tgt_c in rec_c):
                return True, target
            if "province_tail" in rules and len(target) >= 8 and len(rec) >= 8:
                tail = 5 if len(target) >= 9 else 4
                if tgt_c[:2] == rec_c[:2] and (target[-tail:] == rec[-tail:] or target[-5:] == rec[-5:]):
                    return True, target
            if len(rec_c) >= 6 and len(tgt_c) >= 6:
                if rec_c[:2] == tgt_c[:2] and rec_c[:2].isdigit():
                    if "fuzzy" in rules:
                        allowed = cap(3 if max(len(rec_c), len(tgt_c)) >= 8 else 2)
                        if _levenshtein_distance(rec_c, tgt_c) <= allowed:
                            return True, target
                elif "fuzzy_screw" in rules and len(rec_c) >= 7 and rec_c[1:3] == tgt_c[:2] and rec_c[1:3].isdigit():
                    allowed = cap(3 if max(len(rec_c[1:]), len(tgt_c)) >= 8 else 2)
                    if _levenshtein_distance(rec_c[1:], tgt_c) <= allowed:
                        return True, target
        return False, None

    return match


def main():
    rows = []
    for items in load_sets().values():
        rows += read_all(items, 0)

    full, engine = make_matcher(ENGINE_RULES, ENGINE_MAX_DIST), PlateWhitelistManager.is_plate_match
    texts = sorted({gt for gt, *_ in rows})
    for gt, ocr, *_ in rows:
        for other in texts:
            for rec in (ocr, gt):
                assert full(rec, {other})[0] == engine(rec, {other})[0], f"matcher drifted: {rec!r} vs {other!r}"
    print(f"Re-implementation agrees with the Engine's matcher on {2 * len(rows) * len(texts)} pairs.")

    configs = {"exact only": set(), "all five rules (Engine before 2026-11-12)": set(RULES)}
    configs.update({f"exact + {r}": {r} for r in RULES})
    configs.update({f"all except {r}": set(RULES) - {r} for r in RULES})

    caps = {f"all, fuzzy distance <= {d}": d for d in (2, 1)}
    caps["Engine now (no province_tail, fuzzy distance <= 1)"] = ENGINE_MAX_DIST
    results = {}
    print(f"\n{'config':32s} {'owner kept':>10s} {'leak 1':>8s} {'leak 5':>8s} {'leak 20':>8s} {'exposed':>8s}")
    cap_rules = {n: set(RULES) - ({"province_tail"} if "Engine now" in n else set()) for n in caps}
    for name, rules in {**configs, **cap_rules}.items():
        r = score(rows, DEFAULT_MIN_CONFIDENCE, make_matcher(rules, caps.get(name)))
        leak = r["stranger_leak_by_whitelist_size_ocr"]
        results[name] = {
            "rules": sorted(rules),
            "owner_kept": r["true_accept"],
            "leak_by_whitelist_size": leak,
            "plates_matched_by_some_other": r["plates_matched_by_some_other_ocr"],
            "examples": r["examples"][:4],
        }
        print(
            f"{name:32s} {r['true_accept']:>10.1%} {leak[1]:>8.3%} {leak[5]:>8.3%} {leak[20]:>8.3%} "
            f"{r['plates_matched_by_some_other_ocr']:>8.1%}"
        )
    (HERE / "results/whitelist_rules.json").write_text(json.dumps(results, indent=1, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    main()
