import { Batch } from "../types";
type Props = { stats: Record<string, number>; batch: Batch | null; onCreate: () => void };
export function Dashboard({ stats, batch, onCreate }: Props) {
  const total = Object.values(stats).reduce((sum, value) => sum + value, 0);
  return <section className="dashboard"><div className="welcome-card"><div><span className="section-kicker">PRIVACY WORKSPACE</span><h2>Keep every image private.</h2><p>Redact faces and license plates in secure, asynchronous batches.</p></div><button className="primary-button" onClick={onCreate}>Create new batch <span>→</span></button></div><div className="stats-grid compact-stats"><div><span>Jobs processed</span><strong>{total}</strong></div><div><span>In progress</span><strong>{(stats.PROCESSING ?? 0) + (stats.QUEUED ?? 0)}</strong></div><div><span>Completed</span><strong>{stats.COMPLETED ?? 0}</strong></div><div><span>Needs attention</span><strong>{stats.FAILED ?? 0}</strong></div></div>{!batch && <div className="empty-dashboard"><span>✦</span><h3>Your workspace is ready</h3><p>Create a batch to start protecting your media.</p></div>}</section>;
}
