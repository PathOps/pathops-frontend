import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client";
import type { Resource } from "../api/useResource";
import type { EnvironmentStatus } from "../environment";

const statusClass: Record<string, string> = {
  SUCCEEDED: "ok",
  READY_FOR_BUILD: "ok",
  BUILD_AND_PUSH_CONFIGURED: "ok",
  True: "ok",
  HEALTHY: "ok",
  FAILED: "error",
  UNSTABLE: "error",
  DEGRADED: "error",
  BLOCKED: "error",
  BLOCKED_CONFLICT: "error",
  False: "error",
  RUNNING: "running",
  PROVISIONING: "running",
  Unknown: "running",
  running: "running",
  PROGRESSING: "running",
  IN_PROGRESS: "running",
  DEPLOYING: "running",
  VALIDATING: "running",
  PENDING: "warning",
  CANCELLED: "neutral",
  WAITING_FOR_AUTHORIZATION: "warning",
  AUTHORIZATION_REQUIRED: "warning",
  waiting: "warning",
};

// Status is a status as bold, colored words (Succeeded, Failed, Running...).
export function Status({ status, label }: { status: string | undefined; label?: string }) {
  const kind = (status && statusClass[status]) || "neutral";
  return (
    <strong className={`status-${kind}`} data-status={status ?? ""}>
      {label ?? humanize(status ?? "unknown")}
    </strong>
  );
}

// EnvironmentLabel is an environment (PREFLIGHT, PRODUCTION) as plain words,
// the same wherever one is shown: color is for statuses.
export function EnvironmentLabel({ environment }: { environment: string }) {
  return <span data-environment={environment}>{humanize(environment)}</span>;
}

// EnvironmentState is an environment's derived state and how long it has
// been in it: "Healthy — 2h", "Deploying — 30s"; never deployed, only "Not
// deployed". The Applications list and an Application's header show it alike.
export function EnvironmentState({ status }: { status: EnvironmentStatus }) {
  if (status.state === "NOT_DEPLOYED") return <span className="muted">Not deployed</span>;
  return (
    <>
      <Status status={status.state} /> — <Ago at={status.since} />
    </>
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

// title turns a camelCase name (a Tekton result) into words: "imageDigest"
// is "Image Digest".
// stepTitle is a step type's display name in Title Case (the enum stays
// the API's): BUILD_APPLICATION is Build Application, UPDATE_GITOPS Update
// GitOps; a type it does not know yet, each word capitalized.
export function stepTitle(type: string): string {
  const known: Record<string, string> = {
    BUILD_APPLICATION: "Build Application",
    DEPLOY_PREFLIGHT: "Deploy Preflight",
    DEPLOY_PRODUCTION: "Deploy Production",
    UPDATE_GITOPS: "Update GitOps",
    RECONCILE: "Reconcile",
    VALIDATE: "Validate",
  };
  return known[type] ?? type.toLowerCase().split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

export function title(name: string): string {
  const words = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function Head12({ revision, head12 }: { revision: string; head12?: string }) {
  return <code title={revision}>{head12 ?? revision.slice(0, 12)}</code>;
}

// Short is a long identifier (a digest) shortened, whole on hover.
export function Short({ text }: { text: string }) {
  const short = text.length > 24 ? `${text.slice(0, 11)}…${text.slice(-4)}` : text;
  return <code title={text}>{short}</code>;
}

export function Time({ at }: { at: string | null | undefined }) {
  if (!at) return <span className="muted">—</span>;
  const d = new Date(at);
  return (
    <time dateTime={at} title={d.toISOString()}>
      {d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </time>
  );
}

// useTick renders its component again every interval, so a relative time
// stays current without a reload.
function useTick(ms: number) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

// Ago is how long ago, abbreviated (3s, 5m, 1h, 3d); relative, as a phrase
// ("just now", "5m ago", "1h ago"). The full time on hover.
export function Ago({ at, now, relative = false }: { at: string | null | undefined; now?: number; relative?: boolean }) {
  useTick(30000);
  if (!at) return <span className="muted">—</span>;
  const s = Math.max(0, Math.floor(((now ?? Date.now()) - Date.parse(at)) / 1000));
  const short = s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
  const text = !relative ? short : s < 60 ? "just now" : `${short} ago`;
  return (
    <time dateTime={at} title={new Date(at).toISOString()}>
      {text}
    </time>
  );
}

export function Duration({ seconds }: { seconds: number | null | undefined }) {
  if (seconds === null || seconds === undefined) return <span className="muted">—</span>;
  // Tekton can report a step that ends before it starts (its start comes
  // from the step's entrypoint, its end from the container runtime): 0s.
  if (seconds < 0) return <span title="The reported end precedes the start">0s</span>;
  if (seconds < 60) return <span>{Math.round(seconds)}s</span>;
  const m = Math.floor(seconds / 60);
  return (
    <span>
      {m}m {String(Math.round(seconds - m * 60)).padStart(2, "0")}s
    </span>
  );
}

export function seconds(a: string | null, b: string | null): number | null {
  return a && b ? (Date.parse(b) - Date.parse(a)) / 1000 : null;
}

// Copy is a value with a button that copies it (or text, when shown short).
export function Copy({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <>
      {children ?? <code>{text}</code>} <CopyButton text={text} />
    </>
  );
}

// CopyButton copies text it does not show; label names it for a screen
// reader when the text itself is too long to (a log). "Copied" shows for a
// moment in a small bubble over the button, beside nothing.
export function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(0);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(0), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <span className="copy">
      <button
        type="button"
        aria-label={`Copy ${label ?? text}`}
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => setCopied(Date.now()));
        }}
      >
        ⧉ Copy
      </button>
      {copied > 0 && (
        <span className="copied" role="status">
          Copied
        </span>
      )}
    </span>
  );
}

