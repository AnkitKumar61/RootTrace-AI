import { useState } from "react";
import { Link, useParams, useOutletContext } from "react-router-dom";
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
  if (loading) return <Loading />;
  if (error) return <Notice>{error}</Notice>;
  const { incident } = data;
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
          <button className="button secondary" onClick={toggle}>
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
          Index your logs and documentation to prepare the evidence for this
          incident.
        </p>
        <Link
          className="button secondary"
          to={`/projects/${project._id}/sources`}
        >
          View sources
        </Link>
      </div>
    </>
  );
}
