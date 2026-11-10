/**
 * Local-only preview using a bundled sample image. It is never uploaded or sent to the Engine.
 */
import { useEffect, useRef, useState } from "react";
import { drawRedaction } from "../redaction-draw";

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
 * Face and plate boxes in the sample's own pixels, [x1, y1, x2, y2] like the engine's detections. They are fixed
 * against this bundled photograph so the preview never depends on running a model in the browser.
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

export function PreviewCanvas({ style, strength, targets = ["face", "plate"], padding = 0.1 }: PreviewCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [imageState, setImageState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) {
      setImageState("error");
      return;
    }

    let active = true;
    const image = new Image();
    image.onload = () => {
      if (!active) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      setImageState("ready");
      const scaleX = canvas.width / image.naturalWidth;
      const scaleY = canvas.height / image.naturalHeight;
      for (const target of targets) {
        for (const [x1, y1, x2, y2] of SAMPLE_BOXES[target] ?? []) {
          const box = {
            x: x1 * scaleX,
            y: y1 * scaleY,
            width: (x2 - x1) * scaleX,
            height: (y2 - y1) * scaleY,
          };
          drawRedaction(context, box, style, strength, padding);
        }
      }
    };
    image.onerror = () => {
      if (!active) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      setImageState("error");
    };
    setImageState("loading");
    image.decoding = "async";
    image.src = SAMPLE_IMAGE;

    return () => {
      active = false;
      image.onload = null;
      image.onerror = null;
    };
  }, [style, strength, targets, padding]);

  return (
    <>
      <div className="preview-canvas">
        <canvas
          ref={ref}
          width={640}
          height={400}
          aria-busy={imageState === "loading"}
          aria-label="Local redaction preview using a real street photo"
        />
      </div>
      {imageState === "error" && (
        <p className="preview-error" role="status">
          The preview photo could not be loaded. The final processing result is unaffected.
        </p>
      )}
      <p className="preview-note">
        Real street photo: Jorge Láscar,{" "}
        <a href={SAMPLE_CREDIT_URL} target="_blank" rel="noreferrer">
          CC BY 2.0
        </a>
        , cropped.
      </p>
    </>
  );
}
