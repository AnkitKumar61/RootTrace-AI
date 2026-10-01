import { useEffect, useState } from "react";
import { api, errorMessage } from "../lib/api.js";
import { Loading, Notice } from "./UI.jsx";
export default function EvidenceViewer({ evidence, projectId }) {
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    if (evidence)
      api
        .get(`/projects/${projectId}/sources/${evidence.sourceId}/lines`, {
          params: {
            start: Math.max(1, evidence.lineStart - 3),
            limit: Math.min(500, evidence.lineEnd - evidence.lineStart + 7),
          },
          signal: controller.signal,
        })
        .then((r) => setData(r.data))
        .catch((e) => {
          if (e.code !== "ERR_CANCELED") setError(errorMessage(e));
        });
    return () => controller.abort();
  }, [evidence, projectId]);
  if (!evidence)
    return (
      <div className="panel evidence-viewer">
        <h2>Source evidence</h2>
        <p>Select a citation to inspect its original lines.</p>
      </div>
    );
  return (
    <section className="panel evidence-viewer" aria-label="Source evidence">
      <div className="eyebrow">SOURCE EVIDENCE</div>
      <h2 className="break-word">{evidence.fileName}</h2>
      <p className="muted">
        Lines {evidence.lineStart}–{evidence.lineEnd}
        {evidence.section && ` · ${evidence.section}`}
      </p>
      <small>
        Retrieval similarity: {evidence.score.toFixed(3)} · This score measures
        relevance, not certainty.
      </small>
      <Notice>{error}</Notice>
      {!data && !error && <Loading label="Loading original lines…" />}
      {data && (
        <div
          className="source-lines"
          tabIndex={0}
          aria-label="Original source lines"
        >
          {data.lines.map((line) => (
            <div
              key={line.number}
              className={
                line.number >= evidence.lineStart &&
                line.number <= evidence.lineEnd
                  ? "highlight-line"
                  : ""
              }
            >
              <span className="line-number">{line.number}</span>
              <code>{line.text || " "}</code>
            </div>
          ))}
        </div>
      )}
      {error && (
        <>
          <p className="muted">Saved evidence excerpt</p>
          <pre className="excerpt">{evidence.text}</pre>
        </>
      )}
    </section>
  );
}
