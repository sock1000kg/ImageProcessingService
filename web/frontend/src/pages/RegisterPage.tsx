import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function RegisterPage() {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registerKey, setRegisterKey] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signUp(email, password, registerKey);
      navigate("/");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to register");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-card" aria-labelledby="register-title">
      <p className="section-kicker">Team accounts</p>
      <h2 id="register-title">Register</h2>
      <form className="auth-form" onSubmit={(event) => void submit(event)}>
        <label htmlFor="register-email">Email</label>
        <input
          id="register-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
        <label htmlFor="register-password">Password</label>
        <input
          id="register-password"
          type="password"
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <label htmlFor="register-key">Registration key</label>
        <input
          id="register-key"
          type="password"
          autoComplete="off"
          value={registerKey}
          onChange={(event) => setRegisterKey(event.target.value)}
          required
        />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary-button" type="submit" disabled={busy}>
          {busy ? "Creating account…" : "Create account"}
        </button>
      </form>
      <p className="auth-link">
        Already registered? <Link to="/login">Sign in</Link>
      </p>
    </section>
  );
}
