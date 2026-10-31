/**
 * Batch creation page route hosting the dropzone, redaction configuration, and upload monitor.
 */
import { useNavigate } from "react-router-dom";
import { BatchCreateForm } from "../components/BatchCreateForm";
import { FormConfig } from "../components/RedactionConfigForm";
import { useCreateBatch } from "../hooks/useCreateBatch";
import { UploadProgress } from "../api";

export interface CreateBatchPageProps {
  onMessage?: (message: string) => void;
}

/**
 * Batch upload page component mounted at `/batches/new`.
 */
export function CreateBatchPage({ onMessage }: CreateBatchPageProps = {}) {
  const navigate = useNavigate();
  const { busy, error, create, startWithoutThem } = useCreateBatch();

  const handleCreate = async (
    files: File[],
    whitelist: File[],
    config: FormConfig,
    onProgress?: (progress: UploadProgress) => void,
    existingBatchId?: string,
    name?: string,
  ) => {
    const result = await create(files, whitelist, config, onProgress, existingBatchId, name);
    if (result && result.failed.length === 0) {
      onMessage?.("Batch created successfully");
      navigate(`/batches/${result.batch.id}`);
    }
    return result;
  };

  const handleStartWithoutThem = async (batchId: string) => {
    const startedBatch = await startWithoutThem(batchId);
    onMessage?.("Batch created successfully");
    navigate(`/batches/${startedBatch.id}`);
  };

  return (
    <section className="page-section">
      <BatchCreateForm
        busy={busy}
        error={error}
        onSubmit={handleCreate}
        onStartWithoutFailed={handleStartWithoutThem}
      />
    </section>
  );
}
