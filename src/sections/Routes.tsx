import type { Route, RouteList } from "../api/types";
import { useResource } from "../api/useResource";
import { ExternalLink, Loaded, Status } from "../components/ui";
import { application } from "../live/topics";

// Routes (Decision 0067): the external names PathOps reserved for the
// Application, the default first, with each one's canonical hostname in each
// environment as the Tenant CP derives it (never rebuilt here). A Production
// hostname is reserved, not deployed: it is shown, but no environment
// answers there yet. A Route not yet in effect shows its status.
function host(r: Route, env: string) {
  const h = r.hosts.find((x) => x.environment === env);
  if (!h) return <span className="muted">—</span>;
  return <ExternalLink href={h.url}>{h.hostname}</ExternalLink>;
}

export function RoutesSection({ appId }: { appId: string }) {
  const r = useResource<RouteList>(`/api/v1/applications/${appId}/routes`, { live: application(appId) });
  return (
    <>
      <h2>Routes</h2>
      <p className="muted">
        External names reserved for this application, with their hostname in each environment. Production hostnames are reserved before
        anything is deployed there.
      </p>
      <Loaded resource={r} empty={(d) => d.routes.length === 0}>
        {(d) => {
          const pending = d.routes.some((x) => x.status !== "ACTIVE");
          return (
            <div className="scroll">
              <table aria-label="Routes">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Default</th>
                    <th>Preflight</th>
                    <th>Production</th>
                    {pending && <th>Status</th>}
                  </tr>
                </thead>
                <tbody>
                  {d.routes.map((x) => (
                    <tr key={x.name}>
                      <td>{x.name}</td>
                      <td>{x.default ? "Yes" : "No"}</td>
                      <td>{host(x, "PREFLIGHT")}</td>
                      <td>{host(x, "PRODUCTION")}</td>
                      {pending && (
                        <td>
                          <Status status={x.status === "ACTIVE" ? "ACTIVE" : (x.run?.status ?? x.status)} />
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }}
      </Loaded>
    </>
  );
}
