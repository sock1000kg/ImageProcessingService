/**
 * Redaction configuration form for privacy targets, styles, padding, and advanced thresholds.
 */
import { Dispatch, SetStateAction } from "react";
import {
  REDACTION_STRENGTH_RANGES,
  RedactionPaddingControl,
  RedactionPaddingSlider,
  RedactionStyleControls,
  type RedactionPaddingControlProps,
  type RedactionPaddingSliderProps,
  type RedactionStyle,
  type RedactionStyleControlsProps,
} from "./RedactionStyleControls";

export {
  REDACTION_STRENGTH_RANGES,
  RedactionPaddingControl,
  RedactionPaddingSlider,
  RedactionStyleControls,
  type RedactionPaddingControlProps,
  type RedactionPaddingSliderProps,
  type RedactionStyle,
  type RedactionStyleControlsProps,
};

export type FormConfig = {
  targets: string[];
  style: "blur" | "pixelate" | "blackout";
  strength: number;
  padding: number;
  quality: "standard" | "high" | "max";
  format: "original" | "jpg" | "png" | "webp";
  faceConfidenceThreshold: number;
  plateConfidenceThreshold: number;
  reviewThreshold: number;
  similarityThreshold: number;
  whitelistPlates: string[];
  detectionMode: "fast" | "max_privacy";
};

/**
 * Confidence thresholds each detection mode starts from (same table as the backend's `DETECTION_MODE_THRESHOLDS`).
 * Picking a mode fills these into the form, where Advanced thresholds can still change them; the form always sends
 * both thresholds, so without this the mode would not change what is sent.
 */
export const MODE_THRESHOLDS: Record<FormConfig["detectionMode"], { face: number; plate: number }> = {
  fast: { face: 0.17, plate: 0.11 },
  max_privacy: { face: 0.06, plate: 0.05 },
};

export const DEFAULT_FORM_CONFIG: FormConfig = {
  targets: ["face", "plate"],
  style: "blur",
  strength: REDACTION_STRENGTH_RANGES.blur.default,
  padding: 0.1,
  quality: "high",
  format: "original",
  faceConfidenceThreshold: 0.17,
  plateConfidenceThreshold: 0.11,
  reviewThreshold: 0.25,
  similarityThreshold: 0.45,
  whitelistPlates: [],
  detectionMode: "fast",
};

/**
 * Maps a stored batch config object to form configuration fields with standard fallbacks.
 *
 * Why fallback defaults: Stored batches may lack optional fields or have older schemas;
 * applying defaults and clamping strengths to style ranges ensures the re-run form remains
 * completely interactive and valid within Engine Contract §2 bounds.
 */
export function batchConfigToFormConfig(raw?: Record<string, unknown> | null): FormConfig {
  const c = raw ?? {};
  const style =
    c.style === "pixelate" || c.style === "blackout" || c.style === "blur" ? c.style : DEFAULT_FORM_CONFIG.style;
  const range = style === "pixelate" ? REDACTION_STRENGTH_RANGES.pixelate : REDACTION_STRENGTH_RANGES.blur;
  // Why: Stored strengths from older batches (e.g. blur 60) or invalid values are clamped to style range
  const strength =
    typeof c.strength === "number" && !Number.isNaN(c.strength)
      ? Math.min(range.max, Math.max(range.min, Math.round(c.strength)))
      : range.default;
  const targets =
    Array.isArray(c.targets) && c.targets.length > 0
      ? (c.targets as string[]).filter((t) => t === "face" || t === "plate")
      : DEFAULT_FORM_CONFIG.targets;
  const padding =
    typeof c.padding === "number" && c.padding >= 0 && c.padding <= 0.5 ? c.padding : DEFAULT_FORM_CONFIG.padding;
  const quality =
    c.quality === "standard" || c.quality === "high" || c.quality === "max" ? c.quality : DEFAULT_FORM_CONFIG.quality;
  const format =
    c.format === "jpg" || c.format === "jpeg"
      ? "jpg"
      : c.format === "png" || c.format === "webp" || c.format === "original"
        ? c.format
        : DEFAULT_FORM_CONFIG.format;

  const faceConfidenceThreshold =
    typeof c.faceConfidenceThreshold === "number"
      ? c.faceConfidenceThreshold
      : DEFAULT_FORM_CONFIG.faceConfidenceThreshold;
  const plateConfidenceThreshold =
    typeof c.plateConfidenceThreshold === "number"
      ? c.plateConfidenceThreshold
      : DEFAULT_FORM_CONFIG.plateConfidenceThreshold;

  const reviewThreshold =
    typeof c.reviewThreshold === "number" ? c.reviewThreshold : DEFAULT_FORM_CONFIG.reviewThreshold;
  const similarityThreshold =
    typeof c.similarityThreshold === "number" ? c.similarityThreshold : DEFAULT_FORM_CONFIG.similarityThreshold;
  const whitelistPlates = Array.isArray(c.whitelistPlates)
    ? c.whitelistPlates.filter((value): value is string => typeof value === "string")
    : DEFAULT_FORM_CONFIG.whitelistPlates;
  const detectionMode = c.detectionMode === "max_privacy" ? "max_privacy" : "fast";

  return {
    targets: targets.length > 0 ? targets : [...DEFAULT_FORM_CONFIG.targets],
    style,
    strength,
    padding,
    quality,
    format,
    faceConfidenceThreshold,
    plateConfidenceThreshold,
    reviewThreshold,
    similarityThreshold,
    whitelistPlates,
    detectionMode,
  };
}

