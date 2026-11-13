import { Link } from "react-router-dom";
import type { ImageEntry } from "../api/types";
import { useResource } from "../api/useResource";
import { ComingLater, Copy, Head12, Loaded, Time } from "../components/ui";

export function Images({ appId, appName }: { appId: string; appName: string }) {
  const r = useResource<{ images: ImageEntry[] }>(`/api/v1/applications/${appId}/images`);
  return (
    <>
      <h2>Images</h2>
      <Loaded resource={r} empty={(d) => d.images.length === 0}>
        {(d) => (
          <ul className="cards">
            {d.images.map((i) => (
              <li key={i.digest + i.buildId} className="card">
                <div className="card-title">
                  <span>
                    Image of {appName} <Head12 revision={i.sourceRevision} head12={i.head12} />
                  </span>
                  <span className="muted small">
                    built <Time at={i.builtAt} />
                  </span>
                </div>
                <dl>
                  {/* The registry repository is named by the Application's id
                      (Decision 0056 §8), never by its name. */}
                  <div className="field">
                    <dt>Repository</dt>
                    <dd>
                      <Copy text={i.repository} />
                    </dd>
                  </div>
                  <div className="field">
                    <dt>Reference</dt>
                    <dd>
                      <Copy text={i.reference} />
                    </dd>
                  </div>
                  <div className="field">
                    <dt>Digest</dt>
                    <dd>
                      <Copy text={i.digest} />
                    </dd>
                  </div>
                  <div className="field">
                    <dt>Pinned</dt>
                    <dd>
                      <Copy text={i.pinnedReference} label="repository@digest" />
                    </dd>
                  </div>
                  <div className="field">
                    <dt>From</dt>
                    <dd>
                      <Link to={`/applications/${appId}/builds/${i.buildId}`}>Build</Link> ·{" "}
                      <Link to={`/applications/${appId}/deliveries/${i.deliveryRunId}`}>Delivery run</Link>
                    </dd>
                  </div>
                </dl>
                {/* Registry metadata (size, creation time, manifests) arrives with a
                    read-only registry identity of the Tenant CP; nothing is shown
                    until then. */}
                {i.registryMetadata === null && <ComingLater what="Registry metadata" />}
              </li>
            ))}
          </ul>
        )}
      </Loaded>
    </>
  );
}
