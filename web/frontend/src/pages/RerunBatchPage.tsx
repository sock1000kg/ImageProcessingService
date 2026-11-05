/**
 * Batch re-run page route enabling reprocessing from stored originals with updated redaction configurations.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getBatch, rerunBatch } from "../api";
import { BatchCreateForm } from "../components/BatchCreateForm";
import { batchConfigToFormConfig, FormConfig } from "../components/RedactionConfigForm";
import { Banner } from "../components/ui/Banner";
import { Batch } from "../types";

export interface RerunBatchPageProps {
  onMessage?: (message: string) => void;
}

/**
 * Loads an existing batch and presents the creation form in re-run mode to trigger reprocessing.
 */
export function RerunBatchPage({ onMessage }: RerunBatchPageProps = {}) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [sourceBatch, setSourceBatch] = useState<Batch | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError("");
    void getBatch(id)
      .then((res) => {
        setSourceBatch(res.batch);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load source batch");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  const handleRerunSubmit = async (whitelist: File[], config: FormConfig, name?: string, faceListId?: string) => {
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      const result = await rerunBatch(id, whitelist, config, name, faceListId);
      if (result.skipped > 0) {
        onMessage?.(`Batch created successfully (${result.skipped} skipped)`);
      } else {
        onMessage?.("Batch created successfully");
      }
      navigate(`/batches/${result.batch.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to re-run batch");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <section className="page-section">
        <div className="viewer-empty">Loading batch details…</div>
      </section>
    );
  }

  if (error && !sourceBatch) {
    return (
      <section className="page-section">
        <Banner variant="error">{error}</Banner>
      </section>
    );
  }

  if (!sourceBatch) {
    return (
      <section className="page-section">
        <Banner variant="error">Source batch not found</Banner>
      </section>
    );
  }

  if (sourceBatch.status === "DRAFT" || !sourceBatch.startedAt) {
    return (
      <section className="page-section">
        <Banner variant="error">Batch has not been started yet and cannot be re-run.</Banner>
      </section>
    );
  }

  const initialConfig = batchConfigToFormConfig(sourceBatch.config);
  const initialName = `${sourceBatch.name} (re-run)`.slice(0, 100);

  return (
    <section className="page-section">
      <BatchCreateForm
        busy={busy}
        error={error}
        rerunSource={{
          batchId: sourceBatch.id,
          batchName: sourceBatch.name,
          imageCount: sourceBatch.jobs.length,
          initialConfig,
          initialName,
        }}
        onRerunSubmit={handleRerunSubmit}
      />
    </section>
  );
}
