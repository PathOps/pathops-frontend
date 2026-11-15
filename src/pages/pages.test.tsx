import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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
    // The step's error is the run's: shown once, in the run's facts.
    expect(screen.getByRole("table", { name: "Delivery steps" })).not.toHaveTextContent("failed (Failed)");
    expect(screen.getByText("No image: the run failed, nothing was published.")).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "Image" })).toBeNull();
  });

  it("opens a failed step as its build tree, with one step's log open at a time under its step", async () => {
    renderAt(`/applications/${f.appId}/deliveries/run-bad`, fakeApi(all));
    const tree = await screen.findByRole("group", { name: "Build tree" });
    expect(tree).toHaveTextContent("Tasks Completed: 2 (Failed: 1, Cancelled 0), Skipped: 0");
    // No error row under a step with a build; the PipelineRun's name is cut short.
    const steps = screen.getByRole("table", { name: "Delivery steps" });
    expect(within(steps).queryByText(/^the PipelineRun manual-web-ci\/build-b failed/)).toBeNull();
    expect(within(tree).getByTitle("manual-web-ci/build-b")).toHaveTextContent("build-b");
    expect(within(within(tree).getByRole("table", { name: "Build summary" })).getByRole("link", { name: "#2" })).toHaveAttribute(
      "href",
      `/applications/${f.appId}/builds/build-bad`,
    );
    // One summary row per level, one under the other.
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
    // Copy puts the whole log on the clipboard; Download saves it as <TaskRun>-<step>.log.
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await userEvent.click(within(log).getByRole("button", { name: "Copy log of build" }));
    expect(writeText).toHaveBeenCalledWith(f.buildLog.content);
    // "Copied" shows in a bubble over the button for a moment, then goes.
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

  it("says when Tekton no longer has the PipelineRun", async () => {
    const gone = { ...f.buildOk, observation: "not_found", pipelineRunStatus: null };
    renderAt(`/applications/${f.appId}/builds/build-ok`, fakeApi({
      "/api/v1/builds/build-ok": gone,
      "/api/v1/builds/build-ok/tasks": { buildId: "build-ok", observation: "not_found", taskRuns: [] },
    }));
    expect((await screen.findAllByText(/no longer has this PipelineRun/)).length).toBeGreaterThan(0);
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

  it("signs out from the user's menu", async () => {
    renderAt("/", fakeApi({ "/api/v1/applications": { applications: [] }, "/api/v1/me": me }));
    await userEvent.click(await screen.findByRole("button", { name: /alice@example\.test/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    // The page leaves for /signed-out (outside these routes).
    expect(await screen.findByText("No such page.")).toBeInTheDocument();
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
