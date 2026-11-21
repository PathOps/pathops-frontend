import type { DeploymentRef, ImageEntry, Paged } from "../api/types";
import { useResource, type Resource } from "../api/useResource";
import { BuildLink, CopyButton, Loaded, Pager, Short, Time, humanize, usePageCursor, withCursor } from "../components/ui";
import { imageEnvironments } from "../environment";
import { applicationList } from "../live/topics";

// Images: 10 per page, newest first, paged by the Tenant CP (?cursor=); live
// (a succeeded build adds one to the newest page; an older page changes only
// with its own builds). Environment is where each image runs now, from each
// environment's current Deployment (the overview's, live with its
// deliveries): "Preflight", "Production", both (a promotion reuses the
// artifact) or "—"; never where it ran before.
export function Images({ appId, current }: { appId: string; current: Partial<Record<string, DeploymentRef | null>> }) {
  const cursor = usePageCursor();
  const r: Resource<Paged & { images: ImageEntry[] }> = useResource(withCursor(`/api/v1/applications/${appId}/images`, cursor), {
    live: (e) => applicationList("BUILD_CHANGED", appId, !r.data?.previousCursor, r.data?.images.map((i) => i.buildId) ?? [])(e),
  });
  return (
    <>
      <h2>Images</h2>
      <p className="muted">OCI artifacts stored in zot.</p>
      <Loaded resource={r} empty={(d) => d.images.length === 0}>
        {(d) => (
          <>
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Tag</th>
                    <th>Environment</th>
                    <th>Digest</th>
                    <th>Build</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {d.images.map((i) => {
                    const envs = imageEnvironments(i.digest, current);
                    return (
                      <tr key={i.digest + i.buildId}>
                        <td>
                          {/* Copies the reference a manifest pins: repository@digest. */}
                          <code>{i.revision}</code> <CopyButton text={i.pinnedReference} />
                        </td>
                        <td>{envs.length ? envs.map(humanize).join(", ") : <span className="muted">—</span>}</td>
                        <td>
                          <Short text={i.digest} />
                        </td>
                        <td>
                          <BuildLink appId={appId} id={i.buildId} number={i.buildNumber} />
                        </td>
                        <td>
                          <Time at={i.builtAt} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager label="Image pages" newer={d.previousCursor} older={d.nextCursor} />
            {/* Registry metadata (size, manifests) arrives with a read-only
                registry identity of the Tenant CP; nothing is invented until then. */}
          </>
        )}
      </Loaded>
    </>
  );
}
