import { useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { Upload } from "lucide-react";
import { api, errorMessage } from "../lib/api.js";
import { Field, Notice, PageHeader, Submit } from "../components/UI.jsx";
import { useResource } from "../hooks/useResource.js";
export default function UploadSource() {
  const { project } = useOutletContext();
  const navigate = useNavigate();
  const configuration = useResource("/health/config");
  const maximum = configuration.data?.maxFileSizeMB ?? 20;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [filename, setFilename] = useState("");
  async function submit(event) {
    event.preventDefault();
    setError("");
    const data = new FormData(event.currentTarget);
    const file = data.get("file");
    if (file.size > maximum * 1024 * 1024) {
      setError(`Choose a file smaller than ${maximum} MB.`);
      return;
    }
    setBusy(true);
    try {
      await api.post(`/projects/${project._id}/sources`, data);
      navigate(`/projects/${project._id}/sources`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        eyebrow={project.name}
        title="Upload source"
        description="Bring the context your investigation needs."
      />
      <section className="panel form-panel">
        <Notice>{error}</Notice>
        <form onSubmit={submit}>
          <Field label="Source type">
            <select name="sourceType">
              <option value="log">Application logs</option>
              <option value="document">Documentation or runbook</option>
            </select>
          </Field>
          <label className="upload-zone">
            <Upload size={28} />
            <strong>{filename || "Choose a text file"}</strong>
            <span>.log, .txt, .json, .md · Maximum {maximum} MB</span>
            <input
              type="file"
              name="file"
              aria-label="Source file"
              accept=".log,.txt,.json,.md"
              required
              onChange={(e) => setFilename(e.target.files[0]?.name || "")}
            />
          </label>
          <p className="help-note">
            Processing starts in the background after upload. You can track
            progress and retry failures from Sources.
          </p>
          <div className="actions">
            <Submit busy={busy}>Upload and process</Submit>
            <Link
              className="button secondary"
              to={`/projects/${project._id}/sources`}
            >
              Cancel
            </Link>
          </div>
        </form>
      </section>
    </>
  );
}
