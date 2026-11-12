import { Link } from "react-router-dom";
import type { BuildSummary } from "../api/types";
import { running, useResource } from "../api/useResource";
import { Duration, Head12, Loaded, RefreshButton, StatusBadge, Time } from "../components/ui";

export function Builds({ appId }: { appId: string }) {
  const b = useResource<{ builds: BuildSummary[] }>(`/api/v1/applications/${appId}/builds`, {
    pollWhile: (d) => d.builds.some((x) => running(x.status)),
  });
  return (
    <>
      <div className="page-head">
        <h2>Builds</h2>
        <RefreshButton resource={b} />
      </div>
      <Loaded resource={b} empty={(d) => d.builds.length === 0}>
        {(d) => (
          <table className="list">
            <thead>
              <tr>
                <th>Revision</th>
                <th>Status</th>
                <th>Started</th>
                <th>Duration</th>
                <th>PipelineRun</th>
                <th>Image</th>
              </tr>
            </thead>
            <tbody>
              {d.builds.map((x) => (
                <tr key={x.id}>
                  <td>
                    <Link to={`/applications/${appId}/builds/${x.id}`}>
                      <Head12 revision={x.sourceRevision} head12={x.head12} />
                    </Link>
                  </td>
                  <td>
                    <StatusBadge status={x.status} />
                  </td>
                  <td>
                    <Time at={x.startedAt ?? x.createdAt} />
                  </td>
                  <td>
                    <Duration seconds={x.durationSeconds} />
                  </td>
                  <td>
                    <code className="small">{x.pipelineRun.name}</code>
                  </td>
                  <td>{x.image ? <code className="small">{x.image.revision}</code> : <span className="muted">no image</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Loaded>
    </>
  );
}
