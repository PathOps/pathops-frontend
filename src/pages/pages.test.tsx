import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/client";
import { authorizationUrl, completeSignIn, loadConfig, resetForTests, signedIn } from "../auth/oidc";
import { MemoryRouter } from "react-router-dom";
import { App } from "../App";
import { Ago, Duration, EnvironmentLabel, Status } from "../components/ui";
import { ValidationsTable } from "../sections/Validations";
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
      "Validations",
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
      ["Validations", "No validations yet."],
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

  it("states Not deployed, Deploying, Healthy and Unstable; Open App when PathOps gives the app's URL, also when Unstable", async () => {
    const url = "https://manual-web-preflight.example.test/";
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
      ["Not deployed", { environment: "PREFLIGHT", last: null, current: null, url }, "status-neutral", false],
      ["Deploying", { environment: "PREFLIGHT", last: running, current: dep, url }, "status-running", true],
      ["Healthy", { environment: "PREFLIGHT", last: dep, current: dep, url }, "status-ok", true],
      ["Unstable", { environment: "PREFLIGHT", last: { ...running, status: "FAILED", completedAt: dep.completedAt }, current: dep, url }, "status-error", true],
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
      // The Commit is the last Deployment's, the one the state is about.
      if (state === "Deploying") expect(within(facts).getByText("bbbbbbbbbbbb")).toBeInTheDocument();
      if (state === "Not deployed") expect(within(facts).getAllByText("—")).toHaveLength(2);
      unmount();
    }
  });

  it("shows a delivery step's Deployment in its details", async () => {
    const run: DeliveryDetail = {
      ...f.deliveryOk,
      steps: [
        { ...f.deliveryOk.steps[0], position: 3, id: "s3", type: "DEPLOY_PREFLIGHT", executor: "FLUX", build: null, deployment: dep,
          externalRef: "kustomization:hello-preflight-deploy/hello-preflight" },
        f.deliveryOk.steps[0],
      ],
    };
    renderAt(`/applications/${f.appId}/deliveries/run-p`, fakeApi({ [`${app}/deliveries/run-p`]: run }));
    const steps = await screen.findByRole("table", { name: "Delivery steps" });
    const row = within(steps).getAllByRole("row")[1];
    expect(row).toHaveTextContent("Deploy preflight");
    await userEvent.click(within(row).getByRole("button", { name: "Show" }));
    const facts = await screen.findByRole("table", { name: "Deployment #1" });
    expect(facts).toHaveTextContent(dep.imageReference);
    expect(screen.getByText("kustomization:hello-preflight-deploy/hello-preflight")).toBeInTheDocument();
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
    failureReason: "FLUX_RECONCILIATION_FAILED",
    failureMessage: "Ready=False",
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

  it("lists Deployments newest first: # Commit Environment Status Started Duration Delivery", async () => {
    const api = fakeApi({ ...all, [`${app}/deployments`]: { deployments: [failed, f.deployment], nextCursor: null, previousCursor: null } });
    renderAt(`/applications/${f.appId}/deployments`, api);
    const list = await screen.findByRole("region", { name: "Deployments" });
    await waitFor(() => expect(rows(list)).toHaveLength(2));
    expect(within(list).getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "#",
      "Commit",
      "Environment",
      "Status",
      "Started",
      "Duration",
      "Delivery",
    ]);
    const [first, second] = rows(list);
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
    expect(within(within(first).getAllByRole("cell")[6]).getByRole("link", { name: "#2" })).toHaveAttribute(
      "href",
      `/applications/${f.appId}/deliveries/run-bad`,
    );
    expect(within(first).getAllByRole("cell")[5]).toHaveTextContent("5m 00s");
    // The succeeded one: the 12-character commit, its delivery.
    expect(within(second).getByText("Succeeded")).toHaveClass("status-ok");
    expect(within(second).getByText(f.okRev.slice(0, 12))).toHaveAttribute("title", f.okRev);
    expect(within(within(second).getAllByRole("cell")[6]).getByRole("link", { name: "#1" })).toHaveAttribute(
      "href",
      `/applications/${f.appId}/deliveries/run-ok`,
    );
    expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
  });

  it("is a tab between Validations and Images; empty, it says so", async () => {
    renderAt(`/applications/${f.appId}/deployments`, fakeApi(all));
    const tabs = await screen.findByRole("navigation", { name: "Application sections" });
    const names = within(tabs).getAllByRole("link").map((l) => l.textContent);
    expect(names.slice(names.indexOf("Validations"), names.indexOf("Validations") + 3)).toEqual(["Validations", "Deployments", "Images"]);
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

describe("Validations table", () => {
  it("is # Commit Environment Status Tests Started Duration Delivery, its environment the same label as Deployments'", () => {
    const v = {
      id: "v-1",
      number: 1,
      sourceRevision: f.okRev,
      environment: "PRODUCTION",
      status: "SUCCEEDED",
      tests: { passed: 12, total: 12 },
      startedAt: "2026-11-20T10:00:00Z",
      durationSeconds: 42,
      deliveryRunId: "run-ok",
      deliveryNumber: 1,
    };
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <ValidationsTable appId={f.appId} validations={[v, { ...v, id: "v-2", number: 2, environment: "PREFLIGHT", tests: null }]} />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
      "#",
      "Commit",
      "Environment",
      "Status",
      "Tests",
      "Started",
      "Duration",
      "Delivery",
    ]);
    const [first, second] = screen.getAllByRole("row").slice(1);
    expect(within(first).getByText("Production").className).toBe("");
    expect(within(first).getByText("12/12")).toBeInTheDocument();
    expect(within(first).getByText(f.okRev.slice(0, 12))).toBeInTheDocument();
    expect(within(first).getByRole("link", { name: "#1" })).toHaveAttribute("href", `/applications/${f.appId}/deliveries/run-ok`);
    expect(within(second).getByText("Preflight").className).toBe("");
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
  const detail = { ...f.deployment, build: { id: "build-ok", number: 1, status: "SUCCEEDED" } };
  const api = () =>
    fakeApi({
      ...all,
      [`${app}/deployments`]: { deployments: [f.deployment], nextCursor: null, previousCursor: null },
      [`${app}/deployments/dep-1`]: detail,
    });

  it("opens from # in Deployments: Deployment #N, its environment, status, commit, image, delivery, times, GitOps commit", async () => {
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
      "Delivery",
      "Started",
      "Duration",
      "GitOps commit",
    ]);
    expect(within(facts).getByText("Preflight")).toBeInTheDocument();
    expect(within(facts).getByText("Succeeded")).toHaveClass("status-ok");
    expect(within(facts).getByText(f.okRev)).toBeInTheDocument();
    expect(within(facts).getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual([
      `/applications/${f.appId}/builds/build-ok`,
      `/applications/${f.appId}/deliveries/run-ok`,
    ]);
    expect(within(facts).getByRole("button", { name: "Copy image reference" })).toBeInTheDocument();
    expect(within(facts).getByText("2m 00s")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Deployments" })).toHaveAttribute("href", `/applications/${f.appId}/deployments`);
  });

  it("is a real route; another user's or an unknown Deployment is not found", async () => {
    renderAt(`/applications/${f.appId}/deployments/dep-9`, api());
    expect(await screen.findByRole("alert")).toHaveTextContent("Not found, or not yours.");
  });

  it("shows a failed Deployment's error, and no Build link without one", async () => {
    const failed = { ...detail, status: "FAILED", build: null, gitopsCommit: undefined, failureReason: "FLUX_RECONCILIATION_FAILED", failureMessage: "Ready=False" };
    renderAt(`/applications/${f.appId}/deployments/dep-1`, fakeApi({ ...all, [`${app}/deployments/dep-1`]: failed }));
    const facts = await screen.findByRole("table", { name: "Deployment" });
    expect(within(facts).getByText("Failed")).toHaveClass("status-error");
    expect(facts).toHaveTextContent("Flux reconciliation failed: Ready=False");
    expect(facts).toHaveTextContent("not yet");
    expect(within(facts).getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual([`/applications/${f.appId}/deliveries/run-ok`]);
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
