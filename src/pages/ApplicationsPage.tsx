import { Link } from "react-router-dom";
import type { ApplicationSummary, Technology } from "../api/types";
import { useResource } from "../api/useResource";
import { Page } from "../components/Page";
import { Loaded, RefreshButton, RunLink, Status, Time } from "../components/ui";

export function technologyLine(t: Technology | null): string {
  if (!t) return "Technology not declared";
  return [t.language, t.framework, t.runtime, t.build].filter(Boolean).join(" · ");
}

// ApplicationsPage lists the signed-in user's Applications.
export function ApplicationsPage() {
  const apps = useResource<{ applications: ApplicationSummary[] }>("/api/v1/applications");
  return (
    <Page>
      <h1>Applications</h1>
      <p>
        <RefreshButton resource={apps} />
      </p>
      <Loaded resource={apps} empty={(d) => d.applications.length === 0}>
        {(d) => (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Application</th>
                  <th>Technology</th>
                  <th>Template</th>
                  <th>Provisioning</th>
                  <th>Last delivery</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {d.applications.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link to={`/applications/${a.id}`}>{a.name}</Link>
                    </td>
                    <td>{technologyLine(a.technology)}</td>
                    <td>{a.templateId}</td>
                    <td>
                      <Status status={a.provisioning.status} />
                    </td>
                    <td>
                      {a.lastDelivery ? (
                        <>
                          <RunLink appId={a.id} id={a.lastDelivery.id} number={a.lastDelivery.number} /> —{" "}
                          <Status status={a.lastDelivery.status} />
                        </>
                      ) : (
                        <span className="muted">none yet</span>
                      )}
                    </td>
                    <td>
                      <Time at={a.createdAt} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Loaded>
    </Page>
  );
}
