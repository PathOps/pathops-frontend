import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type {
  BuildDetail,
  DeliveryDetail,
  DeliveryStep,
  DeploymentDetail,
  DeploymentStepDetail,
  FluxExecution,
  TektonExecution,
} from "../api/types";
import { running, useResource, type Resource } from "../api/useResource";
import { FailureText, FluxReady, FluxRevision, Sha12, TektonStepsTable, executorName, type LogPath } from "../components/execution";
import { Page } from "../components/Page";
import { Node, Row, Tree } from "../components/tree";
import { BuildLink, Copy, DeploymentLink, Duration, EnvironmentLabel, Fact, Facts, Loaded, Status, Time, humanize, seconds, stepTitle } from "../components/ui";
import { resource } from "../live/topics";
import { AppCrumbs, appPath } from "./BuildPage";
import { stepPath } from "./DeploymentPage";

// The Delivery tree (Decision 0066): what happened, in order, at a glance.
// Each step has its projection (what PathOps accepted) and its Execution
// (what the engine reported) as siblings; under a Tekton Execution its
// PipelineRun, TaskRuns and Steps (logs live), under a Flux one its
// GitRepository and Kustomization. Only the few facts that tell what
// happened; a projection's # (Build, Deployment) links the page with all of
// them. A Deployment's step (Update GitOps, Reconcile) has its own page: its
// # (its position) links it; its record (GitOps Commit, Target) has no #.
//
// Where it starts: a succeeded run with its steps closed (one line each); a
// failed run with the branch of its failed step open, its succeeded steps
// closed; a running run with its running branch open. Opening a step opens
// its whole branch.

const stepHead = ["#", "Step", "Status", "Started", "Duration"];

// StepRow is a step's one-row table: its position (a link to the step's page
// when it has one), its name, its verdict and times.
function StepRow({ s, to }: { s: DeliveryStep; to?: string }) {
  return (
    <Row
      label={`Step ${stepTitle(s.type)}`}
      head={stepHead}
      cells={[
        to ? <Link to={to}>{s.position}</Link> : String(s.position),
        stepTitle(s.type),
        <Status status={s.status} />,
        <Time at={s.startedAt} />,
        <Duration seconds={s.durationSeconds} />,
      ]}
    />
  );
}

// ExecutionRow is an Execution's one-row table: its executor, what it
// reported and how long it took (its reason only when it failed).
function ExecutionRow({ x }: { x: TektonExecution | FluxExecution }) {
  const failed = x.status === "FAILED";
  return (
    <Row
      label={`Execution ${executorName(x.executor)}`}
      head={["Executor", "Status", "Duration", ...(failed ? ["Reason"] : [])]}
      cells={[
        executorName(x.executor),
        <Status status={x.status} />,
        <Duration seconds={seconds(x.startedAt, x.completedAt)} />,
        ...(failed ? [x.reason ?? "—"] : []),
      ]}
    />
  );
}

// TektonNodes are a Tekton Execution's PipelineRun -> TaskRuns -> Steps.
function TektonNodes({ id, x, logPath }: { id: string; x: TektonExecution; logPath: LogPath }) {
  const [log, setLog] = useState<string | null>(null);
  return (
    <Node
      id={`${id}/pr`}
      label={`PipelineRun ${x.pipelineRun.name}`}
      table={
        <Row
          label="PipelineRun"
          head={["PipelineRun", "Status", "Duration"]}
          cells={[
            <code title={`${x.pipelineRun.namespace}/${x.pipelineRun.name}`}>{x.pipelineRun.name}</code>,
            <Status status={x.status} />,
            <Duration seconds={seconds(x.startedAt, x.completedAt)} />,
          ]}
        />
      }
    >
      {x.taskRuns.map((tr) => (
        <Node
          key={tr.name}
          id={`${id}/tr/${tr.name}`}
          label={`TaskRun ${tr.pipelineTask}`}
          table={
            <Row
              label={`TaskRun ${tr.pipelineTask}`}
              head={["TaskRun", "Status", "Duration"]}
              cells={[
                <code title={tr.name}>{tr.pipelineTask}</code>,
                tr.observedAt ? <Status status={tr.status} /> : <span className="muted">not observed</span>,
                <Duration seconds={seconds(tr.startedAt, tr.completedAt)} />,
              ]}
            />
          }
        >
          {tr.steps.length > 0 && (
            <li className="tree-node tree-leaf">
              <TektonStepsTable tr={tr} logPath={logPath} open={log} onLog={(key) => setLog(log === key ? null : key)} />
            </li>
          )}
        </Node>
      ))}
    </Node>
  );
}

