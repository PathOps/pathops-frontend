import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { authorizationUrl, completeSignIn, loadConfig, resetForTests, signedIn } from "../auth/oidc";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App";
import { Ago, Duration, EnvironmentLabel, Status } from "../components/ui";
import type { DeliveryDetail } from "../api/types";
import { fakeApi, renderAt } from "../test/render";
import * as f from "../test/fixtures";

const app = `/api/v1/applications/${f.appId}`;
const all = {
  "/api/v1/applications": f.applications,
  [`${app}/overview`]: f.overview,
  [`${app}/provisioning`]: f.provisioning,
  [`${app}/repositories`]: f.repositories,
  [`${app}/deliveries`]: f.deliveries,
  [`${app}/deliveries/run-ok`]: f.deliveryOk,
  [`${app}/deliveries/run-bad`]: f.deliveryBad,
  [`${app}/images`]: f.images,
  [`${app}/builds`]: { builds: [] },
  [`${app}/deployments`]: { deployments: [], nextCursor: null, previousCursor: null },
  [`${app}/builds/build-ok`]: f.buildOk,
  [`${app}/builds/build-ok/tasks/build-build-ok-build-image/logs?step=checkout`]: { ...f.buildLog, step: "checkout", content: "cloned" },
  [`${app}/builds/build-ok/tasks/build-build-ok-build-image/logs?step=build`]: f.buildLog,
  [`${app}/builds/build-ok/tasks/build-build-ok-build-image/logs?step=push`]: { ...f.buildLog, step: "push", content: "pushed" },
  [`${app}/builds/build-bad`]: f.buildBad,
  [`${app}/builds/build-bad/tasks/build-b-lint/logs?step=checkout`]: f.logOf("build-b-lint", "checkout", "lint checkout ok"),
  [`${app}/builds/build-bad/tasks/build-b-build-image/logs?step=checkout`]: f.logOf("build-b-build-image", "checkout", "image checkout ok"),
  [`${app}/builds/build-bad/tasks/build-b-build-image/logs?step=build`]: f.logOf("build-b-build-image", "build", "ERROR: failed to solve"),
  [`${app}/deployments/dep-1`]: f.deploymentDetail,
  [`${app}/deployments/dep-1/steps/UPDATE_GITOPS`]: f.updateStep,
  [`${app}/deployments/dep-1/steps/RECONCILE`]: f.reconcileStep,
  [`${app}/deployments/dep-1/steps/UPDATE_GITOPS/tasks/update-preflight-dep-1-update/logs?step=push`]: f.logOf(
    "update-preflight-dep-1-update",
    "push",
    "pushed " + f.gitopsG,
  ),
};

// children are a tree node's own child nodes (not their descendants).
const children = (node: HTMLElement) => Array.from(node.querySelectorAll(":scope > ul > li[role=treeitem]")) as HTMLElement[];
const names = (node: HTMLElement) => children(node).map((c) => c.getAttribute("aria-label"));

