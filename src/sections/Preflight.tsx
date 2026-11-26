import type { EnvironmentSummary } from "../api/types";
import { Ago, ExternalLink, Fact, Facts, Head12, Status } from "../components/ui";
import { deriveEnvironmentStatus } from "../environment";

// Preflight: how the environment is now, not how it was deployed (that is
// the Deployments, Images and Delivery tabs' and a Deployment's page).
//
//   Status         the environment's derived state (deriveEnvironmentStatus)
//   Commit         the commit of its last Deployment, the one the state is about
//   Last deployed  when its current version (last successful Deployment) was deployed
//   Tests          its validations: none run yet (Validation execution is a
//                  later milestone), so "Not configured", never a count
//   Default Route  the default Route's Preflight hostname, a link to the
//                  deployed app (Decision 0067)
export function Preflight({ env }: { env: EnvironmentSummary }) {
  const status = deriveEnvironmentStatus(env.last);
  return (
    <>
      <h2>Preflight</h2>
      <Facts label="Preflight environment">
        <Fact label="Status">
          <Status status={status.state} />
        </Fact>
        <Fact label="Commit">{env.last ? <Head12 revision={env.last.sourceRevision} head12={env.last.head12} /> : <span className="muted">—</span>}</Fact>
        <Fact label="Last deployed">
          <Ago at={env.current?.completedAt} relative />
        </Fact>
        <Fact label="Tests">
          <span className="muted">Not configured</span>
        </Fact>
        {env.route && (
          <Fact label="Default Route">
            <ExternalLink href={env.route.url}>{env.route.hostname}</ExternalLink>
          </Fact>
        )}
      </Facts>
    </>
  );
}
