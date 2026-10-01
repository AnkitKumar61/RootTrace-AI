import { useState } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { Upload, FileText, RefreshCw } from "lucide-react";
import { useResource } from "../hooks/useResource.js";
import { api, errorMessage } from "../lib/api.js";
import {
  PageHeader,
  Notice,
  Loading,
  Empty,
  Badge,
} from "../components/UI.jsx";
const active = new Set(["UPLOADED", "QUEUED", "PROCESSING"]);
export default function Sources() {
  const { project } = useOutletContext();
  const base = `/projects/${project._id}/sources`;
  const { data, loading, error, reload } = useResource(base, {
    pollWhile: (d) => d.sources.some((s) => active.has(s.status)),
  });
  const [failure, setFailure] = useState("");
  async function retry(id) {
    setFailure("");
    try {
      await api.post(`${base}/${id}/retry`);
      reload();
    } catch (e) {
      setFailure(errorMessage(e));
    }
  }
  return (
    <>
      <PageHeader
        eyebrow={project.name}
        title="Sources"
        description="Your logs, runbooks, and documentation. Every conclusion starts here."
        action={
          <Link className="button" to={`${base}/upload`}>
            <Upload size={17} />
            Upload source
          </Link>
        }
      />
      <Notice>{error || failure}</Notice>
      {loading ? (
        <Loading />
      ) : data?.sources.length ? (
        <section className="panel table-panel">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Type / size</th>
                  <th>Processing</th>
                  <th>Chunks</th>
                  <th>Added</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.sources.map((source) => (
                  <tr key={source._id}>
                    <td>
                      <div className="source-name">
                        <FileText size={18} />
                        <strong>{source.originalFileName}</strong>
                      </div>
                      {source.processingError && (
                        <div className="inline-error">
                          {source.processingError}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="cell-title">
                        {source.sourceType === "log"
                          ? "Application logs"
                          : "Documentation"}
                      </span>
                      <small>{(source.fileSize / 1024).toFixed(1)} KB</small>
                    </td>
                    <td>
                      <Badge value={source.status} />
                      {active.has(source.status) && (
                        <>
                          <div
                            className="progress"
                            role="progressbar"
                            aria-label={`${source.originalFileName} processing`}
                            aria-valuenow={source.processingProgress}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          >
                            <span
                              style={{ width: `${source.processingProgress}%` }}
                            />
                          </div>
                          <small>
                            {source.processingStage} ·{" "}
                            {source.processingProgress}%
                          </small>
                        </>
                      )}
                    </td>
                    <td className="mono">{source.chunkCount || "—"}</td>
                    <td>
                      <small>
                        {new Date(source.createdAt).toLocaleDateString()}
                      </small>
                    </td>
                    <td>
                      {source.status === "FAILED" && (
                        <button
                          className="button secondary small"
                          onClick={() => retry(source._id)}
                        >
                          <RefreshCw size={14} />
                          Retry
                        </button>
                      )}
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
            title="Add your engineering evidence"
            description="Upload a log file or document. Sources are indexed in the background so you can keep working."
            action={
              <Link className="button" to={`${base}/upload`}>
                <Upload size={16} />
                Upload your first source
              </Link>
            }
          />
        )
      )}
      <p className="help-note">
        Supported formats: .log, .txt, .json, .md · Active sources update
        automatically.
      </p>
    </>
  );
}
