/**
 * File upload input, allow list picker dialog, and preview list for biometric reference whitelist faces.
 *
 * Biometric data retention policy: Whitelist faces uploaded directly for a batch are purged immediately
 * once all jobs terminate. Allow lists are stored permanently under the user's account until explicitly
 * deleted. Using an allow list references its photos directly without copying so deleting a list removes the photos
 * while retry continues working while the list exists.
 */
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { addWhitelistFiles, FileSelectionIssue, MAX_FACE_LIST_FILES, MAX_WHITELIST_FILES } from "./file-selection";
import { FilePreviewList } from "./FilePreviewList";
import { RejectedFilesNotice } from "./RejectedFilesNotice";
import { FaceListItem } from "../types";
import { createFaceList, listFaceLists } from "../api";
import { Dialog } from "./ui/Dialog";
import { FaceListViewer } from "./FaceListViewer";
import { FaceListThumbnails } from "./FaceListThumbnails";
import { Banner } from "./ui/Banner";

export interface WhitelistUploaderProps {
  files: File[];
  onChange: (files: File[]) => void;
  selectedFaceListId?: string | null;
  onFaceListIdChange?: (id: string | null) => void;
  selectedFaceListIds?: string[];
  onFaceListIdsChange?: (ids: string[]) => void;
  showSavedSelector?: boolean;
  showSaveAsList?: boolean;
}

/**
 * Handles selection of up to 20 reference face images excluded from redaction,
 * combining chosen allow lists and uploaded reference face files.
 */
