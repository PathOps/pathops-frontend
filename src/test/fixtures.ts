// Read-model answers as the Tenant CP gives them, for the component tests.
import type {
  ApplicationSummary,
  BuildDetail,
  DeliveryDetail,
  DeliverySummary,
  DeploymentDetail,
  DeploymentRef,
  DeploymentStepDetail,
  ImageEntry,
  Log,
  Overview,
  Provisioning,
  Repositories,
  TektonExecution,
} from "../api/types";

export const appId = "11111111-1111-4111-8111-111111111111";
export const okRev = "274af150e590aaaaaaaaaaaaaaaaaaaaaaaaaaaa";
export const badRev = "202161553024bbbbbbbbbbbbbbbbbbbbbbbbbbbb";
export const digest = "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
const image = {
  repository: `zot-canary.demo.pathops.io/apps/${appId}`,
  revision: okRev.slice(0, 12),
  digest,
  reference: `zot-canary.demo.pathops.io/apps/${appId}:${okRev.slice(0, 12)}`,
  pinnedReference: `zot-canary.demo.pathops.io/apps/${appId}@${digest}`,
};
const t0 = "2026-11-11T10:00:00Z";
const t1 = "2026-11-11T10:02:00Z";

export const applications: { applications: ApplicationSummary[] } = {
  applications: [
    {
      id: appId,
      name: "manual-web",
      status: "BUILD_AND_PUSH_CONFIGURED",
      templateId: "generic-container",
      technology: { runtime: "container", language: "any", build: "Dockerfile (BuildKit)" },
      provisioning: { status: "SUCCEEDED", completedAt: t0 },
      lastDelivery: { id: "run-ok", number: 1, sourceRevision: okRev, head12: okRev.slice(0, 12), status: "SUCCEEDED", createdAt: t0, completedAt: t1 },
      createdAt: t0,
    },
  ],
};

export const overview: Overview = {
  id: appId,
  name: "manual-web",
  status: "BUILD_AND_PUSH_CONFIGURED",
  owner: { email: "alice@example.test", name: "Alice" },
  createdAt: t0,
  updatedAt: t1,
  template: {
    id: "generic-container",
    source: "https://github.com/PathOps/pathops-templates",
    ref: "main",
    revision: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    digest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    url: "https://github.com/PathOps/pathops-templates/tree/eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee/templates/generic-container",
  },
  technology: { runtime: "container", language: "any", build: "Dockerfile (BuildKit)" },
  provisioning: { runId: "run-p", status: "SUCCEEDED", createdAt: t0, completedAt: t1, steps: 12, succeeded: 12 },
  deliveries: { total: 2, succeeded: 1, failed: 1, running: 0, last: applications.applications[0].lastDelivery },
  images: 1,
  sections: ["general", "provisioning", "repositories", "builds", "images", "deliveries"],
  repositories: [
    { role: "source", fullName: "alice/manual-web", url: "https://forgejo-canary.demo.pathops.io/alice/manual-web" },
    { role: "preflight", fullName: "alice/manual-web-gitops-preflight", url: "https://forgejo-canary.demo.pathops.io/alice/manual-web-gitops-preflight" },
    { role: "production", fullName: "alice/manual-web-gitops-production", url: "https://forgejo-canary.demo.pathops.io/alice/manual-web-gitops-production" },
  ],
};

const stepTypes = [
  "RESOLVE_TEMPLATE",
  "CREATE_SOURCE_REPOSITORY",
  "CREATE_PREFLIGHT_GITOPS_REPOSITORY",
  "CREATE_PRODUCTION_GITOPS_REPOSITORY",
  "CONFIGURE_SOURCE_WEBHOOKS",
  "CREATE_CI_NAMESPACE",
  "CONFIGURE_BUILD_AND_PUSH_SOURCE_RESOLUTION_ACCESS",
  "CONFIGURE_BUILD_AND_PUSH_SOURCE_CHECKOUT_ACCESS",
  "CONFIGURE_BUILD_AND_PUSH_REGISTRY_ACCESS",
  "CONFIGURE_BUILD_AND_PUSH_PIPELINE",
  "CONFIGURE_BUILD_AND_PUSH_TRIGGER",
  "CONFIGURE_BUILD_AND_PUSH_ACCESS_ISOLATION",
];

