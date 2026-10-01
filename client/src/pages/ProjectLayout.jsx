import { Outlet, useParams, Link, useNavigate } from "react-router-dom";
import { useEffect, useRef } from "react";
import { useResource } from "../hooks/useResource.js";
import { Loading, Notice, PageHeader } from "../components/UI.jsx";
import { api } from "../lib/api.js";
export default function ProjectLayout() {
  const { projectId } = useParams();
  const { data, loading, error, errorStatus, reload } = useResource(
    `/projects/${projectId}`,
    { pollWhile: (d) => d.project.status === "DELETING" },
  );
  const deleting = useRef(false);
  const navigate = useNavigate();
  useEffect(() => {
    deleting.current = false;
  }, [projectId]);
  useEffect(() => {
    if (data?.project.status === "DELETING") deleting.current = true;
    if (deleting.current && errorStatus === 404)
      navigate("/projects", { replace: true });
  }, [data, errorStatus, navigate]);
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