describe("Applications", () => {
  it("shows loading, then the user's Applications as a table", async () => {
    let resolve: (v: unknown) => void = () => {};
    const api = fakeApi({ "/api/v1/applications": new Promise((r) => (resolve = r)) });
    renderAt("/", api);
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    resolve(f.applications);
    expect(await screen.findByRole("link", { name: "manual-web" })).toHaveAttribute("href", `/applications/${f.appId}`);
    expect(screen.getByRole("link", { name: "#1" })).toHaveAttribute("href", `/applications/${f.appId}/deliveries/run-ok`);
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Application",
      "Production",
      "Preflight",
      "Last delivery",
      "Provisioning",
      "Created",
    ]);
    expect(screen.getAllByText("Not deployed")).toHaveLength(2);
  });

  it("shows an environment as its state and how long it has been in it, as the header does: Healthy — 2h, no Deployment numbers", async () => {
    const at = new Date(Date.now() - 2 * 3600 * 1000 - 60_000).toISOString();
    const last = { ...f.deployment, completedAt: at };
    const app = { ...f.applications.applications[0], preflight: { status: "SUCCEEDED", deployedAt: at, deployment: last } };
    renderAt("/", fakeApi({ "/api/v1/applications": { applications: [app] } }));
    const healthy = await screen.findByText("Healthy");
    expect(healthy).toHaveClass("status-ok");
    const cell = healthy.closest("td")!;
    expect(cell).toHaveTextContent(/^Healthy — 2h$/);
    expect(within(cell).queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getAllByText("Not deployed")).toHaveLength(1);
  });

  it("shows an empty list", async () => {
    renderAt("/", fakeApi({ "/api/v1/applications": { applications: [] } }));
    expect(await screen.findByText("Nothing here yet.")).toBeInTheDocument();
  });

  it("shows the Tenant CP's error", async () => {
    renderAt("/", fakeApi({ "/api/v1/applications": new ApiError(500, "internal_error") }));
    expect(await screen.findByRole("alert")).toHaveTextContent("500");
  });

  it("navigates from the list to an Application, opened at its delivery runs", async () => {
    renderAt("/", fakeApi(all));
    await userEvent.click(await screen.findByRole("link", { name: "manual-web" }));
    expect(await screen.findByRole("heading", { level: 1, name: "manual-web" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Delivery Runs" })).toBeInTheDocument();
  });
});

describe("Application", () => {
  it("has a summary and the tabs, the planned ones saying they have nothing yet", async () => {
    renderAt(`/applications/${f.appId}/deliveries`, fakeApi(all));
    const tabs = await screen.findByRole("navigation", { name: "Application sections" });
    expect(within(tabs).getAllByRole("link").map((l) => l.textContent)).toEqual([
      "Production",
      "Preflight",
      "Delivery",
      "Deployments",
      "Images",
      "Builds",
      "Repositories",
      "Provisioning",
    ]);
    const summary = screen.getByRole("table", { name: "Summary" });
    expect(summary).toHaveTextContent("any · container · Dockerfile (BuildKit)");
    expect(within(summary).getByRole("link", { name: "generic-container ↗" })).toHaveAttribute("href", f.overview.template.url);
    expect(within(summary).getByRole("link", { name: "#1" })).toHaveAttribute("href", `/applications/${f.appId}/deliveries/run-ok`);
    expect(summary).toHaveTextContent("Production");
    expect(screen.getByText(f.appId)).toBeInTheDocument();
    for (const [planned, state] of [
      ["Production", "The production environment has not been created yet."],
      ["Preflight", "The preflight environment has not been created yet."],
      ["Deployments", "Nothing here yet."],
    ]) {
      await userEvent.click(within(tabs).getByRole("link", { name: planned }));
      const section = await screen.findByRole("region", { name: planned });
      expect(within(section).getByRole("heading", { level: 2, name: planned })).toBeInTheDocument();
      expect(within(section).getByText(state)).toBeInTheDocument();
    }
  });

  it("is not found for an id that is not the user's", async () => {
    renderAt(`/applications/22222222-2222-4222-8222-222222222222/deliveries`, fakeApi(all));
    expect(await screen.findByRole("alert")).toHaveTextContent("Not found, or not yours.");
  });

  it("sends an old or unknown section to the delivery runs", async () => {
    renderAt(`/applications/${f.appId}/general`, fakeApi(all));
    expect(await screen.findByRole("heading", { name: "Delivery Runs" })).toBeInTheDocument();
  });

  it("lists the provisioning Steps latest first with their errors", async () => {
    renderAt(`/applications/${f.appId}/provisioning`, fakeApi(all));
    const table = await screen.findByRole("table", { name: "Provisioning steps" });
    const rows = within(table).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Configure build and push access isolation");
    expect(rows[rows.length - 1]).toHaveTextContent("Resolve template");
    expect(table).toHaveTextContent("conflict: alice/manual-web exists");
  });

  it("lists the three repositories, linked through Forgejo's sign-in", async () => {
    renderAt(`/applications/${f.appId}/repositories`, fakeApi(all));
    const src = await screen.findByRole("link", { name: "alice/manual-web ↗" });
    expect(src).toHaveAttribute("href", "https://forgejo-canary.demo.pathops.io/user/login?redirect_to=%2Falice%2Fmanual-web");
    expect(src).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("link", { name: "alice/manual-web-gitops-production ↗" })).toBeInTheDocument();
    expect(screen.getByText("gitops-preflight")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Clone" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Branch" })).not.toBeInTheDocument();
    const section = screen.getByRole("region", { name: "Repositories" });
    // Live (APPLICATION_CHANGED): no Refresh.
    expect(within(section).queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
    expect(section).not.toHaveTextContent("Source webhook");
  });

  it("lists images with their tag, digest, build and a copy of the pinned reference", async () => {
    renderAt(`/applications/${f.appId}/images`, fakeApi(all));
    expect(await screen.findByTitle(f.digest)).toBeInTheDocument();
    expect(screen.queryByText(/^Repository:/)).not.toBeInTheDocument();
    expect(screen.getByText("274af150e590")).toBeInTheDocument();
    const section = screen.getByRole("region", { name: "Images" });
    // Live (Decision 0063): no Refresh.
    expect(within(section).queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
    expect(within(section).getAllByRole("button", { name: /^Copy / }).map((b) => b.getAttribute("aria-label"))).toEqual([
      `Copy zot-canary.demo.pathops.io/apps/${f.appId}@${f.digest}`,
    ]);
    expect(within(section).getByRole("link", { name: "#1" })).toHaveAttribute("href", `/applications/${f.appId}/builds/build-ok`);
  });

  it("lists builds by number with their delivery", async () => {
    renderAt(`/applications/${f.appId}/builds`, fakeApi({ ...all, [`${app}/builds`]: { builds: [f.buildBad, f.buildOk] } }));
    const links = await screen.findAllByRole("link", { name: "#2" });
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["#", "Commit", "Status", "Started", "Duration", "Delivery"]);
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      `/applications/${f.appId}/builds/build-bad`,
      `/applications/${f.appId}/deliveries/run-bad`,
    ]);
  });

  it("lists delivery runs by number, newest first", async () => {
    renderAt(`/applications/${f.appId}/deliveries`, fakeApi(all));
    const section = await screen.findByRole("region", { name: "Delivery" });
    const runs = await within(section).findAllByRole("link", { name: /^#\d+$/ });
    expect(runs.map((l) => l.textContent)).toEqual(["#2", "#1"]);
    expect(runs[1]).toHaveAttribute("href", `/applications/${f.appId}/deliveries/run-ok`);
    expect(within(section).getAllByRole("columnheader")[0]).toHaveTextContent(/^#$/);
    expect(section).toHaveTextContent("202161553024");
  });
});

describe("Delivery run", () => {
  const tree = async () => screen.findByRole("tree", { name: "Delivery tree" });
  const roots = (t: HTMLElement) => Array.from(t.querySelectorAll(":scope > li[role=treeitem]")) as HTMLElement[];
  const top = (t: HTMLElement, name: string) => roots(t).find((n) => n.getAttribute("aria-label") === name)!;
  const child = (n: HTMLElement, name: string | RegExp) =>
    children(n).find((c) => (typeof name === "string" ? c.getAttribute("aria-label") === name : name.test(c.getAttribute("aria-label") ?? "")))!;
  const withRun = (run: DeliveryDetail) => fakeApi({ ...all, [`${app}/deliveries/run-x`]: run });

  it("a succeeded run opens compact: its steps closed, in Title Case, each # only a position", async () => {
    renderAt(`/applications/${f.appId}/deliveries/run-ok`, fakeApi(all));
    const t = await tree();
    expect(roots(t).map((n) => n.getAttribute("aria-label"))).toEqual(["Build Application", "Deploy Preflight"]);
    for (const n of roots(t)) {
      expect(within(n).getByRole("button", { name: `Expand ${n.getAttribute("aria-label")}` })).toHaveTextContent("[+]");
      expect(children(n)).toHaveLength(0);
    }
    const step = within(t).getByRole("table", { name: "Step Build Application" });
    expect(within(step).getAllByRole("cell").map((c) => c.textContent)).toEqual(["1", "Build Application", "Succeeded", expect.any(String), "2m 00s"]);
    expect(within(step).queryByRole("link")).toBeNull();
    expect(within(within(t).getByRole("table", { name: "Step Deploy Preflight" })).queryByRole("link")).toBeNull();
  });

  it("+ on a step opens its whole branch: projection and Execution siblings, every descendant open", async () => {
    renderAt(`/applications/${f.appId}/deliveries/run-ok`, fakeApi(all));
    const t = await tree();
    await userEvent.click(within(t).getByRole("button", { name: "Expand Build Application" }));
    const build = top(t, "Build Application");
    await waitFor(() => expect(names(build)).toEqual(["Build #1", "Execution Tekton"]));
    const exec = child(build, "Execution Tekton");
    expect(names(exec)).toEqual(["PipelineRun build-build-ok"]);
    expect(names(children(exec)[0])).toEqual(["TaskRun build-image"]);
    expect(within(children(children(exec)[0])[0]).getByRole("table", { name: "Steps of build-image" })).toHaveTextContent("checkout");
    for (const b of within(build).getAllByRole("button", { name: /^(Collapse|Expand) / })) expect(b).toHaveTextContent("[-]");
    // Execution: no empty first column.
    expect(within(within(exec).getAllByRole("table", { name: "Execution Tekton" })[0]).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "Executor",
      "Status",
      "Duration",
    ]);
    // The projection's # links its page.
    expect(within(within(build).getByRole("table", { name: "Build" })).getByRole("link", { name: "#1" })).toHaveAttribute(
      "href",
      `/applications/${f.appId}/builds/build-ok`,
    );
    // The other step is still closed.
    expect(children(top(t, "Deploy Preflight"))).toHaveLength(0);
  });

  it("Deploy Preflight's branch: Deployment, Update GitOps (GitOps update #N, Execution) and Reconcile (Reconciliation #N, Execution: Flux objects)", async () => {
    renderAt(`/applications/${f.appId}/deliveries/run-ok`, fakeApi(all));
    const t = await tree();
    await userEvent.click(within(t).getByRole("button", { name: "Expand Deploy Preflight" }));
    const deploy = top(t, "Deploy Preflight");
    expect(names(deploy)).toEqual(["Deployment #1", "Update GitOps", "Reconcile"]);
    const update = child(deploy, "Update GitOps");
    const reconcile = child(deploy, "Reconcile");
    await waitFor(() => expect(names(update)).toEqual(["GitOps update #4", "Execution Tekton"]));
    await waitFor(() => expect(names(reconcile)).toEqual(["Reconciliation #4", "Execution Flux"]));
    expect(names(child(reconcile, "Execution Flux"))).toEqual(["GitRepository", "Kustomization"]);
    expect(within(within(update).getByRole("table", { name: "GitOps update" })).getByRole("link", { name: "#4" })).toHaveAttribute(
      "href",
      `/applications/${f.appId}/deployments/dep-1/steps/UPDATE_GITOPS`,
    );
    expect(within(within(reconcile).getByRole("table", { name: "Reconciliation" })).getByRole("link", { name: "#4" })).toHaveAttribute(
      "href",
      `/applications/${f.appId}/deployments/dep-1/steps/RECONCILE`,
    );
    expect(within(within(deploy).getByRole("table", { name: "Deployment" })).getByRole("link", { name: "#1" })).toHaveAttribute(
      "href",
      `/applications/${f.appId}/deployments/dep-1`,
    );
    for (const name of ["Update GitOps", "Reconcile"])
      expect(within(within(deploy).getByRole("table", { name: `Step ${name}` })).queryByRole("link")).toBeNull();
    // Compact: no digest, uid, trigger event, refSource, baseline or base commit.
    for (const gone of ["uid-", "event-1", f.baseCommit.slice(0, 12), ".pathops/tekton", "Applied revision"]) expect(t).not.toHaveTextContent(gone);
    // A live log in the tree.
    const steps = await waitFor(() => within(update).getByRole("table", { name: "Steps of update-preflight-gitops" }));
    await userEvent.click(within(within(steps).getByRole("cell", { name: "push" }).closest("tr")!).getByRole("button", { name: "View log" }));
    expect(await within(t).findByRole("log", { name: "Log of push" })).toHaveTextContent("pushed " + f.gitopsG);
  });

  it("a child closes on its own; closing the root hides the branch, opening it opens the whole branch again", async () => {
    renderAt(`/applications/${f.appId}/deliveries/run-ok`, fakeApi(all));
    const t = await tree();
    await userEvent.click(within(t).getByRole("button", { name: "Expand Deploy Preflight" }));
    const deploy = top(t, "Deploy Preflight");
    await waitFor(() => expect(names(child(deploy, "Reconcile"))).toEqual(["Reconciliation #4", "Execution Flux"]));
    await userEvent.click(within(deploy).getByRole("button", { name: "Collapse Update GitOps" }));
    expect(children(child(deploy, "Update GitOps"))).toHaveLength(0);
    expect(names(child(deploy, "Reconcile"))).toEqual(["Reconciliation #4", "Execution Flux"]);
    await userEvent.click(within(deploy).getByRole("button", { name: "Collapse Deploy Preflight" }));
    expect(children(top(t, "Deploy Preflight"))).toHaveLength(0);
    await userEvent.click(within(t).getByRole("button", { name: "Expand Deploy Preflight" }));
    await waitFor(() => expect(names(child(top(t, "Deploy Preflight"), "Update GitOps"))).toEqual(["GitOps update #4", "Execution Tekton"]));
  });

  it("a failed run opens the branch of its failed step; its succeeded steps stay closed", async () => {
    renderAt(`/applications/${f.appId}/deliveries/run-x`, withRun(f.deliveryDeployFailed));
    const t = await tree();
    expect(children(top(t, "Build Application"))).toHaveLength(0);
    const deploy = top(t, "Deploy Preflight");
    expect(names(deploy)).toEqual(["Deployment #1", "Update GitOps", "Reconcile"]);
    expect(children(child(deploy, "Update GitOps"))).toHaveLength(0);
    const reconcile = child(deploy, "Reconcile");
    await waitFor(() => expect(names(reconcile)).toEqual(["Reconciliation #4", "Execution Flux"]));
    expect(reconcile).toHaveTextContent("Flux reconciliation failed: Ready=False");
  });

  it("a failed build opens Build Application", async () => {
    renderAt(`/applications/${f.appId}/deliveries/run-bad`, fakeApi(all));
    expect(await screen.findByRole("alert")).toHaveTextContent("Build failed: the PipelineRun manual-web-build/build-b failed (Failed)");
    const t = await tree();
    const build = top(t, "Build Application");
    await waitFor(() => expect(names(build)).toEqual(["Build #2", "Execution Tekton"]));
    expect(build).toHaveTextContent("Build failed: the PipelineRun manual-web-build/build-b failed (Failed)");
    expect(within(build).getAllByRole("table", { name: "Execution Tekton" })[0]).toHaveTextContent("Failed");
    expect(screen.getByText("No image: the build did not produce one.")).toBeInTheDocument();
  });

  it("a running run shows its running branch; its finished steps closed", async () => {
    renderAt(`/applications/${f.appId}/deliveries/run-x`, withRun(f.deliveryRunning));
    const t = await tree();
    expect(children(top(t, "Build Application"))).toHaveLength(0);
    const deploy = top(t, "Deploy Preflight");
    expect(names(deploy)).toEqual(["Deployment #1", "Update GitOps", "Reconcile"]);
    await waitFor(() => expect(names(child(deploy, "Update GitOps"))).toEqual(["GitOps update #4", "Execution Tekton"]));
  });

  it("renders the top-level steps the Tenant CP returns in order, including types it does not know yet", async () => {
    const future: DeliveryDetail = {
      ...f.deliveryOk,
      status: "RUNNING",
      completedAt: null,
      steps: [{ ...f.deliveryOk.steps[0], position: 3, type: "DEPLOY_PRODUCTION", status: "PENDING", build: undefined, steps: undefined, deployment: undefined }, ...f.deliveryOk.steps],
    };
    renderAt(`/applications/${f.appId}/deliveries/run-x`, withRun(future));
    const t = await tree();
    expect(roots(t).map((n) => n.getAttribute("aria-label"))).toEqual(["Build Application", "Deploy Preflight", "Deploy Production"]);
  });

  it("is read by number too: /deliveries/1 is the same run", async () => {
    renderAt(`/applications/${f.appId}/deliveries/1`, fakeApi({ ...all, [`${app}/deliveries/1`]: f.deliveryOk }));
    expect(await screen.findByRole("heading", { level: 1, name: "Delivery #1" })).toBeInTheDocument();
  });
});