export const provisioning: Provisioning = {
  run: { id: "run-p", type: "APPLICATION_PROVISIONING", status: "SUCCEEDED", createdAt: t0, updatedAt: t1, completedAt: t1 },
  steps: stepTypes.map((type, i) => ({
    position: i + 1,
    type,
    status: i === 1 ? "FAILED" : "SUCCEEDED",
    attemptCount: i === 1 ? 2 : 1,
    sanitizedError: i === 1 ? "conflict: alice/manual-web exists" : undefined,
    updatedAt: t1,
    attempts: [{ number: 1, status: "SUCCEEDED", observation: "ABSENT", action: "CREATED", startedAt: t0, completedAt: t1 }],
  })),
};

export const repositories: Repositories = {
  repositories: overview.repositories.map((r) => ({
    role: r.role,
    name: r.fullName.split("/")[1],
    fullName: r.fullName,
    url: r.url,
    cloneUrl: `https://forgejo-canary.demo.pathops.io/${r.fullName}.git`,
    sshUrl: `ssh://git@forgejo.scm.svc.cluster.local:2222/${r.fullName}.git`,
    defaultBranch: "main",
    initialCommit: "ffffffffffffffffffffffffffffffffffffffff",
    createdAt: t0,
    metadata: null,
    metadataStatus: "not_available",
  })),
  webhook: { events: ["push"], lastDeliveryAt: t1 },
};

export const deliveries: { deliveries: DeliverySummary[] } = {
  deliveries: [
    {
      id: "run-bad",
      number: 2,
      trigger: "PUSH",
      sourceRevision: badRev,
      head12: badRev.slice(0, 12),
      status: "FAILED",
      createdAt: t1,
      startedAt: t1,
      completedAt: t1,
      durationSeconds: 61,
      failure: { reason: "BUILD_FAILED", message: "the PipelineRun manual-web-build/build-b failed (Failed)" },
      build: { id: "build-bad", number: 2, status: "FAILED", image: null },
    },
    {
      id: "run-ok",
      number: 1,
      trigger: "PUSH",
      sourceRevision: okRev,
      head12: okRev.slice(0, 12),
      status: "SUCCEEDED",
      createdAt: t0,
      startedAt: t0,
      completedAt: t1,
      durationSeconds: 120,
      failure: null,
      build: { id: "build-ok", number: 1, status: "SUCCEEDED", image },
    },
  ],
};

// detail is s with its top-level steps: Build application and, with a
// Deployment, Deploy preflight (its own steps are the Deployment's page).
function detail(s: DeliverySummary, deployment?: { id: string; number: number; status: string }): DeliveryDetail {
  const steps: DeliveryDetail["steps"] = [
    {
      position: 1,
      type: "BUILD_APPLICATION",
      status: s.build?.status ?? s.status,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
      durationSeconds: s.durationSeconds,
      failure: s.failure,
      build: s.build ?? undefined,
      execution: { executor: "TEKTON", status: s.status, pipelineRun: { namespace: "manual-web-build", name: `build-${s.build?.id}` } },
    },
  ];
  if (deployment)
    steps.push({
      position: 2,
      type: "DEPLOY_PREFLIGHT",
      status: deployment.status === "IN_PROGRESS" ? "RUNNING" : deployment.status,
      startedAt: t1,
      completedAt: t1,
      durationSeconds: 40,
      failure: null,
      deployment: { ...deployment, environment: "PREFLIGHT" },
      execution: null,
      steps: [
        { position: 1, type: "UPDATE_GITOPS", status: "SUCCEEDED", startedAt: t1, completedAt: t1, durationSeconds: 20, failure: null, execution: { executor: "TEKTON", status: "SUCCEEDED" } },
        { position: 2, type: "RECONCILE", status: "SUCCEEDED", startedAt: t1, completedAt: t1, durationSeconds: 20, failure: null, execution: { executor: "FLUX", status: "SUCCEEDED" } },
      ],
    });
  return {
    ...s,
    applicationId: appId,
    triggerId: "wd-1",
    sourceRepository: "alice/manual-web",
    sourceRef: "refs/heads/main",
    steps,
  };
}

export const deliveryOk = detail(deliveries.deliveries[1], { id: "dep-1", number: 1, status: "SUCCEEDED" });
export const deliveryBad = detail(deliveries.deliveries[0]);

// execution is a Tekton Execution with its TaskRuns, as PathOps recorded it.
function execution(name: string, status: string, taskRuns: TektonExecution["taskRuns"], results: TektonExecution["results"]): TektonExecution {
  return {
    executor: "TEKTON",
    status,
    reason: status === "SUCCEEDED" ? "Succeeded" : "Failed",
    message: status === "FAILED" ? "Tasks Completed: 2 (Failed: 1, Cancelled 0), Skipped: 0" : undefined,
    createdAt: t0,
    startedAt: t0,
    completedAt: t1,
    observedAt: t1,
    pipelineRun: { namespace: "manual-web-build", name, uid: `uid-${name}` },
    triggerEventId: "event-1",
    triggeredAt: t0,
    results,
    refSource: { uri: "git+https://forgejo/alice/manual-web.git", digest: { sha1: okRev }, entryPoint: ".pathops/tekton/pipelines/build-and-push.yaml" },
    taskRuns,
  };
}

