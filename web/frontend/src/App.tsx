/**
 * Main application shell hosting global navigation layout, topbar, and routed pages.
 */
import { useState } from "react";
import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import { CreateBatchPage } from "./pages/CreateBatchPage";
import { DashboardPage } from "./pages/DashboardPage";
import { BatchPage } from "./pages/BatchPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { Banner } from "./components/ui/Banner";

interface TopbarProps {
  onRefresh?: (() => Promise<void> | void) | null;
}

/**
 * Topbar header component reflecting the active view's context and refresh action.
 */
function Topbar({ onRefresh }: TopbarProps) {
  const location = useLocation();
  const isCreate = location.pathname === "/batches/new";

  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">
          Cloud-native privacy service <span className="eyebrow-dot" />
        </p>
        <h1>{isCreate ? "Create a secure batch" : "Your privacy workspace"}</h1>
        <p className="subtitle">
          {isCreate
            ? "Configure redaction once. Workers handle the rest asynchronously."
            : "Monitor processing and review protected media in one place."}
        </p>
      </div>
      <div className="topbar-actions">
        <span className="last-sync">Live sync · 3s</span>
        {typeof onRefresh === "function" && (
          <button type="button" className="secondary-button" onClick={() => void onRefresh()}>
            Refresh
          </button>
        )}
        <div className="avatar">PC</div>
      </div>
    </header>
  );
}

/**
 * Primary App component providing sidebar navigation, contextual notifications, and routed pages.
 */
export function App() {
  const location = useLocation();
  const [message, setMessage] = useState<string>("");
  const [refreshHandler, setRefreshHandler] = useState<(() => Promise<void> | void) | null>(null);

  // Store function reference safely without triggering React's functional updater pattern
  const handleRegisterRefresh = (handler: (() => Promise<void> | void) | null) => {
    setRefreshHandler(() => handler);
  };

  const batchMatch = location.pathname.match(/^\/batches\/([^/]+)$/);
  const activeBatchId = batchMatch && batchMatch[1] !== "new" ? batchMatch[1] : null;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">✦</span>
          <span>
            Privacy<span>Cloud</span>
          </span>
        </div>
        <nav>
          <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`.trim()}>
            ⌂ <span>Overview</span>
          </NavLink>
          <NavLink to="/batches/new" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`.trim()}>
            ＋ <span>New batch</span>
          </NavLink>
          {activeBatchId && (
            <NavLink
              to={`/batches/${activeBatchId}`}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`.trim()}
            >
              ▦ <span>Batch details</span>
            </NavLink>
          )}
        </nav>
        <div className="sidebar-footer">
          <span className="online-dot" /> Service operational
        </div>
      </aside>

      <main className="workspace">
        <Topbar onRefresh={refreshHandler} />
        {message && (
          <Banner variant="success" role="status">
            {message}
          </Banner>
        )}
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/batches/new" element={<CreateBatchPage onMessage={setMessage} />} />
          <Route
            path="/batches/:id"
            element={<BatchPage onMessage={setMessage} onRegisterRefresh={handleRegisterRefresh} />}
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  );
}
