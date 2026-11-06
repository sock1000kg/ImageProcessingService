/**
 * Connection status overlay notifying users when background sync is interrupted or restored.
 */
import { useEffect, useRef, useState } from "react";
import { SyncStatus as SyncState, useSyncStatus } from "../sync";

// Reuse existing 3-second notification timeout
const RECOVERY_TIMEOUT_MS = 3000;

/**
 * Renders a transient bottom-right corner pill reflecting connection loss and recovery.
 *
 * Why: Poll failures reflect backend connectivity rather than user-initiated actions.
 * A non-blocking corner indicator prevents notification alert spam while keeping users informed.
 */
export function SyncStatus() {
  const status = useSyncStatus();
  const prevStatusRef = useRef<SyncState>(status);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    if (prev === "lost" && status === "ok") {
      setRecovering(true);
      const timer = window.setTimeout(() => {
        setRecovering(false);
      }, RECOVERY_TIMEOUT_MS);
      return () => window.clearTimeout(timer);
    } else if (status !== "ok") {
      setRecovering(false);
    }
  }, [status]);

  if (status === "lost") {
    return (
      <div className="sync-status-pill sync-status-lost" role="status">
        Sync lost, retrying…
      </div>
    );
  }

  if (recovering) {
    return (
      <div className="sync-status-pill sync-status-recovered" role="status">
        Back in sync
      </div>
    );
  }

  return null;
}
