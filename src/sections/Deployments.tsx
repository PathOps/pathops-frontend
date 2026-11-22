import type { DeploymentRef, Paged } from "../api/types";
import { useResource, type Resource } from "../api/useResource";
import { DeploymentLink, Duration, EnvironmentLabel, Head12, Loaded, Pager, RunLink, Status, Time, usePageCursor, withCursor } from "../components/ui";
import { applicationList } from "../live/topics";

// Deployments: 10 per page, newest first, every environment (Decision 0064
// §12). Live like Builds: a Deployment's change is its delivery run's
// (DELIVERY_CHANGED); the newest page also shows new ones, an older page only
// its own rows' changes. # links the Deployment's page. Status is the
// Deployment's own (In progress, Succeeded, Failed), never its environment's.
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
                  <th>Tests</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>Delivery</th>
                </tr>
              </thead>
              <tbody>
                {d.deployments.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <DeploymentLink appId={appId} id={x.id} number={x.number} />
                    </td>
                    <td>
                      <Head12 revision={x.sourceRevision} head12={x.head12} />
                    </td>
                    <td>
                      <EnvironmentLabel environment={x.environment} />
                    </td>
                    <td>
                      <Status status={x.status} />
                    </td>
                    <td>{x.tests ? `${x.tests.passed}/${x.tests.total}` : <span className="muted">—</span>}</td>
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
