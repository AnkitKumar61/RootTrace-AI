import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
  Plus,
  FileText,
  TriangleAlert,
  Activity,
  CheckCircle2,
} from "lucide-react";
import { useResource } from "../hooks/useResource.js";
import { api, errorMessage } from "../lib/api.js";
import {
  PageHeader,
  Loading,
  Notice,
  Badge,
  Field,
  Submit,
  Empty,
} from "../components/UI.jsx";
export default function Dashboard() {
  const { project, reloadProject } = useOutletContext();
  const { data, loading, error } = useResource(
    `/projects/${project._id}/dashboard`,
    { pollWhile: (d) => d.activeWork },
  );
  const [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  const base = `/projects/${project._id}`;
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setFailure("");
    try {
      await api.patch(base, Object.fromEntries(new FormData(e.currentTarget)));
      setEditing(false);
      reloadProject();
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (
      !window.confirm(
        `Delete ${project.name} and all its sources, incidents, and reports?`,
      )
    )
      return;
    setBusy(true);
    try {
      await api.delete(base);
    } catch (e) {
      setFailure(errorMessage(e));
    } finally {
      reloadProject();
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow="PROJECT OVERVIEW"
        title={project.name}
        description={
          project.description || "Your evidence and incident workspace."
        }
        action={
          <div className="actions">
            <Link className="button secondary" to={`${base}/sources/upload`}>
              <Plus size={16} />
              Add source
            </Link>
            <Link className="button" to={`${base}/incidents/new`}>
              <Plus size={16} />
              New incident
            </Link>
          </div>
        }
      />
      <Notice>{failure || error}</Notice>
      {editing && (
        <section className="panel form-panel">
          <h2>Project settings</h2>
          <form onSubmit={save}>
            <Field label="Project name">
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                defaultValue={project.name}
              />
            </Field>
            <Field label="Description">
              <textarea
                name="description"
                maxLength={2000}
                defaultValue={project.description}
              />
            </Field>
            <div className="actions">
              <Submit busy={busy}>Save changes</Submit>
              <button
                className="button secondary"
                type="button"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}
      {loading ? (
        <Loading />
      ) : (
        data && (
          <>
            <div className="stats-grid">
              {[
                [
                  FileText,
                  "Sources",
                  Object.values(data.sources).reduce((a, b) => a + b, 0),
                ],
                [CheckCircle2, "Ready", data.sources.READY || 0],
                [
                  Activity,
                  "Processing",
                  (data.sources.QUEUED || 0) +
                    (data.sources.PROCESSING || 0) +
                    (data.sources.UPLOADED || 0),
                ],
                [TriangleAlert, "Failed", data.sources.FAILED || 0],
              ].map(([Icon, label, value]) => (
                <div className="stat-card" key={label}>
                  <div>
                    <span>{label}</span>
                    <Icon size={18} />
                  </div>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            {data.sources.FAILED > 0 && (
              <div className="assessment-note">
                {data.sources.FAILED} source(s) failed processing.{" "}
                <Link to={`${base}/sources`}>Review failures and retry</Link>.
              </div>
            )}
            <div className="dashboard-grid">
              <section className="panel">
                <div className="section-heading">
                  <h2>
                    Recent incidents{" "}
                    <span className="muted">({data.incidentCount})</span>
                  </h2>
                  <Link to={`${base}/incidents`}>View all</Link>
                </div>
                {data.incidents.length ? (
                  <div className="dashboard-list">
                    {data.incidents.map((i) => (
                      <Link to={`${base}/incidents/${i._id}`} key={i._id}>
                        <div>
                          <strong>{i.title}</strong>
                          <small>
                            {i.affectedService || "Service unspecified"}
                          </small>
                        </div>
                        <Badge value={i.status} />
                      </Link>
                    ))}
                  </div>
                ) : (
                  <Empty
                    title="No incidents yet"
                    description="Describe a failure to investigate it against your project sources."
                    action={
                      <Link
                        className="button secondary"
                        to={`${base}/incidents/new`}
                      >
                        Create incident
                      </Link>
                    }
                  />
                )}
              </section>
              <section className="panel">
                <h2>Recent investigations</h2>
                {data.recentInvestigations.length ? (
                  <div className="dashboard-list">
                    {data.recentInvestigations.map((r) => (
                      <div key={r._id}>
                        <div>
                          <strong>{r.incidentId?.title || "Incident"}</strong>
                          <small>
                            {new Date(r.createdAt).toLocaleString()}
                          </small>
                          {r.status === "COMPLETED" && (
                            <Link
                              to={`${base}/incidents/${r.incidentId?._id}/reports/${r._id}`}
                            >
                              Open report
                            </Link>
                          )}
                        </div>
                        <Badge value={r.evidenceSufficiency || r.status} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p>
                    Saved reports will appear here after your first
                    investigation.
                  </p>
                )}
              </section>
            </div>
          </>
        )
      )}
      <footer className="project-settings">
        <button
          className="button secondary small"
          disabled={busy}
          onClick={() => setEditing(!editing)}
        >
          Edit project
        </button>
        <button
          className="button danger small"
          disabled={busy}
          onClick={remove}
        >
          Delete project
        </button>
      </footer>
    </>
  );
}
