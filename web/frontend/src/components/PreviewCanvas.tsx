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
 * Street photo from Ho Chi Minh City (Jorge Láscar, CC BY 2.0, cropped to 16:10 and resized to 1280x800).
 * Source: https://commons.wikimedia.org/wiki/File:Lascar_Ho_Chi_Minh_City_-_The_capital_of_motorbikes_(4607953274).jpg
 */
const SAMPLE_IMAGE = "/preview-sample.jpg";
const SAMPLE_CREDIT_URL =
  "https://commons.wikimedia.org/wiki/File:Lascar_Ho_Chi_Minh_City_-_The_capital_of_motorbikes_(4607953274).jpg";

/**
 * Face and plate boxes in the sample's own pixels, [x1, y1, x2, y2] like the engine's detections. They come from the
 * fine-tuned YOLO11n (engine/training run yolo11-1280/e20, best.pt) at 1280 px, keeping detections with confidence
 * >= 0.2, and are fixed in code so the preview never depends on running a model in the browser.
 */
const SAMPLE_BOXES: Record<string, [number, number, number, number][]> = {
  face: [
    [510, 156, 539, 190], // rider in the middle (0.77)
    [703, 129, 724, 153], // rider in the green helmet (0.77)
    [134, 205, 172, 250], // street vendor under the conical hat (0.72)
    [663, 156, 680, 175], // person behind the green-helmet rider (0.35)
  ],
  plate: [
    [824, 715, 926, 800], // 66-F1 7741, front right (0.83)
    [741, 383, 802, 422], // 51-R1 8738 (0.82)
    [1185, 304, 1239, 330], // parked bike, right (0.45)
    [913, 252, 949, 276], // rider further back (0.24)
  ],
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
  const width = Math.min(context.canvas.width - x, box.width + horizontal * 2);
  const height = Math.min(context.canvas.height - y, box.height + vertical * 2);
  if (style === "blackout") {
    context.fillStyle = "#111827";
    context.fillRect(x, y, width, height);
    return;
  }
  if (style === "blur") {
    // Why: drawImage with a blur filter on a sub-rectangle samples transparent pixels beyond the crop
    // boundary, causing large blur radii (e.g. strength ~60) to fade to transparent so the original
    // shows through. By copying the canvas once, clipping to the bounding box, and drawing the entire
    // offscreen copy with the blur filter, the filter only samples real pixels and stays fully opaque.
    const copy = document.createElement("canvas");
    copy.width = context.canvas.width;
    copy.height = context.canvas.height;
    const copyContext = copy.getContext("2d");
    if (copyContext) {
      copyContext.drawImage(context.canvas, 0, 0);
      context.save();
      context.beginPath();
      context.rect(x, y, width, height);
      context.clip();
      context.filter = `blur(${Math.max(1, strength / 3)}px)`;
      context.drawImage(copy, 0, 0);
      context.restore();
    }
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
      // Boxes are in the photo's pixels; the canvas is smaller, so scale them down.
      const scale = canvas.width / image.naturalWidth;
      for (const target of targets) {
        for (const [x1, y1, x2, y2] of SAMPLE_BOXES[target] ?? []) {
          const box = { x: x1 * scale, y: y1 * scale, width: (x2 - x1) * scale, height: (y2 - y1) * scale };
          drawRedaction(context, box, style, strength, padding);
        }
      }
    };
    image.src = SAMPLE_IMAGE;
  }, [style, strength, targets, padding]);

  return (
    <>
      <div className="preview-canvas">
        <canvas ref={ref} width={640} height={400} aria-label="Local redaction preview using a sample image" />
      </div>
      <p className="preview-note">
        Photo: Jorge Láscar,{" "}
        <a href={SAMPLE_CREDIT_URL} target="_blank" rel="noreferrer">
          CC BY 2.0
        </a>
        , cropped.
      </p>
    </>
  );
}
