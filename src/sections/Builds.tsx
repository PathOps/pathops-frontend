import type { BuildSummary, Paged } from "../api/types";
import { running, useResource } from "../api/useResource";
import { BuildLink, Duration, Head12, Loaded, Pager, RefreshButton, RunLink, Status, Time, Toolbar, usePageCursor, withCursor } from "../components/ui";

// Builds: 10 per page, newest first, paged by the Tenant CP (?cursor=).
export function Builds({ appId }: { appId: string }) {
  const cursor = usePageCursor();
  const b = useResource<Paged & { builds: BuildSummary[] }>(withCursor(`/api/v1/applications/${appId}/builds`, cursor), {
    pollWhile: (d) => d.builds.some((x) => running(x.status)),
  });
  return (
    <>
      <h2>Builds</h2>
      <Toolbar actions={<RefreshButton resource={b} />}>Each build turns a commit into an OCI image, as part of a delivery.</Toolbar>
      <Loaded resource={b} empty={(d) => d.builds.length === 0}>
        {(d) => (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Commit</th>
                  <th>Status</th>
                  <th>Delivery</th>
                  <th>Started</th>
                  <th>Duration</th>
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
                      <RunLink appId={appId} id={x.deliveryRunId} number={x.deliveryNumber} />
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
            <Pager label="Build pages" newer={d.previousCursor} older={d.nextCursor} />
          </div>
        )}
      </Loaded>
    </>
  );
}
