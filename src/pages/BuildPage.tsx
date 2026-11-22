import { Link, useParams } from "react-router-dom";
import type { BuildDetail, Overview } from "../api/types";
import { running, useResource, type Resource } from "../api/useResource";
import { ExecutionFacts, FailureText, PipelineRunFacts, TaskRunsDetail } from "../components/execution";
import { Page } from "../components/Page";
import { Copy, Duration, Fact, Facts, Loaded, RunLink, Status, Time } from "../components/ui";
import { resource } from "../live/topics";

// AppCrumbs is "/ <application> / <section>" of a page under an Application.
export function AppCrumbs({ appId, section, title }: { appId: string; section: string; title: string }) {
  const o = useResource<Overview>(`/api/v1/applications/${encodeURIComponent(appId)}/overview`);
  return (
    <>
      {" / "}
      <Link to={`/applications/${appId}`}>{o.data?.name ?? "Application"}</Link>
      {" / "}
      <Link to={`/applications/${appId}/${section}`}>{title}</Link>
    </>
  );
}

// appPath is the API path of something of Application appId.
export function appPath(appId: string, rest: string): string {
  return `/api/v1/applications/${encodeURIComponent(appId)}${rest}`;
}

// BuildPage is one Build (by id or number): the Build (what PathOps
// accepted), then its Execution (what Tekton reported: the generic facts,
// then the PipelineRun's own, TaskRuns and Steps, logs live). Live:
// this build's invalidations; while it runs, also read again every few
// seconds.
export function BuildPage() {
  const { appId = "", buildId = "" } = useParams();
  const b: Resource<BuildDetail> = useResource(appPath(appId, `/builds/${encodeURIComponent(buildId)}`), {
    live: (e) => resource("BUILD_CHANGED", b.data?.id ?? buildId)(e),
    pollWhile: (d) => running(d.status),
  });
  return (
    <Page crumbs={<AppCrumbs appId={appId} section="builds" title="Builds" />}>
      <Loaded resource={b}>
        {(d) => (
          <>
            <h1>Build #{d.number}</h1>
            <Facts label="Build">
              <Fact label="Build ID">
                <code>{d.id}</code>
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
              <Fact label="Delivery">
                <RunLink appId={appId} id={d.deliveryRunId} number={d.deliveryNumber} />
              </Fact>
              <Fact label="Started">
                <Time at={d.startedAt} />
              </Fact>
              <Fact label="Completed">
                <Time at={d.completedAt} />
              </Fact>
              <Fact label="Duration">
                <Duration seconds={d.durationSeconds} />
              </Fact>
              <Fact label="Image">{d.image ? <Copy text={d.image.reference} /> : <span className="muted">no image</span>}</Fact>
              {d.image && (
                <Fact label="Digest">
                  <Copy text={d.image.digest} />
                </Fact>
              )}
            </Facts>
            {d.execution ? (
              <>
                <h2>Execution</h2>
                <ExecutionFacts x={d.execution} />
                <h2>PipelineRun</h2>
                <PipelineRunFacts x={d.execution} />
                <TaskRunsDetail
                  x={d.execution}
                  logPath={(tr, step) =>
                    appPath(appId, `/builds/${encodeURIComponent(d.id)}/tasks/${encodeURIComponent(tr)}/logs?step=${encodeURIComponent(step)}`)
                  }
                />
              </>
            ) : (
              <p className="muted">Not dispatched.</p>
            )}
          </>
        )}
      </Loaded>
    </Page>
  );
}
