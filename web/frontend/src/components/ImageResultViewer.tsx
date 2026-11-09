/**
 * Interactive before-and-after image comparator, detection telemetry viewer, and redaction editor.
 *
 * Why: Allows users to review detected faces/plates, compare before/after results, and enter
 * an interactive editor to toggle detections, draw custom redactions, and re-render without re-running AI.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowSquareOutIcon, DownloadSimpleIcon, TrashIcon } from "@phosphor-icons/react";
import { Detection, Job, ReviewReason } from "../types";
import { usePresignedUrl } from "../hooks/usePresignedUrl";
import { editJob, EditJobBody, request } from "../api";
import { formatJobErrorMessage } from "../utils/format";
import { drawRedaction } from "../redaction-draw";
import { DetectionList } from "./DetectionList";
import { boxToPercent, ImageStage, stageCoordsToPixelBox } from "./ui/ImageStage";
import { StatusBadge } from "./ui/StatusBadge";
import { REDACTION_STRENGTH_RANGES, RedactionStyle, RedactionStyleControls } from "./RedactionStyleControls";

export interface ImageResultViewerProps {
  job: Job;
  detections: Detection[];
  reviewReasons: ReviewReason[];
  hasWhitelist?: boolean;
  onRetry: (job: Job) => void;
  batchConfig?: Record<string, unknown> | null;
  onSelectJob?: (id: string) => void;
  onRefresh?: () => Promise<void>;
  onError?: (message: string) => void;
  /**
   * Ref hook allowing unit tests to simulate calling the component's add-box path.
   */
  addBoxHandlerRef?: React.MutableRefObject<((box: [number, number, number, number]) => void) | null>;
}

/**
 * Resolves natural dimensions using loaded event telemetry, summary metadata, or detection coordinates.
 */
function getEffectiveDimensions(
  naturalSize: { width: number; height: number } | null,
  job: Job,
  detections: Detection[],
): { width: number; height: number } | null {
  if (naturalSize && naturalSize.width > 0 && naturalSize.height > 0) {
    return naturalSize;
  }
  const summarySize = job.resultSummary?.imageSize;
  if (
    Array.isArray(summarySize) &&
    typeof summarySize[0] === "number" &&
    typeof summarySize[1] === "number" &&
    summarySize[0] > 0 &&
    summarySize[1] > 0
  ) {
    return { width: summarySize[0], height: summarySize[1] };
  }
  let maxX = 0;
  let maxY = 0;
  for (const d of detections) {
    if (d.box && d.box.length >= 4) {
      if (d.box[2] > maxX) maxX = d.box[2];
      if (d.box[3] > maxY) maxY = d.box[3];
    }
  }
  if (maxX > 0 && maxY > 0) {
    return { width: maxX, height: maxY };
  }
  return null;
}

/**
 * Displays original vs redacted image comparison slider and detection findings,
 * with an interactive edit mode to toggle boxes, draw custom boxes, and re-render.
 */