const step = (name: string, exitCode = 0) => ({ name, state: "terminated", reason: exitCode ? "Error" : "Completed", exitCode, startedAt: t0, finishedAt: t1 });
const taskRun = (name: string, pipelineTask: string, status: string, steps: ReturnType<typeof step>[]) => ({
  name,
  pipelineTask,
  task: pipelineTask,
  status,
  reason: status === "SUCCEEDED" ? "Succeeded" : "Failed",
  startedAt: t0,
  completedAt: t1,
  observedAt: t1,
  results: [],
  refSource: null,
  steps,
});

export const buildOk: BuildDetail = {
  id: "build-ok",
  number: 1,
  applicationId: appId,
  deliveryRunId: "run-ok",
  deliveryNumber: 1,
  sourceRevision: okRev,
  head12: okRev.slice(0, 12),
  status: "SUCCEEDED",
  startedAt: t0,
  completedAt: t1,
  durationSeconds: 120,
  failure: null,
  image,
  execution: execution(
    "build-build-ok",
    "SUCCEEDED",
    [taskRun("build-build-ok-build-image", "build-image", "SUCCEEDED", ["checkout", "build", "push"].map((n) => step(n)))],
    [
      { name: "sourceCommit", value: okRev },
      { name: "imageDigest", value: digest },
    ],
  ),
};

export const buildLog: Log = {
  taskRun: "build-build-ok-build-image",
  step: "build",
  content: "#1 building\nexporting to oci image format\n",
  truncated: true,
  limitBytes: 262144,
  tailLines: 4000,
};

export const images: { images: ImageEntry[] } = {
  images: [
    {
      ...image,
      buildId: "build-ok",
      buildNumber: 1,
      deliveryRunId: "run-ok",
      deliveryNumber: 1,
      sourceRevision: okRev,
      head12: okRev.slice(0, 12),
      builtAt: t1,
      registryMetadata: null,
      registryMetadataStatus: "not_available",
    },
  ],
};

// A failed build: lint passed, build-image failed in its build step.
export const buildBad: BuildDetail = {
  ...buildOk,
  id: "build-bad",
  number: 2,
  deliveryRunId: "run-bad",
  deliveryNumber: 2,
  status: "FAILED",
  image: null,
  failure: { reason: "BUILD_FAILED", message: "the PipelineRun manual-web-build/build-b failed (Failed)" },
  evidence: "STORED",
  execution: execution(
    "build-b",
    "FAILED",
    [
      taskRun("build-b-lint", "lint", "SUCCEEDED", [step("checkout")]),
      taskRun("build-b-build-image", "build-image", "FAILED", [step("checkout"), step("build", 1)]),
    ],
    [],
  ),
};

export function logOf(taskRun: string, step: string, content: string): Log {
  return { taskRun, step, content, truncated: false, limitBytes: 262144, tailLines: 4000 };
}

// deployment is Deployment #1: Preflight, succeeded, of delivery #1.
export const deployment: DeploymentRef = {
  id: "dep-1",
  number: 1,
  environment: "PREFLIGHT",
  status: "SUCCEEDED",
  deliveryRunId: "run-ok",
  deliveryNumber: 1,
  sourceRevision: okRev,
  head12: okRev.slice(0, 12),
  image: null,
  imageReference: `zot-test.example/apps/${appId}:${okRev.slice(0, 12)}@${digest}`,
  gitopsCommit: "2222222222222222222222222222222222222222",
  tests: null,
  failure: null,
  startedAt: "2026-11-20T10:00:00Z",
  completedAt: "2026-11-20T10:02:00Z",
  durationSeconds: 120,
};

export const baseCommit = "1111111111111111111111111111111111111111";
export const gitopsG = "2222222222222222222222222222222222222222";

