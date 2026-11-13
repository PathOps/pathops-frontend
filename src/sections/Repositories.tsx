import type { Repositories } from "../api/types";
import { useResource } from "../api/useResource";
import { ExternalLink, Loaded, Time } from "../components/ui";

const roles: Record<string, string> = { source: "source", preflight: "gitops-preflight", production: "gitops-production" };

export function RepositoriesSection({ appId }: { appId: string }) {
  const r = useResource<Repositories>(`/api/v1/applications/${appId}/repositories`);
  return (
    <>
      <h2>Repositories</h2>
      <Loaded resource={r} empty={(d) => d.repositories.length === 0}>
        {(d) => (
          <>
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Repository</th>
                  </tr>
                </thead>
                <tbody>
                  {d.repositories.map((repo) => (
                    <tr key={repo.role}>
                      <td>{roles[repo.role] ?? repo.role}</td>
                      <td>{repo.url ? <ExternalLink href={repo.url}>{repo.fullName}</ExternalLink> : repo.fullName}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {d.webhook && (
              <p className="muted">
                Source webhook: {d.webhook.events.join(", ")} · last push received <Time at={d.webhook.lastDeliveryAt} />
              </p>
            )}
          </>
        )}
      </Loaded>
    </>
  );
}
