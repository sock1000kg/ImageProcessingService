/**
 * Not-found route fallback page component.
 */
import { useNavigate } from "react-router-dom";

/**
 * 404 error page displayed when a requested frontend route is not matched.
 */
export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <section className="empty-dashboard">
      <span>✦</span>
      <h3>Page not found</h3>
      <p>The page you are looking for does not exist.</p>
      <button type="button" className="primary-button" onClick={() => navigate("/")}>
        Return to Overview
      </button>
    </section>
  );
}
