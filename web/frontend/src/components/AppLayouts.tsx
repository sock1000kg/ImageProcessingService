/**
 * Layout components splitting the application shell into dedicated authentication
 * and authenticated workspace environments, plus the initial session loading state.
 */
import { Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Banner } from "./ui/Banner";
import { SyncStatus } from "./SyncStatus";
import { ThemeToggle } from "./ui/ThemeToggle";
import { BATCH_SYNC_MS, STATS_SYNC_MS, useSyncStatus } from "../sync";

/**
 * Shared brand mark and wordmark rendered across auth and workspace shells.
 */
function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">✦</span>
      <span>
        Redact<span>Funnel</span>
      </span>
    </div>
  );
}

/**
 * Topbar header component reflecting the active view's context and sync telemetry.
 * Keeps batch name out of h1 and hides the subtitle when empty.
 */
function Topbar() {
  const location = useLocation();
  const syncStatus = useSyncStatus();
  const isCreate = location.pathname === "/batches/new";
  const isRerun = Boolean(location.pathname.match(/^\/batches\/[^/]+\/rerun$/));
  const isLibrary = location.pathname === "/library";
  const isOverview = location.pathname === "/";
  const isBatch = Boolean(location.pathname.match(/^\/batches\/[^/]+$/) && !isCreate);

  const syncIntervalMs = isBatch ? BATCH_SYNC_MS : isOverview ? STATS_SYNC_MS : null;

  const title = isRerun
    ? "Rerun batch"
    : isCreate
      ? "Create a batch"
      : isLibrary
        ? "Media library"
        : isBatch
          ? "Batch review"
          : "Your privacy workspace";

  const subtitle = isRerun
    ? "Rerun a batch with different configs"
    : isCreate
      ? "Configure redaction once. Workers handle the rest asynchronously."
      : isLibrary
        ? "Manage stored originals, completed results, and account storage."
        : isBatch
          ? ""
          : "Monitor processing and review protected media in one place.";

  return (
    <header className="topbar">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      <div className="topbar-actions">
        {syncIntervalMs !== null && syncStatus !== "lost" && (
          <span className="last-sync">{`Live sync · ${syncIntervalMs / 1000}s`}</span>
        )}
      </div>
    </header>
  );
}

interface SidebarProps {
  activeBatchId: string | null;
}

/**
 * Sidebar navigation hosting main route links and pinned user footer.
 */
function Sidebar({ activeBatchId }: SidebarProps) {
  const { user, signOut } = useAuth();

  return (
    <aside className="sidebar">
      <Brand />
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
      <footer className="sidebar-footer">
        <div className="sidebar-divider" />
        <div className="sidebar-footer-row">
          {user && (
            <span className="user-email" title={user.email}>
              {user.email}
            </span>
          )}
          <ThemeToggle />
        </div>
        {user && (
          <button type="button" className="secondary-button" onClick={() => void signOut()}>
            Sign out
          </button>
        )}
      </footer>
    </aside>
  );
}

/**
 * Layout wrapping authentication routes (/login, /register).
 * Redirects authenticated users to the workspace root to avoid dead ends,
 * and renders a standalone auth shell without sidebar, topbar, toast or sync indicators.
 */
export function AuthLayout() {
  const { status } = useAuth();

  if (status === "authenticated") {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="auth-shell">
      <div className="auth-theme-toggle">
        <ThemeToggle />
      </div>
      <Brand />
      <Outlet />
    </div>
  );
}

export interface WorkspaceLayoutProps {
  message: {
    text: string;
    variant: "success" | "error";
    id: number;
  } | null;
  onDismiss: () => void;
}

/**
 * Layout wrapping authenticated workspace routes.
 * Redirects unauthenticated visitors to /login, and hosts the sidebar,
 * topbar, contextual flash notices, and background sync indicator.
 */
export function WorkspaceLayout({ message, onDismiss }: WorkspaceLayoutProps) {
  const { status } = useAuth();
  const location = useLocation();

  if (status !== "authenticated") {
    return <Navigate to="/login" replace />;
  }

  const batchMatch = location.pathname.match(/^\/batches\/([^/]+)$/);
  const activeBatchId = batchMatch && batchMatch[1] !== "new" ? batchMatch[1] : null;

  return (
    <div className="app-shell">
      <Sidebar activeBatchId={activeBatchId} />
      <main className="workspace">
        <Topbar />
        {/* Render overlay toast wrapper so transient confirmations take no layout space and avoid page jumps */}
        {message && (
          <div className="toast">
            <Banner variant={message.variant} role={message.variant === "error" ? "alert" : "status"}>
              <span>{message.text}</span>
              {message.variant === "error" && (
                <button type="button" className="icon-button" aria-label="Dismiss" onClick={onDismiss}>
                  ×
                </button>
              )}
            </Banner>
          </div>
        )}
        <SyncStatus />
        <Outlet />
      </main>
    </div>
  );
}

/**
 * Loading splash view displayed while determining authentication status.
 * Replaces the empty viewer placeholder with centered session status copy.
 */
export function SessionSplash() {
  return <div className="session-splash">Checking session…</div>;
}
