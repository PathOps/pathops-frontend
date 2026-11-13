import type { ImageEntry } from "../api/types";
import { useResource } from "../api/useResource";
import { BuildLink, CopyButton, Loaded, Short, Time } from "../components/ui";

export function Images({ appId }: { appId: string }) {
  const r = useResource<{ images: ImageEntry[] }>(`/api/v1/applications/${appId}/images`);
  return (
    <>
      <h2>Images</h2>
      <p>OCI artifacts stored in zot.</p>
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
            {/* Registry metadata (size, manifests) arrives with a read-only
                registry identity of the Tenant CP; nothing is invented until then. */}
          </>
        )}
      </Loaded>
    </>
  );
}
