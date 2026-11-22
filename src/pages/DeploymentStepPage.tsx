import { Link, useParams } from "react-router-dom";
import type { DeploymentStepDetail, FluxExecution, Overview, TektonExecution } from "../api/types";
import { running, useResource, type Resource } from "../api/useResource";
import {
  ExecutionFacts,
  FailureText,
  FluxFacts,
  FluxObjectDetail,
  FullSha,
  PipelineRunFacts,
  TaskRunsDetail,
} from "../components/execution";
import { Page } from "../components/Page";
import { Duration, Fact, Facts, Loaded, Status, Time, stepTitle } from "../components/ui";
import { appPath } from "./BuildPage";

// DeploymentStepPage is one step of a Deployment (Decision 0066), all of
// what PathOps recorded of it, in this order: the step (PathOps' verdict);
// its projection (what PathOps accepted: the GitOps update's repository,
// base and resulting commit; the Reconciliation's target); its Execution
// (what the engine reported: the generic facts first, then the engine's
// own: Tekton's PipelineRun, TaskRuns and Steps with live logs; Flux's
// namespace and baseline, then its GitRepository and Kustomization, each
// its own table). Live with its Deployment's run; read again every few
// seconds while it runs.
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
              {stepTitle(d.type)} — Deployment #{d.deploymentNumber}
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
                <h2>GitOps update #{d.gitopsUpdate.number}</h2>
                <Facts label="GitOps update">
                  <Fact label="Repository">{d.gitopsUpdate.repository}</Fact>
                  <Fact label="Base commit">
                    <FullSha sha={d.gitopsUpdate.baseCommit} />
                  </Fact>
                  <Fact label="Resulting commit">
                    <FullSha sha={d.gitopsUpdate.resultingCommit} />
                  </Fact>
                </Facts>
              </>
            )}
            {d.reconciliation && (
              <>
                <h2>Reconciliation #{d.reconciliation.number}</h2>
                <Facts label="Reconciliation">
                  <Fact label="Target revision">
                    <FullSha sha={d.reconciliation.targetRevision} />
                  </Fact>
                </Facts>
              </>
            )}
            {!d.execution ? (
              <p className="muted">No execution yet.</p>
            ) : (
              <>
                <h2>Execution</h2>
                <ExecutionFacts x={d.execution} />
                {d.execution.executor === "FLUX" ? (
                  <>
                    <h2>Flux</h2>
                    <FluxFacts x={d.execution as FluxExecution} />
                    <FluxObjectDetail kind="GitRepository" o={(d.execution as FluxExecution).gitRepository} />
                    <FluxObjectDetail kind="Kustomization" o={(d.execution as FluxExecution).kustomization} />
                  </>
                ) : (
                  <>
                    <h2>PipelineRun</h2>
                    <PipelineRunFacts x={d.execution as TektonExecution} />
                    <TaskRunsDetail
                      x={d.execution as TektonExecution}
                      logPath={(tr, step) => appPath(appId, `${base}/tasks/${encodeURIComponent(tr)}/logs?step=${encodeURIComponent(step)}`)}
                    />
                  </>
                )}
              </>
            )}
          </>
        )}
      </Loaded>
    </Page>
  );
}
