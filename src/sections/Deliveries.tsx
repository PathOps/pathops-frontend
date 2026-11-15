import type { DeliverySummary, Paged } from "../api/types";
import { running, useResource } from "../api/useResource";
import { Duration, Head12, Loaded, Pager, RefreshButton, RunLink, Status, Time, Toolbar, usePageCursor, withCursor } from "../components/ui";

// Deliveries: 10 per page, newest first, paged by the Tenant CP (?cursor=).
export function Deliveries({ appId }: { appId: string }) {
  const cursor = usePageCursor();
  const r = useResource<Paged & { deliveries: DeliverySummary[] }>(withCursor(`/api/v1/applications/${appId}/deliveries`, cursor), {
    pollWhile: (d) => d.deliveries.some((x) => running(x.status)),
  });
  return (
    <>
      <h2>Delivery Runs</h2>
      <Toolbar actions={<RefreshButton resource={r} />}>
        Each delivery represents a tracked execution through build, validation and deployment.
      </Toolbar>
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
