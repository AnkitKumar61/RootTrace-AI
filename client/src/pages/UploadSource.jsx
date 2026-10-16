import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { Upload, LoaderCircle, X } from "lucide-react";
import { api, errorMessage } from "../lib/api.js";
import { Field, Notice, PageHeader } from "../components/UI.jsx";
import { useResource } from "../hooks/useResource.js";
const extensions = /\.(log|txt|json|md)$/i;
const editable = new Set(["pending", "failed", "invalid"]);
function validationError(file, maximum) {
  if (!extensions.test(file.name))
    return "Supported files: .log, .txt, .json, .md.";
  if (!file.size) return "File is empty. Choose a text file.";
  if (file.size > maximum * 1024 * 1024)
    return `File exceeds the ${maximum} MB limit.`;
  return "";
}
function detectedType(file) {
  return /\.(log|json)$/i.test(file.name) ? "log" : "document";
}
const labels = {
  pending: "Selected",
  uploading: "Uploading",
  queued: "Queued",
  failed: "Rejected",
  invalid: "Invalid file",
  saved: "Saved",
  unconfirmed: "Check Sources",
};
export default function UploadSource() {
  const { project } = useOutletContext();
  const navigate = useNavigate();
  const configuration = useResource("/health/config");
  const maximum = configuration.data?.maxFileSizeMB ?? 20;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [files, setFiles] = useState([]),
    [sourceType, setSourceType] = useState("auto");
  const mounted = useRef(false),
    running = useRef(false),
    input = useRef(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function update(id, patch) {
    if (mounted.current)
      setFiles((current) =>
        current.map((entry) =>
          entry.id === id ? { ...entry, ...patch } : entry,
        ),
      );
  }
  function choose(selected) {
    setError("");
    setFiles(
      Array.from(selected).map((file, id) => {
        const message = validationError(file, maximum);
        return {
          id,
          file,
          sourceType: sourceType === "auto" ? detectedType(file) : sourceType,
          status: message ? "invalid" : "pending",
          error: message,
        };
      }),
    );
  }
  function changeType(value) {
    setSourceType(value);
    setFiles((current) =>
      current.map((entry) =>
        editable.has(entry.status)
          ? {
              ...entry,
              sourceType: value === "auto" ? detectedType(entry.file) : value,
            }
          : entry,
      ),
    );
  }
  function remove(id) {
    setFiles((current) => current.filter((entry) => entry.id !== id));
    if (input.current) input.current.value = "";
  }
  const candidates = files.filter(
    (entry) => entry.status === "pending" || entry.status === "failed",
  );
  const queued = files.filter((entry) => entry.status === "queued").length;
  async function submit(event) {
    event.preventDefault();
    if (running.current) return;
    setError("");
    if (!candidates.length) {
      setError("Select at least one valid file to upload.");
      return;
    }
    running.current = true;
    setBusy(true);
    let successful = queued;
    try {
      for (const entry of candidates) {
        if (!mounted.current) break;
        const message = validationError(entry.file, maximum);
        if (message) {
          update(entry.id, { status: "invalid", error: message });
          continue;
        }
        update(entry.id, { status: "uploading", error: "" });
        const data = new FormData();
        data.append("sourceType", entry.sourceType);
        data.append("file", entry.file);
        try {
          await api.post(`/projects/${project._id}/sources`, data);
          successful++;
          update(entry.id, { status: "queued", error: "" });
        } catch (e) {
          const saved = e.response?.data?.error?.code === "QUEUE_UNAVAILABLE";
          const rejected =
            e.response?.status >= 400 && e.response?.status < 500;
          update(entry.id, {
            status: saved ? "saved" : rejected ? "failed" : "unconfirmed",
            error: saved
              ? "File saved. Retry processing from Sources."
              : rejected
                ? errorMessage(e)
                : "Upload not confirmed. Check Sources before retrying.",
          });
        }
      }
      if (mounted.current && successful === files.length)
        navigate(`/projects/${project._id}/sources`);
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow={project.name}
        title="Upload files"
        description="Select logs and documents to process."
      />
      <section className="panel form-panel">
        <Notice>{error}</Notice>
        <form onSubmit={submit}>
          <Field
            label="File type"
            hint="Set a default or change each file below."
          >
            <select
              name="sourceType"
              aria-label="File type"
              value={sourceType}
              disabled={busy}
              onChange={(e) => changeType(e.target.value)}
            >
              <option value="auto">Automatic</option>
              <option value="log">Logs</option>
              <option value="document">Documents</option>
            </select>
          </Field>
          <label className="upload-zone">
            <Upload size={28} />
            <strong>
              {files.length
                ? `${files.length} file${files.length === 1 ? "" : "s"} selected`
                : "Choose files"}
            </strong>
            <span>.log, .txt, .json, .md · Maximum {maximum} MB per file</span>
            <input
              type="file"
              name="file"
              aria-label="Files"
              accept=".log,.txt,.json,.md"
              multiple
              ref={input}
              disabled={busy}
              onChange={(e) => choose(e.target.files)}
            />
          </label>
          {files.length > 0 && (
            <ul className="upload-file-list" aria-label="Selected files">
              {files.map((entry) => (
                <li key={entry.id}>
                  <div className="upload-file-name">
                    <strong>{entry.file.name}</strong>
                    <small>{(entry.file.size / 1024).toFixed(1)} KB</small>
                  </div>
                  <select
                    aria-label={`File type for ${entry.file.name}`}
                    value={entry.sourceType}
                    disabled={busy || !editable.has(entry.status)}
                    onChange={(e) =>
                      update(entry.id, { sourceType: e.target.value })
                    }
                  >
                    <option value="log">Logs</option>
                    <option value="document">Documents</option>
                  </select>
                  <span
                    className={`upload-file-status upload-file-${entry.status}`}
                  >
                    {entry.status === "uploading" && (
                      <LoaderCircle size={14} className="spin" />
                    )}
                    {labels[entry.status]}
                  </span>
                  {editable.has(entry.status) && (
                    <button
                      type="button"
                      className="icon-button"
                      disabled={busy}
                      aria-label={`Remove ${entry.file.name}`}
                      onClick={() => remove(entry.id)}
                    >
                      <X size={16} />
                    </button>
                  )}
                  {entry.error && (
                    <div className="upload-file-error" role="alert">
                      {entry.error}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {files.length > 0 && (
            <p className="upload-summary" role="status" aria-live="polite">
              {queued} of {files.length} files queued
              {busy ? " · Uploading files…" : ""}
            </p>
          )}
          <p className="help-note">
            Files process automatically after upload. Manage retries in Sources.
          </p>
          <div className="actions">
            <button
              className="button"
              type="submit"
              disabled={busy || !candidates.length}
            >
              {busy && <LoaderCircle size={16} className="spin" />}
              {busy
                ? "Uploading…"
                : candidates.length &&
                    candidates.every((entry) => entry.status === "failed")
                  ? "Retry uploads"
                  : "Upload files"}
            </button>
            {busy ? (
              <span className="muted">Keep this page open during upload.</span>
            ) : (
              <Link
                className="button secondary"
                to={`/projects/${project._id}/sources`}
              >
                {files.some((entry) =>
                  ["queued", "saved", "unconfirmed"].includes(entry.status),
                )
                  ? "View sources"
                  : "Cancel"}
              </Link>
            )}
          </div>
        </form>
      </section>
    </>
  );
}
