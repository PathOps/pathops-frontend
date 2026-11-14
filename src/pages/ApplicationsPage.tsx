import { Link } from "react-router-dom";
import type { ApplicationSummary, EnvironmentRef, Technology } from "../api/types";
import { useResource } from "../api/useResource";
import { Page } from "../components/Page";
import { Ago, ExternalLink, Loaded, RefreshButton, RunLink, Status, Time, Toolbar } from "../components/ui";

export function technologyLine(t: Technology | null): string {
  if (!t) return "Technology not declared";
  return [t.language, t.framework, t.runtime, t.build].filter(Boolean).join(" · ");
}

// Environment is "Healthy — Open app ↗ — 3s": health, the app's link and
// how long ago its current version was deployed.
function Environment({ env }: { env: EnvironmentRef | null | undefined }) {
  if (!env) return <span className="muted">not deployed</span>;
  return (
    <>
      <Status status={env.status} />
      {env.url && (
        <>
          {" — "}
          <ExternalLink href={env.url}>Open app</ExternalLink>
        </>
      )}
      {" — "}
      <Ago at={env.deployedAt} />
    </>
  );
}

// ApplicationsPage lists the signed-in user's Applications.
export function ApplicationsPage() {
  const apps = useResource<{ applications: ApplicationSummary[] }>("/api/v1/applications");
  return (
    <Page>
      <h1>Applications</h1>
      <Toolbar actions={<RefreshButton resource={apps} />} />
      <Loaded resource={apps} empty={(d) => d.applications.length === 0}>
        {(d) => (
          <div className="scroll">
            <table>
              <thead>
                <tr>
                  <th>Application</th>
                  <th>Production</th>
                  <th>Preflight</th>
                  <th>Last delivery</th>
                  <th>Provisioning</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {d.applications.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <Link to={`/applications/${a.id}`}>{a.name}</Link>
                    </td>
                    <td>
                      <Environment env={a.production} />
                    </td>
                    <td>
                      <Environment env={a.preflight} />
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
                      <Status status={a.provisioning.status} />
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
