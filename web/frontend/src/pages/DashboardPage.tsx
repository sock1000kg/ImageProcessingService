/**
 * Dashboard page route displaying global system statistics and creation trigger.
 */
import { useNavigate } from "react-router-dom";
import { Dashboard } from "../components/Dashboard";
import { useSystemStats } from "../hooks/useSystemStats";
import { MessageHandler } from "../types";

export interface DashboardPageProps {
  onMessage?: MessageHandler;
}

/**
 * Overview dashboard page component mounted at `/`.
 */
export function DashboardPage({ onMessage }: DashboardPageProps = {}) {
  const navigate = useNavigate();
  const { stats } = useSystemStats();

  return <Dashboard stats={stats} onCreate={() => navigate("/batches/new")} onMessage={onMessage} />;
}
