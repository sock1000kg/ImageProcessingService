/**
 * Dashboard overview component displaying workspace welcome banner, system metrics, and empty state.
 */
import React from "react";
import { Batch } from "../types";
import { StatTile } from "./ui/StatTile";

export interface DashboardProps {
  stats: Record<string, number>;
  batch: Batch | null;
  onCreate: () => void;
}

/**
 * Renders the dashboard workspace metrics and navigation prompts.
 */
export function Dashboard({ stats, batch, onCreate }: DashboardProps) {
  const total = Object.values(stats).reduce((sum, value) => sum + value, 0);

  return (
    <section className="dashboard">
      <div className="welcome-card">
        <div>
          <span className="section-kicker">PRIVACY WORKSPACE</span>
          <h2>Keep every image private.</h2>
          <p>Redact faces and license plates in secure, asynchronous batches.</p>
        </div>
        <button className="primary-button" onClick={onCreate}>
          Create new batch <span>→</span>
        </button>
      </div>

      <div className="stats-grid compact-stats">
        <StatTile label="Jobs processed" value={total} />
        <StatTile label="In progress" value={(stats.PROCESSING ?? 0) + (stats.QUEUED ?? 0)} />
        <StatTile label="Completed" value={stats.COMPLETED ?? 0} />
        <StatTile label="Needs attention" value={stats.FAILED ?? 0} />
      </div>

      {!batch && (
        <div className="empty-dashboard">
          <span>✦</span>
          <h3>Your workspace is ready</h3>
          <p>Create a batch to start protecting your media.</p>
        </div>
      )}
    </section>
  );
}
