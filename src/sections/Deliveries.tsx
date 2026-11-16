import type { DeliverySummary, Paged } from "../api/types";
import { useResource, type Resource } from "../api/useResource";
import { Duration, Head12, Loaded, Pager, RunLink, Status, Time, usePageCursor, withCursor } from "../components/ui";
import { applicationList } from "../live/topics";

// Deliveries: 10 per page, newest first, paged by the Tenant CP (?cursor=);
// live (the newest page shows new runs, any page its own runs' changes).
export function Deliveries({ appId }: { appId: string }) {
  const cursor = usePageCursor();
  const r: Resource<Paged & { deliveries: DeliverySummary[] }> = useResource(withCursor(`/api/v1/applications/${appId}/deliveries`, cursor), {
    live: (e) => applicationList("DELIVERY_CHANGED", appId, !r.data?.previousCursor, r.data?.deliveries.map((x) => x.id) ?? [])(e),
  });
  return (
    <>
      <h2>Delivery Runs</h2>
      <p className="muted">Each delivery represents a tracked execution through build, validation and deployment.</p>
      <Loaded resource={r} empty={(d) => d.deliveries.length === 0}>
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
                </tr>
              </thead>
              <tbody>
                {d.deliveries.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <RunLink appId={appId} id={x.id} number={x.number} />
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
                  </tr>
                ))}
              </tbody>
            </table>
            <Pager label="Delivery pages" newer={d.previousCursor} older={d.nextCursor} />
          </div>
        )}
      </Loaded>
    </>
  );
}