// deploymentDetail is Deployment #1 with its Build and its two steps.
export const deploymentDetail: DeploymentDetail = {
  ...deployment,
  build: { id: "build-ok", number: 1, status: "SUCCEEDED" },
  steps: [
    {
      position: 1,
      type: "UPDATE_GITOPS",
      status: "SUCCEEDED",
      startedAt: "2026-11-20T10:00:00Z",
      completedAt: "2026-11-20T10:00:30Z",
      durationSeconds: 30,
      failure: null,
      gitopsUpdate: { number: 4, repository: "alice/hello-gitops-preflight", baseCommit, resultingCommit: gitopsG },
      execution: { executor: "TEKTON", status: "SUCCEEDED", pipelineRun: { namespace: "hello-preflight-update", name: "update-preflight-dep-1" } },
    },
    {
      position: 2,
      type: "RECONCILE",
      status: "SUCCEEDED",
      startedAt: "2026-11-20T10:00:30Z",
      completedAt: "2026-11-20T10:02:00Z",
      durationSeconds: 90,
      failure: null,
      reconciliation: { number: 4, targetRevision: gitopsG },
      execution: { executor: "FLUX", status: "SUCCEEDED" },
    },
  ],
};

// updateStep is the Update GitOps step's page: its GitOpsUpdate and its
// Tekton Execution (resolved from the base commit).
export const updateStep: DeploymentStepDetail = {
  ...deploymentDetail.steps[0],
  deploymentId: "dep-1",
  deploymentNumber: 1,
  execution: {
    ...execution(
      "update-preflight-dep-1",
      "SUCCEEDED",
      [taskRun("update-preflight-dep-1-update", "update-preflight-gitops", "SUCCEEDED", ["checkout", "update", "push"].map((n) => step(n)))],
      [{ name: "gitopsCommit", value: gitopsG }],
    ),
    pipelineRun: { namespace: "hello-preflight-update", name: "update-preflight-dep-1" },
    refSource: { digest: { sha1: baseCommit }, entryPoint: ".pathops/tekton/pipelines/update-preflight-gitops.yaml" },
  },
};

// reconcileStep is the Reconcile step's page: its target (G) and the Flux
// snapshots of exactly G.
export const reconcileStep: DeploymentStepDetail = {
  ...deploymentDetail.steps[1],
  deploymentId: "dep-1",
  deploymentNumber: 1,
  execution: {
    executor: "FLUX",
    status: "SUCCEEDED",
    startedAt: "2026-11-20T10:00:30Z",
    completedAt: "2026-11-20T10:02:00Z",
    observedAt: "2026-11-20T10:02:00Z",
    namespace: "hello-preflight-deploy",
    baselineRevision: baseCommit,
    gitRepository: {
      name: "hello-gitops-preflight",
      found: true,
      generation: 1,
      observedGeneration: 1,
      artifactRevision: `main@sha1:${gitopsG}`,
      ready: { status: "True", reason: "Succeeded" },
      observedAt: "2026-11-20T10:01:00Z",
    },
    kustomization: {
      name: "hello-preflight",
      found: true,
      generation: 2,
      observedGeneration: 2,
      lastAttemptedRevision: `main@sha1:${gitopsG}`,
      lastAppliedRevision: `main@sha1:${gitopsG}`,
      ready: { status: "True", reason: "ReconciliationSucceeded", message: "Applied revision: main@sha1:2222" },
      observedAt: "2026-11-20T10:02:00Z",
    },
  },
};

// deliveryDeployFailed is run #1 whose Reconcile failed: Build Application
// and Update GitOps succeeded, Deploy Preflight and the run FAILED.
export const deliveryDeployFailed: DeliveryDetail = (() => {
  const failure = { reason: "FLUX_RECONCILIATION_FAILED", message: "Ready=False" };
  const [build, deploy] = deliveryOk.steps;
  return {
    ...deliveryOk,
    status: "FAILED",
    failure,
    steps: [
      build,
      {
        ...deploy,
        status: "FAILED",
        failure,
        deployment: { ...deploy.deployment!, status: "FAILED" },
        steps: [deploy.steps![0], { ...deploy.steps![1], status: "FAILED", failure, execution: { executor: "FLUX", status: "FAILED" } }],
      },
    ],
  };
})();

// deliveryRunning is run #1 while its Update GitOps runs.
export const deliveryRunning: DeliveryDetail = (() => {
  const [build, deploy] = deliveryOk.steps;
  return {
    ...deliveryOk,
    status: "RUNNING",
    completedAt: null,
    steps: [
      build,
      {
        ...deploy,
        status: "RUNNING",
        completedAt: null,
        deployment: { ...deploy.deployment!, status: "IN_PROGRESS" },
        steps: [
          { ...deploy.steps![0], status: "RUNNING", completedAt: null },
          { ...deploy.steps![1], status: "PENDING", startedAt: null, completedAt: null, execution: null },
        ],
      },
    ],
  };
})();
