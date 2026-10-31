/**
 * Active batch workspace page route displaying batch status, images, review telemetry, and reports.
 */
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { BatchDetails } from "../components/BatchDetails";
import { Banner } from "../components/ui/Banner";
import { useBatch } from "../hooks/useBatch";

export interface BatchPageProps {
  onMessage?: (message: string) => void;
  onRegisterRefresh?: (handler: (() => Promise<void> | void) | null) => void;
}

/**
 * Batch inspection and reporting page component mounted at `/batches/:id`.
 */
export function BatchPage({ onMessage, onRegisterRefresh }: BatchPageProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { batch, loading, error, refreshBatch, removeBatch } = useBatch(id, onMessage);

  // Register the active batch refresh handler with the Topbar while batch is mounted
  useEffect(() => {
    if (batch && onRegisterRefresh) {
      onRegisterRefresh(refreshBatch);
      return () => {
        onRegisterRefresh(null);
      };
    }
  }, [batch, refreshBatch, onRegisterRefresh]);

  const handleDelete = async () => {
    const deleted = await removeBatch();
    if (deleted) {
      onMessage?.("Batch deleted");
      navigate("/");
    }
  };

  if (loading && !batch) {
    return <div className="viewer-empty">Loading batch details…</div>;
  }

  if (error || !batch) {
    return (
      <div className="page-section">
        <Banner variant="error">{error ?? "Batch not found"}</Banner>
      </div>
    );
  }

  return (
    <div className="page-section">
      <BatchDetails
        batch={batch}
        onRefresh={refreshBatch}
        onDelete={handleDelete}
        onMessage={onMessage ?? (() => {})}
      />
    </div>
  );
}
