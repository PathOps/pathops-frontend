// The Tenant CP's read model (internal/readmodel): PathOps domain views, never
// Forgejo, Tekton or zot schemas. Field names follow the API's JSON.

export type Iso = string;

export interface Technology {
  runtime?: string;
  language?: string;
  framework?: string;
  build?: string;
}

// number is the run's or build's #N within its Application (its own
// sequence); id stays its identity in URLs.
export interface DeliveryRef {
  id: string;
  number: number;
  sourceRevision: string;
  head12: string;
  status: string;
  createdAt: Iso;
  completedAt: Iso | null;
}

// EnvironmentRef is an Application's environment (Production, Preflight):
// its health, where the app answers and when its current version was
// deployed. The Tenant CP does not return it yet (absent: not deployed).
export interface EnvironmentRef {
  status: string;
  url?: string;
  deployedAt: Iso | null;
}

export interface ApplicationSummary {
  id: string;
  name: string;
  status: string;
  templateId: string;
  technology: Technology | null;
  provisioning: { status: string; completedAt: Iso | null };
  lastDelivery: DeliveryRef | null;
  production?: EnvironmentRef | null;
  preflight?: EnvironmentRef | null;
  createdAt: Iso;
}

export interface Overview {
  id: string;
  name: string;
  status: string;
  owner: { email: string; name: string };
  createdAt: Iso;
  updatedAt: Iso;
  template: { id: string; source: string; ref: string; revision?: string; digest?: string; url?: string };
  technology: Technology | null;
  provisioning: {
    runId: string;
    status: string;
    createdAt: Iso;
    completedAt: Iso | null;
    steps: number;
    succeeded: number;
  };
  deliveries: { total: number; succeeded: number; failed: number; running: number; last: DeliveryRef | null };
  images: number;
  sections: string[];
  repositories: { role: string; fullName: string; url?: string }[];
}

export interface Attempt {
  number: number;
  status: string;
  observation?: string;
  action?: string;
  externalRef?: string;
  artifactRef?: string;
  sanitizedError?: string;
  startedAt: Iso;
  completedAt: Iso | null;
}

export interface ProvisioningStep {
  position: number;
  type: string;
  status: string;
  attemptCount: number;
  externalRef?: string;
  sanitizedError?: string;
  updatedAt: Iso;
  attempts: Attempt[];
}

export interface Provisioning {
  run: { id: string; type: string; status: string; createdAt: Iso; updatedAt: Iso; completedAt: Iso | null };
  steps: ProvisioningStep[];
}

// RepositoryMetadata is live Forgejo metadata: not read yet (null).
export interface RepositoryMetadata {
  commitCount?: number;
  sizeKiB?: number;
  latestCommit?: string;
  lastActivityAt?: Iso;
}

export interface Repository {
  role: string;
  name: string;
  fullName: string;
  url?: string;
  cloneUrl: string;
  sshUrl: string;
  defaultBranch: string;
  initialCommit: string;
  createdAt: Iso;
  metadata: RepositoryMetadata | null;
  metadataStatus: string;
}

export interface Repositories {
  repositories: Repository[];
  webhook: { events: string[]; lastDeliveryAt: Iso | null } | null;
}

export interface Image {
  repository: string;
  revision: string;
  digest: string;
  reference: string;
  pinnedReference: string;
}

export interface BuildRef {
  id: string;
  number: number;
  status: string;
  image: Image | null;
}

export interface DeliverySummary {
  id: string;
  number: number;
  sourceRevision: string;
  head12: string;
  status: string;
  createdAt: Iso;
  startedAt: Iso | null;
  completedAt: Iso | null;
  durationSeconds: number | null;
  sanitizedError?: string;
  build: BuildRef | null;
}

export interface DeliveryStep {
  id: string;
  position: number;
  type: string;
  executor: string;
  status: string;
  externalRef?: string;
  sanitizedError?: string;
  createdAt: Iso;
  startedAt: Iso | null;
  completedAt: Iso | null;
  durationSeconds: number | null;
  build: BuildRef | null;
}

export interface DeliveryDetail extends DeliverySummary {
  applicationId: string;
  sourceRepository: string;
  sourceRef: string;
  webhookDeliveryId: string;
  steps: DeliveryStep[];
}

export interface BuildSummary {
  id: string;
  number: number;
  applicationId: string;
  deliveryRunId: string;
  deliveryNumber: number;
  deliveryStepId: string;
  sourceRevision: string;
  head12: string;
  status: string;
  createdAt: Iso;
  startedAt: Iso | null;
  completedAt: Iso | null;
  durationSeconds: number | null;
  pipelineRun: { namespace: string; name: string };
  triggerEventId?: string;
  triggeredAt: Iso | null;
  sanitizedError?: string;
  image: Image | null;
}

export interface Result {
  name: string;
  value: string;
}

export interface PipelineRunView {
  status: string;
  reason?: string;
  message?: string;
  startTime: Iso | null;
  completionTime: Iso | null;
  results: Result[];
  taskRuns: { name: string; pipelineTask: string }[];
}

// observation: "observed", "not_found" (pruned or not created yet) or
// "unavailable" (the Tenant CP could not read Tekton).
export interface BuildDetail extends BuildSummary {
  observation: string;
  pipelineRunStatus: PipelineRunView | null;
}

export interface StepView {
  name: string;
  state: string;
  reason?: string;
  exitCode: number | null;
  startedAt: Iso | null;
  finishedAt: Iso | null;
}

export interface TaskRunView {
  name: string;
  pipelineTask: string;
  task?: string;
  observation: string;
  status?: string;
  reason?: string;
  message?: string;
  startTime: Iso | null;
  completionTime: Iso | null;
  steps: StepView[];
  results: Result[];
}

export interface Tasks {
  buildId: string;
  observation: string;
  taskRuns: TaskRunView[];
}

export interface Log {
  buildId: string;
  taskRun: string;
  step: string;
  content: string;
  truncated: boolean;
  limitBytes: number;
  tailLines: number;
}

// RegistryMetadata is live zot metadata: not read yet (null).
export interface RegistryMetadata {
  sizeBytes?: number;
  createdAt?: Iso;
}

export interface ImageEntry extends Image {
  buildId: string;
  buildNumber: number;
  deliveryRunId: string;
  deliveryNumber: number;
  sourceRevision: string;
  head12: string;
  builtAt: Iso | null;
  registryMetadata: RegistryMetadata | null;
  registryMetadataStatus: string;
}

export interface Me {
  subject: string;
  email?: string;
  name?: string;
  issuer: string;
  cellId: string;
}
