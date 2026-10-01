import { LoaderCircle, ArrowRight, FolderPlus } from "lucide-react";
export function Notice({ children }) {
  return children ? (
    <div className="notice" role="alert">
      {children}
    </div>
  ) : null;
}
export function Loading({ label = "Loading workspace…" }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" size={20} />
      {label}
    </div>
  );
}
export function Badge({ value }) {
  return (
    <span className={`badge badge-${String(value).toLowerCase()}`}>
      {String(value).replaceAll("_", " ")}
    </span>
  );
}
export function Empty({ title, description, action }) {
  return (
    <div className="empty">
      <FolderPlus size={34} />
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function PageHeader({ eyebrow, title, description, action }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}
export function Submit({ busy, children }) {
  return (
    <button className="button" disabled={busy} type="submit">
      {busy ? (
        <LoaderCircle className="spin" size={16} />
      ) : (
        <ArrowRight size={16} />
      )}{" "}
      {busy ? "Please wait…" : children}
    </button>
  );
}
export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