describe("Build", () => {
  it("shows the build, its PipelineRun as recorded, TaskRuns, steps and a bounded live log", async () => {
    renderAt(`/applications/${f.appId}/builds/build-ok`, fakeApi(all));
    expect(await screen.findByRole("heading", { level: 1, name: "Build #1" })).toBeInTheDocument();
    const facts = screen.getByRole("table", { name: "Build" });
    expect(within(facts).getAllByRole("rowheader")[0]).toHaveTextContent("Build ID");
    const delivery = within(facts).getByRole("row", { name: /^Delivery/ });
    expect(within(delivery).getByRole("link", { name: "#1" })).toHaveAttribute("href", `/applications/${f.appId}/deliveries/run-ok`);
    // Build (what PathOps accepted), then Execution (generic), then the PipelineRun (Tekton's own).
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent).slice(0, 3)).toEqual(["Execution", "PipelineRun", "TaskRuns"]);
    const x = screen.getByRole("table", { name: "Execution" });
    expect(within(x).getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Executor", "Status", "Started", "Completed", "Duration", "Reason", "Message"]);
    expect(x).toHaveTextContent("Tekton");
    const pr = screen.getByRole("table", { name: "PipelineRun" });
    expect(pr).toHaveTextContent("manual-web-build/build-build-ok");
    expect(within(pr).queryByRole("rowheader", { name: "Status" })).toBeNull();
    expect(within(pr).getByRole("rowheader", { name: "Image Digest" })).toBeInTheDocument();
    // Where Tekton resolved the Pipeline from (its provenance).
    expect(within(within(pr).getByRole("row", { name: /^Resolved from/ })).getByTitle(f.okRev)).toBeInTheDocument();
    const tasks = screen.getByRole("region", { name: "TaskRuns" });
    const tr = within(tasks).getByRole("table", { name: "TaskRun build-image facts" });
    expect(tr).toHaveTextContent("build-build-ok-build-image");
    for (const step of ["checkout", "build", "push"]) expect(within(tasks).getByText(step)).toBeInTheDocument();
    const steps = within(tasks).getAllByRole("row").slice(-3).map((r) => r.textContent?.slice(0, 2));
    expect(steps).toEqual(["3p", "2b", "1c"]);
    await userEvent.click(within(tasks).getAllByRole("button", { name: "View log" })[1]);
    const log = await screen.findByRole("log", { name: "Log of build" });
    // Copy puts the whole log on the clipboard; Download saves it as <TaskRun>-<step>.log.
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await userEvent.click(within(log).getByRole("button", { name: "Copy log of build" }));
    expect(writeText).toHaveBeenCalledWith(f.buildLog.content);
    expect(await within(log).findByRole("status")).toHaveTextContent(/^Copied$/);
    await waitFor(() => expect(within(log).queryByRole("status")).toBeNull(), { timeout: 3000 });
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob) => (created.push(b), "blob:log"));
    URL.revokeObjectURL = vi.fn();
    let saved = "";
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      saved = this.download;
    });
    await userEvent.click(within(log).getByRole("button", { name: "⤓ Download" }));
    expect(saved).toBe("build-build-ok-build-image-build.log");
    const text = await new Promise<string>((done) => {
      const reader = new FileReader();
      reader.onload = () => done(reader.result as string);
      reader.readAsText(created[0]);
    });
    expect(text).toBe(f.buildLog.content);
    click.mockRestore();
    expect(log).toHaveTextContent("exporting to oci image format");
    expect(log).toHaveTextContent("Truncated: the last 4000 lines, at most 256 KiB.");
  });

  it("shows a failed build's error and its failed step's exit code; one log open at a time", async () => {
    renderAt(`/applications/${f.appId}/builds/build-bad`, fakeApi(all));
    const facts = await screen.findByRole("table", { name: "Build" });
    expect(facts).toHaveTextContent("Build failed: the PipelineRun manual-web-build/build-b failed (Failed)");
    expect(screen.getByRole("table", { name: "Execution" })).toHaveTextContent("Tasks Completed: 2 (Failed: 1, Cancelled 0), Skipped: 0");
    const lint = screen.getByRole("group", { name: "TaskRun lint" });
    const image = screen.getByRole("group", { name: "TaskRun build-image" });
    expect(within(image).getByRole("cell", { name: "build" }).closest("tr")).toHaveTextContent("1");
    await userEvent.click(within(image).getAllByRole("button", { name: "View log" })[0]);
    const log = await within(image).findByRole("log", { name: "Log of build" });
    expect(log).toHaveTextContent("ERROR: failed to solve");
    expect(within(image).getByRole("cell", { name: "build" }).closest("tr")!.nextElementSibling).toContainElement(log);
    await userEvent.click(within(lint).getByRole("button", { name: "View log" }));
    expect(await within(lint).findByText("lint checkout ok")).toBeInTheDocument();
    expect(within(image).queryByRole("log", { name: "Log of build" })).toBeNull();
  });

  it("keeps the history after Tekton pruned it: the log says it is gone", async () => {
    renderAt(`/applications/${f.appId}/builds/build-ok`, fakeApi({ [`${app}/builds/build-ok`]: f.buildOk }));
    const tasks = await screen.findByRole("region", { name: "TaskRuns" });
    expect(within(tasks).getByText("push")).toBeInTheDocument();
    await userEvent.click(within(tasks).getAllByRole("button", { name: "View log" })[0]);
    expect(await within(tasks).findByText(/The log is no longer available/)).toBeInTheDocument();
  });
});

