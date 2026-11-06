/**
 * Redaction configuration form for privacy targets, styles, padding, and advanced thresholds.
 */
import { Dispatch, SetStateAction } from "react";

export type FormConfig = {
  targets: string[];
  style: "blur" | "pixelate" | "blackout";
  strength: number;
  padding: number;
  quality: "standard" | "high" | "max";
  format: "original" | "jpg" | "png" | "webp";
  confidenceThreshold: number;
  reviewThreshold: number;
  similarityThreshold: number;
};

export const DEFAULT_FORM_CONFIG: FormConfig = {
  targets: ["face", "plate"],
  style: "blur",
  strength: 25,
  padding: 0.1,
  quality: "high",
  format: "original",
  confidenceThreshold: 0.35,
  reviewThreshold: 0.5,
  similarityThreshold: 0.45,
};

/**
 * Maps a stored batch config object to form configuration fields with standard fallbacks.
 *
 * Why fallback defaults: Stored batches may lack optional fields or have older schemas;
 * applying defaults ensures the re-run form remains completely interactive and valid.
 */
export function batchConfigToFormConfig(raw?: Record<string, unknown> | null): FormConfig {
  const c = raw ?? {};
  const style =
    c.style === "pixelate" || c.style === "blackout" || c.style === "blur" ? c.style : DEFAULT_FORM_CONFIG.style;
  const defaultStrength = style === "pixelate" ? 12 : 25;
  const strength = typeof c.strength === "number" && c.strength > 0 ? c.strength : defaultStrength;
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
  const confidenceThreshold =
    typeof c.confidenceThreshold === "number" ? c.confidenceThreshold : DEFAULT_FORM_CONFIG.confidenceThreshold;
  const reviewThreshold =
    typeof c.reviewThreshold === "number" ? c.reviewThreshold : DEFAULT_FORM_CONFIG.reviewThreshold;
  const similarityThreshold =
    typeof c.similarityThreshold === "number" ? c.similarityThreshold : DEFAULT_FORM_CONFIG.similarityThreshold;

  return {
    targets: targets.length > 0 ? targets : [...DEFAULT_FORM_CONFIG.targets],
    style,
    strength,
    padding,
    quality,
    format,
    confidenceThreshold,
    reviewThreshold,
    similarityThreshold,
  };
}

const THRESHOLD_FIELDS = [
  {
    key: "confidenceThreshold",
    label: "Confidence Threshold",
    hint: "which detections get redacted",
  },
  {
    key: "reviewThreshold",
    label: "Review Threshold",
    hint: "which detections get flagged for review",
  },
  {
    key: "similarityThreshold",
    label: "Similarity Threshold",
    hint: "how closely a face must match the whitelist",
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

      <label>
        Redaction style
        <select
          value={config.style}
          onChange={(event) => {
            const style = event.target.value as FormConfig["style"];
            update("style", style);
            if (style === "blur") update("strength", 25);
            if (style === "pixelate") update("strength", 12);
          }}
        >
          <option value="blur">Blur</option>
          <option value="pixelate">Pixelate</option>
          <option value="blackout">Blackout</option>
        </select>
      </label>

      {config.style !== "blackout" && (
        <label>
          Strength <output>{config.strength}</output>
          <input
            type="range"
            min="1"
            max="60"
            value={config.strength}
            onChange={(event) => update("strength", Number(event.target.value))}
          />
        </label>
      )}

      <label>
        Padding <output>{config.padding.toFixed(2)}</output>
        <input
          type="range"
          min="0"
          max="0.5"
          step="0.01"
          value={config.padding}
          onChange={(event) => update("padding", Number(event.target.value))}
        />
      </label>

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

      <details className="advanced-settings">
        <summary>Advanced thresholds</summary>
        <p className="preview-note" style={{ margin: "8px 0 2px" }}>
          Higher = stricter
        </p>
        <div className="threshold-grid">
          {THRESHOLD_FIELDS.map(({ key, label, hint }) => (
            <label key={key}>
              <span>{label}</span>
              <span className="preview-note" style={{ margin: 0, fontWeight: "normal" }}>
                {hint}
              </span>
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
