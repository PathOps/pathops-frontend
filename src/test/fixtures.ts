// Read-model answers as the Tenant CP gives them, for the component tests.
import type {
  ApplicationSummary,
  BuildDetail,
  DeliveryDetail,
  DeliverySummary,
  ImageEntry,
  Log,
  Overview,
  Provisioning,
  Repositories,
  Tasks,
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
      sourceRevision: badRev,
      head12: badRev.slice(0, 12),
      status: "FAILED",
      createdAt: t1,
      startedAt: t1,
      completedAt: t1,
      durationSeconds: 61,
      sanitizedError: "BUILD_APPLICATION: the PipelineRun manual-web-ci/build-b failed (Failed)",
      build: { id: "build-bad", number: 2, status: "FAILED", image: null },
    },
    {
      id: "run-ok",
      number: 1,
      sourceRevision: okRev,
      head12: okRev.slice(0, 12),
      status: "SUCCEEDED",
      createdAt: t0,
      startedAt: t0,
      completedAt: t1,
      durationSeconds: 120,
      build: { id: "build-ok", number: 1, status: "SUCCEEDED", image },
    },
  ],
};

function detail(s: DeliverySummary, step: Partial<DeliveryDetail["steps"][number]> = {}): DeliveryDetail {
  return {
    ...s,
    applicationId: appId,
    sourceRepository: "alice/manual-web",
    sourceRef: "refs/heads/main",
    webhookDeliveryId: "wd-1",
    steps: [
      {
        id: "step-1",
        position: 1,
        type: "BUILD_APPLICATION",
        executor: "TEKTON",
        status: s.status,
        externalRef: `pipelinerun:manual-web-ci/build-${s.build?.id}`,
        sanitizedError: s.sanitizedError?.replace("BUILD_APPLICATION: ", ""),
        createdAt: s.createdAt,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        durationSeconds: s.durationSeconds,
        build: s.build,
        ...step,
      },
    ],
  };
}

export const deliveryOk = detail(deliveries.deliveries[1]);
export const deliveryBad = detail(deliveries.deliveries[0]);

export const buildOk: BuildDetail = {
  id: "build-ok",
  number: 1,
  applicationId: appId,
  deliveryRunId: "run-ok",
  deliveryNumber: 1,
  deliveryStepId: "step-1-uuid",
  sourceRevision: okRev,
  head12: okRev.slice(0, 12),
  status: "SUCCEEDED",
  createdAt: t0,
  startedAt: t0,
  completedAt: t1,
  durationSeconds: 120,
  pipelineRun: { namespace: "manual-web-ci", name: "build-build-ok" },
  triggerEventId: "event-1",
  triggeredAt: t0,
  image,
  observation: "observed",
  pipelineRunStatus: {
    status: "True",
    reason: "Succeeded",
    startTime: t0,
    completionTime: t1,
    results: [
      { name: "sourceCommit", value: okRev },
      { name: "imageDigest", value: digest },
    ],
    taskRuns: [{ name: "build-build-ok-build-image", pipelineTask: "build-image" }],
  },
};

export const tasksOk: Tasks = {
  buildId: "build-ok",
  observation: "observed",
  taskRuns: [
    {
      name: "build-build-ok-build-image",
      pipelineTask: "build-image",
      task: "build-image",
      observation: "observed",
      status: "True",
      reason: "Succeeded",
      startTime: t0,
      completionTime: t1,
      steps: ["checkout", "build", "push"].map((name) => ({
        name,
        state: "terminated",
        reason: "Completed",
        exitCode: 0,
        startedAt: t0,
        finishedAt: t1,
      })),
      results: [{ name: "imageDigest", value: digest }],
    },
  ],
};

export const buildLog: Log = {
  buildId: "build-ok",
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
  sanitizedError: "the PipelineRun manual-web-ci/build-b failed (Failed)",
  pipelineRun: { namespace: "manual-web-ci", name: "build-b" },
  pipelineRunStatus: {
    status: "False",
    reason: "Failed",
    message: "Tasks Completed: 2 (Failed: 1, Cancelled 0), Skipped: 0",
    startTime: t0,
    completionTime: t1,
    results: [],
    taskRuns: [
      { name: "build-b-lint", pipelineTask: "lint" },
      { name: "build-b-build-image", pipelineTask: "build-image" },
    ],
  },
};

export const tasksBad: Tasks = {
  buildId: "build-bad",
  observation: "observed",
  taskRuns: [
    { ...tasksOk.taskRuns[0], name: "build-b-lint", pipelineTask: "lint", task: "lint", steps: [tasksOk.taskRuns[0].steps[0]], results: [] },
    {
      ...tasksOk.taskRuns[0],
      name: "build-b-build-image",
      status: "False",
      reason: "Failed",
      steps: [tasksOk.taskRuns[0].steps[0], { ...tasksOk.taskRuns[0].steps[1], reason: "Error", exitCode: 1 }],
      results: [],
    },
  ],
};

export function logOf(taskRun: string, step: string, content: string): Log {
  return { buildId: "build-bad", taskRun, step, content, truncated: false, limitBytes: 262144, tailLines: 4000 };
}
