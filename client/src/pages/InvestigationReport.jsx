import { useState } from "react";
import { Link, useParams, useOutletContext } from "react-router-dom";
import { useResource } from "../hooks/useResource.js";
import { Badge, PageHeader, Loading, Notice } from "../components/UI.jsx";
import EvidenceViewer from "../components/EvidenceViewer.jsx";
export function ReportContent({ report, projectId }) {
  const [selected, setSelected] = useState(null);
  const citations = new Map(
    report.retrievedEvidence.map((e) => [e.evidenceId, e]),
  );
  function citation(id) {
    const e = citations.get(id);
    return (
      e && (
        <button
          key={id}
          className={`citation ${selected?.evidenceId === id ? "selected" : ""}`}
          onClick={() => setSelected(e)}
          aria-label={`View ${e.fileName} lines ${e.lineStart} to ${e.lineEnd}`}
        >
          {e.fileName}{" "}
          <span>
            L{e.lineStart}–{e.lineEnd}
          </span>
        </button>
      )
    );
  }
  return (
    <div className="report-grid">
      <div>
        <section className="panel">
          <div className="report-status">
            <h2>Evidence assessment</h2>
            <Badge value={report.evidenceSufficiency} />
          </div>
          <p>{report.summary}</p>
          {report.evidenceSufficiency !== "SUFFICIENT" && (
            <div className="assessment-note">
              {report.evidenceSufficiency === "PARTIAL"
                ? "Treat these causes as hypotheses. The next checks can confirm or rule them out."
                : "Available evidence cannot establish a cause. Add relevant sources before drawing conclusions."}
            </div>
          )}
          <div className="actions">
            {report.affectedServices.map((s) => (
              <span key={s} className="service-tag mono">
                {s}
              </span>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2>Suspected causes</h2>
          {report.suspectedCauses.length ? (
            report.suspectedCauses.map((c, i) => (
              <article className="cause" key={i}>
                <h3>{c.cause}</h3>
                <p>{c.reasoning}</p>
                <div className="citations">{c.evidenceIds.map(citation)}</div>
              </article>
            ))
          ) : (
            <p>No cause is supported by the available evidence.</p>
          )}
        </section>
        <section className="panel">
          <h2>Next investigation steps</h2>
          <ol className="next-steps">
            {report.nextSteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </section>
        <section className="panel">
          <h2>
            Retrieved evidence{" "}
            <span className="muted">({report.retrievedEvidence.length})</span>
          </h2>
          <p className="muted">
            Retrieval may include contextual or unrelated matches. Conclusions
            cite only their supporting records.
          </p>
          <div className="evidence-list">
            {report.retrievedEvidence.map((e) => citation(e.evidenceId))}
          </div>
        </section>
        <p className="help-note">
          {report.modelInformation.model} · Top-K {report.modelInformation.topK}{" "}
          · Retrieval {report.modelInformation.retrievalDurationMs} ms ·
          Generation {report.modelInformation.generationDurationMs} ms
        </p>
      </div>
      <EvidenceViewer evidence={selected} projectId={projectId} />
    </div>
  );
}
export default function InvestigationReport() {
  const { project } = useOutletContext();
  const { incidentId, reportId } = useParams();
  const { data, loading, error } = useResource(`/investigations/${reportId}`);
  if (loading) return <Loading />;
  if (error) return <Notice>{error}</Notice>;
  const report = data.investigation;
  if (
    String(report.projectId) !== project._id ||
    String(report.incidentId) !== incidentId
  )
    return <Notice>Report not found in this incident.</Notice>;
  return (
    <>
      <PageHeader
        eyebrow={`${project.name} / REPORT`}
        title="Investigation report"
        description={`Saved ${new Date(report.createdAt).toLocaleString()}`}
        action={
          <Link
            className="button secondary"
            to={`/projects/${project._id}/incidents/${incidentId}`}
          >
            Back to incident
          </Link>
        }
      />
      {report.status === "COMPLETED" ? (
        <ReportContent report={report} projectId={project._id} />
      ) : (
        <Notice>
          {report.failureMessage || "This investigation is still running."}
        </Notice>
      )}
    </>
  );
}
