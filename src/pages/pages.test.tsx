import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import { Duration } from "../components/ui";
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
    expect(screen.getAllByText("not deployed")).toHaveLength(2);
  });

  it("shows an environment as its health, the app's link and how long ago it was deployed", async () => {
    const at = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    const app = { ...f.applications.applications[0], production: { status: "HEALTHY", url: "https://manual-web.example.test/", deployedAt: at } };
    renderAt("/", fakeApi({ "/api/v1/applications": { applications: [app] } }));
    const open = await screen.findByRole("link", { name: "Open app ↗" });
    expect(open).toHaveAttribute("href", "https://manual-web.example.test/");
    expect(open.closest("td")).toHaveTextContent(/^Healthy — Open app ↗ — 3h$/);
    expect(screen.getAllByText("not deployed")).toHaveLength(1);
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
      "Validations",
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
      ["Validations", "No validations yet."],
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
    expect(within(section).getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(section).not.toHaveTextContent("Source webhook");
  });

  it("lists images with their tag, digest, build and a copy of the pinned reference", async () => {
    renderAt(`/applications/${f.appId}/images`, fakeApi(all));
    expect(await screen.findByTitle(f.digest)).toBeInTheDocument();
    expect(screen.queryByText(/^Repository:/)).not.toBeInTheDocument();
    expect(screen.getByText("274af150e590")).toBeInTheDocument();
    const section = screen.getByRole("region", { name: "Images" });
    expect(within(section).getByRole("button", { name: "Refresh" })).toBeInTheDocument();
    expect(within(section).getAllByRole("button", { name: /^Copy / }).map((b) => b.getAttribute("aria-label"))).toEqual([
      `Copy zot-canary.demo.pathops.io/apps/${f.appId}@${f.digest}`,
    ]);
    expect(within(section).getByRole("link", { name: "#1" })).toHaveAttribute("href", `/applications/${f.appId}/builds/build-ok`);
  });

  it("lists builds by number with their delivery", async () => {
    renderAt(`/applications/${f.appId}/builds`, fakeApi({ ...all, [`${app}/builds`]: { builds: [f.buildBad, f.buildOk] } }));
    const links = await screen.findAllByRole("link", { name: "#2" });
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["#", "Commit", "Status", "Delivery", "Started", "Duration"]);
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
  it("shows a succeeded run: its facts, its steps and the image", async () => {
    renderAt(`/applications/${f.appId}/deliveries/run-ok`, fakeApi(all));
    expect(await screen.findByRole("heading", { level: 1, name: "Delivery #1" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Delivery run" })).toHaveTextContent(f.okRev);
    expect(within(screen.getByRole("table", { name: "Delivery run" })).getAllByRole("rowheader")[0]).toHaveTextContent("Run ID");
    const steps = screen.getByRole("table", { name: "Delivery steps" });
    expect(steps).toHaveTextContent("Build application");
    expect(within(steps).getByRole("link", { name: "#1" })).toHaveAttribute("href", `/applications/${f.appId}/builds/build-ok`);
    expect(within(steps).queryByRole("group", { name: "Build tree" })).toBeNull();
    expect(screen.getByRole("table", { name: "Image" })).toHaveTextContent(f.digest);
  });

  it("shows a failed run's error and no image", async () => {
    renderAt(`/applications/${f.appId}/deliveries/run-bad`, fakeApi(all));
    expect(await screen.findByRole("alert")).toHaveTextContent("BUILD_APPLICATION: the PipelineRun manual-web-ci/build-b failed (Failed)");
    expect(screen.getByRole("table", { name: "Delivery steps" })).toHaveTextContent("the PipelineRun manual-web-ci/build-b failed (Failed)");
    expect(screen.getByText("No image: the run failed, nothing was published.")).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Image" })).toBeNull();
  });

  it("opens a failed step as its build tree, with one step's log open at a time under its step", async () => {
    renderAt(`/applications/${f.appId}/deliveries/run-bad`, fakeApi(all));
    const tree = await screen.findByRole("group", { name: "Build tree" });
    expect(tree).toHaveTextContent("Tasks Completed: 2 (Failed: 1, Cancelled 0), Skipped: 0");
    // The build's error shows once, under its step; the PipelineRun's name is cut short.
    const steps = screen.getByRole("table", { name: "Delivery steps" });
    expect(within(steps).getAllByText(/^the PipelineRun manual-web-ci\/build-b failed/)).toHaveLength(1);
    expect(tree).not.toHaveTextContent("failed (Failed)");
    expect(within(tree).getByTitle("manual-web-ci/build-b")).toHaveTextContent("build-b");
    expect(within(within(tree).getByRole("table", { name: "Build summary" })).getByRole("link", { name: "#2" })).toHaveAttribute(
      "href",
      `/applications/${f.appId}/builds/build-bad`,
    );
    // One summary row per level, each level one indent further in.
    const pr = within(tree).getByRole("table", { name: "PipelineRun" });
    expect(pr.querySelectorAll(":scope > tbody > tr")).toHaveLength(1);
    expect(pr.parentElement).toHaveClass("level");
    expect(pr.parentElement!.parentElement).toBe(tree);
    const lint = await within(tree).findByRole("group", { name: "TaskRun lint" });
    const image = within(tree).getByRole("group", { name: "TaskRun build-image" });
    expect(within(image).getByRole("table", { name: "TaskRun build-image summary" })).toHaveTextContent("build-image");
    // Steps latest first: build, then checkout.
    await userEvent.click(within(image).getAllByRole("button", { name: "View log" })[0]);
    const log = await within(image).findByRole("log", { name: "Log of build" });
    expect(log).toHaveTextContent("ERROR: failed to solve");
    // The log is the row right under its step's row.
    const stepRow = within(image).getByRole("cell", { name: "build" }).closest("tr")!;
    expect(stepRow.nextElementSibling).toContainElement(log);
    await userEvent.click(within(lint).getByRole("button", { name: "View log" }));
    expect(await within(lint).findByText("lint checkout ok")).toBeInTheDocument();
    expect(within(image).queryByRole("log", { name: "Log of build" })).toBeNull();
  });

  it("renders the steps the Tenant CP returns latest first, including types it does not know yet", async () => {
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
    const steps = await screen.findByRole("table", { name: "Delivery steps" });
    const rows = within(steps).getAllByRole("row").slice(1);
    expect(rows[0]).toHaveTextContent("Update preflight gitops");
    expect(rows[1]).toHaveTextContent("Build application");
  });
});

describe("Build", () => {
  it("shows the build by number, its PipelineRun, TaskRuns, steps and a bounded log", async () => {
    renderAt(`/applications/${f.appId}/builds/build-ok`, fakeApi(all));
    expect(await screen.findByRole("heading", { level: 1, name: "Build #1" })).toBeInTheDocument();
    const facts = screen.getByRole("table", { name: "Build" });
    expect(within(facts).getAllByRole("rowheader")[0]).toHaveTextContent("Build ID");
    const delivery = within(facts).getByRole("row", { name: /^Delivery/ });
    expect(within(delivery).getByRole("link", { name: "#1" })).toHaveAttribute("href", `/applications/${f.appId}/deliveries/run-ok`);
    const pr = screen.getByRole("table", { name: "PipelineRun" });
    expect(pr).toHaveTextContent("manual-web-ci/build-build-ok");
    expect(within(pr).getByRole("rowheader", { name: "Image Digest" })).toBeInTheDocument();
    const tasks = await screen.findByRole("region", { name: "TaskRuns" });
    await waitFor(() => expect(tasks).toHaveTextContent("build-image"));
    const tr = within(tasks).getByRole("table", { name: "TaskRun build-image facts" });
    expect(tr).toHaveTextContent("build-build-ok-build-image");
    expect(tasks).not.toHaveTextContent("Results:");
    for (const step of ["checkout", "build", "push"]) expect(within(tasks).getByText(step)).toBeInTheDocument();
    const steps = within(tasks).getAllByRole("row").slice(-3).map((r) => r.textContent?.slice(0, 2));
    expect(steps).toEqual(["3p", "2b", "1c"]);
    await userEvent.click(within(tasks).getAllByRole("button", { name: "View log" })[1]);
    const log = await screen.findByRole("log", { name: "Log of build" });
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

describe("Theme", () => {
  it("toggles light and dark and remembers the choice", async () => {
    renderAt("/", fakeApi({ "/api/v1/applications": { applications: [] } }));
    const before = document.documentElement.dataset.theme;
    const toggle = screen.getByRole("button", { name: /mode$/ });
    await userEvent.click(toggle);
    const after = document.documentElement.dataset.theme;
    expect(after).not.toEqual(before);
    expect(localStorage.getItem("pathops-theme")).toEqual(after);
  });

  it("sits first in the header, before the user and sign out, with no Cell", async () => {
    const me = { subject: "s", email: "alice@example.test", issuer: "https://dex", cellId: "canary" };
    renderAt("/", fakeApi({ "/api/v1/applications": { applications: [] }, "/api/v1/me": me }));
    const header = screen.getByRole("banner");
    await within(header).findByText("alice@example.test");
    expect(header.textContent).toMatch(/mode\s*alice@example\.test\s*Sign out$/);
    expect(header).not.toHaveTextContent("canary");
    expect(screen.getByRole("contentinfo")).toHaveTextContent("© 2026 PathOps · Open source under the MIT License");
    expect(within(header).queryByRole("button", { name: "alice@example.test" })).not.toBeInTheDocument();
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
