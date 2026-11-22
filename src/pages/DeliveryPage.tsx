import { Fragment } from "react";
import { useParams } from "react-router-dom";
import type { DeliveryDetail, DeliveryStep } from "../api/types";
import { running, useResource, type Resource } from "../api/useResource";
import { FailureText } from "../components/execution";
import { Page } from "../components/Page";
import { BuildLink, Copy, DeploymentLink, Duration, EnvironmentLabel, Fact, Facts, Loaded, Status, Time, humanize } from "../components/ui";
import { resource } from "../live/topics";
import { AppCrumbs, appPath } from "./BuildPage";

// StepDetails is where a top-level step's details are: its Build or its
// Deployment (a Deployment's own steps are on its page).
function StepDetails({ appId, s }: { appId: string; s: DeliveryStep }) {
  if (s.build)
    return (
      <>
        Build <BuildLink appId={appId} id={s.build.id} number={s.build.number} />
      </>
    );
  if (s.deployment)
    return (
      <>
        Deployment <DeploymentLink appId={appId} id={s.deployment.id} number={s.deployment.number} /> —{" "}
        <EnvironmentLabel environment={s.deployment.environment} />
      </>
    );
  return <span className="muted">—</span>;
}

// Steps are the run's top-level steps in order (Decision 0066): Build
// application, Deploy preflight, ... as the Tenant CP returns them; a new
// type appears with no change here. A failed step's error is under it.
function Steps({ appId, steps }: { appId: string; steps: DeliveryStep[] }) {
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
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {[...steps]
            .sort((a, b) => a.position - b.position)
            .map((s) => (
              <Fragment key={s.position}>
                <tr>
                  <td>{s.position}</td>
                  <td>{humanize(s.type)}</td>
                  <td>
                    <Status status={s.status} />
                  </td>
                  <td>
                    <Time at={s.startedAt} />
                  </td>
                  <td>
                    <Duration seconds={s.durationSeconds} />
                  </td>
                  <td>
                    <StepDetails appId={appId} s={s} />
                  </td>
                </tr>
                {s.failure && (
                  <tr>
                    <td />
                    <td colSpan={5}>
                      <FailureText failure={s.failure} />
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function Output({ d }: { d: DeliveryDetail }) {
  const image = d.build?.image ?? null;
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
  if (d.status === "FAILED" && !d.build?.image) return <p>No image: the build did not produce one.</p>;
  if (running(d.status)) return <p className="muted">Not built yet.</p>;
  return <p className="muted">No image.</p>;
}

// DeliveryPage is one DeliveryRun (by id or number): one immutable delivery
// attempt of one push. Live: its run's invalidations.
export function DeliveryPage() {
  const { appId = "", runId = "" } = useParams();
  const r: Resource<DeliveryDetail> = useResource(appPath(appId, `/deliveries/${encodeURIComponent(runId)}`), {
    live: (e) => resource("DELIVERY_CHANGED", r.data?.id ?? runId)(e),
  });
  return (
    <Page crumbs={<AppCrumbs appId={appId} section="deliveries" title="Delivery" />}>
      <Loaded resource={r}>
        {(d) => (
          <>
            <h1>Delivery #{d.number}</h1>
            <Facts label="Delivery run">
              <Fact label="Run ID">
                <code>{d.id}</code>
              </Fact>
              <Fact label="Status">
                <Status status={d.status} />
              </Fact>
              {d.failure && (
                <Fact label="Error">
                  <span role="alert">
                    <FailureText failure={d.failure} />
                  </span>
                </Fact>
              )}
              <Fact label="Commit">
                <Copy text={d.sourceRevision} />
              </Fact>
              <Fact label="Source">
                {d.sourceRepository} · {d.sourceRef}
              </Fact>
              <Fact label="Trigger">
                {humanize(d.trigger)} <small className="muted">{d.triggerId}</small>
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
