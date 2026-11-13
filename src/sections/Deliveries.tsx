import type { DeliverySummary } from "../api/types";
import { running, useResource } from "../api/useResource";
import { Duration, Head12, Loaded, RefreshButton, RunLink, Status, Time } from "../components/ui";

export function Deliveries({ appId }: { appId: string }) {
  const r = useResource<{ deliveries: DeliverySummary[] }>(`/api/v1/applications/${appId}/deliveries`, {
    pollWhile: (d) => d.deliveries.some((x) => running(x.status)),
  });
  return (
    <>
      <h2>Delivery Runs</h2>
      <p>
        Each delivery represents a tracked execution through build, validation and deployment. <RefreshButton resource={r} />
      </p>
      <Loaded resource={r} empty={(d) => d.deliveries.length === 0}>
        {(d) => (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Run</th>
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
          </div>
        )}
      </Loaded>
    </>
  );
}
