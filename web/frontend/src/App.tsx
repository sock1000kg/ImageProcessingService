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

interface TopbarProps {
  onRefresh?: (() => Promise<void> | void) | null;
}

/**
 * Topbar header component reflecting the active view's context and refresh action.
 */
function Topbar({ onRefresh }: TopbarProps) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const isCreate = location.pathname === "/batches/new";
  const isLibrary = location.pathname === "/library";

  return (
    <header className="topbar">
      <div>
        <p className="eyebrow">
          Cloud-native privacy service <span className="eyebrow-dot" />
        </p>
        <h1>{isCreate ? "Create a secure batch" : isLibrary ? "Media library" : "Your privacy workspace"}</h1>
        <p className="subtitle">
          {isCreate
            ? "Configure redaction once. Workers handle the rest asynchronously."
            : isLibrary
              ? "Manage stored originals, completed results, and account storage."
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

function AuthenticatedApp() {
  const { status } = useAuth();
  const location = useLocation();
  // The id makes a repeated message ("Batch renamed" twice) restart the timer instead of being ignored.
  const [message, setMessageState] = useState<{ text: string; id: number } | null>(null);
  const setMessage = useCallback((text: string) => setMessageState(text ? { text, id: Date.now() } : null), []);
  const [refreshHandler, setRefreshHandler] = useState<(() => Promise<void> | void) | null>(null);

  // Notices like "Batch renamed" are confirmations, not state: hide them after a few seconds.
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessageState(null), MESSAGE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [message]);

  if (status === "loading") return <div className="viewer-empty">Checking session…</div>;

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
        <div className="sidebar-footer">
          <span className="online-dot" /> Service operational
        </div>
      </aside>

      <main className="workspace">
        <Topbar onRefresh={refreshHandler} />
        {message && (
          <Banner variant="success" role="status">
            {message.text}
          </Banner>
        )}
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardPage />
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
                <BatchPage onMessage={setMessage} onRegisterRefresh={handleRegisterRefresh} />
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
