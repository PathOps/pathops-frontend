import { Fragment, useState } from "react";
import { useParams } from "react-router-dom";
import type { BuildDetail, DeliveryDetail, DeliveryStep } from "../api/types";
import { running, useResource } from "../api/useResource";
import { Page } from "../components/Page";
import {
  BuildLink,
  Copy,
  Duration,
  Fact,
  Facts,
  Loaded,
  RefreshButton,
  Status,
  Time,
  Toolbar,
  humanize,
  newestFirst,
} from "../components/ui";
import { AppCrumbs, PipelineRunFacts, TaskRunList } from "./BuildPage";

// BuildTree is a step's build as a tree: the Build, its PipelineRun and its
// TaskRuns, each step with its log.
function BuildTree({ appId, buildId }: { appId: string; buildId: string }) {
  const b = useResource<BuildDetail>(`/api/v1/builds/${encodeURIComponent(buildId)}`, { pollWhile: (d) => running(d.status) });
  return (
    <Loaded resource={b}>
      {(d) => (
        <ul className="tree" aria-label="Build tree">
          <li>
            Build <BuildLink appId={appId} id={d.id} number={d.number} /> — <Status status={d.status} />
            {d.sanitizedError && <p className="error">{d.sanitizedError}</p>}
            <ul>
              <li>
                PipelineRun
                <PipelineRunFacts build={d} />
                <ul>
                  <li>
                    TaskRuns
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

// Steps are the run's DeliverySteps, latest first, as the Tenant CP returns
// them: a new step type (UPDATE_PREFLIGHT_GITOPS, ...) appears with no change
// here. A failed step starts open on its build tree.
function Steps({ appId, steps }: { appId: string; steps: DeliveryStep[] }) {
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  return (
    <div className="scroll">
      <table aria-label="Delivery steps">
        <thead>
          <tr>
            <th>#</th>
            <th>Step</th>
            <th>Status</th>
            <th>Started</th>
            <th>Duration</th>
            <th>Build</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {newestFirst([...steps].sort((a, b) => a.position - b.position)).map((s) => {
            const open = toggled[s.id] ?? s.status === "FAILED";
            return (
              <Fragment key={s.id}>
                <tr>
                  <td>{s.position}</td>
                  <td>
                    {humanize(s.type)} <small>({humanize(s.executor)})</small>
                  </td>
                  <td>
                    <Status status={s.status} />
                  </td>
                  <td>
                    <Time at={s.startedAt} />
                  </td>
                  <td>
                    <Duration seconds={s.durationSeconds} />
                  </td>
                  <td>{s.build ? <BuildLink appId={appId} id={s.build.id} number={s.build.number} /> : "—"}</td>
                  <td>
                    <button type="button" aria-expanded={open} onClick={() => setToggled({ ...toggled, [s.id]: !open })}>
                      {open ? "Hide" : "Show"}
                    </button>
                  </td>
                </tr>
                {s.sanitizedError && (
                  <tr>
                    <td />
                    <td colSpan={6} className="error">
                      {s.sanitizedError}
                    </td>
                  </tr>
                )}
                {open && (
                  <tr>
                    <td />
                    <td colSpan={6} className="detail">
                      {s.externalRef && (
                        <p>
                          Execution <code>{s.externalRef}</code>
                        </p>
                      )}
                      {s.build ? <BuildTree appId={appId} buildId={s.build.id} /> : !s.externalRef && <span className="muted">No details.</span>}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Output({ d }: { d: DeliveryDetail }) {
  const image = d.build?.image ?? d.steps.find((s) => s.build?.image)?.build?.image ?? null;
  if (image)
    return (
      <Facts label="Image">
        <Fact label="Reference">
          <Copy text={image.reference} />
        </Fact>
        <Fact label="Digest">
          <Copy text={image.digest} />
        </Fact>
        <Fact label="Pinned">
          <Copy text={image.pinnedReference} />
        </Fact>
      </Facts>
    );
  if (d.status === "FAILED") return <p>No image: the run failed, nothing was published.</p>;
  if (running(d.status)) return <p className="muted">Not built yet.</p>;
  return <p className="muted">No image.</p>;
}

export function DeliveryPage() {
  const { appId = "", runId = "" } = useParams();
  const r = useResource<DeliveryDetail>(`/api/v1/applications/${encodeURIComponent(appId)}/deliveries/${encodeURIComponent(runId)}`, {
    pollWhile: (d) => running(d.status),
  });
  return (
    <Page crumbs={<AppCrumbs appId={appId} section="deliveries" title="Delivery" />}>
      <Loaded resource={r}>
        {(d) => (
          <>
            <h1>Delivery #{d.number}</h1>
            <Toolbar actions={<RefreshButton resource={r} />} />
            <Facts label="Delivery run">
              <Fact label="Run ID">
                <code>{d.id}</code>
              </Fact>
              <Fact label="Status">
                <Status status={d.status} />
              </Fact>
              {d.sanitizedError && (
                <Fact label="Error">
                  <span className="error" role="alert">
                    {d.sanitizedError}
                  </span>
                </Fact>
              )}
              <Fact label="Commit">
                <Copy text={d.sourceRevision} />
              </Fact>
              <Fact label="Source">
                {d.sourceRepository} · {d.sourceRef}
              </Fact>
              <Fact label="Push received">
                <Time at={d.createdAt} />
              </Fact>
              <Fact label="Completed">
                <Time at={d.completedAt} />
              </Fact>
              <Fact label="Duration">
                <Duration seconds={d.durationSeconds} />
              </Fact>
              <Fact label="Webhook delivery">{d.webhookDeliveryId || <span className="muted">—</span>}</Fact>
            </Facts>
            <h2>Steps</h2>
            <Steps appId={appId} steps={d.steps} />
            <h2>Image</h2>
            <Output d={d} />
          </>
        )}
      </Loaded>
    </Page>
  );
}
