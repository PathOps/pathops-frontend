import type { BuildSummary, Paged } from "../api/types";
import { useResource, type Resource } from "../api/useResource";
import { BuildLink, Duration, Head12, Loaded, Pager, RunLink, Status, Time, usePageCursor, withCursor } from "../components/ui";
import { applicationList } from "../live/topics";

// Builds: 10 per page, newest first, paged by the Tenant CP (?cursor=); live
// (the newest page shows new builds, any page its own builds' changes).
export function Builds({ appId }: { appId: string }) {
  const cursor = usePageCursor();
  const b: Resource<Paged & { builds: BuildSummary[] }> = useResource(withCursor(`/api/v1/applications/${appId}/builds`, cursor), {
    live: (e) => applicationList("BUILD_CHANGED", appId, !b.data?.previousCursor, b.data?.builds.map((x) => x.id) ?? [])(e),
  });
  return (
    <>
      <h2>Builds</h2>
      <p className="muted">Each build turns a commit into an OCI image, as part of a delivery.</p>
      <Loaded resource={b} empty={(d) => d.builds.length === 0}>
        {(d) => (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Commit</th>
                  <th>Status</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>Delivery</th>
                </tr>
              </thead>
              <tbody>
                {d.builds.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <BuildLink appId={appId} id={x.id} number={x.number} />
                    </td>
                    <td>
                      <Head12 revision={x.sourceRevision} head12={x.head12} />
                    </td>
                    <td>
                      <Status status={x.status} />
                    </td>
                    <td>
                      <Time at={x.startedAt ?? x.createdAt} />
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
            <Pager label="Build pages" newer={d.previousCursor} older={d.nextCursor} />
          </div>
        )}
      </Loaded>
    </>
  );
}
