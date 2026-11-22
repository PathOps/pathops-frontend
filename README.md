# PathOps frontend

`pathops-frontend` is the PathOps Application UI (PathOps Decision 0060),
shown to users simply as PathOps: a read-only view of a Cell's Applications for
the developers who own them and for the people who operate PathOps. It is a React + TypeScript single-page application built with
Vite into static files, served by unprivileged nginx. There is no Node.js at
runtime and no backend of its own.

```text
Browser (this UI)
  | REST, same origin, bearer token of the Cell's Dex (client pathops-ui)
  v
Tenant Control Plane  /api/v1/... (read model), /.well-known/pathops
  +-- PostgreSQL           durable PathOps state
  +-- Kubernetes/Tekton    a build's PipelineRun, TaskRuns, step logs
  (Forgejo and zot metadata: not read yet)
```

The browser talks only to the Tenant Control Plane: it never receives a
Forgejo, Kubernetes or registry credential, and it never calls those tools.

## Where it runs

In a Cell, at the Tenant Control Plane's canonical URL,
`https://control-plane-<cell>.<domain>/`: the Cell routes `/api`,
`/.well-known` and `/healthz` to the Tenant Control Plane and everything else to
this UI (`pathops-system/pathops-frontend`). Same origin: no CORS towards the Tenant
Control Plane, no other host, certificate or DNS name.

## Sign-in

OIDC Authorization Code + PKCE (S256) at the Cell's Dex for the public client
named by the Tenant Control Plane's discovery (`ui.clientId`, `pathops-ui`),
redirect `https://control-plane-<cell>.<domain>/auth/callback`. The Tenant
Control Plane accepts these tokens for reads only. Tokens stay in memory; a
reload signs in again through Dex's login session (shared with the CLI and
Forgejo), without a password. Only the PKCE verifier, state and return path
cross the redirect, in `sessionStorage`.

