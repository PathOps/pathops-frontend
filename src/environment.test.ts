import { describe, expect, it } from "vitest";
import type { DeploymentRef } from "./api/types";
import { deriveEnvironmentStatus, imageEnvironments, NO_VALIDATIONS } from "./environment";
import * as f from "./test/fixtures";

const A = "sha256:" + "a".repeat(64);
const B = "sha256:" + "b".repeat(64);
const dep = (over: Partial<DeploymentRef>): DeploymentRef => ({ ...f.deployment, ...over });
const ref = (digest: string) => `zot-test.example/apps/${f.appId}:aaaaaaaaaaaa@${digest}`;

describe("deriveEnvironmentStatus", () => {
  it("Not deployed without a Deployment", () => {
    expect(deriveEnvironmentStatus(null)).toEqual({ state: "NOT_DEPLOYED", since: null });
    expect(deriveEnvironmentStatus(undefined)).toEqual({ state: "NOT_DEPLOYED", since: null });
  });

  it("Deploying while the last Deployment is in progress, since it started", () => {
    expect(deriveEnvironmentStatus(dep({ status: "IN_PROGRESS", completedAt: null }))).toEqual({ state: "DEPLOYING", since: f.deployment.startedAt });
  });

  it("Unstable when the last Deployment failed, since it ended", () => {
    expect(deriveEnvironmentStatus(dep({ status: "FAILED" }))).toEqual({ state: "UNSTABLE", since: f.deployment.completedAt });
  });

  // The temporary rule: no Application has validations yet, so a succeeded
  // Deployment is Healthy. With Validation execution, Healthy also needs
  // succeeded validations (the cases below).
  it("Healthy when the last Deployment succeeded and no validations are configured, since it ended", () => {
    expect(deriveEnvironmentStatus(dep({}))).toEqual({ state: "HEALTHY", since: f.deployment.completedAt });
    expect(deriveEnvironmentStatus(dep({}), NO_VALIDATIONS)).toEqual({ state: "HEALTHY", since: f.deployment.completedAt });
  });

  it("with validations: Validating while they run, Unstable when they fail, Healthy when they succeed", () => {
    const v = { configured: true as const, startedAt: "2026-11-20T10:03:00Z", completedAt: "2026-11-20T10:05:00Z" };
    expect(deriveEnvironmentStatus(dep({}), { ...v, status: "RUNNING", completedAt: null })).toEqual({ state: "VALIDATING", since: v.startedAt });
    expect(deriveEnvironmentStatus(dep({}), { ...v, status: "FAILED" })).toEqual({ state: "UNSTABLE", since: v.completedAt });
    expect(deriveEnvironmentStatus(dep({}), { ...v, status: "SUCCEEDED" })).toEqual({ state: "HEALTHY", since: v.completedAt });
  });

  it("is the environment's state, not the Deployment's status: a succeeded Deployment may leave it Unstable", () => {
    const d = dep({ status: "SUCCEEDED" });
    const s = deriveEnvironmentStatus(d, { configured: true, status: "FAILED", startedAt: d.completedAt!, completedAt: d.completedAt });
    expect(d.status).toBe("SUCCEEDED");
    expect(s.state).toBe("UNSTABLE");
  });

  it("a deployment the environment does not know as terminal is still deploying", () => {
    expect(deriveEnvironmentStatus(dep({ status: "PENDING", completedAt: null })).state).toBe("DEPLOYING");
  });
});

describe("imageEnvironments", () => {
  const a = dep({ id: "dep-1", imageReference: ref(A) });
  const b = dep({ id: "dep-2", number: 2, imageReference: ref(B) });

  it("— (none) for an image no environment runs now", () => {
    expect(imageEnvironments(A, {})).toEqual([]);
    expect(imageEnvironments(A, { PREFLIGHT: null, PRODUCTION: null })).toEqual([]);
  });

  it("Preflight, Production, or both for the same artifact (a promotion reuses it)", () => {
    expect(imageEnvironments(B, { PREFLIGHT: b })).toEqual(["PREFLIGHT"]);
    expect(imageEnvironments(B, { PRODUCTION: b })).toEqual(["PRODUCTION"]);
    expect(imageEnvironments(B, { PRODUCTION: b, PREFLIGHT: b })).toEqual(["PREFLIGHT", "PRODUCTION"]);
  });

  it("only the current Deployment counts, never history: #1 ran A, #2 runs B in Preflight", () => {
    const current = { PREFLIGHT: b };
    expect(imageEnvironments(A, current)).toEqual([]);
    expect(imageEnvironments(B, current)).toEqual(["PREFLIGHT"]);
    expect(a.imageReference).toContain(A);
  });

  it("reads the digest from the Deployment's image when it has one", () => {
    expect(imageEnvironments(A, { PREFLIGHT: dep({ image: { repository: "r", revision: "t", digest: A, reference: "r:t", pinnedReference: `r@${A}` } }) })).toEqual(["PREFLIGHT"]);
  });
});
