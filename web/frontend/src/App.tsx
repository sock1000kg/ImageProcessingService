/**
 * Main application router and state management for user feedback notices.
 */
import { useCallback, useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { CreateBatchPage } from "./pages/CreateBatchPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LibraryPage } from "./pages/LibraryPage";
import { BatchPage } from "./pages/BatchPage";
import { RerunBatchPage } from "./pages/RerunBatchPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { AuthLayout, SessionSplash, WorkspaceLayout } from "./components/AppLayouts";
import { MessageHandler, NoticeOptions } from "./types";

/**
 * Primary App component providing authentication context and root route hierarchy.
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

  if (status === "loading") return <SessionSplash />;

  return (
    <Routes>
      {/* Logged-in users are sent to "/". No sidebar, no topbar. */}
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>

      {/* Logged-out users are sent to "/login". Owns Sidebar, Topbar, toast and SyncStatus. */}
      <Route element={<WorkspaceLayout message={message} onDismiss={() => setMessageState(null)} />}>
        <Route path="/" element={<DashboardPage onMessage={setMessage} />} />
        <Route path="/library" element={<LibraryPage onMessage={setMessage} />} />
        <Route path="/batches/new" element={<CreateBatchPage onMessage={setMessage} />} />
        <Route path="/batches/:id/rerun" element={<RerunBatchPage onMessage={setMessage} />} />
        <Route path="/batches/:id" element={<BatchPage onMessage={setMessage} />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
