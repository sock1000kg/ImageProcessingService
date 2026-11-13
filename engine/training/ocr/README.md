# Plate OCR benchmark

Scores how well RapidOCR reads Vietnamese plate text, to decide how `engine/src/processors/plate_ocr.py` should call it.
Crops come from labelled boxes, so it measures reading only, not plate detection. **Results:** the journey from no OCR
to the picked method in [results/README.md](results/README.md), the last run's numbers in
[results/results.json](results/results.json).

## Run it

```bash
engine/training/ocr/fetch.sh                  # 132 MB into engine/training/datasets/vn-plate-ocr/ (gitignored)
infra/bench/dataset/fetch.sh --set max        # the UET plate images, if not already there
pip install rapidocr-onnxruntime opencv-python
python engine/training/ocr/eval_ocr.py        # prints a table and writes results/results.json
```

## Files

| File | What it is |
| --- | --- |
| `fetch.sh` | Downloads the trungdinh22 Character Detection Dataset (`OCR.zip`) and checks its SHA-256. Its licence isn't stated, so the images stay local |
| `eval_ocr.py` | Scores each reading method on both sets |
| `eval_whitelist.py` | Plate whitelist: owner kept vs stranger leaked, with the Engine's own OCR and matcher. Writes `results/whitelist.json` |
| `eval_whitelist_rules.py` | Same test with each fuzzy rule of the matcher switched on or off alone. Writes `results/whitelist_rules.json` |
| `uet-plates-text.json` | Text of 80 plates from the benchmark's UET set, read by eye, with their image and box |
| `char_map.json` | The real class-number-to-character mapping of the trungdinh22 labels |
| `results/` | `README.md` (the journey) and `results.json` |

## Notes

- **Class numbers:** the trungdinh22 labels don't follow the class list in that repo's `Letter_detect.yaml`.
  `char_map.json` holds the real mapping: index 0–8 is `1`–`9`, 29 is `0`, and the letters run A–Z without I, J, O, Q, R
  and W. It was learned by majority vote over 1,335 training plates, matching each label against a RapidOCR reading of
  the same length. Every class agrees at least 90% of the time except `M` (19), which OCR also reads as `W`. The mapping
  only renames the dataset's numbers, applied to every plate alike.
- **Plate choice:** the dataset also has Croatian and Czech plates, so only plates whose labelled text has Vietnamese
  format are scored. The format is never used to correct a reading.
- **Text rebuilt from character boxes:** group the boxes into lines by vertical centre (a centre more than half a
  character lower starts the second line), then read each line left to right.
