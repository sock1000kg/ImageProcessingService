/**
 * Overview component managing saved biometric face list profiles and creation of new face lists.
 *
 * Why on overview: Keeps the media library exclusively focused on image batches while giving
 * users an immediate workspace dashboard to view, create, and delete reusable face whitelist profiles.
 */
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  addFacesToList,
  createFaceList,
  deleteFaceFromList,
  deleteFaceList,
  listFaceLists,
  renameFaceList,
} from "../api";
import { FaceListItem, MessageHandler } from "../types";
import { DeleteBatchDialog } from "./DeleteBatchDialog";
import { FaceListViewer } from "./FaceListViewer";
import { WhitelistUploader } from "./WhitelistUploader";
import { Trash, UserList } from "@phosphor-icons/react";
import { Banner } from "./ui/Banner";
import { RejectedFilesNotice } from "./RejectedFilesNotice";
import { addWhitelistFiles, FileSelectionIssue, MAX_FACE_LIST_FILES } from "./file-selection";
import { InlineRename } from "./InlineRename";
import { FaceListThumbnails, SavedFaceThumbnail } from "./FaceListThumbnails";

export { SavedFaceThumbnail };

export interface SavedFaceListsPanelProps {
  onMessage?: MessageHandler;
}

/**
 * Renders the saved face lists collection with thumbnail previews, deletion confirmation,
 * full-size photo inspection dialog, and a standalone creation form powered by WhitelistUploader.
 */