const THRESHOLD_FIELDS = [
  {
    key: "faceConfidenceThreshold",
    label: "Face confidence",
    hint: "which detections get redacted",
  },
  {
    key: "plateConfidenceThreshold",
    label: "Plate confidence",
    hint: "which detections get redacted",
  },
  {
    key: "reviewThreshold",
    label: "Review Threshold",
    hint: "which detections get flagged for review",
  },
  {
    key: "similarityThreshold",
    label: "Face similarity threshold",
    hint: "how closely a face must match the face allow list (plates are matched by their text)",
  },
] as const;

export interface RedactionConfigFormProps {
  config: FormConfig;
  setConfig: Dispatch<SetStateAction<FormConfig>>;
}

/**
 * Renders redaction parameters including style, blur strength, format, and sensitivity thresholds.
 */
export function RedactionConfigForm({ config, setConfig }: RedactionConfigFormProps) {
  const update = (key: keyof FormConfig, value: string | number | string[]) =>
    setConfig((current) => ({ ...current, [key]: value }));
  const selectMode = (detectionMode: FormConfig["detectionMode"]) =>
    setConfig((current) => ({
      ...current,
      detectionMode,
      faceConfidenceThreshold: MODE_THRESHOLDS[detectionMode].face,
      plateConfidenceThreshold: MODE_THRESHOLDS[detectionMode].plate,
    }));

  return (
    <div className="config-panel">
      <div className="field-group">
        <span className="field-label">Targets</span>
        <div className="choice-row">
          {["face", "plate"].map((target) => (
            <label className="choice" key={target}>
              <input
                type="checkbox"
                checked={config.targets.includes(target)}
                onChange={(event) =>
                  update(
                    "targets",
                    event.target.checked
                      ? [...config.targets, target]
                      : config.targets.filter((item) => item !== target),
                  )
                }
              />
              {target === "face" ? "Faces" : "License plates"}
            </label>
          ))}
        </div>
      </div>

      <RedactionStyleControls
        style={config.style}
        strength={config.strength}
        onChange={(style, strength) => {
          setConfig((current) => ({ ...current, style, strength }));
        }}
      />

      <RedactionPaddingSlider padding={config.padding} onChange={(padding) => update("padding", padding)} />

      <label>
        Output quality
        <select
          value={config.quality}
          onChange={(event) => update("quality", event.target.value as FormConfig["quality"])}
        >
          <option value="standard">Standard</option>
          <option value="high">High</option>
          <option value="max">Max</option>
        </select>
      </label>

      <label>
        Output format
        <select
          value={config.format}
          onChange={(event) => update("format", event.target.value as FormConfig["format"])}
        >
          <option value="original">Keep original</option>
          <option value="jpg">JPEG</option>
          <option value="png">PNG</option>
          <option value="webp">WEBP</option>
        </select>
      </label>

      <label>
        Detection mode
        <select
          value={config.detectionMode}
          onChange={(event) => selectMode(event.target.value as FormConfig["detectionMode"])}
        >
          <option value="fast">Fast</option>
          <option value="max_privacy">Maximum privacy</option>
        </select>
        <small className="preview-note">
          {config.detectionMode === "max_privacy"
            ? "Redacts anything that might be a face or plate, so some extra boxes. For when you want to be sure."
            : "Quick and good for everyday photos and videos."}
        </small>
      </label>

      <details className="advanced-settings">
        <summary>Advanced thresholds</summary>
        <p className="preview-note">Higher = stricter</p>
        <div className="threshold-grid">
          {THRESHOLD_FIELDS.map(({ key, label, hint }) => (
            <label key={key}>
              <span>{label}</span>
              <span className="preview-note">{hint}</span>
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={config[key]}
                onChange={(event) => update(key, Number(event.target.value))}
              />
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}
