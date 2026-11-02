/**
 * Local-only preview using a bundled sample image. It is never uploaded or sent to the Engine.
 */
import { useEffect, useRef } from "react";

export interface PreviewCanvasProps {
  style: string;
  strength: number;
  targets?: string[];
  padding?: number;
}

/**
 * Draws a representative graphic with the selected redaction filter on an HTML5 canvas.
 */
const SAMPLE_IMAGE = "/preview-sample.svg";
const SAMPLE_BOXES = {
  face: { x: 69, y: 63, width: 84, height: 190 },
  plate: { x: 463, y: 268, width: 42, height: 18 },
};

function drawRedaction(
  context: CanvasRenderingContext2D,
  box: { x: number; y: number; width: number; height: number },
  style: string,
  strength: number,
  padding: number,
) {
  const horizontal = box.width * padding;
  const vertical = box.height * padding;
  const x = Math.max(0, box.x - horizontal);
  const y = Math.max(0, box.y - vertical);
  const width = Math.min(640 - x, box.width + horizontal * 2);
  const height = Math.min(400 - y, box.height + vertical * 2);
  if (style === "blackout") {
    context.fillStyle = "#111827";
    context.fillRect(x, y, width, height);
    return;
  }
  if (style === "blur") {
    context.save();
    context.filter = `blur(${Math.max(1, strength / 3)}px)`;
    context.drawImage(context.canvas, x, y, width, height, x, y, width, height);
    context.restore();
    return;
  }
  const pixelSize = Math.max(2, Math.round(strength / 2));
  const temporary = document.createElement("canvas");
  temporary.width = Math.max(1, Math.ceil(width / pixelSize));
  temporary.height = Math.max(1, Math.ceil(height / pixelSize));
  const temporaryContext = temporary.getContext("2d");
  if (!temporaryContext) return;
  temporaryContext.imageSmoothingEnabled = true;
  temporaryContext.drawImage(context.canvas, x, y, width, height, 0, 0, temporary.width, temporary.height);
  context.save();
  context.imageSmoothingEnabled = false;
  context.drawImage(temporary, 0, 0, temporary.width, temporary.height, x, y, width, height);
  context.restore();
}

export function PreviewCanvas({ style, strength, targets = ["face", "plate"], padding = 0.1 }: PreviewCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const image = new Image();
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const target of targets) {
        const box = SAMPLE_BOXES[target as keyof typeof SAMPLE_BOXES];
        if (box) drawRedaction(context, box, style, strength, padding);
      }
    };
    image.src = SAMPLE_IMAGE;
  }, [style, strength, targets, padding]);

  return (
    <div className="preview-canvas">
      <canvas ref={ref} width={640} height={400} aria-label="Local redaction preview using a sample image" />
    </div>
  );
}
