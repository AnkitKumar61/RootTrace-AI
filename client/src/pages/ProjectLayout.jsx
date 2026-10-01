import { Outlet, useParams, Link } from "react-router-dom";
import { useResource } from "../hooks/useResource.js";
import { Loading, Notice, PageHeader } from "../components/UI.jsx";
import { api } from "../lib/api.js";
export default function ProjectLayout() {
  const { projectId } = useParams();
  const { data, loading, error, reload } = useResource(
    `/projects/${projectId}`,
    { pollWhile: (d) => d.project.status === "DELETING" },
  );
  if (loading) return <Loading />;
  if (error)
    return (
      <>
        <Notice>{error}</Notice>
        <Link to="/projects">Back to projects</Link>
      </>
    );
  if (data.project.status === "DELETING")
    return (
      <>
        <PageHeader
          title={data.project.name}
          description="Project actions are disabled while files, vectors, and records are removed."
        />
        <div className="panel">
          <h2>Deleting project</h2>
          <Loading label="Cleanup in progress…" />
          <Notice>{data.project.cleanupError}</Notice>
          {data.project.cleanupError && (
            <button
              className="button secondary"
              onClick={async () => {
                await api.delete(`/projects/${projectId}`).catch(() => {});
                reload();
              }}
            >
              Retry cleanup
            </button>
          )}
          <Link className="button secondary" to="/projects">
            Back to projects
          </Link>
        </div>
      </>
    );
  return <Outlet context={{ project: data.project, reloadProject: reload }} />;
}