describe("Header", () => {
  const me = { subject: "s", email: "alice@example.test", issuer: "https://dex", cellId: "canary" };

  it("holds the breadcrumb, the Applications and the Inbox, and the user's menu button; no Cell", async () => {
    renderAt("/", fakeApi({ "/api/v1/applications": { applications: [] }, "/api/v1/me": me }));
    const header = screen.getByRole("banner");
    const user = await within(header).findByRole("button", { name: /alice@example\.test/ });
    expect(user).toHaveAttribute("aria-haspopup", "menu");
    expect(user).toHaveAttribute("aria-expanded", "false");
    expect(header.textContent).toMatch(/^PathOps \/ Applications\s*Applications\s*Inbox\s*alice@example\.test ▾$/);
    expect(header).not.toHaveTextContent("canary");
    expect(within(header).queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toHaveTextContent("© 2026 PathOps · Open source under the MIT License");
  });

  it("opens the user's menu: the theme switch, which it remembers, and sign out; Escape and a click outside close it", async () => {
    renderAt("/", fakeApi({ "/api/v1/applications": { applications: [] }, "/api/v1/me": me }));
    const user = await screen.findByRole("button", { name: /alice@example\.test/ });
    await userEvent.click(user);
    const menu = screen.getByRole("menu", { name: "User" });
    expect(user).toHaveAttribute("aria-expanded", "true");
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual([expect.stringMatching(/^(Dark|Light) mode$/), "Sign out"]);
    const before = document.documentElement.dataset.theme;
    await userEvent.click(within(menu).getByRole("menuitem", { name: /mode$/ }));
    const after = document.documentElement.dataset.theme;
    expect(after).not.toEqual(before);
    expect(localStorage.getItem("pathops-theme")).toEqual(after);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await userEvent.click(user);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    await userEvent.click(user);
    await userEvent.click(screen.getByRole("heading", { level: 1, name: "Applications" }));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("signs out from the user's menu: Dex's logout, which returns to the signed-out page; nothing asked of pathops-events", async () => {
    const replace = vi.fn();
    const requests: [string, RequestInit | undefined][] = [];
    vi.stubGlobal("location", { origin: window.location.origin, pathname: "/applications", search: "", replace });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (u: string, init?: RequestInit) => {
        requests.push([u, init]);
        if (u === "/.well-known/pathops")
          return Response.json({ oidc: { issuer: "https://dex.example" }, ui: { clientId: "pathops-ui" }, events: { url: "https://events.example" } });
        if (u === "https://dex.example/.well-known/openid-configuration")
          return Response.json({ issuer: "https://dex.example", authorization_endpoint: "https://dex.example/auth",
            token_endpoint: "https://dex.example/token", end_session_endpoint: "https://dex.example/logout" });
        if (u === "https://dex.example/token")
          return Response.json({ access_token: "at-1", token_type: "Bearer", expires_in: 300, id_token: "id-1" });
        return new Response("", { status: 204 });
      }),
    );
    try {
      await authorizationUrl(await loadConfig(), "/");
      const { state } = JSON.parse(sessionStorage.getItem("pathops.oidc.pending")!);
      await completeSignIn(`?code=c&state=${state}`);
      renderAt("/", fakeApi({ "/api/v1/applications": { applications: [] }, "/api/v1/me": me }));
      await userEvent.click(await screen.findByRole("button", { name: /alice@example\.test/ }));
      await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
      await waitFor(() => expect(replace).toHaveBeenCalledTimes(1));
      const to = new URL(replace.mock.calls[0][0]);
      expect(to.origin + to.pathname).toBe("https://dex.example/logout");
      expect(to.searchParams.get("id_token_hint")).toBe("id-1");
      expect(to.searchParams.get("post_logout_redirect_uri")).toBe(window.location.origin + "/signed-out");
      expect(signedIn()).toBe(false);
      // pathops-events has no session of its own to end.
      expect(requests.some(([u]) => u.startsWith("https://events.example"))).toBe(false);
    } finally {
      vi.unstubAllGlobals();
      resetForTests();
    }
  });
});

describe("Duration", () => {
  it("shows a negative duration (an end reported before the start) as 0s", () => {
    render(
      <>
        <Duration seconds={-4} />|<Duration seconds={6} />
      </>,
    );
    expect(screen.getByTitle("The reported end precedes the start")).toHaveTextContent("0s");
    expect(document.body).toHaveTextContent("0s|6s");
  });
});

const BODY =
  "PathOps couldn't build revision cccccccccccc of manual-web.\n\nThe build stopped before an image could be produced.\n\n" +
  "You can review the delivery and download the build logs for more information.";
const DOWNLOAD = `https://artifacts-canary.demo.pathops.io/objects/applications/${f.appId}/deliveries/run-bad/build-failure.tar.gz`;

const inboxMessage = (over: Record<string, unknown> = {}) => ({
  id: "77777777-7777-4777-8777-777777777773",
  number: 3,
  type: "BUILD_FAILED",
  subject: "The build for manual-web failed",
  body: BODY,
  read: false,
  readAt: null,
  createdAt: new Date(Date.now() - 65 * 60 * 1000).toISOString(),
  applicationId: f.appId,
  deliveryRunId: "run-bad",
  deliveryStepId: "step-bad",
  buildId: "build-bad",
  artifactId: "art-1",
  application: { id: f.appId, name: "manual-web" },
  delivery: { id: "run-bad", number: 2, sourceRevision: "c".repeat(40), head12: "cccccccccccc", status: "FAILED" },
  build: { id: "build-bad", number: 2, status: "FAILED" },
  artifact: {
    id: "art-1",
    type: "BUILD_FAILURE_LOGS",
    mediaType: "application/gzip",
    size: 1234,
    sha256: "ab".repeat(32),
    downloadUrl: DOWNLOAD,
    createdAt: "2026-11-15T10:00:00Z",
  },
  ...over,
});

describe("Inbox", () => {
  it("shows the unread count in the header and links to the Inbox", async () => {
    renderAt("/", fakeApi({ "/api/v1/applications": { applications: [] }, "/api/v1/inbox?unread=true&limit=1": { messages: [inboxMessage()], unread: 1 } }));
    const link = await screen.findByRole("link", { name: "Inbox, 1 unread" });
    expect(link).toHaveAttribute("href", "/inbox");
    expect(link).toHaveTextContent(/Inbox\s*1$/);
  });

  it("shows no badge without unread messages", async () => {
    const api = fakeApi({ "/api/v1/applications": { applications: [] }, "/api/v1/inbox?unread=true&limit=1": { messages: [], unread: 0 } });
    renderAt("/", api);
    await waitFor(() => expect(api.calls).toContain("/api/v1/inbox?unread=true&limit=1"));
    expect(screen.getByRole("link", { name: "Inbox" })).toHaveTextContent(/^Inbox$/);
  });

  it("lists messages like a mail inbox: number, subject, received; unread stands out; nothing technical", async () => {
    const older = inboxMessage({ id: "msg-2", number: 2, read: true, readAt: "2026-11-15T10:00:00Z" });
    renderAt("/inbox", fakeApi({ "/api/v1/inbox": { messages: [inboxMessage(), older], unread: 1 } }));
    const table = await screen.findByRole("table", { name: "Inbox" });
    const rows = within(table).getAllByRole("row");
    expect(rows.map((r) => r.className)).toEqual(["", "unread", "read"]);
    expect(within(rows[0]).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["#", "Subject", "Received"]);
    expect(rows[1]).toHaveAccessibleName("#3 The build for manual-web failed (unread)");
    expect(within(rows[1]).getByTitle("Unread")).toHaveClass("dot");
    expect(within(rows[2]).queryByTitle("Unread")).not.toBeInTheDocument();
    const subject = within(rows[1]).getByRole("link", { name: "The build for manual-web failed" });
    expect(subject).toHaveAttribute("href", "/inbox/3");
    expect(subject).toHaveClass("item-title");
    expect(rows[1]).toHaveTextContent(/^3The build for manual-web failedmanual-web1h ago$/);
    expect(within(rows[2]).getByRole("link")).toHaveAttribute("href", "/inbox/2");
    expect(screen.getByText("1 unread")).toBeInTheDocument();
    // No ids, types, deliveries, builds, logs or body in the list.
    for (const internal of ["77777777", "BUILD_", "cccccccccccc", "#2", "Download", "View", "PathOps couldn't"]) {
      expect(table).not.toHaveTextContent(internal);
    }
  });

  it("opens a message from its row", async () => {
    const api = fakeApi({
      "/api/v1/inbox": { messages: [inboxMessage()], unread: 1 },
      "/api/v1/inbox/3": inboxMessage(),
      "POST /api/v1/inbox/3/read": inboxMessage({ read: true }),
    });
    renderAt("/inbox", api);
    const table = await screen.findByRole("table", { name: "Inbox" });
    await userEvent.click(within(table).getByText("1h", { exact: false }));
    expect(await screen.findByRole("heading", { level: 1, name: "The build for manual-web failed" })).toBeInTheDocument();
    expect(api.calls).toContain("/api/v1/inbox/3");
  });

  it("shows a message on its own page and marks it read", async () => {
    const at = "2026-11-15T14:02:00Z";
    const api = fakeApi({
      "/api/v1/inbox/3": inboxMessage({ createdAt: at }),
      "/api/v1/inbox?unread=true&limit=1": { messages: [inboxMessage()], unread: 1 },
      "POST /api/v1/inbox/3/read": inboxMessage({ read: true, readAt: "2026-11-15T12:00:00Z" }),
    });
    renderAt("/inbox/3", api);
    const msg = await screen.findByRole("article", { name: "Message #3" });
    expect(screen.getByRole("link", { name: "← Inbox" })).toHaveAttribute("href", "/inbox");
    expect(within(msg).getByRole("heading", { level: 1 })).toHaveTextContent("The build for manual-web failed");
    expect(within(msg).getByText("#3")).toBeInTheDocument();
    expect(msg.querySelector("time")).toHaveAttribute("dateTime", at);
    expect(msg.querySelector("time")).toHaveTextContent("2026");
    // The body's paragraphs, as written.
    expect([...msg.querySelectorAll(".message-body p")].map((p) => p.textContent)).toEqual([
      "PathOps couldn't build revision cccccccccccc of manual-web.",
      "The build stopped before an image could be produced.",
      "You can review the delivery and download the build logs for more information.",
    ]);
    const about = within(msg).getByRole("table", { name: "About" });
    expect(within(about).getAllByRole("row").map((r) => r.textContent)).toEqual([
      "Applicationmanual-web",
      "Revisioncccccccccccc",
      "Delivery#2",
      "Build#2",
    ]);
    expect(within(msg).getByRole("link", { name: "View application" })).toHaveAttribute("href", `/applications/${f.appId}`);
    expect(within(msg).getByRole("link", { name: "View delivery" })).toHaveAttribute("href", `/applications/${f.appId}/deliveries/run-bad`);
    expect(within(msg).getByRole("link", { name: "View build" })).toHaveAttribute("href", `/applications/${f.appId}/builds/build-bad`);
    const dl = within(msg).getByRole("link", { name: "Download logs ↗" });
    expect(dl).toHaveAttribute("href", DOWNLOAD);
    expect(dl).toHaveAttribute("target", "_blank");
    expect(dl).toHaveAttribute("rel", "noopener noreferrer");
    for (const internal of ["BUILD_FAILED", "BUILD_APPLICATION", "BUILD_FAILURE_LOGS", "77777777", f.appId]) {
      expect(msg).not.toHaveTextContent(internal);
    }
    // Opening it read it, once, and the header's count was read again.
    await waitFor(() => expect(api.calls.filter((c) => c === "POST /api/v1/inbox/3/read")).toHaveLength(1));
    await waitFor(() => expect(api.calls.filter((c) => c === "/api/v1/inbox?unread=true&limit=1").length).toBe(2));
  });

  it("does not mark a read message again", async () => {
    const api = fakeApi({ "/api/v1/inbox/3": inboxMessage({ read: true, readAt: "2026-11-15T12:00:00Z" }) });
    renderAt("/inbox/3", api);
    await screen.findByRole("article", { name: "Message #3" });
    expect(api.calls.filter((c) => c.startsWith("POST"))).toEqual([]);
  });

  it("offers only the actions of the references a message has", async () => {
    const cases: [Record<string, unknown>, string[], string[]][] = [
      [{ artifact: null, artifactId: null }, ["View application", "View delivery", "View build"], ["Download logs ↗"]],
      [{ delivery: null, deliveryRunId: null, deliveryStepId: null }, ["View application", "View build", "Download logs ↗"], ["View delivery"]],
      [{ build: null, buildId: null }, ["View application", "View delivery", "Download logs ↗"], ["View build"]],
      [
        { application: null, applicationId: null, delivery: null, deliveryRunId: null, build: null, buildId: null, artifact: null, artifactId: null },
        [],
        ["View application", "View delivery", "View build", "Download logs ↗"],
      ],
    ];
    for (const [over, present, absent] of cases) {
      const { unmount } = renderAt("/inbox/3", fakeApi({ "/api/v1/inbox/3": inboxMessage({ ...over, read: true }) }));
      const msg = await screen.findByRole("article", { name: "Message #3" });
      for (const name of present) expect(within(msg).getByRole("link", { name })).toBeInTheDocument();
      for (const name of absent) expect(within(msg).queryByRole("link", { name })).not.toBeInTheDocument();
      if (over.delivery === null) expect(msg).not.toHaveTextContent("Revision");
      unmount();
    }
  });

  it("asks for nothing but a message number", async () => {
    const api = fakeApi({});
    renderAt("/inbox/77777777-7777-4777-8777-777777777773", api);
    await waitFor(() => expect(api.calls).toContain("/api/v1/inbox/0"));
    expect(api.calls.filter((c) => c.includes("77777777"))).toEqual([]);
  });

  it("shows an empty Inbox", async () => {
    renderAt("/inbox", fakeApi({ "/api/v1/inbox": { messages: [], unread: 0 } }));
    expect(await screen.findByText("Nothing here yet.")).toBeInTheDocument();
  });
});

describe("Main navigation", () => {
  const me = { "/api/v1/applications": { applications: [] }, "/api/v1/inbox?unread=true&limit=1": { messages: [], unread: 3, nextCursor: "x", previousCursor: null } };

  it("links the Inbox, with the whole Inbox's unread count, and the Applications; / opens the Applications", async () => {
    renderAt("/", fakeApi(me));
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual(["/applications", "/inbox"]);
    expect(await within(nav).findByRole("link", { name: "Inbox, 3 unread" })).toHaveTextContent(/Inbox\s*3$/);
    const apps = within(nav).getByRole("link", { name: /Applications/ });
    expect(apps).toHaveClass("active");
    expect(apps).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: "Inbox, 3 unread" })).not.toHaveClass("active");
    expect(await screen.findByRole("heading", { level: 1, name: "Applications" })).toBeInTheDocument();
  });

  it("marks the Inbox on its pages, and the Applications on an Application's", async () => {
    const { unmount } = renderAt("/inbox/3", fakeApi({ ...me, "/api/v1/inbox/3": inboxMessage({ read: true }) }));
    let nav = screen.getByRole("navigation", { name: "Main" });
    expect(await within(nav).findByRole("link", { name: "Inbox, 3 unread" })).toHaveClass("active");
    expect(within(nav).getByRole("link", { name: /Applications/ })).not.toHaveClass("active");
    unmount();
    renderAt(`/applications/${f.appId}/deliveries`, fakeApi({ ...all, ...me }));
    nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: /Applications/ })).toHaveAttribute("aria-current", "page");
  });
});

