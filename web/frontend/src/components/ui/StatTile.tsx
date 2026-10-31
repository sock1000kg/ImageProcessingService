/**
 * Shared stat tile component rendering a single metric card.
 * Used consistently in the dashboard overview and batch report.
 */
import React from "react";

export interface StatTileProps {
  label: string;
  value: number | string;
}

/**
 * Renders a label and value formatted as a dashboard / report metric tile.
 */
export function StatTile({ label, value }: StatTileProps) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
