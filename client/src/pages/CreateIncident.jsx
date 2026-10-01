import { useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { api, errorMessage } from "../lib/api.js";
import { PageHeader, Notice, Field, Submit } from "../components/UI.jsx";
export default function CreateIncident() {
  const { project } = useOutletContext();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    for (const field of ["startTime", "endTime"]) {
      if (data[field]) data[field] = new Date(data[field]).toISOString();
      else delete data[field];
    }
    try {
      const r = await api.post(`/projects/${project._id}/incidents`, data);
      navigate(`/projects/${project._id}/incidents/${r.data.incident._id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow={project.name}
        title="Create incident"
        description="Describe what happened. Add enough context to guide evidence retrieval."
      />
      <section className="panel form-panel">
        <Notice>{error}</Notice>
        <form onSubmit={submit}>
          <Field label="Incident title">
            <input
              name="title"
              placeholder="Checkout requests timing out"
              required
              minLength={3}
              maxLength={200}
            />
          </Field>
          <Field label="Symptoms and context">
            <textarea
              name="description"
              placeholder="What failed, how users were affected, and what you have observed…"
              required
              minLength={10}
              maxLength={6000}
            />
          </Field>
          <Field
            label="Affected service"
            hint="Optional. Related services can still appear in the investigation."
          >
            <input
              name="affectedService"
              placeholder="checkout-service"
              maxLength={120}
            />
          </Field>
          <div className="form-grid">
            <Field label="Start time (optional)">
              <input type="datetime-local" name="startTime" />
            </Field>
            <Field label="End time (optional)">
              <input type="datetime-local" name="endTime" />
            </Field>
          </div>
          <div className="actions">
            <Submit busy={busy}>Create incident</Submit>
            <Link
              className="button secondary"
              to={`/projects/${project._id}/incidents`}
            >
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </>
  );
}
