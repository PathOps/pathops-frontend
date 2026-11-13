import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
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
  "/api/v1/builds/build-ok": f.buildOk,
  "/api/v1/builds/build-ok/tasks": f.tasksOk,
  "/api/v1/builds/build-ok/tasks/build-build-ok-build-image/logs?step=checkout": { ...f.buildLog, step: "checkout", content: "cloned" },
  "/api/v1/builds/build-ok/tasks/build-build-ok-build-image/logs?step=build": f.buildLog,
  "/api/v1/builds/build-ok/tasks/build-build-ok-build-image/logs?step=push": { ...f.buildLog, step: "push", content: "pushed" },
  "/api/v1/builds/build-bad": f.buildBad,
  "/api/v1/builds/build-bad/tasks": f.tasksBad,
  "/api/v1/builds/build-bad/tasks/build-b-lint/logs?step=checkout": f.logOf("build-b-lint", "checkout", "lint checkout ok"),
  "/api/v1/builds/build-bad/tasks/build-b-build-image/logs?step=checkout": f.logOf("build-b-build-image", "checkout", "image checkout ok"),
  "/api/v1/builds/build-bad/tasks/build-b-build-image/logs?step=build": f.logOf("build-b-build-image", "build", "ERROR: failed to solve"),
};

describe("Applications", () => {
  it("shows loading, then the user's Applications", async () => {
    let resolve: (v: unknown) => void = () => {};
    const api = fakeApi({ "/api/v1/applications": new Promise((r) => (resolve = r)) });
    renderAt("/", api);
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    resolve(f.applications);
    expect(await screen.findByRole("link", { name: "manual-web" })).toHaveAttribute("href", `/applications/${f.appId}/general`);
    expect(screen.getByText(/any · container · Dockerfile \(BuildKit\)/)).toBeInTheDocument();
    expect(screen.getByText("274af150e590")).toBeInTheDocument();
  });

  it("shows an empty list and errors", async () => {
    renderAt("/", fakeApi({ "/api/v1/applications": { applications: [] } }));
    expect(await screen.findByText("Nothing here yet.")).toBeInTheDocument();
  });

  it("shows the Tenant CP's error", async () => {
    renderAt("/", fakeApi({ "/api/v1/applications": new ApiError(500, "internal_error") }));
    expect(await screen.findByRole("alert")).toHaveTextContent("500");
  });

  it("navigates from the list to an Application", async () => {
    renderAt("/", fakeApi(all));
    await userEvent.click(await screen.findByRole("link", { name: "manual-web" }));
    expect(await screen.findByRole("heading", { name: /manual-web/ })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Application sections" })).toBeInTheDocument();
  });
});

describe("Application", () => {
  it("has the sections the Tenant CP names, and General shows the template, technology and repositories", async () => {
    renderAt(`/applications/${f.appId}/general`, fakeApi(all));
    const tabs = await screen.findByRole("navigation", { name: "Application sections" });
    expect(within(tabs).getAllByRole("link").map((l) => l.textContent)).toEqual([
      "General",
      "Provisioning",
      "Repositories",
      "Builds",
      "Images",
      "Delivery Runs",
    ]);
    expect(screen.queryByText(/Preflight/)).toBeNull();
    expect(screen.getByRole("link", { name: "view the template at this revision" })).toHaveAttribute("href", f.overview.template.url);
    expect(screen.getByText("Dockerfile (BuildKit)")).toBeInTheDocument();
    const src = screen.getByRole("link", { name: "alice/manual-web" });
    expect(src).toHaveAttribute("href", "https://forgejo-canary.demo.pathops.io/alice/manual-web");
    expect(src).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("is not found for an id that is not the user's", async () => {
    renderAt(`/applications/22222222-2222-4222-8222-222222222222/general`, fakeApi(all));
    expect(await screen.findByRole("alert")).toHaveTextContent("Not found, or not yours.");
  });

  it("lists the provisioning Steps in order with their errors and attempts", async () => {
    renderAt(`/applications/${f.appId}/provisioning`, fakeApi(all));
    const steps = await screen.findAllByRole("button", { expanded: false });
    expect(steps).toHaveLength(12);
    expect(steps[0]).toHaveTextContent("Resolve template");
    expect(steps[11]).toHaveTextContent("Configure build and push access isolation");
    expect(screen.getByText("conflict: alice/manual-web exists")).toBeInTheDocument();
    await userEvent.click(steps[1]);
    expect(screen.getByRole("table")).toHaveTextContent("ABSENT");
  });

  it("lists the three repositories with their links, and no invented metadata", async () => {
    renderAt(`/applications/${f.appId}/repositories`, fakeApi(all));
    expect(await screen.findByRole("heading", { name: "Source" })).toBeInTheDocument();
    expect(screen.getByText("Preflight GitOps")).toBeInTheDocument();
    expect(screen.getByText("Production GitOps")).toBeInTheDocument();
    expect(screen.getAllByText("Repository metadata — coming later")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "alice/manual-web-gitops-production" })).toHaveAttribute(
      "href",
      "https://forgejo-canary.demo.pathops.io/alice/manual-web-gitops-production",
    );
  });

  it("lists images with their digest and their build, and no registry metadata", async () => {
    renderAt(`/applications/${f.appId}/images`, fakeApi(all));
    expect(await screen.findByText(f.digest)).toBeInTheDocument();
    expect(screen.getByText(/Image of manual-web/)).toBeInTheDocument();
    expect(screen.getByText(`zot-canary.demo.pathops.io/apps/${f.appId}`)).toBeInTheDocument();
    expect(screen.getByText("Registry metadata — coming later")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Build" })).toHaveAttribute("href", `/applications/${f.appId}/builds/build-ok`);
  });

  it("lists delivery runs by HEAD12 with their result", async () => {
    renderAt(`/applications/${f.appId}/deliveries`, fakeApi(all));
    expect(await screen.findByRole("link", { name: "274af150e590" })).toHaveAttribute("href", `/applications/${f.appId}/deliveries/run-ok`);
    expect(screen.getByRole("link", { name: "202161553024" })).toBeInTheDocument();
    expect(screen.getByText(/the PipelineRun manual-web-ci\/build-b failed/)).toBeInTheDocument();
  });
});

describe("Delivery run", () => {
  it("shows a succeeded run as commit -> push -> steps -> image with its digest", async () => {
    renderAt(`/applications/${f.appId}/deliveries/run-ok`, fakeApi(all));
    const tl = await screen.findByRole("list", { name: "Delivery timeline" });
    const nodes = Array.from(tl.children) as HTMLElement[];
    expect(nodes.map((n) => n.dataset.kind)).toEqual(["commit", "event", "step", "output"]);
    expect(nodes[2]).toHaveTextContent("Build application");
    expect(nodes[3]).toHaveTextContent("OCI image 274af150e590");
    await userEvent.click(within(nodes[3]).getByRole("button"));
    expect(nodes[3]).toHaveTextContent(f.digest);
    await userEvent.click(within(nodes[2]).getByRole("button"));
    expect(within(nodes[2]).getByRole("link", { name: "build-ok" })).toHaveAttribute("href", `/applications/${f.appId}/builds/build-ok`);
    expect(within(nodes[2]).queryByRole("list", { name: "Build tree" })).toBeNull();
  });

  it("shows a failed run's error at the run and the step, and no image", async () => {
    renderAt(`/applications/${f.appId}/deliveries/run-bad`, fakeApi(all));
    const tl = await screen.findByRole("list", { name: "Delivery timeline" });
    expect(screen.getByRole("alert")).toHaveTextContent("BUILD_APPLICATION: the PipelineRun manual-web-ci/build-b failed (Failed)");
    const nodes = Array.from(tl.children) as HTMLElement[];
    expect(nodes[2]).toHaveTextContent("the PipelineRun manual-web-ci/build-b failed (Failed)");
    expect(nodes[3]).toHaveTextContent("No image");
    expect(tl).not.toHaveTextContent("OCI image");
    expect(tl).not.toHaveTextContent("sha256:");
  });

  it("opens a failed step as its build tree, with one step's log open at a time under its step", async () => {
    renderAt(`/applications/${f.appId}/deliveries/run-bad`, fakeApi(all));
    const tree = await screen.findByRole("list", { name: "Build tree" });
    expect(tree).toHaveTextContent("PipelineRun manual-web-ci/build-b");
    expect(tree).toHaveTextContent("Tasks Completed: 2 (Failed: 1, Cancelled 0), Skipped: 0");
    expect(within(tree).getByRole("link", { name: "build-bad" })).toHaveAttribute("href", `/applications/${f.appId}/builds/build-bad`);
    const lint = await within(tree).findByLabelText("TaskRun lint");
    const image = within(tree).getByLabelText("TaskRun build-image");
    await userEvent.click(within(image).getAllByRole("button", { name: "view log" })[1]);
    const log = await within(image).findByLabelText("Log of build");
    expect(log).toHaveTextContent("ERROR: failed to solve");
    // The log is the row right under its step's row.
    const stepRow = within(image).getByRole("cell", { name: "build" }).closest("tr")!;
    expect(stepRow.nextElementSibling).toContainElement(log);
    await userEvent.click(within(lint).getByRole("button", { name: "view log" }));
    expect(await within(lint).findByText("lint checkout ok")).toBeInTheDocument();
    expect(within(image).queryByLabelText("Log of build")).toBeNull();
  });

  it("renders the steps the Tenant CP returns, including types it does not know yet", async () => {
    const future: DeliveryDetail = {
      ...f.deliveryOk,
      status: "RUNNING",
      completedAt: null,
      build: null,
      steps: [
        { ...f.deliveryOk.steps[0], position: 2, id: "s2", type: "UPDATE_PREFLIGHT_GITOPS", status: "RUNNING", executor: "TEKTON", build: null },
        f.deliveryOk.steps[0],
      ],
    };
    renderAt(`/applications/${f.appId}/deliveries/run-x`, fakeApi({ [`${app}/deliveries/run-x`]: future }));
    const tl = await screen.findByRole("list", { name: "Delivery timeline" });
    const nodes = Array.from(tl.children) as HTMLElement[];
    expect(nodes.map((n) => n.textContent)).toEqual([
      expect.stringContaining("Commit"),
      expect.stringContaining("Push received"),
      expect.stringContaining("Build application"),
      expect.stringContaining("Update preflight gitops"),
      expect.stringContaining("OCI image"),
    ]);
  });
});

describe("Build", () => {
  it("correlates the build and shows its PipelineRun, TaskRuns, steps and a bounded log", async () => {
    renderAt(`/applications/${f.appId}/builds/build-ok`, fakeApi(all));
    const chain = await screen.findByRole("list", { name: "Correlation" });
    expect(chain).toHaveTextContent("Delivery run 274af150e590");
    expect(chain).toHaveTextContent("PipelineRun manual-web-ci/build-build-ok");
    expect(screen.getByText("imageDigest")).toBeInTheDocument();
    const tasks = await screen.findByRole("region", { name: "TaskRuns" });
    await waitFor(() => expect(tasks).toHaveTextContent("build-image"));
    for (const step of ["checkout", "build", "push"]) expect(within(tasks).getByText(step)).toBeInTheDocument();
    await userEvent.click(within(tasks).getAllByRole("button", { name: "view log" })[1]);
    const log = await screen.findByLabelText("Log of build");
    expect(log).toHaveTextContent("exporting to oci image format");
    expect(log).toHaveTextContent("Truncated: the last 4000 lines, at most 256 KiB.");
  });

  it("says when Tekton no longer has the PipelineRun", async () => {
    const gone = { ...f.buildOk, observation: "not_found", pipelineRunStatus: null };
    renderAt(`/applications/${f.appId}/builds/build-ok`, fakeApi({
      "/api/v1/builds/build-ok": gone,
      "/api/v1/builds/build-ok/tasks": { buildId: "build-ok", observation: "not_found", taskRuns: [] },
    }));
    expect((await screen.findAllByText(/no longer has this PipelineRun/)).length).toBeGreaterThan(0);
  });
});
