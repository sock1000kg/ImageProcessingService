/**
 * File upload input, saved face list selector, and preview list for biometric reference whitelist faces.
 *
 * Biometric data retention policy: Whitelist faces uploaded directly for a batch are purged immediately
 * once all jobs terminate. Saved face lists are stored permanently under the user's account until explicitly
 * deleted. Using a saved list copies its references into the batch namespace so deleting a list never affects
 * running batches.
 */
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { addWhitelistFiles, FileSelectionIssue, MAX_WHITELIST_FILES } from "./file-selection";
import { FilePreviewList } from "./FilePreviewList";
import { RejectedFilesNotice } from "./RejectedFilesNotice";
import { FaceListItem } from "../types";
import { createFaceList, listFaceLists } from "../api";
import { useFaceListThumbnail } from "../hooks/useFaceListThumbnail";

function SavedFaceThumbnail({ listId, index }: { listId: string; index: number }) {
  const url = useFaceListThumbnail(listId, index);
  return <img src={url ?? undefined} alt={`Face ${index}`} />;
}

export interface WhitelistUploaderProps {
  files: File[];
  onChange: (files: File[]) => void;
  selectedFaceListId?: string | null;
  onFaceListIdChange?: (id: string | null) => void;
}

/**
 * Handles selection of up to 5 reference face images excluded from redaction,
 * or selection of an existing saved face list with opt-in storage management.
 */
export function WhitelistUploader({ files, onChange, selectedFaceListId, onFaceListIdChange }: WhitelistUploaderProps) {
  const [issues, setIssues] = useState<FileSelectionIssue[]>([]);
  const [savedLists, setSavedLists] = useState<FaceListItem[]>([]);
  const [listName, setListName] = useState("");
  const [savingList, setSavingList] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    listFaceLists()
      .then((data) => {
        if (active && data && Array.isArray(data.lists)) {
          setSavedLists(data.lists);
        }
      })
      .catch(() => {
        // Optional feature, quiet fallback
      });
    return () => {
      active = false;
    };
  }, []);

  const change = (event: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    if (!incoming.length) return;

    if (selectedFaceListId) {
      onFaceListIdChange?.(null);
    }

    const result = addWhitelistFiles(files, incoming, MAX_WHITELIST_FILES);
    onChange(result.files);
    setIssues(result.issues);
  };

  const handleRemove = (index: number) => {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    const next = files.filter((_, i) => i !== index);
    onChange(next);
  };

  const handleSelectSavedList = (id: string) => {
    if (!id) {
      onFaceListIdChange?.(null);
      return;
    }
    onChange([]);
    onFaceListIdChange?.(id);
  };

  const handleClearSavedList = () => {
    onFaceListIdChange?.(null);
  };

  const handleSaveAsList = async () => {
    const trimmed = listName.trim();
    if (!trimmed || !files.length || savingList) return;
    setSavingList(true);
    setSaveError(null);
    try {
      const result = await createFaceList(trimmed, files);
      setSavedLists((prev) => [result.list, ...prev]);
      setListName("");
      onChange([]);
      onFaceListIdChange?.(result.list.id);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save face list");
    } finally {
      setSavingList(false);
    }
  };

  const selectedList = savedLists.find((l) => l.id === selectedFaceListId);

  return (
    <div className="whitelist-box">
      <div className="whitelist-header">
        <div>
          <span className="mini-label">OPTIONAL</span>
          <h3>Face whitelist</h3>
          <p>Reference faces will not be redacted when similarity is above the threshold.</p>
        </div>
        <div className="whitelist-actions">
          {(savedLists ?? []).length > 0 && (
            <select
              className="button secondary-button"
              aria-label="Use a saved list"
              value={selectedFaceListId ?? ""}
              onChange={(e) => handleSelectSavedList(e.target.value)}
            >
              <option value="">Use a saved list…</option>
              {(savedLists ?? []).map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name} ({list.faceCount} {list.faceCount === 1 ? "face" : "faces"})
                </option>
              ))}
            </select>
          )}

          {!selectedFaceListId && (
            <>
              <label className="button secondary-button">
                Add references
                <input
                  ref={inputRef}
                  hidden
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={change}
                />
              </label>
              {files.length > 0 && (
                <span className="file-count">
                  {files.length}/{MAX_WHITELIST_FILES} selected
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <RejectedFilesNotice issues={issues} onDismiss={() => setIssues([])} />

      {selectedFaceListId && selectedList ? (
        <div className="file-preview-wrap">
          <div className="file-list-header">
            <span className="file-list-title">
              Using saved list: <strong>{selectedList.name}</strong> ({selectedList.faceCount} faces)
            </span>
            <span className="file-list-divider"> · </span>
            <button type="button" className="file-list-clear" onClick={handleClearSavedList}>
              Clear
            </button>
          </div>
          <div className="file-list scroll-list">
            {Array.from({ length: selectedList.faceCount }, (_, i) => i + 1).map((n) => (
              <div className="file-row" key={`saved-face-${selectedList.id}-${n}`}>
                <div className="thumbnail-container">
                  <SavedFaceThumbnail listId={selectedList.id} index={n} />
                  <span className="thumbnail-badge">{`#${n}`}</span>
                </div>
                <div>
                  <strong>Face #{n}</strong>
                  <span>Saved reference</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <FilePreviewList files={files} onRemove={handleRemove} label={(index) => `#${index + 1}`} />

          {files.length > 0 && (
            <div className="file-preview-wrap" style={{ marginTop: "0.75rem" }}>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <input
                  type="text"
                  placeholder="Name this face list…"
                  aria-label="Face list name"
                  value={listName}
                  onChange={(e) => setListName(e.target.value)}
                  style={{
                    padding: "0.4rem 0.6rem",
                    borderRadius: "4px",
                    border: "1px solid var(--border-color, #ccc)",
                    flex: 1,
                  }}
                  disabled={savingList}
                />
                <button
                  type="button"
                  className="secondary-button"
                  disabled={!listName.trim() || savingList}
                  onClick={() => void handleSaveAsList()}
                >
                  {savingList ? "Saving…" : "Save as list"}
                </button>
              </div>
              <small style={{ display: "block", marginTop: "0.35rem", opacity: 0.8 }}>
                Saved faces are kept under your account until the list is deleted.
              </small>
              {saveError && (
                <small className="field-error" style={{ display: "block", marginTop: "0.25rem" }}>
                  {saveError}
                </small>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