// FluxNodes are a Flux Execution's GitRepository and Kustomization, each its
// own row (they are not the same object).
function FluxNodes({ id, x }: { id: string; x: FluxExecution }) {
  return (
    <>
      <Node
        id={`${id}/gr`}
        label="GitRepository"
        table={
          <Row
            label="GitRepository"
            head={["GitRepository", "Revision", "Ready"]}
            cells={[
              <code>{x.gitRepository?.name ?? "—"}</code>,
              <FluxRevision rev={x.gitRepository?.artifactRevision} />,
              <FluxReady o={x.gitRepository} />,
            ]}
          />
        }
      />
      <Node
        id={`${id}/ks`}
        label="Kustomization"
        table={
          <Row
            label="Kustomization"
            head={["Kustomization", "Applied", "Ready"]}
            cells={[
              <code>{x.kustomization?.name ?? "—"}</code>,
              <FluxRevision rev={x.kustomization?.lastAppliedRevision} />,
              <FluxReady o={x.kustomization} />,
            ]}
          />
        }
      />
    </>
  );
}

// ExecutionNode is an Execution with what is its engine's below it.
function ExecutionNode({ id, x, logPath }: { id: string; x: TektonExecution | FluxExecution; logPath?: LogPath }) {
  return (
    <Node id={`${id}/exec`} label={`Execution ${executorName(x.executor)}`} table={<ExecutionRow x={x} />}>
      {x.executor === "TEKTON" ? <TektonNodes id={`${id}/exec`} x={x as TektonExecution} logPath={logPath!} /> : <FluxNodes id={`${id}/exec`} x={x as FluxExecution} />}
    </Node>
  );
}

// rootOpen is where a top-level step of a run in runStatus starts: open
// when it failed or runs (a succeeded run: all closed).
function rootOpen(runStatus: string, s: DeliveryStep): boolean {
  if (runStatus === "SUCCEEDED") return false;
  return s.status === "FAILED" || s.status === "RUNNING";
}

// childOpen is where a step under a top-level one starts: open unless it
// succeeded (the failed or running one is the one to see).
function childOpen(s: DeliveryStep): boolean {
  return s.status !== "SUCCEEDED";
}

// BuildBranch is BUILD_APPLICATION: its Build and its Execution. Live with
// its Build (BUILD_CHANGED); read again every few seconds while it runs.
function BuildBranch({ appId, runStatus, s }: { appId: string; runStatus: string; s: DeliveryStep }) {
  const buildId = s.build?.id;
  const b: Resource<BuildDetail> = useResource(buildId ? appPath(appId, `/builds/${encodeURIComponent(buildId)}`) : null, {
    live: (e) => !!buildId && resource("BUILD_CHANGED", buildId)(e),
    pollWhile: (d) => running(d.status),
  });
  const id = `s${s.position}`;
  const d = b.data;
  return (
    <Node id={id} label={stepTitle(s.type)} table={<StepRow s={s} />} note={s.failure && <FailureText failure={s.failure} />} defaultOpen={rootOpen(runStatus, s)}>
      {s.build && (
        <Node
          id={`${id}/build`}
          label={`Build #${s.build.number}`}
          table={
            <Row
              label="Build"
              head={["Build", "Status", "Image"]}
              cells={[
                <BuildLink appId={appId} id={s.build.id} number={s.build.number} />,
                <Status status={s.build.status} />,
                s.build.image ? <code title={s.build.image.digest}>{s.build.image.revision}</code> : <span className="muted">—</span>,
              ]}
            />
          }
        />
      )}
      {d?.execution && (
        <ExecutionNode
          id={id}
          x={d.execution}
          logPath={(tr, step) =>
            appPath(appId, `/builds/${encodeURIComponent(d.id)}/tasks/${encodeURIComponent(tr)}/logs?step=${encodeURIComponent(step)}`)
          }
        />
      )}
    </Node>
  );
}

