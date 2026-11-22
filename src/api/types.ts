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
// its last Deployment's status, where the app answers and when its current
// version was deployed (absent or null: never deployed).
export interface EnvironmentRef {
  status: string;
  url?: string;
  deployedAt: Iso | null;
  deployment?: DeploymentRef | null;
}

// Failure is why a run, step or Deployment FAILED: a reason code and the
// sanitized message.
export interface Failure {
  reason: string;
  message?: string;
}

// DeploymentRef is a Deployment (Decisions 0064, 0066): one image applied to
// one environment, numbered within the Application. Its status, times and
// failure are its step's; gitopsCommit is the GitOps commit its update
// produced (G); tests is its Validation's (null: none yet).
export interface DeploymentRef {
  id: string;
  number: number;
  environment: string;
  status: string;
  deliveryRunId: string;
  deliveryNumber: number;
  sourceRevision: string;
  head12: string;
  image: Image | null;
  imageReference: string;
  gitopsCommit?: string;
  tests: { passed: number; total: number } | null;
  failure: Failure | null;
  startedAt: Iso;
  completedAt: Iso | null;
  durationSeconds: number | null;
}

// EnvironmentSummary is an environment's page: its last Deployment and the
// last successful one (what runs there now).
// url is where the deployed app answers, when PathOps exposes the
// environment (absent: not exposed, no link).
export interface EnvironmentSummary {
  environment: string;
  last: DeploymentRef | null;
  current: DeploymentRef | null;
  url?: string;
}

// ExecutionSummary is what an engine reported, in short: its own status,
// separate from the step's (PathOps' verdict).
export interface ExecutionSummary {
  executor: string;
  status: string;
  reason?: string;
  message?: string;
  pipelineRun?: { namespace: string; name: string };
}

// GitOpsUpdate is an Update GitOps step's facts: the repository, the commit
// it updated (base; also where Tekton resolved the update from) and the
// commit it produced, once accepted (G).
export interface GitOpsUpdate {
  // number is its #N within the Application (its own sequence, like a Build's).
  number: number;
  repository: string;
  baseCommit: string;
  resultingCommit?: string;
}

// DeploymentStep is one step of a Deployment (Update GitOps, Reconcile;
// Validate later): PathOps' verdict, its facts and its Execution's summary.
export interface DeploymentStep {
  position: number;
  type: string;
  status: string;
  startedAt: Iso | null;
  completedAt: Iso | null;
  durationSeconds: number | null;
  failure: Failure | null;
  gitopsUpdate?: GitOpsUpdate;
  // number is its #N within the Application (its own sequence).
  reconciliation?: { number: number; targetRevision: string };
  execution: ExecutionSummary | null;
}

// DeploymentDetail is one Deployment's page: the Deployment, the Build that
// produced its image and its steps.
export interface DeploymentDetail extends DeploymentRef {
  build: { id: string; number: number; status: string } | null;
  steps: DeploymentStep[];
}

// DeploymentStepDetail is one step of a Deployment with its full Execution.
export interface DeploymentStepDetail extends Omit<DeploymentStep, "execution"> {
  deploymentId: string;
  deploymentNumber: number;
  execution: TektonExecution | FluxExecution | null;
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
  // Present for an Application with the Preflight capability.
  preflight?: EnvironmentSummary | null;
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
  trigger: string;
  sourceRevision: string;
  head12: string;
  status: string;
  createdAt: Iso;
  startedAt: Iso | null;
  completedAt: Iso | null;
  durationSeconds: number | null;
  failure: Failure | null;
  build: BuildRef | null;
}

// DeliveryStep is one step of a DeliveryRun (Decision 0066): a top-level
// step carries its Build or Deployment; a composite one its children.
export interface DeliveryStep {
  position: number;
  type: string;
  status: string;
  startedAt: Iso | null;
  completedAt: Iso | null;
  durationSeconds: number | null;
  failure: Failure | null;
  build?: BuildRef;
  deployment?: { id: string; number: number; environment: string; status: string };
  execution: ExecutionSummary | null;
  steps?: DeliveryStep[];
}

export interface DeliveryDetail extends DeliverySummary {
  applicationId: string;
  triggerId: string;
  sourceRepository: string;
  sourceRef: string;
  steps: DeliveryStep[];
}