**Sign out** (the user's menu) means the same as `pathops logout`: the page's
tokens are dropped first (the live connection closes with them), then the
browser goes to Dex's `end_session_endpoint` (RP-Initiated Logout) with the
session's ID token as `id_token_hint`. Dex ends the Cell's login session (the
one Forgejo and the Artifact Store sign in with; Dex asks to confirm when the
hint is not its current session) and returns to
`/signed-out` ("You are signed out." and Sign in again), the only
`post_logout_redirect_uri` the core registers.

## Screens (v0.7)

Plain, document-like pages: bordered tables, bold colored statuses, a light
and a dark theme (the system's, or the user's choice). Everything temporal is
latest first; DeliveryRuns and Builds are named by their number within the
Application (`#N`, from the Tenant Control Plane).

The header holds the breadcrumb (PathOps / Applications / ..., or PathOps /
Inbox / #N), the main navigation (**Applications** at `/applications`, `/`
opens it; **Inbox** with the whole Inbox's unread count), the current one
marked, and the signed-in user as a button whose menu switches the theme and
signs out (of pathops-events too). While live updates are not flowing a
discreet note precedes the navigation: **Reconnecting…**, or **Live updates
disconnected** (a reload is the fallback).

Long lists are paged by the Tenant Control Plane (keyset cursors), never cut
in the browser: the Inbox 25 a page (**Newer** / **Older**), Delivery Runs,
Deployments, Builds and Images 10 a page (**Previous** / **Next**), newest first. The page is
`?cursor=` in the URL, so a refresh, a copied link and Back keep it; an end
of the list shows its control disabled, a list of one page none.

- **Applications**: a table of the user's Applications: Production and
  Preflight (the environment's state and how long it has been in it, as
  `Healthy — 2h`, the same as an Application's header; "Not deployed" before
  the first Deployment), last delivery (`#N` and status), provisioning and
  creation time.
- **Application**: the Application ID, a summary (technology, template link,
  last delivery, provisioning; Production "not created yet"; Preflight its
  state, `Healthy — 2h`, never a Deployment or Delivery number; "not created
  yet" without Preflight) and the tabs Production, Preflight, Delivery,
  Deployments, Images, Builds, Repositories, Provisioning (no Validations tab:
  a Validation is shown in its Deployment, Decision 0066). Production says its
  environment has not been created yet, Preflight the same without Preflight; Deployments is always there, empty before the
  first; the others appear when the Tenant Control Plane names them
  (`overview.sections`).
- **Preflight**: how the environment is now, not how it was deployed: Status
  (its state), Commit (its last Deployment's), Last deployed (its current
  version's, relative: `just now`, `2m ago`, `1h ago`, `1d ago`), Tests ("Not
  configured" until Validation execution exists) and **Open App ↗** (a new
  tab) when the Tenant Control Plane gives the environment's URL; none today,
  so no link.
- **Environment state** (`src/environment.ts`, `deriveEnvironmentStatus`),
  derived from the read model, never stored, and not a Deployment's status:
  no Deployment, Not deployed; the last Deployment in progress, Deploying;
  failed, Unstable; succeeded, Healthy while no validations are configured
  (a temporary rule: with Validation execution, Validating while they run,
  Unstable when they fail, Healthy when they succeed). Deployment #5 may be
  Succeeded while its environment is Unstable.
- **Tables**: Deployments `# | Commit | Environment | Status | Tests |
  Started | Duration | Delivery` (Status is the Deployment's own: In progress,
  Succeeded, Failed; Tests its Validation's `passed/total`, `—` until
  Validation exists), Builds `# | Commit | Status | Started | Duration |
  Delivery`, Images `Tag | Environment | Digest | Build | Created`. Commit is the source
  commit's first 12 characters, Delivery the delivery run's `#N` linked, a
  Deployment's `#N` its page. An image's Environment is where it runs now:
  `Preflight`, `Production`, `Preflight, Production` (a promotion reuses the
  artifact) or `—`, from each environment's current Deployment, never
  history. An environment is plain words: color is for statuses. Images copy
  each image's pinned reference (`repository@digest`) beside its tag.
- **Delivery run** (Decision 0066): its facts (commit, source, trigger and
  delivery id, times, error), then its steps as a tree, all open at first:
  Build application with its Build and its Execution (Tekton: PipelineRun,
  TaskRuns, Steps with live logs) as siblings; Deploy preflight with its
  Deployment and its steps Update GitOps (GitOps update and Execution) and
  Reconcile (Reconciliation and Execution: GitRepository, Kustomization).
  Each node is a one-row table hung from its parent by a line; a node with
  children has `[-]`/`[+]`; what a person closes stays closed while live
  updates re-read the tree (not stored: a reload opens everything). The tree
  shows only what tells what happened; every `#` links the page with all of
  it (Build, Deployment, Update GitOps, Reconcile).
- **Deployment**: `Deployment #N`: environment, status (and its error),
  commit, image (its digest, a copy of the reference and the Build that
  produced it), Tests (`—`), delivery, start, duration and GitOps commit (G);
  then its steps (`# | Step | Status | Started | Duration`, `#` links each).
- **Build**, **Update GitOps** and **Reconcile** pages: the step (or Build),
  then the projection (Build; GitOps update: repository, base commit,
  resulting commit; Reconciliation: target revision), then the Execution's
  generic facts (executor, status, times, reason, message), then the
  engine's own: the PipelineRun (where Tekton resolved it from, trigger,
  results), its TaskRuns and steps with exit codes and live logs ("no longer
  available" once pruned); or Flux (namespace, baseline revision, last
  observed) and the GitRepository and Kustomization, each its own key/value
  table.
- Every page of a Delivery, Build or Deployment reads the Tenant Control
  Plane's Application-scoped routes (`/applications/<id>/deliveries|builds|
  deployments/<uuid or number>`).

- **Inbox** (Decision 0061): the header shows **Inbox** with the unread
  count. `/inbox` lists messages like a mail inbox, newest first: number,
  subject (with its Application) and when it arrived; unread ones in bold
  with a dot. Nothing technical (ids, types, deliveries, logs) is listed. A
  row opens `/inbox/<number>`: the subject, the full received time, the body
  as the Cell wrote it, what it is about (Application, revision, delivery
  and build numbers) and the actions its references give, each only when the
  message has that reference: **View application**, **View delivery**,
  **View build**, **Download logs**. Download opens the Cell's Artifact
  Store at the Artifact's URL: the store signs the browser in with the
  Cell's Dex (an existing session is reused) and serves the file itself; the
  UI holds no Artifact Store credential and the Tenant Control Plane never
  carries the bytes. Opening a message marks it read
  (`POST /api/v1/inbox/<number>/read`, the UI's only change).

Repository links open through Forgejo's sign-in
(`/user/login?redirect_to=<path>`), which goes to Dex and lands on the
repository: Forgejo answers 404 for a private repository to a browser not
signed in to it.

## Live updates

Decision 0063: the signed-in UI holds one Socket.IO connection
(the official `socket.io-client` with Socket.IO's default transports:
long-polling, upgraded to WebSocket; `EventProvider`, `src/live/`) to the
Cell's pathops-events at its own host (its URL from the Tenant Control Plane's
discovery, `events.url`), whatever views are open. It is authenticated by the
PathOps token the UI already holds for the Tenant CP, in the handshake's auth
payload: there is no sign-in, session or cookie of pathops-events, and the
token is never in a URL. An
event is only an invalidation (`BUILD_CHANGED`, `DELIVERY_CHANGED`,
`INBOX_CHANGED`, `APPLICATION_CHANGED`, with the Application and the
resource's id, none for the Application itself): a view whose
Topic it matches reads REST again (`useResource`'s `live`); every other view
ignores it. The Topics are in one place (`src/live/topics.ts`):

| View | Reads again on |
|---|---|
| Builds / Delivery Runs / Images (newest page) | that type (an image: `BUILD_CHANGED`), of its Application |
| Builds / Delivery Runs / Images (an older page) | that type, for a row on the page (a new one never moves the page) |
| Build, Delivery run | that Build's / DeliveryRun's id |
| Application overview | its Application (`APPLICATION_CHANGED`) and its DeliveryRuns |
| Provisioning, Repositories | its Application (`APPLICATION_CHANGED`: created, a provisioning Step started or ended) |
| Applications | any Application (`APPLICATION_CHANGED`: a new one, its provisioning) and any DeliveryRun |
| Inbox, the header's unread count | `INBOX_CHANGED` (an older Inbox page: its own messages) |

Those views have no Refresh, and none is polled but for what follows. A dropped
connection reconnects (Socket.IO, with the current token), a refused one is
tried again after a backoff, and a token refused four times in a row ends in
"Live updates disconnected" (never a sign-in); after any reconnection every
live view reads REST again (nothing is replayed). Socket.IO's ping/pong is the
only heartbeat. 20 s before the token expires the UI renews it and hands it
over (`reauth`); otherwise pathops-events closes the connection at its expiry
and it reconnects with the current one. A sign-out closes it, and nothing
reopens it without a token. What no invalidation reports is still read again every 5 s while it
runs: Tekton's progress inside a running build (TaskRuns, steps). No view has
a Refresh.

## Image

```text
ghcr.io/pathops/pathops-frontend:v<version>
```

Releases are published only by the `release` workflow, from tags `v<version>`
equal to `package.json`'s version. Pin the image by digest. The container runs
as a non-root user and needs `PATHOPS_DEX_ORIGIN` (the Cell's Dex origin) and
`PATHOPS_EVENTS_ORIGIN` (its pathops-events origin), the only other origins of
its Content Security Policy; with a read-only root filesystem it needs writable
`/tmp` and `/etc/nginx/conf.d`.

With a certificate and key mounted at `/etc/pathops-frontend/tls`
(`tls.crt`, `tls.key`) it serves HTTPS only, on 8443 (TLS 1.2+), and has no
plaintext listener: in a Cell that is its Cell CA leaf for
`pathops-frontend.pathops-system.svc`, which Traefik verifies when it
re-encrypts to it. Without one it serves plain HTTP on 8080 (a workstation).

## Develop

Node runs only in the pinned build image (`Dockerfile`), through
`scripts/npm.sh`:

```bash
scripts/npm.sh ci
scripts/npm.sh run check              # typecheck, unit tests (Vitest + Testing Library), production build
docker build -t pathops-frontend:local . # the same, then the nginx image
scripts/smoke.sh pathops-frontend:local # serve it read-only and check the SPA and its headers, then over TLS
```
