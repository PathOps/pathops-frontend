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

## Screens (v0.1)

- **Applications**: the user's Applications, technology, provisioning and last
  delivery (HEAD12).
- **Application**: the sections the Tenant Control Plane names
  (`overview.sections`): General (owner, template at its exact revision,
  declared technology, repositories), Provisioning (Run, ordered Steps,
  Attempts, errors), Repositories (source, preflight GitOps, production
  GitOps: canonical Forgejo links, clone URLs; live metadata "coming later"),
  Builds, Images (`repository:HEAD12`, digest; registry metadata "coming later"),
  Delivery Runs.
- **Delivery run**: a timeline built from its DeliverySteps: commit HEAD12 ->
  push received -> each step -> the OCI image (or "No image" for a failed
  build). A new step type appears without a UI change.
- **Build**: Application -> DeliveryRun -> BUILD_APPLICATION step -> Build ->
  PipelineRun; the PipelineRun's status and results, its TaskRuns and their
  steps, and each step's log (the last 4000 lines, at most 256 KiB, as the
  Tenant Control Plane bounds it; not streamed).

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
