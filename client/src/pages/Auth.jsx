import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { GitBranch } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import { api, errorMessage } from "../lib/api.js";
import { Field, Notice, Submit } from "../components/UI.jsx";
export default function Auth({ register = false }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      if (register) {
        await api.post("/auth/register", values);
        navigate("/login", { state: { registered: true } });
      } else {
        await login(values);
        navigate("/projects");
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <Link className="brand" to="/">
          <GitBranch />
          RootTrace
        </Link>
        <div>
          <div className="eyebrow">INCIDENT ANALYSIS</div>
          <h1>
            Investigate incidents.
            <br />
            Review the evidence.
          </h1>
          <p>Analyze logs and documents to investigate application failures.</p>
        </div>
        <small>Review the evidence before confirming a cause.</small>
      </section>
      <main className="auth-form">
        <div className="auth-form-inner">
          <div className="eyebrow">ACCOUNT ACCESS</div>
          <h1>{register ? "Create account" : "Sign in"}</h1>
          <p>
            {register
              ? "Register to create projects."
              : "Access your projects and reports."}
          </p>
          {location.state?.registered && (
            <div className="success" role="status">
              Account created. Sign in to continue.
            </div>
          )}
          <Notice>{error}</Notice>
          <form onSubmit={submit}>
            {register && (
              <Field label="Full name">
                <input
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={80}
                />
              </Field>
            )}
            <Field label="Email address">
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                maxLength={254}
              />
            </Field>
            <Field
              label="Password"
              hint={register ? "At least 10 characters." : ""}
            >
              <input
                type="password"
                name="password"
                autoComplete={register ? "new-password" : "current-password"}
                required
                minLength={10}
                maxLength={72}
              />
            </Field>
            <Submit busy={busy}>
              {register ? "Create account" : "Sign in"}
            </Submit>
          </form>
          <p className="auth-switch">
            {register ? "Already have an account?" : "New to RootTrace?"}{" "}
            <Link to={register ? "/login" : "/register"}>
              {register ? "Sign in" : "Create account"}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