export function SavedFaceListsPanel({ onMessage }: SavedFaceListsPanelProps = {}) {
  const [faceLists, setFaceLists] = useState<FaceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingList, setDeletingList] = useState<FaceListItem | null>(null);
  const [viewingList, setViewingList] = useState<{ list: FaceListItem; initialIndex: number } | null>(null);
  const [revision, setRevision] = useState(0);

  // Add faces state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeListIdForAdd, setActiveListIdForAdd] = useState<string | null>(null);
  const [uploadingListId, setUploadingListId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [rejectedIssues, setRejectedIssues] = useState<FileSelectionIssue[]>([]);

  // New list form state
  const [newListName, setNewListName] = useState("");
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const fetchLists = async () => {
    try {
      const data = await listFaceLists();
      if (data && Array.isArray(data.lists)) {
        setFaceLists(data.lists);
      }
    } catch {
      // Quiet fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLists();
  }, []);

  const handleDeleteConfirm = async () => {
    if (!deletingList) return;
    const target = deletingList;
    setDeletingList(null);
    try {
      await deleteFaceList(target.id);
      setFaceLists((prev) => prev.filter((item) => item.id !== target.id));
      onMessage?.("Allow list deleted");
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : "Failed to delete allow list", { variant: "error" });
    }
  };

  const handleRenameList = async (id: string, newName: string) => {
    try {
      const result = await renameFaceList(id, newName);
      setFaceLists((prev) => prev.map((item) => (item.id === id ? result.list : item)));
      setViewingList((prev) => (prev && prev.list.id === id ? { ...prev, list: result.list } : prev));
      onMessage?.("Allow list renamed");
    } catch (err) {
      // Re-throw so InlineRename can display the error and revert input
      throw err;
    }
  };

  const handleTriggerAddFaces = (listId: string) => {
    setAddError(null);
    setRejectedIssues([]);
    setActiveListIdForAdd(listId);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  };

  const handleAddFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    const listId = activeListIdForAdd;
    if (!incoming.length || !listId) return;

    const targetList = faceLists.find((l) => l.id === listId);
    if (!targetList) return;

    const result = addWhitelistFiles([], incoming, MAX_FACE_LIST_FILES, targetList.faceCount);
    setRejectedIssues(result.issues);

    if (result.files.length === 0) {
      return;
    }

    setUploadingListId(listId);
    setAddError(null);
    try {
      const res = await addFacesToList(listId, result.files);
      setFaceLists((prev) => prev.map((item) => (item.id === listId ? res.list : item)));
      setRevision((prev) => prev + 1);
      onMessage?.("Allow list updated");
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add faces to allow list");
    } finally {
      setUploadingListId(null);
    }
  };

  const handleDeleteFace = async (n: number) => {
    if (!viewingList) return;
    const targetListId = viewingList.list.id;
    setAddError(null);
    try {
      const res = await deleteFaceFromList(targetListId, n);
      setRevision((prev) => prev + 1);
      if (!res.list) {
        setFaceLists((prev) => prev.filter((item) => item.id !== targetListId));
        setViewingList(null);
        onMessage?.("Allow list deleted");
      } else {
        const updated = res.list;
        setFaceLists((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        setViewingList((prev) => (prev ? { ...prev, list: updated } : null));
        onMessage?.("Allow list updated");
      }
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to delete face from allow list");
    }
  };

  const handleCreateList = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = newListName.trim();
    if (!trimmed || newFiles.length === 0 || saving) return;

    setSaving(true);
    setFormError(null);
    try {
      const result = await createFaceList(trimmed, newFiles);
      setFaceLists((prev) => [result.list, ...prev]);
      setNewListName("");
      setNewFiles([]);
      onMessage?.("Allow list created");
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Failed to create allow list");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="details-card saved-face-lists-section">
      <div className="saved-face-lists-header">
        <h2>Allow lists</h2>
        <p className="subtitle saved-face-lists-subtitle">
          Reusable allow lists kept under your account until deleted.
        </p>
      </div>

      <input
        ref={fileInputRef}
        hidden
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        onChange={(e) => void handleAddFiles(e)}
      />

      {addError && <Banner variant="error">{addError}</Banner>}
      <RejectedFilesNotice issues={rejectedIssues} onDismiss={() => setRejectedIssues([])} />

      {loading ? (
        <div className="empty-inline">Loading allow lists…</div>
      ) : faceLists.length === 0 ? (
        <div className="empty-dashboard saved-face-lists-empty">
          <span>
            <UserList aria-hidden />
          </span>
          <h3>No allow lists</h3>
          <p>Create an allow list below to reuse reference faces across batches.</p>
        </div>
      ) : (
        <div className="library-grid">
          {faceLists.map((list) => (
            <article key={list.id} className="library-card" aria-label={list.name}>
              <div className="library-card-header">
                <FaceListThumbnails
                  list={list}
                  revision={revision}
                  onSelect={(n) => setViewingList({ list, initialIndex: n })}
                />
                <div className="library-card-body">
                  <InlineRename
                    name={list.name}
                    headingLevel="h3"
                    title="Rename allow list"
                    ariaLabel={`Rename ${list.name}`}
                    onSave={(newName) => handleRenameList(list.id, newName)}
                  />
                  <div className="library-card-meta saved-face-list-card-meta">
                    <span>
                      {list.faceCount} {list.faceCount === 1 ? "file" : "files"}
                    </span>
                    <span>{new Date(list.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="delete-item-button"
                  title="Delete allow list"
                  aria-label={`Delete ${list.name}`}
                  onClick={() => setDeletingList(list)}
                >
                  <Trash aria-hidden />
                </button>
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
                  className="secondary-button"
                  disabled={list.faceCount >= MAX_FACE_LIST_FILES || Boolean(uploadingListId)}
                  title={
                    list.faceCount >= MAX_FACE_LIST_FILES
                      ? `Allow list is full (maximum ${MAX_FACE_LIST_FILES} files)`
                      : undefined
                  }
                  onClick={() => handleTriggerAddFaces(list.id)}
                >
                  {uploadingListId === list.id ? "Adding…" : "Add faces"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <form className="saved-face-lists-form" aria-label="Create allow list" onSubmit={(e) => void handleCreateList(e)}>
        <h3 className="saved-face-lists-form-title">Create an allow list</h3>
        <div className="batch-name-group">
          <label htmlFor="new-face-list-name" className="mini-label">
            Name
          </label>
          <input
            id="new-face-list-name"
            type="text"
            className="text-input space-above-1"
            maxLength={100}
            placeholder="e.g. VIP Team, Family"
            aria-label="Name"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            disabled={saving}
            required
          />
        </div>

        <WhitelistUploader files={newFiles} onChange={setNewFiles} showSavedSelector={false} showSaveAsList={false} />

        {formError && <p className="field-error saved-face-lists-error">{formError}</p>}

        <button
          type="submit"
          className="primary-button saved-face-lists-submit"
          disabled={!newListName.trim() || newFiles.length === 0 || saving}
        >
          {saving ? "Saving…" : "Save list"}
        </button>
      </form>

      <DeleteBatchDialog
        open={Boolean(deletingList)}
        title="Delete this allow list?"
        body="All reference faces in this allow list will be removed from storage immediately. This cannot be undone."
        confirmLabel="Delete allow list"
        onCancel={() => setDeletingList(null)}
        onConfirm={() => void handleDeleteConfirm()}
      />

      {viewingList && (
        <FaceListViewer
          list={viewingList.list}
          initialIndex={viewingList.initialIndex}
          open={true}
          revision={revision}
          onClose={() => setViewingList(null)}
          onDeleteFace={handleDeleteFace}
          onRename={(newName) => handleRenameList(viewingList.list.id, newName)}
        />
      )}
    </section>
  );
}
