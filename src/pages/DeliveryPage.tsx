import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import type { BuildDetail, DeliveryDetail, DeliveryStep } from "../api/types";
import { running, useResource } from "../api/useResource";
import { Copy, Duration, Head12, Loaded, RefreshButton, StatusBadge, Time, humanize } from "../components/ui";
import { PipelineRunFields, TaskRunList } from "./BuildPage";

interface Node {
  key: string;
  kind: "commit" | "event" | "step" | "output";
  status?: string;
  title: ReactNode;
  summary: ReactNode;
  details: ReactNode;
}

// timeline is what happened to one revision, in order: the commit and the
// push that started the run (the webhook is the initiating event, not a
// step), then the run's DeliverySteps as the Tenant CP returns them, then
// what they produced. Steps are rendered from the data: a new step type
// (UPDATE_PREFLIGHT_GITOPS, ...) appears with no change here.
export function timeline(appId: string, d: DeliveryDetail): Node[] {
  const nodes: Node[] = [
    {
      key: "commit",
      kind: "commit",
      status: "SUCCEEDED",
      title: (
        <>
          Commit <Head12 revision={d.sourceRevision} head12={d.head12} />
        </>
      ),
      summary: (
        <>
          {d.sourceRepository} · {d.sourceRef}
        </>
      ),
      details: <Copy text={d.sourceRevision} />,
    },
    {
      key: "event",
      kind: "event",
      status: "SUCCEEDED",
      title: <>Push received</>,
      summary: <Time at={d.createdAt} />,
      details: (
        <>
          Webhook delivery <code className="small">{d.webhookDeliveryId || "—"}</code> · delivery run <Copy text={d.id} />
        </>
      ),
    },
  ];
  for (const s of [...d.steps].sort((a, b) => a.position - b.position)) {
    nodes.push(stepNode(appId, s));
  }
  const image = d.build?.image ?? d.steps.find((s) => s.build?.image)?.build?.image ?? null;
  if (image) {
    nodes.push({
      key: "image",
      kind: "output",
      status: "SUCCEEDED",
      title: (
        <>
          OCI image <code className="small">{image.revision}</code>
        </>
      ),
      summary: <code className="small">{image.reference}</code>,
      details: (
        <dl>
          <div className="field">
            <dt>Digest</dt>
            <dd>
              <Copy text={image.digest} />
            </dd>
          </div>
          <div className="field">
            <dt>Pinned</dt>
            <dd>
              <Copy text={image.pinnedReference} label="repository@digest" />
            </dd>
          </div>
        </dl>
      ),
    });
  } else if (d.status === "FAILED") {
    nodes.push({
      key: "image",
      kind: "output",
      status: "FAILED",
      title: <>No image</>,
      summary: <span className="muted">The build failed: nothing was published.</span>,
      details: d.sanitizedError ? <p className="error-text">{d.sanitizedError}</p> : null,
    });
  } else if (running(d.status)) {
    nodes.push({
      key: "image",
      kind: "output",
      status: "PENDING",
      title: <>Image</>,
      summary: <span className="muted">Not built yet.</span>,
      details: null,
    });
  }
  return nodes;
}

function stepNode(appId: string, s: DeliveryStep): Node {
  return {
    key: s.id,
    kind: "step",
    status: s.status,
    title: (
      <>
        {humanize(s.type)} <span className="muted small">({humanize(s.executor)})</span>
      </>
    ),
    summary: (
      <>
        <Duration seconds={s.durationSeconds} />
        {s.sanitizedError && <span className="error-text"> · {s.sanitizedError}</span>}
      </>
    ),
    details: (
      <>
        <dl>
          <div className="field">
            <dt>Started</dt>
            <dd>
              <Time at={s.startedAt} />
            </dd>
          </div>
          <div className="field">
            <dt>Completed</dt>
            <dd>
              <Time at={s.completedAt} />
            </dd>
          </div>
          {s.externalRef && (
            <div className="field">
              <dt>Execution</dt>
              <dd>
                <code className="small">{s.externalRef}</code>
              </dd>
            </div>
          )}
          {s.build && (
            <div className="field">
              <dt>Build</dt>
              <dd>
                <Link to={`/applications/${appId}/builds/${s.build.id}`}>
                  <code>{s.build.id}</code>
                </Link>{" "}
                <StatusBadge status={s.build.status} />
              </dd>
            </div>
          )}
        </dl>
        {s.build && s.status === "FAILED" && <BuildTree appId={appId} buildId={s.build.id} />}
      </>
    ),
  };
}

// BuildTree is a failed step's build as a tree: the Build, its PipelineRun
// and its TaskRuns, each with its logs.
function BuildTree({ appId, buildId }: { appId: string; buildId: string }) {
  const b = useResource<BuildDetail>(`/api/v1/builds/${encodeURIComponent(buildId)}`, { pollWhile: (d) => running(d.status) });
  return (
    <Loaded resource={b}>
      {(d) => (
        <ul className="tree" aria-label="Build tree">
          <li>
            <span className="tree-label">
              Build{" "}
              <Link to={`/applications/${appId}/builds/${d.id}`}>
                <code>{d.id}</code>
              </Link>{" "}
              <StatusBadge status={d.status} />
            </span>
            {d.sanitizedError && <p className="error-text">{d.sanitizedError}</p>}
            <ul>
              <li>
                <span className="tree-label">
                  PipelineRun{" "}
                  <code className="small">
                    {d.pipelineRun.namespace}/{d.pipelineRun.name}
                  </code>
                </span>
                <dl>
                  <PipelineRunFields build={d} />
                </dl>
                <ul>
                  <li>
                    <span className="tree-label">TaskRuns</span>
                    <TaskRunList buildId={d.id} buildRunning={running(d.status)} />
                  </li>
                </ul>
              </li>
            </ul>
          </li>
        </ul>
      )}
    </Loaded>
  );
}

export function DeliveryPage() {
  const { appId = "", runId = "" } = useParams();
  const r = useResource<DeliveryDetail>(`/api/v1/applications/${encodeURIComponent(appId)}/deliveries/${encodeURIComponent(runId)}`, {
    pollWhile: (d) => running(d.status),
  });
  // A failed step starts open; a click toggles any node.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  return (
    <main>
      <p className="crumbs">
        <Link to={`/applications/${appId}/deliveries`}>← Delivery runs</Link>
      </p>
      <Loaded resource={r}>
        {(d) => (
          <>
            <div className="page-head">
              <h1>
                <Head12 revision={d.sourceRevision} head12={d.head12} /> <StatusBadge status={d.status} />
              </h1>
              <RefreshButton resource={r} />
            </div>
            <p className="muted small">
              Received <Time at={d.createdAt} /> · completed <Time at={d.completedAt} /> · <Duration seconds={d.durationSeconds} />
            </p>
            {d.sanitizedError && <p className="error" role="alert">{d.sanitizedError}</p>}
            <ol className="timeline" aria-label="Delivery timeline">
              {timeline(appId, d).map((n) => {
                const open = toggled[n.key] ?? (n.kind === "step" && n.status === "FAILED");
                return (
                  <li key={n.key} className={`tl-node tl-${n.kind}`} data-kind={n.kind}>
                    <button type="button" className="tl-head" aria-expanded={open} onClick={() => setToggled({ ...toggled, [n.key]: !open })}>
                      <StatusBadge status={n.status} label="" />
                      <span className="tl-title">{n.title}</span>
                    </button>
                    <div className="tl-summary">{n.summary}</div>
                    {open && n.details && <div className="tl-details">{n.details}</div>}
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </Loaded>
    </main>
  );
}