describe("Pagination", () => {
  const messages = (from: number, to: number) => {
    const out = [];
    for (let n = from; n >= to; n--) out.push(inboxMessage({ id: `m-${n}`, number: n, subject: `Message ${n}`, read: n % 2 === 0 }));
    return out;
  };

  it("pages the Inbox 25 at a time from the Tenant CP: Newer and Older, the unread count the whole Inbox's", async () => {
    const api = fakeApi({
      "/api/v1/inbox": { messages: messages(30, 6), unread: 15, nextCursor: "older-6", previousCursor: null },
      "/api/v1/inbox?cursor=older-6": { messages: messages(5, 1), unread: 15, nextCursor: null, previousCursor: "newer-5" },
    });
    renderAt("/inbox", api);
    const table = await screen.findByRole("table", { name: "Inbox" });
    expect(within(table).getAllByRole("row")).toHaveLength(26);
    expect(screen.getByText("15 unread")).toBeInTheDocument();
    let pager = screen.getByRole("navigation", { name: "Inbox pages" });
    expect(within(pager).getByText("← Newer")).toHaveAttribute("aria-disabled", "true");
    const older = within(pager).getByRole("link", { name: "Older →" });
    expect(older).toHaveAttribute("href", "/inbox?cursor=older-6");
    await userEvent.click(older);
    await waitFor(() => expect(api.calls).toContain("/api/v1/inbox?cursor=older-6"));
    await waitFor(() => expect(within(screen.getByRole("table", { name: "Inbox" })).getAllByRole("row")).toHaveLength(6));
    expect(screen.getByText("15 unread")).toBeInTheDocument();
    pager = screen.getByRole("navigation", { name: "Inbox pages" });
    expect(within(pager).getByRole("link", { name: "← Newer" })).toHaveAttribute("href", "/inbox?cursor=newer-5");
    expect(within(pager).getByText("Older →")).toHaveAttribute("aria-disabled", "true");
  });

  it("reads the page from the URL (a refresh or a copied link keeps it)", async () => {
    const api = fakeApi({ "/api/v1/inbox?cursor=older-6": { messages: messages(5, 1), unread: 15, nextCursor: null, previousCursor: "newer-5" } });
    renderAt("/inbox?cursor=older-6", api);
    expect(await screen.findByRole("link", { name: "Message 5" })).toHaveAttribute("href", "/inbox/5");
    expect(api.calls).not.toContain("/api/v1/inbox");
  });

  it("shows no pager for a single page", async () => {
    renderAt("/inbox", fakeApi({ "/api/v1/inbox": { messages: messages(3, 1), unread: 1, nextCursor: null, previousCursor: null } }));
    await screen.findByRole("table", { name: "Inbox" });
    expect(screen.queryByRole("navigation", { name: "Inbox pages" })).not.toBeInTheDocument();
  });

  const runs = (from: number, to: number) => {
    const out = [];
    for (let n = from; n >= to; n--) out.push({ ...f.deliveries.deliveries[0], id: `run-${n}`, number: n });
    return out;
  };
  const builds = (from: number, to: number) => {
    const out = [];
    for (let n = from; n >= to; n--)
      out.push({ ...f.buildOk, id: `build-${n}`, number: n, deliveryRunId: `run-${n}`, deliveryNumber: n, status: "FAILED" });
    return out;
  };

  it("pages Delivery Runs 10 at a time: Previous and Next", async () => {
    const api = fakeApi({
      ...all,
      [`${app}/deliveries`]: { deliveries: runs(25, 16), nextCursor: "d-16", previousCursor: null },
      [`${app}/deliveries?cursor=d-16`]: { deliveries: runs(15, 6), nextCursor: "d-6", previousCursor: "d-15" },
    });
    renderAt(`/applications/${f.appId}/deliveries`, api);
    const pager = await screen.findByRole("navigation", { name: "Delivery pages" });
    expect(screen.getByRole("region", { name: "Delivery" }).querySelectorAll("tbody tr")).toHaveLength(10);
    expect(within(pager).getByText("← Previous")).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(within(pager).getByRole("link", { name: "Next →" }));
    await waitFor(() => expect(api.calls).toContain(`${app}/deliveries?cursor=d-16`));
    await waitFor(() =>
      expect(within(screen.getByRole("navigation", { name: "Delivery pages" })).getByRole("link", { name: "← Previous" })).toHaveAttribute(
        "href",
        `/applications/${f.appId}/deliveries?cursor=d-15`,
      ),
    );
    const next = screen.getByRole("navigation", { name: "Delivery pages" });
    expect(within(next).getByRole("link", { name: "Next →" })).toHaveAttribute("href", `/applications/${f.appId}/deliveries?cursor=d-6`);
    expect(screen.getByRole("link", { name: "#15" })).toBeInTheDocument();
  });

  it("pages Builds 10 at a time: Previous and Next", async () => {
    const api = fakeApi({
      ...all,
      [`${app}/builds?cursor=b-11`]: { builds: builds(10, 1), nextCursor: null, previousCursor: "b-10" },
    });
    renderAt(`/applications/${f.appId}/builds?cursor=b-11`, api);
    const pager = await screen.findByRole("navigation", { name: "Build pages" });
    expect(screen.getByRole("region", { name: "Builds" }).querySelectorAll("tbody tr")).toHaveLength(10);
    expect(within(pager).getByRole("link", { name: "← Previous" })).toHaveAttribute("href", `/applications/${f.appId}/builds?cursor=b-10`);
    expect(within(pager).getByText("Next →")).toHaveAttribute("aria-disabled", "true");
  });
});

