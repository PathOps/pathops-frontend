import type { Repositories } from "../api/types";
import { useResource } from "../api/useResource";
import { ComingLater, Copy, ExternalLink, Field, Head12, Loaded, Time } from "../components/ui";

const roles: Record<string, string> = { source: "Source", preflight: "Preflight GitOps", production: "Production GitOps" };

export function RepositoriesSection({ appId }: { appId: string }) {
  const r = useResource<Repositories>(`/api/v1/applications/${appId}/repositories`);
  return (
    <Loaded resource={r} empty={(d) => d.repositories.length === 0}>
      {(d) => (
        <>
          <ul className="cards">
            {d.repositories.map((repo) => (
              <li key={repo.role} className="card">
                <div className="card-title">
                  <span className="role">{roles[repo.role] ?? repo.role}</span>
                  {repo.url ? <ExternalLink href={repo.url}>{repo.fullName}</ExternalLink> : <span>{repo.fullName}</span>}
                </div>
                <dl>
                  <Field label="Default branch">{repo.defaultBranch}</Field>
                  <Field label="Initial commit">
                    <Head12 revision={repo.initialCommit} />
                  </Field>
                  <Field label="Clone (HTTPS)">
                    <Copy text={repo.cloneUrl} />
                  </Field>
                  <Field label="Clone (SSH)">
                    <Copy text={repo.sshUrl} />
                  </Field>
                  <Field label="Created">
                    <Time at={repo.createdAt} />
                  </Field>
                </dl>
                {/* Live Forgejo metadata (commit count, size, latest commit, last
                    activity) arrives with a read-only Tenant CP credential;
                    until then metadata is null and nothing is invented. */}
                {repo.metadata === null && <ComingLater what="Repository metadata" />}
              </li>
            ))}
          </ul>
          {d.webhook && (
            <p className="muted small">
              Source webhook: {d.webhook.events.join(", ")} · last push received <Time at={d.webhook.lastDeliveryAt} />
            </p>
          )}
        </>
      )}
    </Loaded>
  );
}
