import type { ImageEntry } from "../api/types";
import { useResource } from "../api/useResource";
import { BuildLink, Copy, Loaded, Short, Time } from "../components/ui";

export function Images({ appId }: { appId: string }) {
  const r = useResource<{ images: ImageEntry[] }>(`/api/v1/applications/${appId}/images`);
  return (
    <>
      <h2>Images</h2>
      <p>OCI artifacts stored in zot.</p>
      <Loaded resource={r} empty={(d) => d.images.length === 0}>
        {(d) => (
          <>
            {/* The registry repository is named by the Application's id
                (Decision 0056 §8), never by its name. */}
            <p>
              Repository: <Copy text={d.images[0].repository} />
            </p>
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
                        <Copy text={i.reference}>
                          <code>{i.revision}</code>
                        </Copy>
                      </td>
                      <td>
                        <Copy text={i.pinnedReference}>
                          <Short text={i.digest} />
                        </Copy>
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
