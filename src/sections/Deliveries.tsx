import { Link } from "react-router-dom";
import type { DeliverySummary } from "../api/types";
import { running, useResource } from "../api/useResource";
import { Duration, Head12, Loaded, RefreshButton, StatusBadge, Time } from "../components/ui";

export function Deliveries({ appId }: { appId: string }) {
  const r = useResource<{ deliveries: DeliverySummary[] }>(`/api/v1/applications/${appId}/deliveries`, {
    pollWhile: (d) => d.deliveries.some((x) => running(x.status)),
  });
  return (
    <>
      <div className="page-head">
        <h2>Delivery runs</h2>
        <RefreshButton resource={r} />
      </div>
      <Loaded resource={r} empty={(d) => d.deliveries.length === 0}>
        {(d) => (
          <table className="list">
            <thead>
              <tr>
                <th>Revision</th>
                <th>Status</th>
                <th>Received</th>
                <th>Duration</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {d.deliveries.map((x) => (
                <tr key={x.id}>
                  <td>
                    <Link to={`/applications/${appId}/deliveries/${x.id}`}>
                      <Head12 revision={x.sourceRevision} head12={x.head12} />
                    </Link>
                  </td>
                  <td>
                    <StatusBadge status={x.status} />
                  </td>
                  <td>
                    <Time at={x.createdAt} />
                  </td>
                  <td>
                    <Duration seconds={x.durationSeconds} />
                  </td>
                  <td>
                    {x.build?.image ? (
                      <code className="small">{x.build.image.reference}</code>
                    ) : x.sanitizedError ? (
                      <span className="error-text">{x.sanitizedError}</span>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Loaded>
    </>
  );
}