export function ImageResultViewer({
  job,
  detections,
  reviewReasons,
  hasWhitelist = false,
  onRetry,
  batchConfig,
  onSelectJob,
  onRefresh,
  onError,
  addBoxHandlerRef,
}: ImageResultViewerProps) {
  // Why 0: the original stays hidden until the user drags, so opening an image never reveals faces.
  const [split, setSplit] = useState(0);
  const [showBoxes, setShowBoxes] = useState(false);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalImgRef = useRef<HTMLImageElement>(null);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [addedBoxes, setAddedBoxes] = useState<Array<{ box: [number, number, number, number] }>>([]);
  const [redactIndices, setRedactIndices] = useState<Set<number>>(new Set());
  const [editStyle, setEditStyle] = useState<RedactionStyle>("blur");
  const [editStrength, setEditStrength] = useState<number>(REDACTION_STRENGTH_RANGES.blur.default);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);

  const isCompleted = job?.status === "COMPLETED";
  const { url: originalUrl } = usePresignedUrl(job && isCompleted ? `/api/jobs/${job.id}/original-url` : null);
  const { url: resultImageUrl } = usePresignedUrl(job && isCompleted ? `/api/jobs/${job.id}/result-url` : null);

  useEffect(() => {
    setNaturalSize(null);
    setIsEditing(false);
    setAddedBoxes([]);
    setDragStart(null);
    setDragCurrent(null);
    setIsDraggingSlider(false);
  }, [job.id]);

  // Compute baseline configuration and initial detection checkboxes
  const initialValues = useMemo(() => {
    const initialIndices = new Set<number>();
    detections.forEach((d, idx) => {
      if (d.box && d.box.length >= 4 && d.redacted !== false) {
        initialIndices.add(idx);
      }
    });
    const rawStyle = batchConfig?.style;
    const style: RedactionStyle =
      rawStyle === "pixelate" || rawStyle === "blackout" || rawStyle === "blur" ? rawStyle : "blur";
    const range = style === "pixelate" ? REDACTION_STRENGTH_RANGES.pixelate : REDACTION_STRENGTH_RANGES.blur;
    const strength =
      typeof batchConfig?.strength === "number" && !Number.isNaN(batchConfig.strength)
        ? Math.min(range.max, Math.max(range.min, Math.round(batchConfig.strength)))
        : range.default;
    return { initialIndices, style, strength };
  }, [detections, batchConfig]);

  const handleStartEdit = () => {
    setRedactIndices(new Set(initialValues.initialIndices));
    setAddedBoxes([]);
    setEditStyle(initialValues.style);
    setEditStrength(initialValues.strength);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setAddedBoxes([]);
    setDragStart(null);
    setDragCurrent(null);
    setIsDraggingSlider(false);
    setRedactIndices(new Set(initialValues.initialIndices));
    setEditStyle(initialValues.style);
    setEditStrength(initialValues.strength);
  };

  const hasChanges = useMemo(() => {
    if (addedBoxes.length > 0) return true;
    if (editStyle !== initialValues.style) return true;
    if (editStyle !== "blackout" && editStrength !== initialValues.strength) return true;
    if (redactIndices.size !== initialValues.initialIndices.size) return true;
    for (const idx of initialValues.initialIndices) {
      if (!redactIndices.has(idx)) return true;
    }
    return false;
  }, [addedBoxes, editStyle, editStrength, redactIndices, initialValues]);

  const handleToggleRedact = (index: number) => {
    setRedactIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleAddBox = (box: [number, number, number, number]) => {
    const [x1, y1, x2, y2] = box;
    // Ignore boxes smaller than a few pixels
    if (x2 - x1 >= 5 && y2 - y1 >= 5) {
      setAddedBoxes((prev) => [...prev, { box: [x1, y1, x2, y2] }]);
    }
  };

  useEffect(() => {
    if (addBoxHandlerRef) {
      addBoxHandlerRef.current = handleAddBox;
    }
  }, [addBoxHandlerRef]);

  const handleRemoveAddedBox = (index: number) => {
    setAddedBoxes((prev) => prev.filter((_, i) => i !== index));
  };

  const handleApply = async () => {
    if (!hasChanges || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const payload: EditJobBody = {
        redactIndices: Array.from(redactIndices).sort((a, b) => a - b),
        addedBoxes,
        style: editStyle,
        strength: editStyle !== "blackout" ? editStrength : undefined,
      };
      const res = await editJob(job.id, payload);
      setIsEditing(false);
      onSelectJob?.(res.job.id);
      await onRefresh?.();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to apply edits";
      onError?.(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenOriginal = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    try {
      const data = await request<{ url: string; expiresAt: string }>(`/api/jobs/${job.id}/original-url`);
      window.open(data.url, "_blank", "noreferrer");
    } catch (err) {
      console.error("Failed to fetch original presigned URL", err);
    }
  };

  const handleDownloadResult = async () => {
    try {
      const data = await request<{ url: string; expiresAt: string }>(`/api/jobs/${job.id}/result-url?download=1`);
      const a = document.createElement("a");
      a.href = data.url;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error("Failed to fetch result download URL", err);
    }
  };

  const effectiveSize = getEffectiveDimensions(naturalSize, job, detections);

  const renderLivePreview = useCallback(() => {
    if (!isEditing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const sourceImg = originalImgRef.current;
    const origW = sourceImg?.naturalWidth || effectiveSize?.width || 1000;
    const origH = sourceImg?.naturalHeight || effectiveSize?.height || 1000;
    const longEdge = Math.max(origW, origH);
    // Cap canvas at about 1600 px on the long edge and scale box coordinates by the same factor
    const scale = longEdge > 1600 ? 1600 / longEdge : 1;

    canvas.width = Math.max(1, Math.round(origW * scale));
    canvas.height = Math.max(1, Math.round(origH * scale));

    context.clearRect(0, 0, canvas.width, canvas.height);
    if (sourceImg && sourceImg.complete && sourceImg.naturalWidth > 0) {
      try {
        context.drawImage(sourceImg, 0, 0, canvas.width, canvas.height);
      } catch {
        // Display-only preview: never read pixels back (cross-origin / tainted canvas safe)
      }
    }

    const effectivePadding =
      typeof batchConfig?.padding === "number" && batchConfig.padding >= 0 && batchConfig.padding <= 0.5
        ? batchConfig.padding
        : 0.1;

    // Apply checked detections
    detections.forEach((d, idx) => {
      if (redactIndices.has(idx) && d.box && d.box.length >= 4) {
        const [x1, y1, x2, y2] = d.box;
        const box = {
          x: x1 * scale,
          y: y1 * scale,
          width: (x2 - x1) * scale,
          height: (y2 - y1) * scale,
        };
        drawRedaction(context, box, editStyle, editStrength, effectivePadding);
      }
    });

    // Apply user-drawn added boxes
    for (const item of addedBoxes) {
      const [x1, y1, x2, y2] = item.box;
      const box = {
        x: x1 * scale,
        y: y1 * scale,
        width: (x2 - x1) * scale,
        height: (y2 - y1) * scale,
      };
      drawRedaction(context, box, editStyle, editStrength, effectivePadding);
    }
  }, [isEditing, effectiveSize, batchConfig?.padding, detections, redactIndices, addedBoxes, editStyle, editStrength]);

  useEffect(() => {
    if (!originalUrl) return;
    const img = new Image();
    img.onload = () => {
      renderLivePreview();
    };
    img.src = originalUrl;
  }, [originalUrl, renderLivePreview]);

  useEffect(() => {
    renderLivePreview();
  }, [renderLivePreview, split]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (naturalWidth && naturalHeight) {
      setNaturalSize({ width: naturalWidth, height: naturalHeight });
    }
    renderLivePreview();
  };

  const isOverlayVisible = isEditing || showBoxes || hoveredIndex !== null;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isEditing || e.button !== 0) return;
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = rect.width > 0 ? e.clientX - rect.left : e.clientX;
    const y = rect.height > 0 ? e.clientY - rect.top : e.clientY;
    const dividerX = (rect.width * split) / 100;
    // Drag before/after slider when pointer is near divider line or handle
    if (rect.width > 0 && Math.abs(x - dividerX) <= 16) {
      setIsDraggingSlider(true);
      target.setPointerCapture?.(e.pointerId);
      return;
    }
    setIsDraggingSlider(false);
    setDragStart({ x, y });
    setDragCurrent({ x, y });
    target.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const x = rect.width > 0 ? e.clientX - rect.left : e.clientX;
    const y = rect.height > 0 ? e.clientY - rect.top : e.clientY;
    if (isDraggingSlider) {
      if (rect.width > 0) {
        const nextSplit = Math.max(0, Math.min(100, Math.round((x / rect.width) * 100)));
        setSplit(nextSplit);
      }
      return;
    }
    if (!dragStart) return;
    setDragCurrent({ x, y });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingSlider) {
      setIsDraggingSlider(false);
      return;
    }
    if (!dragStart || !effectiveSize) {
      setDragStart(null);
      setDragCurrent(null);
      return;
    }
    const target = e.currentTarget;
    const rect = target.getBoundingClientRect();
    const currentX = rect.width > 0 ? e.clientX - rect.left : e.clientX;
    const currentY = rect.height > 0 ? e.clientY - rect.top : e.clientY;
    const stageWidth = rect.width > 0 ? rect.width : effectiveSize.width;
    const stageHeight = rect.height > 0 ? rect.height : effectiveSize.height;

    const box = stageCoordsToPixelBox(
      dragStart,
      { x: currentX, y: currentY },
      { width: stageWidth, height: stageHeight },
      effectiveSize,
    );
    handleAddBox(box);
    setDragStart(null);
    setDragCurrent(null);
  };

  return (
    <div className="result-viewer">
      <div className="viewer-head">
        <div>
          <span className="section-kicker">IMAGE RESULT</span>
          <h3>{job.originalFilename}</h3>
          {reviewReasons.length > 0 && (
            <div className="review-reasons">
              <StatusBadge variant="pill" label="Needs review" />
              {reviewReasons.map((reason) => (
                <small key={reason}>{reason}</small>
              ))}
            </div>
          )}
        </div>
        <div className="result-actions">
          {job.status === "FAILED" && job.error?.code !== "WHITELIST_REFERENCE_ERROR" && (
            <button type="button" className="secondary-button" onClick={() => onRetry(job)}>
              Retry job
            </button>
          )}
          {job.status === "COMPLETED" && !isEditing && (
            <button type="button" className="primary-button" onClick={handleStartEdit}>
              Edit redaction
            </button>
          )}
          {isEditing && (
            <>
              <button type="button" className="secondary-button" onClick={handleCancel} disabled={isSubmitting}>
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={() => void handleApply()}
                disabled={!hasChanges || isSubmitting}
              >
                {isSubmitting ? "Applying..." : "Apply"}
              </button>
            </>
          )}
        </div>
      </div>

      {isEditing && (
        <div className="field-group edit-controls">
          <RedactionStyleControls
            style={editStyle}
            strength={editStrength}
            disabled={isSubmitting}
            onChange={(style, strength) => {
              setEditStyle(style);
              setEditStrength(strength);
            }}
          />
        </div>
      )}

      {job.status === "COMPLETED" && (resultImageUrl || originalUrl) ? (
        <>
          <div className="comparison">
            <ImageStage naturalWidth={effectiveSize?.width} naturalHeight={effectiveSize?.height}>
              {isEditing ? (
                <canvas
                  ref={canvasRef}
                  className="comparison-after"
                  aria-label="Live redaction preview"
                  data-testid="live-preview-canvas"
                />
              ) : (
                <img
                  className="comparison-after"
                  src={resultImageUrl ?? undefined}
                  alt={`Processed ${job.originalFilename}`}
                  onLoad={handleImageLoad}
                />
              )}
              <div className="comparison-before" style={{ clipPath: `inset(0 calc(100% - ${split}%) 0 0)` }}>
                {originalUrl && (
                  <img
                    ref={originalImgRef}
                    src={originalUrl}
                    alt={`Original ${job.originalFilename}`}
                    onLoad={handleImageLoad}
                  />
                )}
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={split}
                onChange={(event) => setSplit(Number(event.target.value))}
                className="comparison-range"
                aria-label="Before / after"
              />
              <div
                className={`comparison-divider${split < 3 ? " is-start" : split > 97 ? " is-end" : ""}`}
                style={{ left: `${split}%` }}
              />

              {isEditing && (
                <div
                  className="stage-draw-area"
                  data-testid="stage-draw-area"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                >
                  {dragStart && dragCurrent && (
                    <div
                      className="detection-box detection-box-redacted stage-drag-preview"
                      style={{
                        left: `${Math.min(dragStart.x, dragCurrent.x)}px`,
                        top: `${Math.min(dragStart.y, dragCurrent.y)}px`,
                        width: `${Math.abs(dragCurrent.x - dragStart.x)}px`,
                        height: `${Math.abs(dragCurrent.y - dragStart.y)}px`,
                      }}
                    />
                  )}
                </div>
              )}

              {isOverlayVisible && effectiveSize && (
                <div
                  className={`detection-overlay ${isEditing ? "detection-overlay-editing" : ""}`.trim()}
                  data-testid="detection-overlay"
                >
                  {detections.map((detection, index) => {
                    if (!detection.box || detection.box.length < 4) return null;
                    const isHovered = hoveredIndex === index;
                    if (!showBoxes && !isHovered && !isEditing) return null;

                    const { left, top, width, height } = boxToPercent(
                      detection.box,
                      effectiveSize.width,
                      effectiveSize.height,
                    );

                    const isChecked = isEditing ? redactIndices.has(index) : Boolean(detection.redacted);
                    const isFlagged =
                      Boolean(detection.needsReview) ||
                      Boolean(detection.lowConfidence) ||
                      (detection.reviewReasons && detection.reviewReasons.length > 0);
                    const isWhitelisted = Boolean(detection.whitelisted);

                    let variantClass = "detection-box-redacted";
                    if (isEditing) {
                      variantClass = isChecked ? "detection-box-redacted" : "detection-box-whitelisted";
                    } else if (isFlagged) {
                      variantClass = "detection-box-warning";
                    } else if (isWhitelisted) {
                      variantClass = "detection-box-whitelisted";
                    }

                    return (
                      <div
                        key={`box-${index}`}
                        className={`detection-box ${variantClass} ${isHovered ? "is-highlighted" : ""}`.trim()}
                        style={{
                          left: `${left}%`,
                          top: `${top}%`,
                          width: `${width}%`,
                          height: `${height}%`,
                        }}
                        data-testid={`detection-box-${index}`}
                      >
                        <span className="detection-box-label">#{index + 1}</span>
                        {isEditing && (
                          <label className="choice detection-box-toggle" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleRedact(index)}
                              aria-label={`Redact box #${index + 1}`}
                            />
                          </label>
                        )}
                      </div>
                    );
                  })}

                  {isEditing &&
                    addedBoxes.map((item, addedIndex) => {
                      const { left, top, width, height } = boxToPercent(
                        item.box,
                        effectiveSize.width,
                        effectiveSize.height,
                      );
                      return (
                        <div
                          key={`added-box-${addedIndex}`}
                          className="detection-box detection-box-redacted"
                          style={{
                            left: `${left}%`,
                            top: `${top}%`,
                            width: `${width}%`,
                            height: `${height}%`,
                          }}
                          data-testid={`added-box-${addedIndex}`}
                        >
                          <span className="detection-box-label">+{addedIndex + 1}</span>
                          <button
                            type="button"
                            className="delete-item-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveAddedBox(addedIndex);
                            }}
                            aria-label={`Remove drawn box ${addedIndex + 1}`}
                          >
                            <TrashIcon aria-hidden />
                          </button>
                        </div>
                      );
                    })}
                </div>
              )}
            </ImageStage>
          </div>
          {isEditing && <p className="preview-note">Approximate preview; final render is performed by the server.</p>}
          {!isEditing && (
            <div className="viewer-controls">
              <label className="overlay-toggle">
                <input type="checkbox" checked={showBoxes} onChange={(event) => setShowBoxes(event.target.checked)} />
                Show boxes
              </label>
              {showBoxes && (
                <ul className="box-legend" aria-label="Box key">
                  <li>
                    <span className="box-legend-swatch box-legend-redacted" aria-hidden="true" />
                    <span>redacted</span>
                  </li>
                  <li>
                    <span className="box-legend-swatch box-legend-kept" aria-hidden="true" />
                    <span>kept</span>
                  </li>
                  <li>
                    <span className="box-legend-swatch box-legend-review" aria-hidden="true" />
                    <span>review</span>
                  </li>
                </ul>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="viewer-empty">
          {job.status === "FAILED" ? (
            <>
              <strong>This image failed processing.</strong>
              {job.error && (
                <p className="failure-detail">
                  {job.error.code && <span className="failure-code">{job.error.code}</span>}
                  {job.error.code && formatJobErrorMessage(job.error) ? ": " : ""}
                  {formatJobErrorMessage(job.error)}
                </p>
              )}
            </>
          ) : (
            "Result will appear here when processing completes."
          )}
        </div>
      )}

      <div className="viewer-meta">
        <span>
          {job.stage ?? "Waiting"} · {job.progress}%
        </span>
        {job.status === "COMPLETED" && (
          <>
            <a href="#" onClick={handleOpenOriginal} className="ghost-button">
              <ArrowSquareOutIcon aria-hidden="true" />
              Open original
            </a>
            <button type="button" onClick={handleDownloadResult} className="ghost-button">
              <DownloadSimpleIcon aria-hidden="true" />
              Download result
            </button>
          </>
        )}
      </div>

      <DetectionList
        detections={detections}
        hasWhitelist={hasWhitelist}
        hoveredIndex={hoveredIndex}
        onHoverDetection={setHoveredIndex}
        isEditing={isEditing}
        redactIndices={redactIndices}
        onToggleRedact={handleToggleRedact}
        addedBoxes={addedBoxes}
        onRemoveAddedBox={handleRemoveAddedBox}
      />
    </div>
  );
}