export function WhitelistUploader({
  files,
  onChange,
  selectedFaceListId,
  onFaceListIdChange,
  selectedFaceListIds,
  onFaceListIdsChange,
  showSavedSelector = true,
  showSaveAsList = true,
}: WhitelistUploaderProps) {
  const [issues, setIssues] = useState<FileSelectionIssue[]>([]);
  const [savedLists, setSavedLists] = useState<FaceListItem[]>([]);
  const [listName, setListName] = useState("");
  const [savingList, setSavingList] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewingList, setViewingList] = useState<{ list: FaceListItem; initialIndex: number } | null>(null);
  const [internalListIds, setInternalListIds] = useState<string[]>([]);
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

  const isControlled = selectedFaceListIds !== undefined;
  const activeListIds = isControlled
    ? selectedFaceListIds
    : selectedFaceListId !== undefined
      ? selectedFaceListId
        ? [selectedFaceListId]
        : []
      : internalListIds;

  const updateListIds = (next: string[]) => {
    if (!isControlled) {
      setInternalListIds(next);
    }
    onFaceListIdsChange?.(next);
    if (!onFaceListIdsChange) {
      onFaceListIdChange?.(next[0] ?? null);
    }
  };

  const chosenLists = savedLists.filter((list) => activeListIds.includes(list.id));
  const chosenFacesCount = chosenLists.reduce((sum, list) => sum + list.faceCount, 0);
  const totalFaces = chosenFacesCount + files.length;
  const maxCap = showSavedSelector ? MAX_WHITELIST_FILES : MAX_FACE_LIST_FILES;

  const change = (event: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (inputRef.current) {
      inputRef.current.value = "";
    }
    if (!incoming.length) return;

    const remaining = Math.max(0, maxCap - chosenFacesCount);
    const result = addWhitelistFiles(files, incoming, remaining);
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

  const handleRemoveList = (id: string) => {
    updateListIds(activeListIds.filter((item) => item !== id));
  };

  const handleSaveList = async () => {
    const trimmed = listName.trim();
    // Why: Prevent submitting if name is empty, already saving, or if files count exceeds allow list capacity
    if (!trimmed || !files.length || savingList || files.length > MAX_FACE_LIST_FILES) return;
    setSavingList(true);
    setSaveError(null);
    try {
      const result = await createFaceList(trimmed, files);
      setSavedLists((prev) => [result.list, ...prev]);
      setListName("");
      onChange([]);
      updateListIds([...activeListIds, result.list.id]);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to create allow list");
    } finally {
      setSavingList(false);
    }
  };

  return (
    <div className="whitelist-box">
      <div className="whitelist-header">
        <div>
          <h3>Face whitelist</h3>
          <p>
            Reference faces will not be redacted when similarity is above the threshold. One person per photo. Only the
            largest face is used.
          </p>
        </div>
        <div className="whitelist-actions">
          <div className="dropzone-actions">
            {showSavedSelector && (
              <button type="button" className="secondary-button" onClick={() => setPickerOpen(true)}>
                Add allow list
              </button>
            )}
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
          </div>
          {totalFaces > 0 && (
            <span className="file-count">
              {totalFaces} / {maxCap} files
            </span>
          )}
        </div>
      </div>

      <RejectedFilesNotice issues={issues} onDismiss={() => setIssues([])} />

      {chosenLists.length > 0 && (
        <div className="file-preview-wrap">
          <div className="file-list">
            {chosenLists.map((list) => (
              <div className="file-row" key={`chosen-list-${list.id}`}>
                <FaceListThumbnails list={list} onSelect={(n) => setViewingList({ list, initialIndex: n })} />
                <div className="file-row-info">
                  <strong>{list.name}</strong>
                  <span>
                    {list.faceCount} {list.faceCount === 1 ? "file" : "files"}
                  </span>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove allow list ${list.name}`}
                  onClick={() => handleRemoveList(list.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <FilePreviewList files={files} onRemove={handleRemove} label={(index) => `#${chosenFacesCount + index + 1}`} />

      {showSaveAsList && files.length > 0 && (
        <div className="file-preview-wrap">
          <div className="batch-name-group">
            <input
              type="text"
              className="text-input"
              placeholder="Name this allow list…"
              style={{ marginBottom: "8px" }}
              aria-label="Allow list name"
              value={listName}
              onChange={(e) => setListName(e.target.value)}
              disabled={savingList}
            />
            <button
              type="button"
              className="secondary-button"
              disabled={!listName.trim() || savingList || files.length > MAX_FACE_LIST_FILES}
              onClick={() => void handleSaveList()}
            >
              {savingList ? "Saving…" : "Save list"}
            </button>
          </div>
          <p className="subtitle">Allow lists are kept under your account until deleted.</p>
          <p className="subtitle">If a job fails, faces not saved to an Allow List won't be used for retries.</p>
          {files.length > MAX_FACE_LIST_FILES && (
            <Banner variant="error">Allow lists can hold at most {MAX_FACE_LIST_FILES} files.</Banner>
          )}
          {saveError && <Banner variant="error">{saveError}</Banner>}
        </div>
      )}

      {pickerOpen && (
        <Dialog
          open={pickerOpen}
          title="Allow lists"
          titleId="picker-dialog-title"
          size="large"
          onClose={() => setPickerOpen(false)}
        >
          {savedLists.length === 0 ? (
            <div className="empty-dashboard saved-face-lists-empty">
              <span>👤</span>
              <h3>No allow lists</h3>
              <p>Create an allow list on the overview to select it here.</p>
            </div>
          ) : (
            <div className="library-grid">
              {savedLists.map((list) => {
                const isAdded = activeListIds.includes(list.id);
                const wouldExceed = totalFaces + list.faceCount > MAX_WHITELIST_FILES;
                const exceedReason = `Exceeds ${maxCap} files cap`;
                return (
                  <article key={list.id} className="library-card" aria-label={list.name}>
                    <div className="library-card-header">
                      <FaceListThumbnails list={list} onSelect={(n) => setViewingList({ list, initialIndex: n })} />
                      <div className="library-card-body">
                        <h3>{list.name}</h3>
                        <div className="library-card-meta saved-face-list-card-meta">
                          <span>
                            {list.faceCount} {list.faceCount === 1 ? "file" : "files"}
                          </span>
                          <span>{new Date(list.createdAt).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="library-card-actions">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setViewingList({ list, initialIndex: 1 })}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className={isAdded ? "secondary-button" : "primary-button"}
                        disabled={!isAdded && wouldExceed}
                        title={!isAdded && wouldExceed ? exceedReason : undefined}
                        onClick={() => {
                          if (isAdded) {
                            updateListIds(activeListIds.filter((id) => id !== list.id));
                          } else if (!wouldExceed) {
                            updateListIds([...activeListIds, list.id]);
                          }
                        }}
                      >
                        {isAdded ? "Added" : "Add"}
                      </button>
                    </div>
                    {!isAdded && wouldExceed && <span className="field-error">{exceedReason}</span>}
                  </article>
                );
              })}
            </div>
          )}
          <div className="dialog-actions">
            <button type="button" className="primary-button" onClick={() => setPickerOpen(false)}>
              Done
            </button>
          </div>
        </Dialog>
      )}

      {viewingList && (
        <FaceListViewer
          list={viewingList.list}
          initialIndex={viewingList.initialIndex}
          open={true}
          onClose={() => setViewingList(null)}
        />
      )}
    </div>
  );
}