// ExternalLink opens a canonical URL the Tenant CP gave (Forgejo, the
// template catalog) in a new tab, without an opener.
export function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children} ↗
    </a>
  );
}

// RunLink is a DeliveryRun as #N; BuildLink a Build as #N.
export function RunLink({ appId, id, number }: { appId: string; id: string; number: number }) {
  return <Link to={`/applications/${appId}/deliveries/${id}`}>#{number}</Link>;
}

// DeploymentLink is a Deployment as #N, to its page.
export function DeploymentLink({ appId, id, number }: { appId: string; id: string; number: number }) {
  return <Link to={`/applications/${appId}/deployments/${id}`}>#{number}</Link>;
}

export function BuildLink({ appId, id, number }: { appId: string; id: string; number: number }) {
  return <Link to={`/applications/${appId}/builds/${id}`}>#{number}</Link>;
}

export function ErrorBox({ error }: { error: Error }) {
  let text = error.message;
  if (error instanceof ApiError) {
    text =
      error.status === 404
        ? "Not found, or not yours."
        : error.code === "tekton_unavailable"
          ? "Tekton could not be read right now."
          : `PathOps answered ${error.status} (${error.code}).`;
  }
  return (
    <p className="error" role="alert">
      {text}
    </p>
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
  if (empty && empty(resource.data)) return <p className="muted">Nothing here yet.</p>;
  return <>{children(resource.data)}</>;
}

// Facts is a two-column table of label and value rows.
export function Facts({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <table aria-label={label}>
      <tbody>{children}</tbody>
    </table>
  );
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <tr>
      <th scope="row">{label}</th>
      <td>{children}</td>
    </tr>
  );
}

// NotYet is a section with nothing in it yet: what it holds, and why it is
// empty.
export function NotYet({ title, what, state }: { title: string; what: string; state: string }) {
  return (
    <>
      <h2>{title}</h2>
      <p>{what}</p>
      <p className="muted">{state}</p>
    </>
  );
}

// usePageCursor is the page of a paged list: ?cursor= of the current URL,
// so a page survives a refresh, can be linked and Back returns to the last.
export function usePageCursor(): string {
  const [params] = useSearchParams();
  return params.get("cursor") ?? "";
}

// withCursor is path with the page's cursor, if any.
export function withCursor(path: string, cursor: string): string {
  if (!cursor) return path;
  return `${path}${path.includes("?") ? "&" : "?"}cursor=${encodeURIComponent(cursor)}`;
}

// Pager links a paged list's newer (left) and older (right) pages: links to
// ?cursor=, shown disabled at an end; nothing when the list has one page.
export function Pager({
  label,
  newer,
  older,
  newerLabel = "Previous",
  olderLabel = "Next",
}: {
  label: string;
  newer: string | null;
  older: string | null;
  newerLabel?: string;
  olderLabel?: string;
}) {
  const { pathname } = useLocation();
  if (!newer && !older) return null;
  const to = (c: string) => `${pathname}?cursor=${encodeURIComponent(c)}`;
  return (
    <nav className="pager" aria-label={label}>
      {newer ? <Link to={to(newer)}>← {newerLabel}</Link> : <span aria-disabled="true">← {newerLabel}</span>}
      {older ? <Link to={to(older)}>{olderLabel} →</Link> : <span aria-disabled="true">{olderLabel} →</span>}
    </nav>
  );
}
