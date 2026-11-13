import { Link } from "react-router-dom";
import type { ApplicationSummary, Technology } from "../api/types";
import { useResource } from "../api/useResource";
import { Field, Head12, Loaded, RefreshButton, StatusBadge, Time } from "../components/ui";

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
                <h2 className="card-heading">
                  <Link to={`/applications/${a.id}/general`}>{a.name}</Link>
                </h2>
                <dl>
                  <Field label="Technology">{technologyLine(a.technology)}</Field>
                  <Field label="Template">{a.templateId}</Field>
                  <Field label="Provisioning">
                    <StatusBadge status={a.provisioning.status} />
                  </Field>
                  <Field label="Status">
                    <StatusBadge status={a.status} />
                  </Field>
                  <Field label="Last delivery">
                    {a.lastDelivery ? (
                      <Link to={`/applications/${a.id}/deliveries/${a.lastDelivery.id}`}>
                        <StatusBadge status={a.lastDelivery.status} />{" "}
                        <Head12 revision={a.lastDelivery.sourceRevision} head12={a.lastDelivery.head12} />
                      </Link>
                    ) : (
                      <span className="muted">none yet</span>
                    )}
                  </Field>
                  <Field label="Created">
                    <Time at={a.createdAt} />
                  </Field>
                </dl>
              </li>
            ))}
          </ul>
        )}
      </Loaded>
    </main>
  );
}
