import { Link } from "react-router-dom";
import type { ApplicationSummary, Technology } from "../api/types";
import { useResource } from "../api/useResource";
import { Head12, Loaded, RefreshButton, StatusBadge, Time } from "../components/ui";

export function technologyLine(t: Technology | null): string {
  if (!t) return "Technology not declared";
  return [t.language, t.framework, t.runtime, t.build].filter(Boolean).join(" · ");
}

// ApplicationsPage lists the signed-in user's Applications.
export function ApplicationsPage() {
  const apps = useResource<{ applications: ApplicationSummary[] }>("/api/v1/applications");
  return (
    <main>
      <div className="page-head">
        <h1>Applications</h1>
        <RefreshButton resource={apps} />
      </div>
      <Loaded resource={apps} empty={(d) => d.applications.length === 0}>
        {(d) => (
          <ul className="cards">
            {d.applications.map((a) => (
              <li key={a.id} className="card">
                <div className="card-title">
                  <Link to={`/applications/${a.id}/general`}>{a.name}</Link>
                  <StatusBadge status={a.status} />
                </div>
                <p className="muted">
                  {technologyLine(a.technology)} · template {a.templateId}
                </p>
                <p>
                  Provisioning <StatusBadge status={a.provisioning.status} />
                </p>
                <p>
                  Last delivery{" "}
                  {a.lastDelivery ? (
                    <Link to={`/applications/${a.id}/deliveries/${a.lastDelivery.id}`}>
                      <StatusBadge status={a.lastDelivery.status} />{" "}
                      <Head12 revision={a.lastDelivery.sourceRevision} head12={a.lastDelivery.head12} />
                    </Link>
                  ) : (
                    <span className="muted">none yet</span>
                  )}
                </p>
                <p className="muted small">
                  Created <Time at={a.createdAt} />
                </p>
              </li>
            ))}
          </ul>
        )}
      </Loaded>
    </main>
  );
}
