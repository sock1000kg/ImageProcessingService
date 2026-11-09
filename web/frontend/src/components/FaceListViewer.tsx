/**
 * Modal viewer allowing users to inspect individual biometric face images from a saved face list.
 *
 * Why: Overview cards only display compact 36px thumbnails. This component enables full-size review
 * and fast keyboard navigation through all enrolled faces in the profile.
 */
import { useEffect, useState } from "react";
import { usePresignedUrl } from "../hooks/usePresignedUrl";
import { FaceListItem, faceLabel } from "../types";
import { DeleteBatchDialog } from "./DeleteBatchDialog";
import { Dialog } from "./ui/Dialog";
import { InlineRename } from "./InlineRename";
import { Trash } from "@phosphor-icons/react";

export interface FaceListViewerProps {
  list: FaceListItem;
  initialIndex?: number;
  open?: boolean;
  onClose: () => void;
  onDeleteFace?: (faceId: string) => Promise<void>;
  /**
   * Optional callback to rename the allow list directly from the viewer title.
   * When omitted, the viewer title renders as read-only plain text.
   */
  onRename?: (name: string) => Promise<void>;
  revision?: number;
}

function FaceStripThumbnail({
  listId,
  faceId,
  index,
  revision = 0,
  title,
}: {
  listId: string;
  faceId: string;
  index: number;
  revision?: number;
  title?: string;
}) {
  const { url } = usePresignedUrl(`/api/face-lists/${listId}/faces/${faceId}/url`, revision);
  if (!url) return null;
  return <img src={url} alt={`Thumbnail ${index}`} title={title} />;
}

/**
 * Renders a full-size photo viewer for a saved face list with a thumbnail navigation strip,
 * arrow-key shortcuts, and optional single-face deletion.
 */
export function FaceListViewer({
  list,
  initialIndex = 1,
  open = true,
  onClose,
  onDeleteFace,
  onRename,
  revision = 0,
}: FaceListViewerProps) {
  const [activeIndex, setActiveIndex] = useState(initialIndex);
  const [imgError, setImgError] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Sync activeIndex if initialIndex changes
  useEffect(() => {
    setActiveIndex(initialIndex);
  }, [initialIndex]);

  // Clamp activeIndex after a face is deleted
  useEffect(() => {
    if (list.faceCount > 0 && activeIndex > list.faceCount) {
      setActiveIndex(list.faceCount);
    }
  }, [list.faceCount, activeIndex]);

  // Reset img error on index change
  useEffect(() => {
    setImgError(false);
  }, [activeIndex]);

  const activeFaceId = list.faceIds?.[activeIndex - 1] ?? `face-${activeIndex}`;
  const { url, loading, error } = usePresignedUrl(
    activeFaceId ? `/api/face-lists/${list.id}/faces/${activeFaceId}/url` : null,
    revision,
  );

  // Keyboard navigation for previous/next faces
  useEffect(() => {
    if (!open || list.faceCount === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // While confirming deletion, ignore arrow keys so the confirmed face does not change
      if (confirmingDelete) return;

      // Why: Ignore arrow keys originating from text inputs or editable elements so cursor movement works
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setActiveIndex((prev) => Math.max(1, prev - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setActiveIndex((prev) => Math.min(list.faceCount, prev + 1));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, list.faceCount, confirmingDelete]);

  if (!open) return null;

  const countLabel = `${list.faceCount} ${list.faceCount === 1 ? "file" : "files"}`;
  // Why: When onRename is provided, embed InlineRename with dialog's titleAs="div" to avoid
  // invalid nested headings while keeping accessible name and card/viewer synchronisation.
  const title = onRename ? (
    <InlineRename
      name={list.name}
      headingLevel="h3"
      title="Rename allow list"
      ariaLabel={`Rename ${list.name}`}
      suffix={`(${countLabel})`}
      onSave={onRename}
    />
  ) : (
    `${list.name} (${countLabel})`
  );
  const activeLabel = faceLabel(list, activeIndex);

  const hasFailed = error || imgError;

  const handleDeleteConfirm = async () => {
    if (!onDeleteFace || deleting || !activeFaceId) return;
    setDeleting(true);
    try {
      await onDeleteFace(activeFaceId);
    } finally {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        title={title}
        titleId="face-viewer-title"
        titleAs={onRename ? "div" : "h3"}
        onClose={confirmingDelete ? () => {} : onClose}
        className="face-viewer-dialog"
      >
        <div className="face-viewer-stage">
          {list.faceCount === 0 ? (
            <div className="viewer-empty">No faces in this allow list</div>
          ) : loading ? (
            <div className="viewer-empty">Loading face…</div>
          ) : hasFailed || !url ? (
            <div className="viewer-empty" role="alert">
              Failed to load face image
            </div>
          ) : (
            <img src={url} alt={activeLabel} className="face-viewer-image" onError={() => setImgError(true)} />
          )}
        </div>

        {list.faceCount > 0 && (
          <div className="face-viewer-label" title={activeLabel}>
            {activeLabel}
          </div>
        )}

        {list.faceCount > 0 && (
          <div className="face-viewer-strip" role="region" aria-label="Allow list thumbnails">
            {Array.from({ length: list.faceCount }, (_, i) => i + 1).map((n) => {
              const isActive = n === activeIndex;
              const label = faceLabel(list, n);
              const faceId = list.faceIds?.[n - 1] ?? `face-${n}`;
              return (
                <button
                  key={faceId}
                  type="button"
                  className={`face-strip-thumb ${isActive ? "active" : ""}`}
                  onClick={() => setActiveIndex(n)}
                  aria-label={`Thumbnail ${n}`}
                  aria-current={isActive ? "true" : undefined}
                  title={label}
                >
                  <div className="thumbnail-container">
                    <FaceStripThumbnail listId={list.id} faceId={faceId} index={n} revision={revision} title={label} />
                    <span className="thumbnail-badge">{`#${n}`}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="dialog-actions">
          {onDeleteFace && list.faceCount > 0 && (
            <button
              type="button"
              className="delete-item-button"
              aria-label={list.faceNames?.[activeIndex - 1] ? `Delete ${activeLabel}` : `Delete face #${activeIndex}`}
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash aria-hidden />
            </button>
          )}
          <button type="button" className="secondary-button" onClick={onClose}>
            Close
          </button>
        </div>
      </Dialog>

      {onDeleteFace && (
        <DeleteBatchDialog
          open={confirmingDelete}
          title="Delete this face?"
          body={`${activeLabel} will be removed from this allow list immediately. This cannot be undone.`}
          confirmLabel={deleting ? "Deleting…" : "Delete face"}
          onCancel={() => {
            if (!deleting) setConfirmingDelete(false);
          }}
          onConfirm={() => void handleDeleteConfirm()}
        />
      )}
    </>
  );
}
