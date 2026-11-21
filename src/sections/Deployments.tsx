import type { DeploymentRef, Paged } from "../api/types";
import { useResource, type Resource } from "../api/useResource";
import { Copy, Duration, EnvironmentLabel, Fact, Facts, Head12, Loaded, Pager, RunLink, Short, Status, Time, humanize, usePageCursor, withCursor } from "../components/ui";
import { applicationList } from "../live/topics";

// DeploymentFacts are one Deployment's identity: the exact image it applied
// and its three revisions (Decision 0064).
export function DeploymentFacts({ appId, d }: { appId: string; d: DeploymentRef }) {
  return (
    <Facts label={`Deployment #${d.number}`}>
      <Fact label="Deployment">
        #{d.number} — <EnvironmentLabel environment={d.environment} /> — <Status status={d.status} />
      </Fact>
      <Fact label="Delivery">
        <RunLink appId={appId} id={d.deliveryRunId} number={d.deliveryNumber} />
      </Fact>
      <Fact label="Image">
        <Copy text={d.imageReference} />
      </Fact>
      <Fact label="Source commit">
        <Head12 revision={d.sourceRevision} head12={d.head12} />
      </Fact>
      <Fact label="GitOps repository">{d.gitopsRepository}</Fact>
      <Fact label="Update Task revision">
        <Copy text={d.gitopsTaskRevision}>
          <Short text={d.gitopsTaskRevision} />
        </Copy>
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
      <Fact label="Started">
        <Time at={d.startedAt} />
      </Fact>
      <Fact label="Duration">
        <Duration seconds={d.durationSeconds} />
      </Fact>
      {d.failureMessage && (
        <Fact label="Error">
          <span className="error">
            {d.failureReason ? `${humanize(d.failureReason)}: ` : ""}
            {d.failureMessage}
          </span>
        </Fact>
      )}
    </Facts>
  );
}

// Deployments: 10 per page, newest first, every environment (Decision 0064
// §12). Live like Builds: a Deployment's change is its delivery run's
// (DELIVERY_CHANGED); the newest page also shows new ones, an older page only
// its own rows' changes. # is text: a Deployment has no page of its own (its
// delivery run's page shows it).
export function Deployments({ appId }: { appId: string }) {
  const cursor = usePageCursor();
  const r: Resource<Paged & { deployments: DeploymentRef[] }> = useResource(
    withCursor(`/api/v1/applications/${appId}/deployments`, cursor),
    {
      live: (e) =>
        applicationList("DELIVERY_CHANGED", appId, !r.data?.previousCursor, r.data?.deployments.map((x) => x.deliveryRunId) ?? [])(e),
    },
  );
  return (
    <>
      <h2>Deployments</h2>
      <p className="muted">Each deployment applies one built image to one environment through GitOps.</p>
      <Loaded resource={r} empty={(d) => d.deployments.length === 0}>
        {(d) => (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Commit</th>
                  <th>Environment</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>Delivery</th>
                </tr>
              </thead>
              <tbody>
                {d.deployments.map((x) => (
                  <tr key={x.id}>
                    <td>{x.number}</td>
                    <td>
                      <Head12 revision={x.sourceRevision} head12={x.head12} />
                    </td>
                    <td>
                      <EnvironmentLabel environment={x.environment} />
                    </td>
                    <td>
                      <Status status={x.status} />
                    </td>
                    <td>
                      <Time at={x.startedAt} />
                    </td>
                    <td>
                      <Duration seconds={x.durationSeconds} />
                    </td>
                    <td>
                      <RunLink appId={appId} id={x.deliveryRunId} number={x.deliveryNumber} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager label="Deployment pages" newer={d.previousCursor} older={d.nextCursor} />
          </div>
        )}
      </Loaded>
    </>
  );
}
