/**
 * Shared redaction style selection and strength slider controls.
 *
 * Why: Both the batch creation form and the single-image redaction editor allow
 * adjusting redaction style (blur, pixelate, blackout) and its relative strength bounds.
 */
export const REDACTION_STRENGTH_RANGES = {
  blur: { min: 1, max: 50, default: 15 },
  pixelate: { min: 3, max: 32, default: 8 },
} as const;

export type RedactionStyle = "blur" | "pixelate" | "blackout";

export interface RedactionStyleControlsProps {
  style: RedactionStyle;
  strength: number;
  disabled?: boolean;
  onChange: (style: RedactionStyle, strength: number) => void;
}

/**
 * Properties for RedactionPaddingSlider.
 */
export interface RedactionPaddingSliderProps {
  padding: number;
  disabled?: boolean;
  onChange: (padding: number) => void;
}

export type RedactionPaddingControlProps = RedactionPaddingSliderProps;

/**
 * Shared bounding box expansion padding slider control (0–0.5).
 *
 * Why: Both the batch creation form and the single-image redaction editor allow
 * adjusting bounding box expansion padding (0–0.5) before redacting.
 */
export function RedactionPaddingSlider({ padding, disabled = false, onChange }: RedactionPaddingSliderProps) {
  return (
    <label>
      Padding <output>{padding.toFixed(2)}</output>
      <input
        type="range"
        disabled={disabled}
        min="0"
        max="0.5"
        step="0.01"
        value={padding}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export const RedactionPaddingControl = RedactionPaddingSlider;

/**
 * Renders style select and context-aware strength slider with reset-on-style-change behavior.
 *
 * Why: Encapsulates style range limits and auto-reset behavior so forms and inline editors
 * stay synchronized with Engine Contract §2 requirements.
 */
export function RedactionStyleControls({ style, strength, disabled = false, onChange }: RedactionStyleControlsProps) {
  return (
    <>
      <label>
        Redaction style
        <select
          value={style}
          disabled={disabled}
          onChange={(event) => {
            const nextStyle = event.target.value as RedactionStyle;
            let nextStrength = strength;
            // Why: Reset strength to style-relative default when switching between blur and pixelate
            if (nextStyle === "blur") {
              nextStrength = REDACTION_STRENGTH_RANGES.blur.default;
            } else if (nextStyle === "pixelate") {
              nextStrength = REDACTION_STRENGTH_RANGES.pixelate.default;
            }
            onChange(nextStyle, nextStrength);
          }}
        >
          <option value="blur">Blur</option>
          <option value="pixelate">Pixelate</option>
          <option value="blackout">Blackout</option>
        </select>
      </label>

      {style !== "blackout" && (
        <label>
          Strength <output>{style === "blur" ? `${strength}% of face/plate width` : `${strength} cells across`}</output>
          <input
            type="range"
            disabled={disabled}
            min={style === "pixelate" ? REDACTION_STRENGTH_RANGES.pixelate.min : REDACTION_STRENGTH_RANGES.blur.min}
            max={style === "pixelate" ? REDACTION_STRENGTH_RANGES.pixelate.max : REDACTION_STRENGTH_RANGES.blur.max}
            value={strength}
            onChange={(event) => onChange(style, Number(event.target.value))}
          />
        </label>
      )}
    </>
  );
}