describe("Image pagination", () => {
  const imgs = (from: number, to: number) => {
    const out = [];
    for (let n = from; n >= to; n--) out.push({ ...f.images.images[0], buildId: `build-${n}`, buildNumber: n, digest: `sha256:${String(n).padStart(64, "0")}` });
    return out;
  };

  it("pages Images 10 at a time from the Tenant CP: Previous and Next", async () => {
    const api = fakeApi({
      ...all,
      [`${app}/images`]: { images: imgs(30, 21), nextCursor: "i-21", previousCursor: null },
      [`${app}/images?cursor=i-21`]: { images: imgs(20, 11), nextCursor: "i-11", previousCursor: "i-20" },
    });
    renderAt(`/applications/${f.appId}/images`, api);
    const pager = await screen.findByRole("navigation", { name: "Image pages" });
    expect(screen.getByRole("region", { name: "Images" }).querySelectorAll("tbody tr")).toHaveLength(10);
    expect(within(pager).getByText("← Previous")).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(within(pager).getByRole("link", { name: "Next →" }));
    await waitFor(() => expect(api.calls).toContain(`${app}/images?cursor=i-21`));
    await waitFor(() =>
      expect(within(screen.getByRole("navigation", { name: "Image pages" })).getByRole("link", { name: "← Previous" })).toHaveAttribute(
        "href",
        `/applications/${f.appId}/images?cursor=i-20`,
      ),
    );
    expect(screen.getByRole("link", { name: "#20" })).toBeInTheDocument();
  });
});

describe("Breadcrumb", () => {
  it("is PathOps / Inbox on the Inbox's pages, PathOps / Applications on the Applications'", async () => {
    const { unmount } = renderAt("/inbox/3", fakeApi({ "/api/v1/inbox/3": inboxMessage({ read: true }) }));
    const crumbs = () => screen.getByRole("navigation", { name: "Breadcrumb" });
    await screen.findByRole("article", { name: "Message #3" });
    expect(crumbs().textContent).toBe("PathOps / Inbox / #3");
    expect(within(crumbs()).getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual(["/applications", "/inbox"]);
    unmount();
    const r = renderAt("/inbox", fakeApi({ "/api/v1/inbox": { messages: [], unread: 0, nextCursor: null, previousCursor: null } }));
    expect(crumbs().textContent).toBe("PathOps / Inbox");
    r.unmount();
    renderAt("/applications", fakeApi({ "/api/v1/applications": { applications: [] } }));
    expect(crumbs().textContent).toBe("PathOps / Applications");
  });

  it("the main navigation's links are words, no icons", () => {
    renderAt("/applications", fakeApi({ "/api/v1/applications": { applications: [] } }));
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("link").map((l) => l.textContent)).toEqual(["Applications", "Inbox"]);
  });
});

