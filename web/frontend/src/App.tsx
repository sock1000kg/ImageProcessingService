/**
 * Main application shell hosting global navigation layout, topbar, and routed pages.
 */
import { useCallback, useEffect, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { CreateBatchPage } from "./pages/CreateBatchPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LibraryPage } from "./pages/LibraryPage";
import { BatchPage } from "./pages/BatchPage";
import { RerunBatchPage } from "./pages/RerunBatchPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { Banner } from "./components/ui/Banner";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { BATCH_SYNC_MS, STATS_SYNC_MS } from "./sync";
import { MessageHandler, NoticeOptions } from "./types";

/**
 * Topbar header component reflecting the active view's context and sync telemetry.
 */
function Topbar() {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const isCreate = location.pathname === "/batches/new";
  const isRerun = Boolean(location.pathname.match(/^\/batches\/[^/]+\/rerun$/));
  const isLibrary = location.pathname === "/library";
  const isOverview = location.pathname === "/";
  const isBatch = Boolean(location.pathname.match(/^\/batches\/[^/]+$/) && !isCreate);

  const syncIntervalMs = isBatch ? BATCH_SYNC_MS : isOverview ? STATS_SYNC_MS : null;

  return (
    <header className="topbar">
      <div>
        <h1>
          {isRerun
            ? "Rerun batch"
            : isCreate
              ? "Create a batch"
              : isLibrary
                ? "Media library"
                : "Your privacy workspace"}
        </h1>
        <p className="subtitle">
          {isRerun
            ? "Rerun a batch with different configs"
            : isCreate
              ? "Configure redaction once. Workers handle the rest asynchronously."
              : isLibrary
                ? "Manage stored originals, completed results, and account storage."
                : "Monitor processing and review protected media in one place."}
        </p>
      </div>
      <div className="topbar-actions">
        {syncIntervalMs !== null && <span className="last-sync">{`Live sync · ${syncIntervalMs / 1000}s`}</span>}
        {user && (
          <>
            <span className="user-email">{user.email}</span>
            <button type="button" className="secondary-button" onClick={() => void signOut()}>
              Sign out
            </button>
          </>
        )}
      </div>
    </header>
  );
}

/**
 * Primary App component providing sidebar navigation, contextual notifications, and routed pages.
 */
export function App() {
  return (
    <AuthProvider>
      <AuthenticatedApp />
    </AuthProvider>
  );
}

const MESSAGE_TIMEOUT_MS = 3000;

type NoticeState = {
  text: string;
  variant: "success" | "error";
  id: number;
};

function AuthenticatedApp() {
  const { status } = useAuth();
  const location = useLocation();
  // The id makes a repeated message ("Batch renamed" twice) restart the timer instead of being ignored.
  const [message, setMessageState] = useState<NoticeState | null>(null);
  const setMessage: MessageHandler = useCallback((text: string, options?: NoticeOptions) => {
    setMessageState(
      text
        ? {
            text,
            variant: options?.variant ?? "success",
            id: Date.now(),
          }
        : null,
    );
  }, []);

  // Notices like "Batch renamed" are confirmations, not state: hide them after a few seconds.
  // Error notices stay until dismissed.
  useEffect(() => {
    if (!message || message.variant !== "success") return;
    const timer = setTimeout(() => setMessageState(null), MESSAGE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [message]);

  if (status === "loading") return <div className="viewer-empty">Checking session…</div>;

  const batchMatch = location.pathname.match(/^\/batches\/([^/]+)$/);
  const activeBatchId = batchMatch && batchMatch[1] !== "new" ? batchMatch[1] : null;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">✦</span>
          <span>
            Redact<span>Funnel</span>
          </span>
        </div>
        <nav>
          <NavLink to="/" end className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`.trim()}>
            ⌂ <span>Overview</span>
          </NavLink>
          <NavLink to="/library" className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`.trim()}>
            🗂 <span>Library</span>
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
      </aside>

      <main className="workspace">
        <Topbar />
        {/* Render overlay toast wrapper so transient confirmations take no layout space and avoid page jumps */}
        {message && (
          <div className="toast">
            <Banner variant={message.variant} role={message.variant === "error" ? "alert" : "status"}>
              <span>{message.text}</span>
              {message.variant === "error" && (
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Dismiss"
                  onClick={() => setMessageState(null)}
                >
                  ×
                </button>
              )}
            </Banner>
          </div>
        )}
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardPage onMessage={setMessage} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/library"
            element={
              <ProtectedRoute>
                <LibraryPage onMessage={setMessage} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/batches/new"
            element={
              <ProtectedRoute>
                <CreateBatchPage onMessage={setMessage} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/batches/:id/rerun"
            element={
              <ProtectedRoute>
                <RerunBatchPage onMessage={setMessage} />
              </ProtectedRoute>
            }
          />
          <Route
            path="/batches/:id"
            element={
              <ProtectedRoute>
                <BatchPage onMessage={setMessage} />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
    </div>
  );
}

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { status } = useAuth();
  return status === "authenticated" ? children : <Navigate to="/login" replace />;
}
