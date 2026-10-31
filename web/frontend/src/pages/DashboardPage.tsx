/**
 * Dashboard page route displaying global system statistics and creation trigger.
 */
import { useNavigate } from "react-router-dom";
import { Dashboard } from "../components/Dashboard";
import { useSystemStats } from "../hooks/useSystemStats";

/**
 * Overview dashboard page component mounted at `/`.
 */
export function DashboardPage() {
  const navigate = useNavigate();
  const { stats } = useSystemStats();

  return <Dashboard stats={stats} batch={null} onCreate={() => navigate("/batches/new")} />;
}