describe("Signed out", () => {
  it("back from Dex's logout: only that the user is signed out, and a way to sign in again", () => {
    render(
      <MemoryRouter initialEntries={["/signed-out"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^You are signed out\.$/);
    expect(screen.getByRole("link", { name: "Sign in again" })).toHaveAttribute("href", "/");
    expect(document.body).not.toHaveTextContent(/Dex|login session|stays/);
    expect(screen.queryByRole("status", { name: "Signing in" })).not.toBeInTheDocument();
  });
});

describe("Preflight (Decision 0064)", () => {
  const dep = f.deployment;
  const withPreflight = {
    ...all,
    [`${app}/overview`]: {
      ...f.overview,
      sections: [...f.overview.sections, "preflight", "deployments"],
      preflight: { environment: "PREFLIGHT", last: dep, current: dep },
    },
    [`${app}/deployments`]: { deployments: [dep], nextCursor: null, previousCursor: null },
  };
  const withEnv = (preflight: unknown) => ({
    ...withPreflight,
    [`${app}/overview`]: { ...(withPreflight[`${app}/overview`] as object), preflight },
  });

  it("answers how the environment is now: Status, Commit, Last deployed, Tests; nothing about how it was deployed", async () => {
    const at = new Date(Date.now() - 2 * 60_000 - 5000).toISOString();
    const d = { ...dep, completedAt: at };
    renderAt(`/applications/${f.appId}/preflight`, fakeApi(withEnv({ environment: "PREFLIGHT", last: d, current: d })));
    const section = await screen.findByRole("region", { name: "Preflight" });
    const facts = within(section).getByRole("table", { name: "Preflight environment" });
    expect(within(facts).getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Status", "Commit", "Last deployed", "Tests"]);
    expect(within(facts).getByText("Healthy")).toHaveClass("status-ok");
    expect(within(facts).getByText(dep.head12)).toHaveAttribute("title", dep.sourceRevision);
    expect(within(facts).getByText("2m ago")).toHaveAttribute("dateTime", at);
    expect(within(facts).getByText("Not configured")).toBeInTheDocument();
    for (const gone of ["Deployment", "Image", "GitOps repository", "Update Task revision", "Started", "Duration", "Source commit"])
      expect(within(section).queryByText(gone)).not.toBeInTheDocument();
    expect(section).not.toHaveTextContent(dep.imageReference);
    expect(section).not.toHaveTextContent("alice/hello-gitops-preflight");
    // No URL from the Tenant CP: no Open App.
    expect(within(section).queryByRole("link", { name: /Open App/ })).not.toBeInTheDocument();
    // The header: the same state, no Deployment or Delivery number.
    const summary = screen.getByRole("table", { name: "Summary" });
    const cell = within(summary).getByText("Healthy").closest("td")!;
    expect(cell).toHaveTextContent(/^Healthy — 2m$/);
    expect(within(cell).queryByRole("link")).not.toBeInTheDocument();
    expect(summary).not.toHaveTextContent("Deployment #");
  });

  it("states Not deployed, Deploying, Healthy and Unstable; Open App at the default Route's URL, also when Unstable", async () => {
    const url = "https://api-shop-preflight-testing.demo.pathops.io";
    const route = { name: "api-shop", hostname: "api-shop-preflight-testing.demo.pathops.io", url };
    const running = {
      ...dep,
      id: "dep-2",
      number: 2,
      status: "IN_PROGRESS",
      completedAt: null,
      durationSeconds: null,
      head12: "bbbbbbbbbbbb",
      sourceRevision: "bbbbbbbbbbbb" + "c".repeat(28),
    };
    const cases: [string, unknown, string, boolean][] = [
      ["Not deployed", { environment: "PREFLIGHT", last: null, current: null, route }, "status-neutral", false],
      ["Deploying", { environment: "PREFLIGHT", last: running, current: dep, route }, "status-running", true],
      ["Healthy", { environment: "PREFLIGHT", last: dep, current: dep, route }, "status-ok", true],
      ["Unstable", { environment: "PREFLIGHT", last: { ...running, status: "FAILED", completedAt: dep.completedAt }, current: dep, route }, "status-error", true],
    ];
    for (const [state, preflight, cls, open] of cases) {
      const { unmount } = renderAt(`/applications/${f.appId}/preflight`, fakeApi(withEnv(preflight)));
      const facts = await screen.findByRole("table", { name: "Preflight environment" });
      expect(within(facts).getByText(state)).toHaveClass(cls);
      const link = screen.queryByRole("link", { name: "Open App ↗" });
      if (open) {
        expect(link).toHaveAttribute("href", url);
        expect(link).toHaveAttribute("target", "_blank");
      } else expect(link).not.toBeInTheDocument();
      // The default Route is always shown, with its hostname (not the
      // Application's name).
      expect(within(facts).getByRole("link", { name: "api-shop-preflight-testing.demo.pathops.io ↗" })).toHaveAttribute("href", url);
      // The Commit is the last Deployment's, the one the state is about.
      if (state === "Deploying") expect(within(facts).getByText("bbbbbbbbbbbb")).toBeInTheDocument();
      if (state === "Not deployed") expect(within(facts).getAllByText("—")).toHaveLength(2);
      unmount();
    }
  });

});

describe("Routes (Decision 0067)", () => {
  const routeOf = (name: string, isDefault: boolean, status = "ACTIVE", run: unknown = null) => ({
    name,
    default: isDefault,
    application: { id: f.appId, name: "manual-web" },
    hosts: ["PREFLIGHT", "PRODUCTION"].map((env) => {
      const hostname = `${name}-${env.toLowerCase()}-testing.demo.pathops.io`;
      return { environment: env, hostname, url: `https://${hostname}` };
    }),
    status,
    run,
    createdAt: "2026-11-23T10:00:00Z",
  });
  const withRoutes = (routes: unknown[]) => ({
    ...all,
    [`${app}/overview`]: { ...f.overview, sections: [...f.overview.sections, "routes"] },
    [`${app}/routes`]: { routes },
  });

  it("lists the Routes from the Tenant CP: Name, Default, Preflight and Production hostnames as links", async () => {
    renderAt(`/applications/${f.appId}/routes`, fakeApi(withRoutes([routeOf("api-shop", true), routeOf("idp-shop", false)])));
    const table = await screen.findByRole("table", { name: "Routes" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Name", "Default", "Preflight", "Production"]);
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell")[0].textContent)).toEqual(["api-shop", "idp-shop"]);
    expect(within(rows[0]).getByText("Yes")).toBeInTheDocument();
    expect(within(rows[1]).getByText("No")).toBeInTheDocument();
    expect(within(rows[1]).getByRole("link", { name: "idp-shop-production-testing.demo.pathops.io ↗" })).toHaveAttribute(
      "href",
      "https://idp-shop-production-testing.demo.pathops.io",
    );
    // The tab is there because the Tenant CP names the section.
    expect(screen.getByRole("link", { name: "Routes" })).toBeInTheDocument();
  });

  it("shows a Status column only while a Route is not in effect", async () => {
    renderAt(
      `/applications/${f.appId}/routes`,
      fakeApi(withRoutes([routeOf("api-shop", true), routeOf("idp-shop", false, "PENDING", { id: "r", type: "ROUTE_CREATION", status: "WAITING_FOR_AUTHORIZATION" })])),
    );
    const table = await screen.findByRole("table", { name: "Routes" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toContain("Status");
    expect(within(table).getByText("Waiting for authorization")).toBeInTheDocument();
  });
});

describe("Deployments", () => {
  const failed = {
    ...f.deployment,
    id: "dep-2",
    number: 2,
    status: "FAILED",
    deliveryRunId: "run-bad",
    deliveryNumber: 2,
    sourceRevision: "bbbbbbbbbbbbcccccccccccccccccccccccccccc",
    head12: "bbbbbbbbbbbb",
    gitopsCommit: undefined,
    failure: { reason: "FLUX_RECONCILIATION_FAILED", message: "Ready=False" },
    startedAt: "2026-11-20T11:00:00Z",
    completedAt: "2026-11-20T11:05:00Z",
    durationSeconds: 300,
  };
  const deps = (from: number, to: number) => {
    const out = [];
    for (let n = from; n >= to; n--) out.push({ ...f.deployment, id: `dep-${n}`, number: n, deliveryRunId: `run-${n}`, deliveryNumber: n });
    return out;
  };
  const rows = (region: HTMLElement) => within(region).getAllByRole("row").slice(1);

  it("lists Deployments newest first: # Commit Environment Status Tests Started Duration Delivery", async () => {
    const api = fakeApi({ ...all, [`${app}/deployments`]: { deployments: [failed, f.deployment], nextCursor: null, previousCursor: null } });
    renderAt(`/applications/${f.appId}/deployments`, api);
    const list = await screen.findByRole("region", { name: "Deployments" });
    await waitFor(() => expect(rows(list)).toHaveLength(2));
    expect(within(list).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "#",
      "Commit",
      "Environment",
      "Status",
      "Tests",
      "Started",
      "Duration",
      "Delivery",
    ]);
    const [first, second] = rows(list);
    // No Validation yet: Tests is —.
    expect(within(first).getAllByRole("cell")[4]).toHaveTextContent(/^—$/);
    // As the Tenant CP orders them: #2 (the newest) first.
    expect(within(first).getAllByRole("cell")[0]).toHaveTextContent(/^#2$/);
    expect(within(second).getAllByRole("cell")[0]).toHaveTextContent(/^#1$/);
    // # links the Deployment's page.
    expect(within(within(first).getAllByRole("cell")[0]).getByRole("link", { name: "#2" })).toHaveAttribute(
      "href",
      `/applications/${f.appId}/deployments/dep-2`,
    );
    // The failed one.
    expect(within(first).getByText("Failed")).toHaveClass("status-error");
    expect(within(first).getByText("bbbbbbbbbbbb")).toHaveAttribute("title", failed.sourceRevision);
    // The environment is plain words: color is for the status.
    expect(within(first).getByText("Preflight").className).toBe("");
    expect(within(within(first).getAllByRole("cell")[7]).getByRole("link", { name: "#2" })).toHaveAttribute(
      "href",
      `/applications/${f.appId}/deliveries/run-bad`,
    );
    expect(within(first).getAllByRole("cell")[6]).toHaveTextContent("5m 00s");
    // The succeeded one: the 12-character commit, its delivery.
    expect(within(second).getByText("Succeeded")).toHaveClass("status-ok");
    expect(within(second).getByText(f.okRev.slice(0, 12))).toHaveAttribute("title", f.okRev);
    expect(within(within(second).getAllByRole("cell")[7]).getByRole("link", { name: "#1" })).toHaveAttribute(
      "href",
      `/applications/${f.appId}/deliveries/run-ok`,
    );
    expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
  });

  it("is a tab between Delivery and Images (no Validations tab); empty, it says so", async () => {
    renderAt(`/applications/${f.appId}/deployments`, fakeApi(all));
    const tabs = await screen.findByRole("navigation", { name: "Application sections" });
    const names = within(tabs).getAllByRole("link").map((l) => l.textContent);
    expect(names).not.toContain("Validations");
    expect(names.slice(names.indexOf("Delivery"), names.indexOf("Delivery") + 3)).toEqual(["Delivery", "Deployments", "Images"]);
    const list = await screen.findByRole("region", { name: "Deployments" });
    expect(await within(list).findByText("Nothing here yet.")).toBeInTheDocument();
    expect(within(list).queryByRole("table")).not.toBeInTheDocument();
  });

  it("pages Deployments 10 at a time from the Tenant CP: Previous and Next", async () => {
    const api = fakeApi({
      ...all,
      [`${app}/deployments`]: { deployments: deps(25, 16), nextCursor: "p-16", previousCursor: null },
      [`${app}/deployments?cursor=p-16`]: { deployments: deps(15, 6), nextCursor: "p-6", previousCursor: "p-15" },
    });
    renderAt(`/applications/${f.appId}/deployments`, api);
    const pager = await screen.findByRole("navigation", { name: "Deployment pages" });
    expect(screen.getByRole("region", { name: "Deployments" }).querySelectorAll("tbody tr")).toHaveLength(10);
    expect(within(pager).getByText("← Previous")).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(within(pager).getByRole("link", { name: "Next →" }));
    await waitFor(() => expect(api.calls).toContain(`${app}/deployments?cursor=p-16`));
    await waitFor(() => expect(screen.getAllByRole("link", { name: "#15" })).toHaveLength(2));
    const next = screen.getByRole("navigation", { name: "Deployment pages" });
    expect(within(next).getByRole("link", { name: "← Previous" })).toHaveAttribute("href", `/applications/${f.appId}/deployments?cursor=p-15`);
    expect(within(next).getByRole("link", { name: "Next →" })).toHaveAttribute("href", `/applications/${f.appId}/deployments?cursor=p-6`);
  });
});

describe("Environment", () => {
  it("is plain words, Preflight and Production: no color of its own, never a status's", () => {
    render(
      <>
        <EnvironmentLabel environment="PREFLIGHT" />
        <EnvironmentLabel environment="PRODUCTION" />
      </>,
    );
    for (const name of ["Preflight", "Production"]) {
      expect(screen.getByText(name).className).toBe("");
      expect(screen.getByText(name).tagName).not.toBe("STRONG");
    }
  });
});

describe("Images Environment", () => {
  const A = f.digest;
  const B = "sha256:" + "b".repeat(64);
  const imgB = { ...f.images.images[0], digest: B, buildId: "build-2", buildNumber: 2, revision: "bbbbbbbbbbbb" };
  const onB = { ...f.deployment, id: "dep-2", number: 2, imageReference: `zot-test.example/apps/${f.appId}:bbbbbbbbbbbb@${B}` };
  const tableWith = (preflight: unknown) => ({
    ...all,
    [`${app}/overview`]: { ...f.overview, sections: [...f.overview.sections, "preflight", "deployments"], preflight },
    [`${app}/images`]: { images: [imgB, f.images.images[0]], nextCursor: null, previousCursor: null },
  });

  it("is a column after Tag: where each image runs now, from the current Deployments, not history", async () => {
    // #1 deployed A, #2 deployed B: Preflight runs B now.
    renderAt(`/applications/${f.appId}/images`, fakeApi(tableWith({ environment: "PREFLIGHT", last: onB, current: onB })));
    const region = await screen.findByRole("region", { name: "Images" });
    await waitFor(() => expect(within(region).getAllByRole("row")).toHaveLength(3));
    expect(within(region).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Tag", "Environment", "Digest", "Build", "Created"]);
    const [b, a] = within(region).getAllByRole("row").slice(1);
    expect(within(b).getAllByRole("cell")[1]).toHaveTextContent(/^Preflight$/);
    expect(within(a).getAllByRole("cell")[1]).toHaveTextContent(/^—$/);
    expect(A).not.toBe(B);
  });

  it("is — for every image before any Deployment, and keeps the last successful one's image while a new one fails", async () => {
    const { unmount } = renderAt(`/applications/${f.appId}/images`, fakeApi(tableWith({ environment: "PREFLIGHT", last: null, current: null })));
    let region = await screen.findByRole("region", { name: "Images" });
    await waitFor(() => expect(within(region).getAllByRole("row")).toHaveLength(3));
    for (const r of within(region).getAllByRole("row").slice(1)) expect(within(r).getAllByRole("cell")[1]).toHaveTextContent(/^—$/);
    unmount();
    // #2 (image B) failed: Preflight still runs #1's image A.
    const failed = { ...onB, status: "FAILED" };
    renderAt(`/applications/${f.appId}/images`, fakeApi(tableWith({ environment: "PREFLIGHT", last: failed, current: f.deployment })));
    region = await screen.findByRole("region", { name: "Images" });
    await waitFor(() => expect(within(region).getAllByRole("row")).toHaveLength(3));
    const [b, a] = within(region).getAllByRole("row").slice(1);
    expect(within(b).getAllByRole("cell")[1]).toHaveTextContent(/^—$/);
    expect(within(a).getAllByRole("cell")[1]).toHaveTextContent(/^Preflight$/);
  });
});

describe("Deployment page", () => {
  const api = () =>
    fakeApi({
      ...all,
      [`${app}/deployments`]: { deployments: [f.deployment], nextCursor: null, previousCursor: null },
      [`${app}/deployments/dep-1`]: f.deploymentDetail,
      [`${app}/deployments/dep-1/steps/UPDATE_GITOPS`]: f.updateStep,
      [`${app}/deployments/dep-1/steps/RECONCILE`]: f.reconcileStep,
      [`${app}/deployments/dep-1/steps/UPDATE_GITOPS/tasks/update-preflight-dep-1-update/logs?step=push`]: f.logOf(
        "update-preflight-dep-1-update",
        "push",
        "pushed " + f.gitopsG,
      ),
    });

  it("opens from # in Deployments: its facts, Tests —, and its steps Update GitOps and Reconcile", async () => {
    renderAt(`/applications/${f.appId}/deployments`, api());
    const list = await screen.findByRole("region", { name: "Deployments" });
    await waitFor(() => expect(within(list).getAllByRole("row")).toHaveLength(2));
    const number = within(within(list).getAllByRole("row")[1]).getAllByRole("cell")[0];
    await userEvent.click(within(number).getByRole("link", { name: "#1" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Deployment #1" })).toBeInTheDocument();
    const facts = screen.getByRole("table", { name: "Deployment" });
    expect(within(facts).getAllByRole("rowheader").map((h) => h.textContent)).toEqual([
      "Environment",
      "Status",
      "Commit",
      "Image",
      "Tests",
      "Delivery",
      "Started",
      "Duration",
      "GitOps commit",
    ]);
    expect(within(facts).getByText("Preflight")).toBeInTheDocument();
    expect(within(facts).getByText("Succeeded")).toHaveClass("status-ok");
    expect(within(facts).getByRole("row", { name: /^Tests/ })).toHaveTextContent(/^Tests—$/);
    expect(within(facts).getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual([
      `/applications/${f.appId}/builds/build-ok`,
      `/applications/${f.appId}/deliveries/run-ok`,
    ]);
    const steps = screen.getByRole("table", { name: "Deployment steps" });
    // No Details column: # links each step's page.
    expect(within(steps).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["#", "Step", "Status", "Started", "Duration", "Result"]);
    const rows = within(steps).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell")[1].textContent)).toEqual(["Update GitOps", "Reconcile"]);
    // # is only a position; what each step produced links its page.
    expect(within(within(rows[0]).getAllByRole("cell")[0]).queryByRole("link")).toBeNull();
    expect(within(rows[0]).getByRole("link", { name: "GitOps update #4" })).toHaveAttribute(
      "href",
      `/applications/${f.appId}/deployments/dep-1/steps/UPDATE_GITOPS`,
    );
    expect(within(rows[1]).getByRole("link", { name: "Reconciliation #4" })).toHaveAttribute(
      "href",
      `/applications/${f.appId}/deployments/dep-1/steps/RECONCILE`,
    );
  });

  it("is a real route; another user's or an unknown Deployment is not found", async () => {
    renderAt(`/applications/${f.appId}/deployments/dep-9`, api());
    expect(await screen.findByRole("alert")).toHaveTextContent("Not found, or not yours.");
  });

  it("shows a failed Deployment's error, its failed step's, and no Build link without one", async () => {
    const failed = {
      ...f.deploymentDetail,
      status: "FAILED",
      build: null,
      gitopsCommit: undefined,
      failure: { reason: "FLUX_RECONCILIATION_FAILED", message: "Ready=False" },
      steps: [f.deploymentDetail.steps[0], { ...f.deploymentDetail.steps[1], status: "FAILED", failure: { reason: "FLUX_RECONCILIATION_FAILED", message: "Ready=False" } }],
    };
    renderAt(`/applications/${f.appId}/deployments/dep-1`, fakeApi({ ...all, [`${app}/deployments/dep-1`]: failed }));
    const facts = await screen.findByRole("table", { name: "Deployment" });
    expect(within(facts).getByText("Failed")).toHaveClass("status-error");
    expect(facts).toHaveTextContent("Flux reconciliation failed: Ready=False");
    expect(facts).toHaveTextContent("not yet");
    expect(within(facts).getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual([`/applications/${f.appId}/deliveries/run-ok`]);
    expect(within(screen.getByRole("table", { name: "Deployment steps" }).querySelectorAll("tbody tr")[1] as HTMLElement).getByText(
      /Flux reconciliation failed/,
    )).toBeInTheDocument();
  });

  it("Update GitOps: its GitOpsUpdate (repository, base, resulting commit), its PipelineRun resolved from the base, TaskRuns and a live log", async () => {
    renderAt(`/applications/${f.appId}/deployments/dep-1/steps/UPDATE_GITOPS`, api());
    expect(await screen.findByRole("heading", { level: 1, name: "Update GitOps — Deployment #1" })).toBeInTheDocument();
    const update = screen.getByRole("table", { name: "GitOps update" });
    expect(within(update).getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Repository", "Base commit", "Resulting commit"]);
    expect(update).toHaveTextContent("alice/hello-gitops-preflight");
    expect(within(within(update).getByRole("row", { name: /^Base commit/ })).getByTitle(f.baseCommit)).toBeInTheDocument();
    expect(within(within(update).getByRole("row", { name: /^Resulting commit/ })).getByTitle(f.gitopsG)).toBeInTheDocument();
    // GitOps update (domain), then Execution, then the PipelineRun (execution).
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["GitOps update #4", "Execution", "PipelineRun", "TaskRuns"]);
    const pr = screen.getByRole("table", { name: "PipelineRun" });
    expect(pr).toHaveTextContent("hello-preflight-update/update-preflight-dep-1");
    expect(within(within(pr).getByRole("row", { name: /^Resolved from/ })).getByTitle(f.baseCommit)).toBeInTheDocument();
    expect(within(pr).getByRole("row", { name: /^Resolved from/ })).toHaveTextContent(".pathops/tekton/pipelines/update-preflight-gitops.yaml");
    const tasks = screen.getByRole("region", { name: "TaskRuns" });
    await userEvent.click(within(tasks).getAllByRole("button", { name: "View log" })[0]);
    expect(await within(tasks).findByRole("log", { name: "Log of push" })).toHaveTextContent("pushed " + f.gitopsG);
    expect(screen.getByRole("link", { name: "#1" })).toHaveAttribute("href", `/applications/${f.appId}/deployments/dep-1`);
  });

  it("Reconcile: Reconciliation, Execution, Flux, then GitRepository and Kustomization each its own key/value table", async () => {
    renderAt(`/applications/${f.appId}/deployments/dep-1/steps/RECONCILE`, api());
    expect(await screen.findByRole("heading", { level: 1, name: "Reconcile — Deployment #1" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Reconciliation #4",
      "Execution",
      "Flux",
      "GitRepository",
      "Kustomization",
    ]);
    expect(within(screen.getByRole("table", { name: "Reconciliation" })).getByTitle(f.gitopsG)).toBeInTheDocument();
    const x = screen.getByRole("table", { name: "Execution" });
    expect(within(x).getByRole("row", { name: /^Executor/ })).toHaveTextContent("Flux");
    expect(within(within(x).getByRole("row", { name: /^Status/ })).getByText("Succeeded")).toHaveClass("status-ok");
    const flux = screen.getByRole("table", { name: "Flux" });
    expect(within(flux).getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Namespace", "Baseline revision", "Last observed"]);
    expect(within(within(flux).getByRole("row", { name: /^Baseline revision/ })).getByTitle(f.baseCommit)).toBeInTheDocument();
    const gr = screen.getByRole("table", { name: "GitRepository" });
    expect(within(gr).getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Name", "Revision", "Generation", "Ready", "Reason", "Message", "Observed"]);
    expect(within(gr).getByTitle(`main@sha1:${f.gitopsG}`)).toHaveTextContent(f.gitopsG.slice(0, 12));
    const ks = screen.getByRole("table", { name: "Kustomization" });
    expect(within(ks).getAllByRole("rowheader").map((h) => h.textContent)).toEqual([
      "Name",
      "Last attempted",
      "Last applied",
      "Generation",
      "Ready",
      "Reason",
      "Message",
      "Observed",
    ]);
    expect(ks).toHaveTextContent("ReconciliationSucceeded");
    expect(within(within(ks).getByRole("row", { name: /^Message/ })).getByText(/Applied revision/)).toHaveClass("wrap");
    expect(within(within(ks).getByRole("row", { name: /^Generation/ })).getByRole("cell")).toHaveTextContent("2 / 2");
    // No combined table, no TaskRuns.
    expect(screen.queryByRole("table", { name: "Flux objects" })).toBeNull();
    expect(screen.queryByRole("region", { name: "TaskRuns" })).toBeNull();
  });

  it("Reconcile: an object that did not exist, and one never observed", async () => {
    const x = f.reconcileStep.execution as import("../api/types").FluxExecution;
    const step = { ...f.reconcileStep, status: "RUNNING", execution: { ...x, gitRepository: { ...x.gitRepository!, found: false }, kustomization: null } };
    renderAt(`/applications/${f.appId}/deployments/dep-1/steps/RECONCILE`, fakeApi({ ...all, [`${app}/deployments/dep-1/steps/RECONCILE`]: step }));
    expect(await screen.findByRole("table", { name: "GitRepository" })).toHaveTextContent("did not exist");
    expect(within(screen.getByRole("region", { name: "Kustomization" })).getByText("Not observed.")).toBeInTheDocument();
  });
});

describe("Status in progress", () => {
  it("colors In progress as a running status, never success or failure", () => {
    render(<Status status="IN_PROGRESS" />);
    expect(screen.getByText("In progress")).toHaveClass("status-running");
  });
});

describe("Relative time", () => {
  it("is just now, then 2m ago, 1h ago, 3h ago, 1d ago; the full time on hover", () => {
    const now = Date.parse("2026-11-21T12:00:00Z");
    const at = (s: number) => new Date(now - s * 1000).toISOString();
    render(
      <>
        {[5, 125, 3700, 3 * 3600 + 10, 86500].map((s) => (
          <Ago key={s} at={at(s)} now={now} relative />
        ))}
      </>,
    );
    expect(screen.getAllByRole("time").map((t) => t.textContent)).toEqual(["just now", "2m ago", "1h ago", "3h ago", "1d ago"]);
    expect(screen.getByText("2m ago")).toHaveAttribute("title", at(125));
  });
});
