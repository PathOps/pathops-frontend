import type { ImageEntry, Paged } from "../api/types";
import { useResource, type Resource } from "../api/useResource";
import { BuildLink, CopyButton, Loaded, Pager, Short, Time, usePageCursor, withCursor } from "../components/ui";
import { applicationList } from "../live/topics";

// Images: 10 per page, newest first, paged by the Tenant CP (?cursor=); live
// (a succeeded build adds one to the newest page; an older page changes only
// with its own builds).
export function Images({ appId }: { appId: string }) {
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
                    <th>Digest</th>
                    <th>Build</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {d.images.map((i) => (
                    <tr key={i.digest + i.buildId}>
                      <td>
                        {/* Copies the reference a manifest pins: repository@digest. */}
                        <code>{i.revision}</code> <CopyButton text={i.pinnedReference} />
                      </td>
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
                  ))}
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
