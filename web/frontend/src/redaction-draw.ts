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
    context.fillStyle = "#000000"; // the Engine's blackout is pure black (np.zeros_like)
    context.fillRect(x, y, width, height);
    return;
  }

  if (style === "blur") {
    blurRegion(context, x, y, width, height, Math.max(0.8, (width * strength) / 100));
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

/**
 * Blurs one rectangle using only its own pixels, like the Engine's cv2.GaussianBlur on the cropped ROI.
 *
 * Why: the canvas blur filter fades to transparent at the edge of what it draws, and blurring the whole canvas
 * then clipping pulls colour from outside the box into the blur. The Engine reflects the box's own edge pixels
 * instead, so the crop is padded with mirrored copies of itself, blurred, and only the centre is drawn back.
 */
function blurRegion(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  sigma: number,
) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  // The mirrored margin can't be larger than the crop itself; 3 sigma is where the Gaussian weight vanishes.
  const margin = Math.min(Math.ceil(sigma * 3), w, h);
  const padded = document.createElement("canvas");
  padded.width = w + margin * 2;
  padded.height = h + margin * 2;
  const paddedContext = padded.getContext("2d");
  if (!paddedContext) return;

  const source = context.canvas;
  for (const row of [-1, 0, 1]) {
    for (const column of [-1, 0, 1]) {
      paddedContext.save();
      // Neighbour tiles are drawn flipped so the pixels next to each border mirror the crop's own edge.
      const tileX = margin + column * w;
      const tileY = margin + row * h;
      // A flipped tile is drawn from its far edge, so it starts one crop-width/height further along.
      paddedContext.translate(tileX + (column === 0 ? 0 : w), tileY + (row === 0 ? 0 : h));
      paddedContext.scale(column === 0 ? 1 : -1, row === 0 ? 1 : -1);
      paddedContext.drawImage(source, x, y, w, h, 0, 0, w, h);
      paddedContext.restore();
    }
  }

  const blurred = canvasFilterSupported() ? filterBlur(padded, sigma) : resampleBlur(padded, sigma);
  if (!blurred) return;
  context.drawImage(blurred, margin, margin, w, h, x, y, w, h);
}

let filterSupport: boolean | undefined;

/**
 * Whether this browser applies CanvasRenderingContext2D.filter.
 *
 * Why: some mobile browsers (Safari on iPhone and iPad) ignore it, so the preview showed an unblurred photo.
 * An unsupported browser leaves `filter` undefined instead of the string "none".
 */
function canvasFilterSupported(): boolean {
  if (filterSupport === undefined) {
    const probe = document.createElement("canvas").getContext("2d");
    filterSupport = !!probe && typeof probe.filter === "string";
  }
  return filterSupport;
}

function filterBlur(source: HTMLCanvasElement, sigma: number): HTMLCanvasElement | null {
  const blurred = document.createElement("canvas");
  blurred.width = source.width;
  blurred.height = source.height;
  const blurredContext = blurred.getContext("2d");
  if (!blurredContext) return null;
  blurredContext.filter = `blur(${sigma}px)`;
  blurredContext.drawImage(source, 0, 0);
  return blurred;
}

/**
 * Blur without `filter`: shrink the canvas in halving steps, then enlarge it the same way, smoothing each step.
 *
 * Why: it only uses drawImage, so it also works on a canvas holding a cross-origin picture (the editor shows the
 * result image from storage, and reading its pixels back would throw). Shrinking by a factor f and enlarging again
 * softens about as much as a Gaussian with sigma f / 2, so f = 2 * sigma. It is a preview, not the Engine's exact blur.
 */
function resampleBlur(source: HTMLCanvasElement, sigma: number): HTMLCanvasElement | null {
  const factor = Math.max(1, sigma * 2);
  const halvings = Math.floor(Math.log2(factor));
  const sizes: Array<[number, number]> = [[source.width, source.height]];
  for (let i = 0; i < halvings; i += 1) {
    const [w, h] = sizes[sizes.length - 1];
    sizes.push([Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2))]);
  }
  const rest = factor / 2 ** halvings;
  if (rest > 1.05) {
    const [w, h] = sizes[sizes.length - 1];
    sizes.push([Math.max(1, Math.round(w / rest)), Math.max(1, Math.round(h / rest))]);
  }

  let current = source;
  for (const [w, h] of [...sizes.slice(1), ...sizes.slice(0, -1).reverse()]) {
    const next = document.createElement("canvas");
    next.width = w;
    next.height = h;
    const nextContext = next.getContext("2d");
    if (!nextContext) return null;
    nextContext.imageSmoothingEnabled = true;
    nextContext.imageSmoothingQuality = "high";
    nextContext.drawImage(current, 0, 0, current.width, current.height, 0, 0, w, h);
    current = next;
  }
  return current;
}
