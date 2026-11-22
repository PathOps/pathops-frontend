import { Link, useParams } from "react-router-dom";
import type { DeploymentStepDetail, FluxExecution, Overview, TektonExecution } from "../api/types";
import { running, useResource, type Resource } from "../api/useResource";
import { FailureText, FluxExecutionView, TektonExecutionView } from "../components/execution";
import { Page } from "../components/Page";
import { Copy, Duration, Fact, Facts, Loaded, Short, Status, Time, humanize } from "../components/ui";
import { appPath } from "./BuildPage";

function Sha({ sha }: { sha?: string }) {
  if (!sha) return <span className="muted">not yet</span>;
  return (
    <Copy text={sha}>
      <Short text={sha} />
    </Copy>
  );
}

// DeploymentStepPage is one step of a Deployment (Decision 0066): its
// verdict, its own facts (the GitOpsUpdate's repository, base and resulting
// commit; the Reconciliation's target) and its Execution as PathOps
// recorded it (Tekton: PipelineRun -> TaskRuns -> Steps, logs live; Flux:
// the GitRepository and Kustomization snapshots). Live with its
// Deployment's run; read again every few seconds while it runs.
export function DeploymentStepPage() {
  const { appId = "", deploymentId = "", type = "" } = useParams();
  const o = useResource<Overview>(appPath(appId, "/overview"));
  const base = `/deployments/${encodeURIComponent(deploymentId)}/steps/${encodeURIComponent(type)}`;
  const r: Resource<DeploymentStepDetail> = useResource(appPath(appId, base), {
    live: (e) => e.type === "DELIVERY_CHANGED" && e.applicationId === appId,
    pollWhile: (d) => running(d.status),
  });
  return (
    <Page
      crumbs={
        <>
          {" / "}
          <Link to={`/applications/${appId}`}>{o.data?.name ?? "Application"}</Link>
          {" / "}
          <Link to={`/applications/${appId}/deployments`}>Deployments</Link>
          {r.data && (
            <>
              {" / "}
              <Link to={`/applications/${appId}/deployments/${r.data.deploymentId}`}>#{r.data.deploymentNumber}</Link>
            </>
          )}
        </>
      }
    >
      <Loaded resource={r}>
        {(d) => (
          <>
            <h1>
              {humanize(d.type)} — Deployment #{d.deploymentNumber}
            </h1>
            <Facts label="Step">
              <Fact label="Status">
                <Status status={d.status} />
              </Fact>
              {d.failure && (
                <Fact label="Error">
                  <FailureText failure={d.failure} />
                </Fact>
              )}
              <Fact label="Started">
                <Time at={d.startedAt} />
              </Fact>
              <Fact label="Completed">
                <Time at={d.completedAt} />
              </Fact>
              <Fact label="Duration">
                <Duration seconds={d.durationSeconds} />
              </Fact>
            </Facts>
            {d.gitopsUpdate && (
              <>
                <h2>GitOps update</h2>
                <Facts label="GitOps update">
                  <Fact label="Repository">{d.gitopsUpdate.repository}</Fact>
                  <Fact label="Base commit">
                    <Sha sha={d.gitopsUpdate.baseCommit} />
                  </Fact>
                  <Fact label="Resulting commit">
                    <Sha sha={d.gitopsUpdate.resultingCommit} />
                  </Fact>
                </Facts>
              </>
            )}
            {d.reconciliation && (
              <>
                <h2>Reconciliation</h2>
                <Facts label="Reconciliation">
                  <Fact label="Target revision">
                    <Sha sha={d.reconciliation.targetRevision} />
                  </Fact>
                </Facts>
              </>
            )}
            {!d.execution ? (
              <p className="muted">No execution yet.</p>
            ) : d.execution.executor === "FLUX" ? (
              <>
                <h2>Flux</h2>
                <FluxExecutionView x={d.execution as FluxExecution} />
              </>
            ) : (
              <>
                <h2>PipelineRun</h2>
                <TektonExecutionView
                  x={d.execution as TektonExecution}
                  logPath={(tr, step) => appPath(appId, `${base}/tasks/${encodeURIComponent(tr)}/logs?step=${encodeURIComponent(step)}`)}
                />
              </>
            )}
          </>
        )}
      </Loaded>
    </Page>
  );
}
