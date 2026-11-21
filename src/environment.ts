// An environment's state (Preflight now, Production later): whether it can be
// used and reviewed now. It is derived from the read model, never stored, and
// it is not a Deployment's status: Deployment #5 may be SUCCEEDED while its
// environment is Unstable (its validations failed).
import type { DeploymentRef, Iso } from "./api/types";

export type EnvironmentState = "NOT_DEPLOYED" | "DEPLOYING" | "VALIDATING" | "HEALTHY" | "UNSTABLE";

// since is when the environment entered its state (null: never deployed).
export interface EnvironmentStatus {
  state: EnvironmentState;
  since: Iso | null;
}

// Validations of an environment's current Deployment. The Tenant CP runs none
// yet (Validation execution is a later milestone): every caller passes
// NO_VALIDATIONS until it does.
export type ValidationState =
  | { configured: false }
  | { configured: true; status: "RUNNING" | "SUCCEEDED" | "FAILED"; startedAt: Iso; completedAt: Iso | null };

export const NO_VALIDATIONS: ValidationState = { configured: false };

// deriveEnvironmentStatus is the environment's state from its last Deployment
// (the newest, whatever its status) and the validations of it:
//
//   no Deployment                              Not deployed
//   the last Deployment in progress            Deploying   (since it started)
//   the last Deployment failed                 Unstable    (since it ended)
//   it succeeded, validations running          Validating  (since they started)
//   it succeeded, validations failed           Unstable    (since they ended)
//   it succeeded, validations succeeded        Healthy     (since they ended)
//   it succeeded, no validations configured    Healthy     (since it ended)
//
// The last rule is temporary: while no Application has validations, a
// succeeded Deployment is Healthy. Once Validation execution exists, Healthy
// needs a succeeded Deployment and succeeded validations.
export function deriveEnvironmentStatus(
  last: DeploymentRef | null | undefined,
  validations: ValidationState = NO_VALIDATIONS,
): EnvironmentStatus {
  if (!last) return { state: "NOT_DEPLOYED", since: null };
  if (last.status === "FAILED") return { state: "UNSTABLE", since: last.completedAt ?? last.startedAt };
  if (last.status !== "SUCCEEDED") return { state: "DEPLOYING", since: last.startedAt };
  if (!validations.configured) return { state: "HEALTHY", since: last.completedAt };
  switch (validations.status) {
    case "RUNNING":
      return { state: "VALIDATING", since: validations.startedAt };
    case "FAILED":
      return { state: "UNSTABLE", since: validations.completedAt ?? validations.startedAt };
    case "SUCCEEDED":
      return { state: "HEALTHY", since: validations.completedAt ?? last.completedAt };
  }
}

// The environments in the order the UI names them.
export const ENVIRONMENTS = ["PREFLIGHT", "PRODUCTION"] as const;

// deploymentDigest is the digest a Deployment applied (repository:tag@digest).
export function deploymentDigest(d: DeploymentRef): string {
  return d.image?.digest ?? d.imageReference.slice(d.imageReference.lastIndexOf("@") + 1);
}

// imageEnvironments are the environments whose current Deployment (what runs
// there now: its last successful one) applied this digest, in the UI's
// order. Only the current one counts, never history: an image an environment
// ran before is in none. A promotion reuses the artifact, so one digest may
// be in both.
export function imageEnvironments(digest: string, current: Partial<Record<string, DeploymentRef | null>>): string[] {
  return ENVIRONMENTS.filter((e) => {
    const d = current[e];
    return d != null && deploymentDigest(d) === digest;
  });
}
