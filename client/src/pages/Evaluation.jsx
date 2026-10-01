import { useState, useEffect } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { api, errorMessage } from "../lib/api.js";
import { useResource } from "../hooks/useResource.js";
import {
  PageHeader,
  Notice,
  Loading,
  Badge,
  Field,
} from "../components/UI.jsx";
const percentage = (v) =>
  v == null ? "Not measured" : `${(v * 100).toFixed(1)}%`;
export default function Evaluation() {
  const { project } = useOutletContext();
  const base = `/projects/${project._id}/evaluation`;
  const dataset = useResource(`${base}/dataset`),
    history = useResource(base, {
      pollWhile: (d) => d.runs.some((r) => r.status === "RUNNING"),
    });
  const [selected, setSelected] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [detailLoading, setDetailLoading] = useState(false);
  const newestId = history.data?.runs[0]?._id;
  useEffect(() => {
    const controller = new AbortController();
    if (newestId && !selected) {
      setDetailLoading(true);
      api
        .get(`${base}/${newestId}`, { signal: controller.signal })
        .then((r) => setSelected(r.data.run))
        .catch((e) => {
          if (e.code !== "ERR_CANCELED") setError(errorMessage(e));
        })
        .finally(() => setDetailLoading(false));
    }
    return () => controller.abort();
  }, [newestId, selected, base]);
  async function select(id) {
    setDetailLoading(true);
    try {
      setSelected((await api.get(`${base}/${id}`)).data.run);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setDetailLoading(false);
    }
  }
  async function run(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const response = await api.post(
        base,
        {
          topK: Number(form.get("topK")),
          includeReports: form.get("includeReports") === "on",
        },
        { timeout: 320000 },
      );
      setSelected(response.data.run);
      history.reload();
    } catch (e) {
      setError(errorMessage(e));
      history.reload();
    } finally {
      setBusy(false);
    }
  }
  const result = selected?.result;
  return (
    <>
      <PageHeader
        eyebrow={`${project.name} / EVALUATION`}
        title="Retrieval evaluation"
        description="Measure evidence retrieval against 15 fictional ShopFlow incidents."
      />
      <Notice>{error || dataset.error || history.error}</Notice>
      <section className="panel">
        <h2>ShopFlow benchmark</h2>
        <p>
          Upload the files in <code>demo-data/logs</code> and{" "}
          <code>demo-data/docs</code> to this project. Ground truth is kept
          outside the investigation prompt.
        </p>
        {dataset.loading ? (
          <Loading />
        ) : (
          dataset.data && (
            <>
              <p className="muted">
                Dataset {dataset.data.version} · {dataset.data.totalCases} cases
                · Five incident categories
              </p>
              {dataset.data.missingFiles.length > 0 && (
                <div className="assessment-note">
                  Missing ready sources:{" "}
                  <span className="mono">
                    {dataset.data.missingFiles.join(", ")}
                  </span>
                  .{" "}
                  <Link to={`/projects/${project._id}/sources/upload`}>
                    Upload sources
                  </Link>
                </div>
              )}
            </>
          )
        )}
        <form onSubmit={run} className="evaluation-controls">
          <Field label="Top-K">
            <select name="topK" defaultValue={8}>
              {[3, 5, 8, 12, 20, 30].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <label className="checkbox-label">
            <input type="checkbox" name="includeReports" />
            Include report and citation checks{" "}
            <small>Uses additional provider quota.</small>
          </label>
          <button
            className="button"
            disabled={
              busy ||
              dataset.loading ||
              !!dataset.data?.missingFiles.length ||
              history.data?.runs.some((r) => r.status === "RUNNING")
            }
          >
            {busy ? "Evaluating…" : "Run evaluation"}
          </button>
        </form>
        {busy && (
          <Loading label="Evaluating cases. This may take several minutes…" />
        )}
      </section>
      {detailLoading && <Loading />}
      {selected && (
        <>
          <div className="section-heading">
            <h2>Run results</h2>
            <Badge value={selected.status} />
          </div>
          <Notice>{selected.failureMessage}</Notice>
          {result && (
            <>
              <p className="muted">
                {result.completedCases} / {result.totalCases} cases completed ·{" "}
                {result.failedCases} failed · Top-K {result.topK}. Aggregate
                retrieval metrics use completed cases only.
              </p>
              <div className="stats-grid">
                {[
                  ["Hit Rate@K", result.hitRate],
                  ["Recall@K", result.recall],
                  ["Precision@K", result.precision],
                  ["Citation validity", result.citationValidity],
                ].map(([label, value]) => (
                  <div className="stat-card metric" key={label}>
                    <div>{label}</div>
                    <strong>{percentage(value)}</strong>
                  </div>
                ))}
              </div>
              <div className="assessment-note">
                Project isolation:{" "}
                {result.isolation.violations === 0
                  ? "No violations detected"
                  : "Violations detected"}{" "}
                across {result.isolation.checkedEvidence} retrieved records.
                Citation checks:{" "}
                {result.includeReports
                  ? `${result.citationCount} references checked.`
                  : "Not run for this retrieval-only evaluation."}
              </div>
              <div className="panel table-panel table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Case</th>
                      <th>Category</th>
                      <th>Hit</th>
                      <th>Recall</th>
                      <th>Precision</th>
                      <th>Report</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.cases.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <strong className="cell-title">{c.title}</strong>
                          <small className="mono">{c.id}</small>
                          <details>
                            <summary>Ground truth</summary>
                            <p>{c.knownCause}</p>
                            <small>
                              {c.expectedEvidenceIds.length} expected chunk(s);{" "}
                              {c.retrievedEvidenceIds?.length || 0} retrieved.
                            </small>
                          </details>
                          {c.error && (
                            <div className="inline-error">{c.error}</div>
                          )}
                        </td>
                        <td>{c.category}</td>
                        <td>
                          {c.status === "FAILED" ? (
                            <Badge value="FAILED" />
                          ) : c.hit ? (
                            "Yes"
                          ) : (
                            "No"
                          )}
                        </td>
                        <td>{percentage(c.recall)}</td>
                        <td>{percentage(c.precision)}</td>
                        <td>
                          {c.evidenceSufficiency ? (
                            <Badge value={c.evidenceSufficiency} />
                          ) : result.includeReports ? (
                            "Unavailable"
                          ) : (
                            "Not run"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
      <section className="panel">
        <h2>Evaluation history</h2>
        {history.loading ? (
          <Loading />
        ) : history.data?.runs.length ? (
          <div className="history-list">
            {history.data.runs.map((r) => (
              <div key={r._id}>
                <div className="actions">
                  <Badge value={r.status} />
                  <small>
                    {new Date(r.createdAt).toLocaleString()} · Top-K {r.topK}
                  </small>
                </div>
                <button
                  className="button secondary small"
                  onClick={() => select(r._id)}
                >
                  View results
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p>No evaluation runs yet.</p>
        )}
      </section>
    </>
  );
}
