/**
 * Allow list of license plates left unredacted, edited one plate at a time.
 *
 * Why separate from the face allow list: plates are matched by OCR text (not by photo), live only in this batch's
 * config, and have no saved-list equivalent. The Engine compares them after removing spaces, dots and dashes and
 * uppercasing, so entries are stored in that form and shown the same way.
 */
import { FormEvent, useState } from "react";
import { XIcon } from "@phosphor-icons/react";

export const MAX_ALLOWED_PLATES = 20;

export interface PlateAllowListProps {
  plates: string[];
  onChange: (plates: string[]) => void;
}

/** Same normalisation the backend and Engine apply, so what is listed here is what gets matched. */
export function normalizePlate(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\s.-]/g, "");
}

export function PlateAllowList({ plates, onChange }: PlateAllowListProps) {
  const [draft, setDraft] = useState("");
  const normalized = normalizePlate(draft);
  const isFull = plates.length >= MAX_ALLOWED_PLATES;
  const isDuplicate = plates.includes(normalized);

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (!normalized || isFull || isDuplicate) return;
    onChange([...plates, normalized]);
    setDraft("");
  };

  return (
    <div className="whitelist-box">
      <div className="whitelist-header">
        <div>
          <h3>License plate allow list</h3>
          <p>
            Plates listed here will not be redacted when the Engine reads exactly the same text. Spaces, dots and dashes
            are ignored. Up to {MAX_ALLOWED_PLATES} plates.
          </p>
        </div>
      </div>
      <div className="plate-allow-form" role="group" aria-label="Add license plate">
        <input
          type="text"
          className="text-input"
          placeholder="e.g. 30A-123.45"
          aria-label="License plate"
          value={draft}
          disabled={isFull}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") add(event);
          }}
        />
        <button
          type="button"
          className="secondary-button"
          disabled={!normalized || isFull || isDuplicate}
          onClick={add}
        >
          Add plate
        </button>
      </div>
      {plates.length > 0 && (
        <ul className="plate-chips" aria-label="Allowed license plates">
          {plates.map((plate) => (
            <li key={plate} className="plate-chip">
              <span>{plate}</span>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove ${plate}`}
                onClick={() => onChange(plates.filter((item) => item !== plate))}
              >
                <XIcon aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
