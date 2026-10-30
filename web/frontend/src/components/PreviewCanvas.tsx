import { useEffect, useRef } from "react";
type Props = { style: string; strength: number; };
export function PreviewCanvas({ style, strength }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#dce8f8"); gradient.addColorStop(1, "#f5e6f4");
    context.fillStyle = gradient; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#b8c5d8"; context.beginPath(); context.arc(92, 82, 38, 0, Math.PI * 2); context.fill();
    context.fillStyle = "#9caec6"; context.fillRect(48, 122, 88, 52);
    context.fillStyle = "#1f2c49"; context.font = "600 12px system-ui"; context.fillText(`${style} preview`, 16, 22);
    context.strokeStyle = "#7566e8"; context.lineWidth = 3; context.strokeRect(48, 42, 88, 135);
    if (style === "blackout") { context.fillStyle = "#171b28"; context.fillRect(49, 85, 86, Math.max(12, strength)); }
    else { context.fillStyle = "#7566e8aa"; context.fillRect(49, 85, 86, Math.max(12, strength)); }
  }, [style, strength]);
  return <div className="preview-canvas"><canvas ref={ref} width={184} height={194} aria-label="Local redaction preview" /></div>;
}
