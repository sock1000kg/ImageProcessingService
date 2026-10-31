/**
 * Image stage component providing a unified coordinate space for before/after slider layers
 * and detection bounding box overlays.
 *
 * Why this component exists:
 * The before/after comparator and detection overlay must line up pixel-for-pixel at any viewport
 * and image aspect ratio. By constraining an inner stage to the image's exact natural aspect ratio
 * and centering it inside the comparison container, child elements (clipped layers, slider divider,
 * and detection bounding boxes) can be reliably positioned using percentage coordinates relative
 * to the image itself rather than the outer arbitrary box.
 */
import React, { useEffect, useRef, useState } from "react";

export interface BoxPercent {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Converts absolute bounding box coordinates [x1, y1, x2, y2] in original image pixels
 * into percentage values (0-100) relative to naturalWidth and naturalHeight.
 */
export function boxToPercent(box: number[], naturalWidth: number, naturalHeight: number): BoxPercent {
  if (naturalWidth <= 0 || naturalHeight <= 0 || box.length < 4) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const [x1, y1, x2, y2] = box;
  const left = (x1 / naturalWidth) * 100;
  const top = (y1 / naturalHeight) * 100;
  const width = ((x2 - x1) / naturalWidth) * 100;
  const height = ((y2 - y1) / naturalHeight) * 100;
  return { left, top, width, height };
}

export interface ImageStageProps {
  naturalWidth?: number;
  naturalHeight?: number;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Renders a centered stage with the image's natural aspect ratio to unify coordinate space
 * for slider comparison layers and detection bounding boxes.
 */
export function ImageStage({ naturalWidth, naturalHeight, children, className = "", style }: ImageStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [fitMode, setFitMode] = useState<"height" | "width">("height");

  const hasDims = Boolean(naturalWidth && naturalHeight && naturalWidth > 0 && naturalHeight > 0);

  useEffect(() => {
    if (!hasDims || !naturalWidth || !naturalHeight) return;
    const parent = stageRef.current?.parentElement;
    if (!parent) return;

    const checkFit = () => {
      const pWidth = parent.clientWidth;
      const pHeight = parent.clientHeight;
      if (pWidth > 0 && pHeight > 0) {
        const pRatio = pWidth / pHeight;
        const imgRatio = naturalWidth / naturalHeight;
        setFitMode(imgRatio > pRatio ? "width" : "height");
      }
    };

    checkFit();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(checkFit) : null;
    if (ro) ro.observe(parent);
    return () => ro?.disconnect();
  }, [hasDims, naturalWidth, naturalHeight]);

  const stageStyle: React.CSSProperties = {
    position: "relative",
    aspectRatio: hasDims ? `${naturalWidth} / ${naturalHeight}` : undefined,
    width: fitMode === "width" ? "100%" : "auto",
    height: fitMode === "height" ? "100%" : "auto",
    maxWidth: "100%",
    maxHeight: "100%",
    margin: "0 auto",
    ...style,
  };

  return (
    <div ref={stageRef} className={`image-stage ${className}`.trim()} style={stageStyle} data-testid="image-stage">
      {children}
    </div>
  );
}
