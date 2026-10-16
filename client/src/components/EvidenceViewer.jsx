import { useEffect, useState } from "react";
import { api, errorMessage } from "../lib/api.js";
import { Loading, Notice } from "./UI.jsx";
export default function EvidenceViewer({ evidence, projectId }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
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
          timeout: 15000,
        })
        .then((r) => {
          if (active) setData(r.data);
        })
        .catch((e) => {
          if (active && e.code !== "ERR_CANCELED")
            setError(
              e.response
                ? errorMessage(e)
                : "Cannot load source lines. Check your connection and retry.",
            );
        });
    return () => {
      active = false;
      controller.abort();
    };
  }, [evidence, projectId, attempt]);
  if (!evidence)
    return (
      <div className="panel evidence-viewer">
        <h2>Source lines</h2>
        <p>Select a citation to view the original lines.</p>
      </div>
    );
  return (
    <section className="panel evidence-viewer" aria-label="Source lines">
      <div className="eyebrow">SOURCE LINES</div>
      <h2 className="break-word">{evidence.fileName}</h2>
      <p className="muted">
        Lines {evidence.lineStart}–{evidence.lineEnd}
        {evidence.section && ` · ${evidence.section}`}
      </p>
      <Notice>{error}</Notice>
      {!data && !error && <Loading label="Loading source lines…" />}
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
          <button
            className="button secondary small"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry source lines
          </button>
          <p className="muted help-note">Saved excerpt</p>
          <pre className="excerpt">{evidence.text}</pre>
        </>
      )}
    </section>
  );
}
