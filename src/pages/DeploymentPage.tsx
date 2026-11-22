import { Link, useParams } from "react-router-dom";
import type { DeploymentDetail, DeploymentStep } from "../api/types";
import { running, useResource, type Resource } from "../api/useResource";
import { FailureText } from "../components/execution";
import { Page } from "../components/Page";
import {
  BuildLink,
  Copy,
  CopyButton,
  Duration,
  EnvironmentLabel,
  Fact,
  Facts,
  Loaded,
  RunLink,
  Short,
  Status,
  Time,
  stepTitle,
} from "../components/ui";
import { deployment } from "../live/topics";
import { AppCrumbs, appPath } from "./BuildPage";

// stepPath is the UI path of a Deployment's step.
export function stepPath(appId: string, deploymentId: string, type: string): string {
  return `/applications/${appId}/deployments/${deploymentId}/steps/${type}`;
}

// Steps are a Deployment's own steps in order: Update GitOps, Reconcile
// (Validate later). # is only the step's position; what each step produced
// (GitOps update #N, Reconciliation #N) links its page.
function Steps({ appId, d }: { appId: string; d: DeploymentDetail }) {
  return (
    <div className="scroll">
      <table aria-label="Deployment steps">
        <thead>
          <tr>
            <th>#</th>
            <th>Step</th>
            <th>Status</th>
            <th>Started</th>
            <th>Duration</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {[...d.steps]
            .sort((a, b) => a.position - b.position)
            .map((s: DeploymentStep) => (
              <tr key={s.type}>
                <td>{s.position}</td>
                <td>{stepTitle(s.type)}</td>
                <td>
                  <Status status={s.status} />
                  {s.failure && (
                    <>
                      {" — "}
                      <FailureText failure={s.failure} />
                    </>
                  )}
                </td>
                <td>
                  <Time at={s.startedAt} />
                </td>
                <td>
                  <Duration seconds={s.durationSeconds} />
                </td>
                <td>
                  {s.gitopsUpdate ? (
                    <Link to={stepPath(appId, d.id, s.type)}>GitOps update #{s.gitopsUpdate.number}</Link>
                  ) : s.reconciliation ? (
                    <Link to={stepPath(appId, d.id, s.type)}>Reconciliation #{s.reconciliation.number}</Link>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

// DeploymentPage is one Deployment (by id or number): what it applied where,
// how it went, and its steps. Live: a Deployment's change is its delivery
// run's (DELIVERY_CHANGED).
export function DeploymentPage() {
  const { appId = "", deploymentId = "" } = useParams();
  const r: Resource<DeploymentDetail> = useResource(appPath(appId, `/deployments/${encodeURIComponent(deploymentId)}`), {
    live: (e) => deployment(appId, r.data?.deliveryRunId)(e),
    pollWhile: (d) => running(d.status),
  });
  return (
    <Page crumbs={<AppCrumbs appId={appId} section="deployments" title="Deployments" />}>
      <Loaded resource={r}>
        {(d) => (
          <>
            <h1>Deployment #{d.number}</h1>
            <Facts label="Deployment">
              <Fact label="Environment">
                <EnvironmentLabel environment={d.environment} />
              </Fact>
              <Fact label="Status">
                <Status status={d.status} />
              </Fact>
              {d.failure && (
                <Fact label="Error">
                  <FailureText failure={d.failure} />
                </Fact>
              )}
              <Fact label="Commit">
                <Copy text={d.sourceRevision} />
              </Fact>
              <Fact label="Image">
                <Short text={d.image?.digest ?? d.imageReference} /> <CopyButton text={d.imageReference} label="image reference" />
                {d.build && (
                  <>
                    {" — Build "}
                    <BuildLink appId={appId} id={d.build.id} number={d.build.number} />
                  </>
                )}
              </Fact>
              <Fact label="Tests">{d.tests ? `${d.tests.passed}/${d.tests.total}` : <span className="muted">—</span>}</Fact>
              <Fact label="Delivery">
                <RunLink appId={appId} id={d.deliveryRunId} number={d.deliveryNumber} />
              </Fact>
              <Fact label="Started">
                <Time at={d.startedAt} />
              </Fact>
              <Fact label="Duration">
                <Duration seconds={d.durationSeconds} />
              </Fact>
              <Fact label="GitOps commit">
                {d.gitopsCommit ? (
                  <Copy text={d.gitopsCommit}>
                    <Short text={d.gitopsCommit} />
                  </Copy>
                ) : (
                  <span className="muted">not yet</span>
                )}
              </Fact>
            </Facts>
            <h2>Steps</h2>
            <Steps appId={appId} d={d} />
          </>
        )}
      </Loaded>
    </Page>
  );
}
