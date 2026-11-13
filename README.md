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

## Screens (v0.2)

Plain, document-like pages: bordered tables, bold colored statuses, a light
and a dark theme (the system's, or the user's choice). Everything temporal is
latest first; DeliveryRuns and Builds are named by their number within the
Application (`#N`, from the Tenant Control Plane).

- **Applications**: a table of the user's Applications: technology, template,
  provisioning, last delivery (`#N` and status), and Production and Preflight
  (an open link and the current version's deploy time; "not deployed" until
  the Tenant Control Plane records environment deploys).
- **Application**: the Application ID, a summary (technology, template link,
  last delivery, provisioning; Production and Preflight "not created yet")
  and the tabs Production, Preflight, Delivery, Validations, Images, Builds,
  Repositories, Provisioning. Images copy each image's pinned reference
  (`repository@digest`, what a manifest uses) beside its tag. Production and
  Preflight say their environment has not been created yet, Validations that
  there are none, until their slices ship (an Application whose provisioning
  stopped half-way has none either); the others appear when the Tenant
  Control Plane names them (`overview.sections`).
- **Delivery run**: its facts (commit, source, times, error), its DeliverySteps
  latest first (a new step type appears without a UI change), and the OCI
  image (or "No image"). A step's details are its build tree: Build ->
  PipelineRun -> TaskRuns -> steps; a failed step starts open.
- **Build**: its facts (Build ID first) and delivery, the PipelineRun's status
  and results, its TaskRuns (each a facts table) and their steps. Each step's log (the last 4000 lines, at most
  256 KiB, as the Tenant Control Plane bounds it; not streamed) opens in the
  row under the step, one at a time.

Repository links open through Forgejo's sign-in
(`/user/login?redirect_to=<path>`), which goes to Dex and lands on the
repository: Forgejo answers 404 for a private repository to a browser not
signed in to it.

Running deliveries and builds are read again every 5 s while they run, and
every view has Refresh. There is no push channel yet (no SSE, no WebSocket).

## Image

```text
ghcr.io/pathops/pathops-frontend:v<version>
```

Releases are published only by the `release` workflow, from tags `v<version>`
equal to `package.json`'s version. Pin the image by digest. The container
listens on 8080 as a non-root user and needs `PATHOPS_DEX_ORIGIN` (the Cell's
Dex origin, the only other origin of its Content Security Policy); with a
read-only root filesystem it needs writable `/tmp` and `/etc/nginx/conf.d`.

## Develop

Node runs only in the pinned build image (`Dockerfile`), through
`scripts/npm.sh`:

```bash
scripts/npm.sh ci
scripts/npm.sh run check              # typecheck, unit tests (Vitest + Testing Library), production build
docker build -t pathops-frontend:local . # the same, then the nginx image
scripts/smoke.sh pathops-frontend:local # serve it read-only and check the SPA and its headers
```
