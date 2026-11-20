import type { EnvironmentSummary } from "../api/types";
import { NotYet } from "../components/ui";
import { DeploymentFacts } from "./Deployments";

// Preflight: what runs there now (the last successful Deployment) and, when
// it differs, the last Deployment; the delivery is the navigation root.
export function Preflight({ appId, env }: { appId: string; env: EnvironmentSummary }) {
  if (!env.last) {
    return (
      <NotYet
        title="Preflight"
        what="Validation environment before production delivery."
        state="Nothing has been deployed yet: the first successful build deploys it."
      />
    );
  }
  return (
    <>
      <h2>Preflight</h2>
      {env.current ? (
        <>
          <h3>Deployed</h3>
          <DeploymentFacts appId={appId} d={env.current} />
        </>
      ) : (
        <p className="muted">No deployment has succeeded yet.</p>
      )}
      {env.last.id !== env.current?.id && (
        <>
          <h3>Last deployment</h3>
          <DeploymentFacts appId={appId} d={env.last} />
        </>
      )}
    </>
  );
}