export interface BuildSummary {
  id: string;
  number: number;
  applicationId: string;
  deliveryRunId: string;
  deliveryNumber: number;
  sourceRevision: string;
  head12: string;
  status: string;
  startedAt: Iso | null;
  completedAt: Iso | null;
  durationSeconds: number | null;
  failure: Failure | null;
  image: Image | null;
}

export interface Result {
  name: string;
  value: string;
}

// RefSource is where Tekton reported resolving a definition from
// (status.provenance.refSource).
export interface RefSource {
  uri?: string;
  digest?: Record<string, string>;
  entryPoint?: string;
}

export interface StepRecord {
  name: string;
  state: string;
  reason?: string;
  exitCode: number | null;
  startedAt: Iso | null;
  finishedAt: Iso | null;
}

// TaskRunRecord is one TaskRun as PathOps recorded it: observedAt null when
// it was named by its PipelineRun but never read.
export interface TaskRunRecord {
  name: string;
  pipelineTask: string;
  task?: string;
  status?: string;
  reason?: string;
  message?: string;
  startedAt: Iso | null;
  completedAt: Iso | null;
  observedAt: Iso | null;
  results: Result[];
  refSource: RefSource | null;
  steps: StepRecord[];
}

// TektonExecution is a Tekton Execution as PathOps recorded it: it stays
// after Tekton prunes its objects. Logs are read live.
export interface TektonExecution {
  executor: "TEKTON";
  status: string;
  reason?: string;
  message?: string;
  createdAt: Iso;
  startedAt: Iso | null;
  completedAt: Iso | null;
  observedAt: Iso | null;
  pipelineRun: { namespace: string; name: string; uid?: string };
  triggerEventId?: string;
  triggeredAt: Iso | null;
  results: Result[];
  refSource: RefSource | null;
  taskRuns: TaskRunRecord[];
}

// FluxObject is a Flux object's last observed state (found false: it did
// not exist).
export interface FluxObject {
  name: string;
  found: boolean;
  generation: number | null;
  observedGeneration: number | null;
  artifactRevision?: string;
  lastAttemptedRevision?: string;
  lastAppliedRevision?: string;
  ready: { status: string; reason?: string; message?: string } | null;
  observedAt: Iso;
}

// FluxExecution is a Flux Execution as PathOps recorded it: the objects, the
// source revision Flux had when it started (baseline) and their last state.
export interface FluxExecution {
  executor: "FLUX";
  status: string;
  reason?: string;
  message?: string;
  startedAt: Iso | null;
  completedAt: Iso | null;
  observedAt: Iso | null;
  namespace: string;
  baselineRevision?: string;
  gitRepository: FluxObject | null;
  kustomization: FluxObject | null;
}

// BuildDetail is a Build with its Execution and where its evidence is.
export interface BuildDetail extends BuildSummary {
  evidence?: string;
  execution: TektonExecution | null;
}

export interface Log {
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

// A page of a paged list (Tenant CP keyset pagination): the opaque cursors
// of the older (next) and newer (previous) pages, null at an end.
export interface Paged {
  nextCursor: string | null;
  previousCursor: string | null;
}

// The Inbox (Decision 0061): a page of the owner's messages, newest first;
// unread counts the whole Inbox.
export interface Inbox extends Paged {
  messages: InboxMessage[];
  unread: number;
}

// An Inbox message: its number is its human name (its id stays its
// identity); subject and body are plain text as the Cell wrote them. Each
// reference is null when the message has none, and so is the action it
// gives.
export interface InboxMessage {
  id: string;
  number: number;
  type: string;
  subject: string;
  body: string;
  read: boolean;
  readAt: Iso | null;
  createdAt: Iso;
  applicationId: string | null;
  deliveryRunId: string | null;
  deliveryStepId: string | null;
  buildId: string | null;
  artifactId: string | null;
  application: { id: string; name: string } | null;
  delivery: { id: string; number: number; sourceRevision: string; head12: string; status: string } | null;
  build: { id: string; number: number; status: string } | null;
  // downloadUrl is the Cell Artifact Store's own page: the browser signs in
  // there (Dex) and downloads directly; the Tenant CP never serves the bytes.
  artifact: { id: string; type: string; mediaType: string; size: number; sha256: string; downloadUrl: string; createdAt: Iso } | null;
}
