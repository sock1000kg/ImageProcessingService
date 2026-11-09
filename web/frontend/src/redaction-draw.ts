/**
 * Shared canvas redaction drawing routines matching the Engine's box-relative formulas.
 */

export interface RedactionBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Draws blur, pixelate, or blackout redaction onto a 2D canvas context using the Engine's box-relative formula.
 *
 * Why: Moves redaction drawing to a shared module so both the local sample preview (PreviewCanvas)
 * and the live interactive editor (ImageResultViewer) render client-side redactions matching Engine Contract §2.
 */
export function drawRedaction(
  context: CanvasRenderingContext2D,
  box: RedactionBox,
  style: string,
  strength: number,
  padding = 0.1,
): void {
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
      // Why: Match Engine Contract §2 Gaussian sigma = strength% of padded box width (sigma >= 0.8)
      const blurRadius = Math.max(0.8, (width * strength) / 100);
      context.filter = `blur(${blurRadius}px)`;
      context.drawImage(copy, 0, 0);
      context.restore();
    }
    return;
  }

  // Why: Match Engine Contract §2 pixelate mosaic cell size = padded box width / strength
  const pixelSize = Math.max(1, width / Math.max(1, strength));
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