// ChildBranch is one step of a Deployment: its record (GitOps Commit,
// Target) and its Execution, from the step's page data. Live with
// the run; read again every few seconds while it runs.
function ChildBranch({ appId, runId, parent, deploymentId, s }: { appId: string; runId: string; parent: string; deploymentId?: string; s: DeliveryStep }) {
  const started = !!deploymentId && !!s.startedAt;
  const base = deploymentId ? `/deployments/${encodeURIComponent(deploymentId)}/steps/${encodeURIComponent(s.type)}` : "";
  const r: Resource<DeploymentStepDetail> = useResource(started ? appPath(appId, base) : null, {
    live: (e) => resource("DELIVERY_CHANGED", runId)(e),
    pollWhile: (d) => running(d.status),
  });
  const id = `${parent}/s${s.position}`;
  const d = r.data;
  const to = started ? stepPath(appId, deploymentId!, s.type) : undefined;
  return (
    <Node id={id} label={stepTitle(s.type)} table={<StepRow s={s} to={to} />} note={s.failure && <FailureText failure={s.failure} />} defaultOpen={childOpen(s)}>
      {d?.gitopsUpdate && (
        <Node
          id={`${id}/update`}
          label="GitOps Commit"
          table={
            <Row
              label="GitOps Commit"
              head={["Repository", "Resulting commit"]}
              cells={[d.gitopsUpdate.repository, <Sha12 sha={d.gitopsUpdate.resultingCommit} />]}
            />
          }
        />
      )}
      {d?.reconciliation && (
        <Node
          id={`${id}/reconciliation`}
          label="Target"
          table={<Row label="Target" head={["Target revision"]} cells={[<Sha12 sha={d.reconciliation.targetRevision} />]} />}
        />
      )}
      {d?.execution && (
        <ExecutionNode
          id={id}
          x={d.execution}
          logPath={(tr, step) => appPath(appId, `${base}/tasks/${encodeURIComponent(tr)}/logs?step=${encodeURIComponent(step)}`)}
        />
      )}
    </Node>
  );
}

// DeployBranch is DEPLOY_<environment>: its Deployment and its own steps
// (no Execution: a composite step). Live with the run.
function DeployBranch({ appId, runId, runStatus, s }: { appId: string; runId: string; runStatus: string; s: DeliveryStep }) {
  const depId = s.deployment?.id;
  const dep: Resource<DeploymentDetail> = useResource(depId ? appPath(appId, `/deployments/${encodeURIComponent(depId)}`) : null, {
    live: (e) => resource("DELIVERY_CHANGED", runId)(e),
  });
  const id = `s${s.position}`;
  return (
    <Node id={id} label={stepTitle(s.type)} table={<StepRow s={s} />} note={s.failure && <FailureText failure={s.failure} />} defaultOpen={rootOpen(runStatus, s)}>
      {s.deployment && (
        <Node
          id={`${id}/deployment`}
          label={`Deployment #${s.deployment.number}`}
          table={
            <Row
              label="Deployment"
              head={["Deployment", "Environment", "Status", "Tests"]}
              cells={[
                <DeploymentLink appId={appId} id={s.deployment.id} number={s.deployment.number} />,
                <EnvironmentLabel environment={s.deployment.environment} />,
                <Status status={s.deployment.status} />,
                dep.data?.tests ? `${dep.data.tests.passed}/${dep.data.tests.total}` : <span className="muted">—</span>,
              ]}
            />
          }
        />
      )}
      {[...(s.steps ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((c) => (
          <ChildBranch key={c.type} appId={appId} runId={runId} parent={id} deploymentId={depId} s={c} />
        ))}
    </Node>
  );
}

// DeliveryTree is the run's steps in order as a tree.
export function DeliveryTree({ appId, run }: { appId: string; run: DeliveryDetail }) {
  return (
    <Tree label="Delivery tree">
      {[...run.steps]
        .sort((a, b) => a.position - b.position)
        .map((s) =>
          s.build || s.type === "BUILD_APPLICATION" ? (
            <BuildBranch key={s.type} appId={appId} runStatus={run.status} s={s} />
          ) : s.deployment || s.steps ? (
            <DeployBranch key={s.type} appId={appId} runId={run.id} runStatus={run.status} s={s} />
          ) : (
            <Node key={s.type} id={`s${s.position}`} label={stepTitle(s.type)} table={<StepRow s={s} />} note={s.failure && <FailureText failure={s.failure} />} />
          ),
        )}
    </Tree>
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
  if (d.status === "FAILED") return <p>No image: the build did not produce one.</p>;
  if (running(d.status)) return <p className="muted">Not built yet.</p>;
  return <p className="muted">No image.</p>;
}

// DeliveryPage is one DeliveryRun (by id or number): one immutable delivery
// attempt of one push, as a tree. Live: its run's invalidations; read again
// every few seconds while it runs.
export function DeliveryPage() {
  const { appId = "", runId = "" } = useParams();
  const r: Resource<DeliveryDetail> = useResource(appPath(appId, `/deliveries/${encodeURIComponent(runId)}`), {
    live: (e) => resource("DELIVERY_CHANGED", r.data?.id ?? runId)(e),
    pollWhile: (d) => running(d.status),
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
            <DeliveryTree appId={appId} run={d} />
            <h2>Image</h2>
            <Output d={d} />
          </>
        )}
      </Loaded>
    </Page>
  );
}
