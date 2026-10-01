import { useState } from "react";
import {
  Link,
  useParams,
  useOutletContext,
  useNavigate,
} from "react-router-dom";
import { useResource } from "../hooks/useResource.js";
import { api, errorMessage } from "../lib/api.js";
import { PageHeader, Loading, Notice, Badge } from "../components/UI.jsx";
export default function IncidentDetails() {
  const { project } = useOutletContext();
  const { incidentId } = useParams();
  const { data, loading, error, reload } = useResource(
    `/incidents/${incidentId}`,
  );
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const history = useResource(`/incidents/${incidentId}/investigations`, {
    pollWhile: (d) => d.investigations.some((i) => i.status === "RUNNING"),
  });
  if (loading) return <Loading />;
  if (error) return <Notice>{error}</Notice>;
  const { incident } = data;
  if (String(incident.projectId) !== project._id)
    return <Notice>Incident not found in this project.</Notice>;
  async function investigate() {
    setFailure("");
    setBusy(true);
    try {
      const response = await api.post(
        `/incidents/${incidentId}/investigate`,
        {},
        { timeout: 150000 },
      );
      navigate(
        `/projects/${project._id}/incidents/${incidentId}/reports/${response.data.investigation._id}`,
      );
    } catch (e) {
      setFailure(errorMessage(e));
      history.reload();
    } finally {
      setBusy(false);
    }
  }
  async function toggle() {
    try {
      await api.patch(`/incidents/${incidentId}`, {
        status: incident.status === "OPEN" ? "RESOLVED" : "OPEN",
      });
      reload();
    } catch (e) {
      setFailure(errorMessage(e));
    }
  }
  return (
    <>
      <PageHeader
        eyebrow={`${project.name} / INCIDENT`}
        title={incident.title}
        action={
          <button className="button secondary" onClick={toggle} disabled={busy}>
            {incident.status === "OPEN" ? "Mark resolved" : "Reopen incident"}
          </button>
        }
      />
      <Notice>{failure}</Notice>
      <div className="panel">
        <div className="actions">
          <Badge value={incident.status} />
          <span className="mono muted">
            {incident.affectedService || "Service unspecified"}
          </span>
        </div>
        <p className="incident-description">{incident.description}</p>
        {incident.startTime && (
          <small>
            Incident window: {new Date(incident.startTime).toLocaleString()}
            {incident.endTime &&
              ` — ${new Date(incident.endTime).toLocaleString()}`}
          </small>
        )}
      </div>
      <div className="panel">
        <h2>Investigation</h2>
        <p>
          Retrieve ready project sources and produce an evidence-backed report.
          Reports remain available here for comparison.
        </p>
        <div className="actions">
          <button
            className="button"
            onClick={investigate}
            disabled={
              busy ||
              history.data?.investigations.some((i) => i.status === "RUNNING")
            }
          >
            {busy ? "Investigating…" : "Investigate incident"}
          </button>
          <Link
            className="button secondary"
            to={`/projects/${project._id}/sources`}
          >
            View sources
          </Link>
        </div>
        {busy && (
          <Loading label="Retrieving evidence and validating the report…" />
        )}
      </div>
      <section className="panel">
        <h2>Investigation history</h2>
        <Notice>{history.error}</Notice>
        {history.loading ? (
          <Loading />
        ) : history.data?.investigations.length ? (
          <div className="history-list">
            {history.data.investigations.map((r) => (
              <div key={r._id}>
                <div className="actions">
                  <Badge value={r.status} />
                  {r.evidenceSufficiency && (
                    <Badge value={r.evidenceSufficiency} />
                  )}
                  <small>{new Date(r.createdAt).toLocaleString()}</small>
                </div>
                {r.status === "COMPLETED" ? (
                  <Link
                    to={`/projects/${project._id}/incidents/${incidentId}/reports/${r._id}`}
                  >
                    Open report
                  </Link>
                ) : (
                  <span className="inline-error">
                    {r.failureMessage || "Investigation in progress…"}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p>No investigations yet.</p>
        )}
      </section>
    </>
  );
}
