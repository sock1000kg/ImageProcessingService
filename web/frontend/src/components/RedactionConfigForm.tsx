import { Dispatch, SetStateAction } from "react";
export type FormConfig = { targets: string[]; style: "blur" | "pixelate" | "blackout"; strength: number; padding: number; quality: "standard" | "high" | "max"; format: "original" | "jpg" | "png" | "webp"; confidenceThreshold: number; reviewThreshold: number; similarityThreshold: number };
type Props = { config: FormConfig; setConfig: Dispatch<SetStateAction<FormConfig>> };
export function RedactionConfigForm({ config, setConfig }: Props) {
  const update = (key: keyof FormConfig, value: string | number | string[]) => setConfig((current) => ({ ...current, [key]: value }));
  return <div className="config-panel">
    <div className="field-group"><span className="field-label">Targets</span><div className="choice-row">{["face", "plate"].map((target) => <label className="choice" key={target}><input type="checkbox" checked={config.targets.includes(target)} onChange={(event) => update("targets", event.target.checked ? [...config.targets, target] : config.targets.filter((item) => item !== target))} />{target === "face" ? "Faces" : "License plates"}</label>)}</div></div>
    <label>Redaction style<select value={config.style} onChange={(event) => { const style = event.target.value as FormConfig["style"]; update("style", style); if (style === "blur") update("strength", 25); if (style === "pixelate") update("strength", 12); }}><option value="blur">Blur</option><option value="pixelate">Pixelate</option><option value="blackout">Blackout</option></select></label>
    {config.style !== "blackout" && <label>Strength <output>{config.strength}</output><input type="range" min="1" max="60" value={config.strength} onChange={(event) => update("strength", Number(event.target.value))} /></label>}
    <label>Padding <output>{config.padding.toFixed(2)}</output><input type="range" min="0" max="0.5" step="0.01" value={config.padding} onChange={(event) => update("padding", Number(event.target.value))} /></label>
    <label>Output quality<select value={config.quality} onChange={(event) => update("quality", event.target.value)}><option value="standard">Standard</option><option value="high">High</option><option value="max">Max</option></select></label>
    <label>Output format<select value={config.format} onChange={(event) => update("format", event.target.value)}><option value="original">Keep original</option><option value="jpg">JPEG</option><option value="png">PNG</option><option value="webp">WEBP</option></select></label>
    <details className="advanced-settings"><summary>Advanced thresholds</summary><div className="threshold-grid">{(["confidenceThreshold", "reviewThreshold", "similarityThreshold"] as const).map((key) => <label key={key}>{key.replace("Threshold", " threshold")}<input type="number" min="0" max="1" step="0.01" value={config[key]} onChange={(event) => update(key, Number(event.target.value))} /></label>)}</div></details>
  </div>;
}
