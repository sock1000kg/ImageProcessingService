/**
 * Not-found route fallback page component.
 */
import { useNavigate } from "react-router-dom";
import { StackIcon } from "@phosphor-icons/react";

/**
 * 404 error page displayed when a requested frontend route is not matched.
 */
export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <section className="empty-dashboard">
      <span>
        <StackIcon aria-hidden />
      </span>
      <h3>Page not found</h3>
      <button type="button" className="primary-button" onClick={() => navigate("/")}>
        Return to Overview
      </button>
    </section>
  );
}
