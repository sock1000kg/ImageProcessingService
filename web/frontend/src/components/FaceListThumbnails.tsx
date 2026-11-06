/**
 * Thumbnail strip component displaying up to MAX_FACE_LIST_FILES reference face thumbnails
 * for an allow list wrapping into rows of 3.
 *
 * Why centralized component: Deduplicates thumbnail strip rendering across SavedFaceListsPanel,
 * WhitelistUploader chosen rows, and WhitelistUploader picker dialog cards.
 */
import { FaceListItem } from "../types";
import { usePrivateImage } from "../hooks/usePrivateImage";
import { MAX_FACE_LIST_FILES } from "./file-selection";

/**
 * Renders an individual biometric face thumbnail by list id and index.
 *
 * Why memoized URL in hook: Fetches auth-protected MinIO thumbnail stream and generates
 * a revocable object URL. Revision bumps invalidate the cache on face addition/deletion.
 */
export function SavedFaceThumbnail({
  listId,
  index,
  revision = 0,
}: {
  listId: string;
  index: number;
  revision?: number;
}) {
  const { url } = usePrivateImage(`/api/face-lists/${listId}/faces/${index}`, revision);
  return <img src={url ?? undefined} alt={`Face #${index}`} />;
}

export interface FaceListThumbnailsProps {
  list: FaceListItem;
  revision?: number;
  onSelect?: (n: number) => void;
}

/**
 * Small thumbnail buttons wrapping into rows of 3, up to MAX_FACE_LIST_FILES (at most 2 rows).
 */
export function FaceListThumbnails({ list, revision, onSelect }: FaceListThumbnailsProps) {
  const count = Math.min(MAX_FACE_LIST_FILES, list.faceCount);
  return (
    <div className="face-list-thumbnails" aria-label={`Faces in ${list.name}`}>
      {Array.from({ length: count }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          className="thumbnail-container thumbnail-container-sm"
          onClick={() => onSelect?.(n)}
          aria-label={`View face #${n} from ${list.name}`}
        >
          <SavedFaceThumbnail listId={list.id} index={n} revision={revision} />
          <span className="thumbnail-badge">{`#${n}`}</span>
        </button>
      ))}
    </div>
  );
}
