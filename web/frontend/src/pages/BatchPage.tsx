/**
 * Active batch workspace page route displaying batch status, images, review telemetry, and reports.
 */
import { useNavigate, useParams } from "react-router-dom";
import { BatchDetails } from "../components/BatchDetails";
import { Banner } from "../components/ui/Banner";
import { useBatch } from "../hooks/useBatch";

export interface BatchPageProps {
  onMessage?: (message: string) => void;
}

/**
 * Batch inspection and reporting page component mounted at `/batches/:id`.
 */
export function BatchPage({ onMessage }: BatchPageProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { batch, loading, error, refreshBatch, removeBatch } = useBatch(id, onMessage);

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
