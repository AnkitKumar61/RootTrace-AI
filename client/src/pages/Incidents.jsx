import { Link, useOutletContext } from "react-router-dom";
import { Plus, ArrowUpRight } from "lucide-react";
import { useResource } from "../hooks/useResource.js";
import {
  PageHeader,
  Notice,
  Loading,
  Empty,
  Badge,
} from "../components/UI.jsx";
export default function Incidents() {
  const { project } = useOutletContext();
  const base = `/projects/${project._id}/incidents`;
  const { data, loading, error } = useResource(base);
  return (
    <>
      <PageHeader
        eyebrow={project.name}
        title="Incidents"
        description="Investigate failures with the context your backend deserves."
        action={
          <Link className="button" to={`${base}/new`}>
            <Plus size={17} />
            New incident
          </Link>
        }
      />
      <Notice>{error}</Notice>
      {loading ? (
        <Loading />
      ) : data?.incidents.length ? (
        <section className="panel table-panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Incident</th>
                  <th>Affected service</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.incidents.map((incident) => (
                  <tr key={incident._id}>
                    <td>
                      <Link
                        className="cell-title strong"
                        to={`${base}/${incident._id}`}
                      >
                        {incident.title}
                      </Link>
                      <small className="truncate">{incident.description}</small>
                    </td>
                    <td className="mono">
                      {incident.affectedService || "Unspecified"}
                    </td>
                    <td>
                      <Badge value={incident.status} />
                    </td>
                    <td>
                      <small>
                        {new Date(incident.createdAt).toLocaleDateString()}
                      </small>
                    </td>
                    <td>
                      <Link
                        to={`${base}/${incident._id}`}
                        aria-label={`Open ${incident.title}`}
                      >
                        <ArrowUpRight size={17} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        !error && (
          <Empty
            title="Ready when something breaks"
            description="Describe the symptoms, affected service, and time window. RootTrace will investigate using your indexed sources."
            action={
              <Link className="button" to={`${base}/new`}>
                <Plus size={16} />
                Create an incident
              </Link>
            }
          />
        )
      )}
    </>
  );
}
