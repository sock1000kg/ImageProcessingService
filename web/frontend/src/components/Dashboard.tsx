/**
 * Dashboard overview component displaying workspace welcome banner, system metrics, and saved face lists.
 */
import React from "react";
import { Batch, MessageHandler } from "../types";
import { StatTile } from "./ui/StatTile";
import { SavedFaceListsPanel } from "./SavedFaceListsPanel";
import { ChangePasswordForm } from "./ChangePasswordForm";

export interface DashboardProps {
  stats: Record<string, number>;
  batch?: Batch | null;
  onCreate: () => void;
  onMessage?: MessageHandler;
}

/**
 * Renders the dashboard workspace metrics, quick creation action, and saved face lists panel.
 */
export function Dashboard({ stats, batch, onCreate, onMessage }: DashboardProps) {
  const total = Object.values(stats).reduce((sum, value) => sum + value, 0);

  return (
    <section className="dashboard">
      <div className="welcome-card">
        <div>
          <h2>Keep every image private</h2>
          <p>Redact faces and license plates in secure, asynchronous batches.</p>
        </div>
        <button className="primary-button" onClick={onCreate}>
          Create new batch
        </button>
      </div>

      <div className="stats-grid compact-stats">
        <StatTile label="Your jobs" value={total} />
        <StatTile label="In progress" value={(stats.PROCESSING ?? 0) + (stats.QUEUED ?? 0)} />
        <StatTile label="Completed" value={stats.COMPLETED ?? 0} />
        <StatTile label="Needs attention" value={stats.FAILED ?? 0} />
      </div>

      <SavedFaceListsPanel onMessage={onMessage} />
      <ChangePasswordForm onMessage={onMessage} />
    </section>
  );
}
