import { useState, type ReactNode } from "react";
import { ApiError } from "../api/client";
import type { Resource } from "../api/useResource";

const statusClass: Record<string, string> = {
  SUCCEEDED: "ok",
  READY_FOR_BUILD: "ok",
  BUILD_AND_PUSH_CONFIGURED: "ok",
  True: "ok",
  terminated: "neutral",
  FAILED: "bad",
  BLOCKED: "bad",
  BLOCKED_CONFLICT: "bad",
  False: "bad",
  RUNNING: "run",
  PROVISIONING: "run",
  Unknown: "run",
  running: "run",
  PENDING: "idle",
  WAITING_FOR_AUTHORIZATION: "idle",
  AUTHORIZATION_REQUIRED: "idle",
  waiting: "idle",
};

const statusIcon: Record<string, string> = { ok: "✓", bad: "✕", run: "⟳", idle: "○", neutral: "•" };

export function statusKind(status: string | undefined): string {
  return (status && statusClass[status]) || "neutral";
}

export function StatusBadge({ status, label }: { status: string | undefined; label?: string }) {
  const kind = statusKind(status);
  return (
    <span className={`badge badge-${kind}`} data-status={status ?? ""}>
      <span aria-hidden="true">{statusIcon[kind]}</span> {label ?? humanize(status ?? "unknown")}
    </span>
  );
}

// newestFirst orders a sequence the Tenant CP returns in time order (steps,
// attempts, TaskRuns) latest first: what happened last is on top.
export function newestFirst<T>(xs: T[]): T[] {
  return [...xs].reverse();
}

// humanize turns an enum (BUILD_APPLICATION, RUNNING) into words; unknown
// values (future step types) render the same way, never hidden.
export function humanize(s: string): string {
  const words = s.replace(/[_-]+/g, " ").toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function Head12({ revision, head12 }: { revision: string; head12?: string }) {
  return (
    <code className="head12" title={revision}>
      {head12 ?? revision.slice(0, 12)}
    </code>
  );
}

export function Time({ at }: { at: string | null | undefined }) {
  if (!at) return <span className="muted">—</span>;
  const d = new Date(at);
  return <time dateTime={at} title={d.toISOString()}>{d.toLocaleString()}</time>;
}

export function Duration({ seconds }: { seconds: number | null | undefined }) {
  if (seconds === null || seconds === undefined) return <span className="muted">—</span>;
  if (seconds < 60) return <span>{seconds.toFixed(1)} s</span>;
  const m = Math.floor(seconds / 60);
  return (
    <span>
      {m} min {Math.round(seconds - m * 60)} s
    </span>
  );
}

export function Copy({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="copy">
      <code>{label ?? text}</code>
      <button
        type="button"
        className="link-button"
        aria-label={`Copy ${label ?? text}`}
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => setCopied(true));
        }}
      >
        {copied ? "copied" : "copy"}
      </button>
    </span>
  );
}

// ExternalLink opens a canonical URL the Tenant CP gave (Forgejo, the
// template catalog) in a new tab, without an opener.
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export function ErrorBox({ error }: { error: Error }) {
  let text = error.message;
  if (error instanceof ApiError) {
    text =
      error.status === 404
        ? "Not found, or not yours."
        : error.code === "tekton_unavailable"
          ? "Tekton could not be read right now."
          : `The Tenant Control Plane answered ${error.status} (${error.code}).`;
  }
  return (
    <div className="error" role="alert">
      {text}
    </div>
  );
}

// Loaded renders a resource's loading, error, empty and success states.
export function Loaded<T>({
  resource,
  empty,
  children,
}: {
  resource: Resource<T>;
  empty?: (d: T) => boolean;
  children: (d: T) => ReactNode;
}) {
  if (resource.error && !resource.data) return <ErrorBox error={resource.error} />;
  if (!resource.data) return <p className="muted" role="status">Loading…</p>;
  if (empty && empty(resource.data)) return <p className="muted empty">Nothing here yet.</p>;
  return <>{children(resource.data)}</>;
}

export function RefreshButton({ resource }: { resource: Resource<unknown> }) {
  return (
    <button type="button" className="refresh" onClick={resource.reload} disabled={resource.loading}>
      {resource.loading ? "Refreshing…" : "Refresh"}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// ComingLater marks read-only metadata the Tenant CP does not read yet.
export function ComingLater({ what }: { what: string }) {
  return <p className="coming-later">{what} — coming later</p>;
}
