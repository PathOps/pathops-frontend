import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ApiContext, type Api } from "../api/client";
import { AppRoutes } from "../App";
import { fakeApi } from "../test/render";
import * as f from "../test/fixtures";
import { EventProvider, type Auth, type LiveSocket, type LiveSource } from "./EventProvider";
import type { LiveEvent } from "./topics";

const EVENTS = "https://events-canary.demo.pathops.io";
const app = `/api/v1/applications/${f.appId}`;
const otherApp = "22222222-2222-4222-8222-222222222222";

// FakeSocket is a socket.io-client socket the test drives.
class FakeSocket implements LiveSocket {
  active = true;
  closed = false;
  connects = 0;
  tokens: string[] = [];
  reauths: { token: string; ack: (a: { ok?: boolean; error?: string }) => void }[] = [];
  private handlers = new Map<string, ((...a: never[]) => void)[]>();
  private reconnecting: (() => void)[] = [];
  constructor(
    public base: string,
    public auth: Auth,
  ) {}
  on(event: string, fn: (...a: never[]) => void) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), fn]);
  }
  onReconnecting(fn: () => void) {
    this.reconnecting.push(fn);
  }
  emit(_event: "reauth", data: { token: string }, ack: (a: { ok?: boolean; error?: string }) => void) {
    this.reauths.push({ token: data.token, ack });
  }
  connect() {
    this.active = true;
    this.connects++;
  }
  disconnect() {
    this.active = false;
    this.closed = true;
    this.fire("disconnect", "io client disconnect");
  }
  private fire(event: string, ...args: unknown[]) {
    (this.handlers.get(event) ?? []).forEach((h) => (h as (...a: unknown[]) => void)(...args));
  }
  // open: the handshake (with the auth's token) succeeds.
  async open() {
    const token = await new Promise<string>((r) => this.auth((d) => r(d.token)));
    this.tokens.push(token);
    this.fire("connect");
  }
  send(data: unknown) {
    this.fire("invalidate", data);
  }
  // drop: the transport closed; Socket.IO reconnects by itself.
  drop() {
    this.fire("disconnect", "transport close");
    this.reconnecting.forEach((f) => f());
  }
  // refuse: pathops-events refused the handshake; Socket.IO does not retry.
  refuse(message = "unauthorized") {
    this.active = false;
    this.fire("connect_error", new Error(message));
  }
}

function fakeSource() {
  let signedIn: ((s: boolean) => void)[] = [];
  const s = {
    socks: [] as FakeSocket[],
    current: "token-1" as string | null,
    exp: Date.now() + 5 * 60_000 as number | null,
    async base() {
      return EVENTS as string | null;
    },
    open(base: string, auth: Auth) {
      const c = new FakeSocket(base, auth);
      s.socks.push(c);
      return c;
    },
    async token() {
      return s.current;
    },
    expiry() {
      return s.exp;
    },
    onSignedIn(l: (signed: boolean) => void) {
      signedIn.push(l);
      return () => {
        signedIn = signedIn.filter((x) => x !== l);
      };
    },
    signIn(signed: boolean) {
      s.current = signed ? "token-2" : null;
      signedIn.forEach((l) => l(signed));
    },
  };
  return s satisfies LiveSource & Record<string, unknown>;
}

function renderLive(path: string, api: Api, source: LiveSource) {
  return render(
    <ApiContext.Provider value={api}>
      <EventProvider source={source} backoffMs={[10]}>
        <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AppRoutes />
        </MemoryRouter>
      </EventProvider>
    </ApiContext.Provider>,
  );
}

const ev = (type: LiveEvent["type"], applicationId: string, resourceId?: string): LiveEvent => ({
  type,
  applicationId,
  resourceId,
  occurredAt: "2026-11-15T12:00:00Z",
});

const count = (api: { calls: string[] }, path: string) => api.calls.filter((c) => c === path).length;

// connected opens the one connection once the page is up.
async function connected(source: ReturnType<typeof fakeSource>) {
  await waitFor(() => expect(source.socks.length).toBe(1));
  await act(() => source.socks[0].open());
  return source.socks[0];
}

function table() {
  return {
    [`${app}/overview`]: f.overview,
    [`${app}/builds`]: { builds: [f.buildBad, f.buildOk], previousCursor: null, nextCursor: null },
    [`${app}/deliveries`]: { ...f.deliveries, previousCursor: null, nextCursor: null },
    [`${app}/deliveries/run-ok`]: f.deliveryOk,
    [`${app}/builds/build-ok`]: f.buildOk,
    [`${app}/deployments/dep-1`]: f.deploymentDetail,
    [`${app}/deployments/dep-1/steps/UPDATE_GITOPS`]: f.updateStep,
    [`${app}/deployments/dep-1/steps/RECONCILE`]: f.reconcileStep,
    "/api/v1/inbox?unread=true&limit=1": { messages: [], unread: 0, previousCursor: null, nextCursor: null },
    "/api/v1/inbox": { messages: [], unread: 0, previousCursor: null, nextCursor: null },
    "/api/v1/applications": f.applications,
    [`${app}/provisioning`]: f.provisioning,
    [`${app}/repositories`]: f.repositories,
  } as Record<string, unknown>;
}

beforeEach(() => sessionStorage.clear());
afterEach(() => sessionStorage.clear());

describe("Live updates", () => {
  it("opens one Socket.IO connection for the whole UI to pathops-events' host, with the PathOps token in its auth", async () => {
    const source = fakeSource();
    const api = fakeApi(table());
    renderLive(`/applications/${f.appId}/builds`, api, source);
    await screen.findAllByRole("link", { name: "#2" });
    const c = await connected(source);
    // The header, the overview and the Builds list all listen; one connection.
    expect(source.socks).toHaveLength(1);
    expect(c.base).toBe(EVENTS);
    expect(c.tokens).toEqual(["token-1"]);
    expect(document.cookie).toBe("");
  });

  it("refetches the Builds list for its Application only; other Applications and types are ignored", async () => {
    const source = fakeSource();
    const api = fakeApi(table());
    renderLive(`/applications/${f.appId}/builds`, api, source);
    await screen.findAllByRole("link", { name: "#2" });
    const c = await connected(source);
    const before = count(api, `${app}/builds`);
    act(() => c.send(ev("BUILD_CHANGED", otherApp, "x")));
    act(() => c.send(ev("INBOX_CHANGED", f.appId)));
    act(() => c.send(ev("DELIVERY_CHANGED", f.appId, "run-ok")));
    expect(count(api, `${app}/builds`)).toBe(before);
    act(() => c.send(ev("BUILD_CHANGED", f.appId, "build-new")));
    await waitFor(() => expect(count(api, `${app}/builds`)).toBe(before + 1));
    // No Refresh: the view is live.
    expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
  });

  it("a new build shows on the newest page without a refresh", async () => {
    const source = fakeSource();
    const t = table();
    const api = fakeApi(t);
    renderLive(`/applications/${f.appId}/builds`, api, source);
    await screen.findAllByRole("link", { name: "#2" });
    const c = await connected(source);
    t[`${app}/builds`] = { builds: [{ ...f.buildOk, id: "build-3", number: 3, status: "RUNNING" }, f.buildBad, f.buildOk], previousCursor: null, nextCursor: null };
    act(() => c.send(ev("BUILD_CHANGED", f.appId, "build-3")));
    expect(await screen.findByRole("link", { name: "#3" })).toBeInTheDocument();
  });

  it("an older page keeps its place: a new build is not shown there; a change of its own row is", async () => {
    const source = fakeSource();
    const t = table();
    const page = `${app}/builds?cursor=older`;
    t[page] = { builds: [f.buildOk], previousCursor: "newer", nextCursor: null };
    const api = fakeApi(t);
    renderLive(`/applications/${f.appId}/builds?cursor=older`, api, source);
    await screen.findByRole("link", { name: "#1" });
    const c = await connected(source);
    act(() => c.send(ev("BUILD_CHANGED", f.appId, "build-new")));
    expect(count(api, page)).toBe(1);
    expect(count(api, `${app}/builds`)).toBe(0);
    act(() => c.send(ev("BUILD_CHANGED", f.appId, "build-ok")));
    await waitFor(() => expect(count(api, page)).toBe(2));
    // Still the same page (its cursor), never the newest.
    expect(count(api, `${app}/builds`)).toBe(0);
  });

  it("Deployments follow their delivery runs' changes without a Refresh: Running becomes Succeeded or Failed", async () => {
    const source = fakeSource();
    const t = table();
    const running = { ...f.deployment, status: "RUNNING", completedAt: null, durationSeconds: 30 };
    t[`${app}/deployments`] = { deployments: [running], previousCursor: null, nextCursor: null };
    const api = fakeApi(t);
    renderLive(`/applications/${f.appId}/deployments`, api, source);
    const list = await screen.findByRole("region", { name: "Deployments" });
    expect(await within(list).findByText("Running")).toBeInTheDocument();
    const c = await connected(source);
    const before = count(api, `${app}/deployments`);
    act(() => c.send(ev("BUILD_CHANGED", f.appId, "build-ok")));
    act(() => c.send(ev("DELIVERY_CHANGED", otherApp, "run-ok")));
    expect(count(api, `${app}/deployments`)).toBe(before);
    t[`${app}/deployments`] = { deployments: [f.deployment], previousCursor: null, nextCursor: null };
    act(() => c.send(ev("DELIVERY_CHANGED", f.appId, "run-ok")));
    expect(await within(list).findByText("Succeeded")).toBeInTheDocument();
    t[`${app}/deployments`] = { deployments: [{ ...f.deployment, status: "FAILED" }], previousCursor: null, nextCursor: null };
    act(() => c.send(ev("DELIVERY_CHANGED", f.appId, "run-ok")));
    expect(await within(list).findByText("Failed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
  });

  it("an older Deployments page keeps its place: only its own delivery runs' changes refetch it", async () => {
    const source = fakeSource();
    const t = table();
    const page = `${app}/deployments?cursor=older`;
    t[page] = { deployments: [f.deployment], previousCursor: "newer", nextCursor: null };
    const api = fakeApi(t);
    renderLive(`/applications/${f.appId}/deployments?cursor=older`, api, source);
    await screen.findByRole("navigation", { name: "Deployment pages" });
    const c = await connected(source);
    const before = count(api, page);
    act(() => c.send(ev("DELIVERY_CHANGED", f.appId, "run-new")));
    expect(count(api, page)).toBe(before);
    act(() => c.send(ev("DELIVERY_CHANGED", f.appId, "run-ok")));
    await waitFor(() => expect(count(api, page)).toBe(before + 1));
    expect(count(api, `${app}/deployments`)).toBe(0);
  });

  it("Images: the newest page shows a new image; an older page only its own builds' changes", async () => {
    const source = fakeSource();
    const t = table();
    t[`${app}/images`] = { ...f.images, previousCursor: null, nextCursor: null };
    t[`${app}/images?cursor=older`] = { ...f.images, previousCursor: "newer", nextCursor: null };
    const api = fakeApi(t);
    renderLive(`/applications/${f.appId}/images?cursor=older`, api, source);
    await screen.findByRole("navigation", { name: "Image pages" });
    const c = await connected(source);
    const page = `${app}/images?cursor=older`;
    const before = count(api, page);
    act(() => c.send(ev("BUILD_CHANGED", f.appId, "build-new")));
    expect(count(api, page)).toBe(before);
    act(() => c.send(ev("BUILD_CHANGED", f.appId, "build-ok")));
    await waitFor(() => expect(count(api, page)).toBe(before + 1));
    expect(count(api, `${app}/images`)).toBe(0);
  });

  it("the Applications list follows any Application's changes (a new one, its provisioning) and any delivery, without a Refresh", async () => {
    const source = fakeSource();
    const api = fakeApi(table());
    renderLive("/applications", api, source);
    await screen.findByRole("link", { name: "manual-web" });
    const c = await connected(source);
    expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
    const before = count(api, "/api/v1/applications");
    act(() => c.send(ev("BUILD_CHANGED", f.appId, "build-ok")));
    act(() => c.send(ev("INBOX_CHANGED", f.appId)));
    await new Promise((r) => setTimeout(r, 50));
    expect(count(api, "/api/v1/applications")).toBe(before);
    act(() => c.send(ev("APPLICATION_CHANGED", otherApp)));
    await waitFor(() => expect(count(api, "/api/v1/applications")).toBe(before + 1));
    act(() => c.send(ev("DELIVERY_CHANGED", f.appId, "run-ok")));
    await waitFor(() => expect(count(api, "/api/v1/applications")).toBe(before + 2));
  });

  it("an Application's provisioning, repositories and overview follow its own APPLICATION_CHANGED only, without Refresh or polling", async () => {
    for (const section of ["provisioning", "repositories"]) {
      const source = fakeSource();
      const api = fakeApi({ ...table(), [`${app}/provisioning`]: { ...f.provisioning, run: { ...f.provisioning.run, status: "RUNNING", completedAt: null } } });
      const view = renderLive(`/applications/${f.appId}/${section}`, api, source);
      await screen.findByRole("heading", { level: 2, name: section === "provisioning" ? "Provisioning" : "Repositories" });
      const c = await connected(source);
      expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
      const path = `${app}/${section}`;
      await waitFor(() => expect(count(api, path)).toBe(1));
      const overview = count(api, `${app}/overview`);
      act(() => c.send(ev("APPLICATION_CHANGED", otherApp)));
      act(() => c.send(ev("BUILD_CHANGED", f.appId, "build-ok")));
      await new Promise((r) => setTimeout(r, 50));
      expect(count(api, path)).toBe(1);
      act(() => c.send(ev("APPLICATION_CHANGED", f.appId)));
      await waitFor(() => expect(count(api, path)).toBe(2));
      await waitFor(() => expect(count(api, `${app}/overview`)).toBe(overview + 1));
      view.unmount();
    }
  });

  it("a Build's page refetches for that Build only", async () => {
    const source = fakeSource();
    const api = fakeApi(table());
    renderLive(`/applications/${f.appId}/builds/build-ok`, api, source);
    await screen.findByRole("heading", { name: "Build #1" });
    const c = await connected(source);
    const before = count(api, `${app}/builds/build-ok`);
    act(() => c.send(ev("BUILD_CHANGED", f.appId, "build-bad")));
    expect(count(api, `${app}/builds/build-ok`)).toBe(before);
    act(() => c.send(ev("BUILD_CHANGED", f.appId, "build-ok")));
    await waitFor(() => expect(count(api, `${app}/builds/build-ok`)).toBe(before + 1));
    expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
  });

  it("a Delivery's page refetches for that DeliveryRun only", async () => {
    const source = fakeSource();
    const api = fakeApi(table());
    renderLive(`/applications/${f.appId}/deliveries/run-ok`, api, source);
    await screen.findByRole("heading", { name: "Delivery #1" });
    const c = await connected(source);
    const path = `${app}/deliveries/run-ok`;
    const before = count(api, path);
    act(() => c.send(ev("DELIVERY_CHANGED", f.appId, "run-bad")));
    expect(count(api, path)).toBe(before);
    act(() => c.send(ev("DELIVERY_CHANGED", f.appId, "run-ok")));
    await waitFor(() => expect(count(api, path)).toBe(before + 1));
    expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
  });

  it("a live update of a Delivery re-reads its tree and keeps what the person opened and collapsed", async () => {
    const source = fakeSource();
    const api = fakeApi(table());
    renderLive(`/applications/${f.appId}/deliveries/run-ok`, api, source);
    const tree = await screen.findByRole("tree", { name: "Delivery tree" });
    const c = await connected(source);
    // A succeeded run starts closed; open Deploy Preflight, close its Reconcile.
    await userEvent.click(within(tree).getByRole("button", { name: "Expand Deploy Preflight" }));
    await waitFor(() => expect(within(tree).getAllByRole("treeitem", { name: "Kustomization" })).toHaveLength(1));
    await userEvent.click(within(tree).getByRole("button", { name: "Collapse Reconcile" }));
    const paths = [`${app}/deliveries/run-ok`, `${app}/deployments/dep-1/steps/RECONCILE`];
    const before = paths.map((p) => count(api, p));
    act(() => c.send(ev("DELIVERY_CHANGED", f.appId, "run-ok")));
    await waitFor(() => expect(count(api, paths[0])).toBe(before[0] + 1));
    await waitFor(() => expect(count(api, paths[1])).toBe(before[1] + 1));
    // As the person left it: Deploy Preflight open, Reconcile closed, Build Application closed.
    expect(within(tree).getByRole("button", { name: "Collapse Deploy Preflight" })).toHaveTextContent("[-]");
    expect(within(tree).getByRole("button", { name: "Expand Reconcile" })).toHaveTextContent("[+]");
    expect(within(tree).getByRole("button", { name: "Expand Build Application" })).toHaveTextContent("[+]");
    expect(within(tree).queryByRole("treeitem", { name: "Kustomization" })).toBeNull();
    expect(within(tree).getAllByRole("treeitem", { name: /^PipelineRun / })).toHaveLength(1);
  });

  it("the Inbox badge follows INBOX_CHANGED on any page; the Inbox list too, without a Refresh", async () => {
    const source = fakeSource();
    const t = table();
    const api = fakeApi(t);
    renderLive(`/applications/${f.appId}/builds`, api, source);
    await screen.findAllByRole("link", { name: "#2" });
    const c = await connected(source);
    expect(screen.getByRole("link", { name: "Inbox" })).toBeInTheDocument();
    t["/api/v1/inbox?unread=true&limit=1"] = { messages: [], unread: 1, previousCursor: null, nextCursor: null };
    act(() => c.send(ev("INBOX_CHANGED", f.appId, "m-1")));
    expect(await screen.findByRole("link", { name: "Inbox, 1 unread" })).toBeInTheDocument();
  });

  it("the Inbox page refetches on INBOX_CHANGED and has no Refresh", async () => {
    const source = fakeSource();
    const api = fakeApi(table());
    renderLive("/inbox", api, source);
    await screen.findByRole("heading", { name: "Inbox" });
    const c = await connected(source);
    const before = count(api, "/api/v1/inbox");
    act(() => c.send(ev("BUILD_CHANGED", f.appId, "build-ok")));
    expect(count(api, "/api/v1/inbox")).toBe(before);
    act(() => c.send(ev("INBOX_CHANGED", f.appId, "m-2")));
    await waitFor(() => expect(count(api, "/api/v1/inbox")).toBe(before + 1));
    expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
  });

  it("ignores malformed events", async () => {
    const source = fakeSource();
    const api = fakeApi(table());
    renderLive(`/applications/${f.appId}/builds`, api, source);
    await screen.findAllByRole("link", { name: "#2" });
    const c = await connected(source);
    const before = api.calls.length;
    act(() => c.send("not an object"));
    act(() => c.send(JSON.stringify(ev("BUILD_CHANGED", f.appId, "build-ok"))));
    act(() => c.send({ type: "BUILD_CHANGED" }));
    act(() => c.send({ type: "APPLICATION_DELETED", applicationId: f.appId, occurredAt: "x" }));
    expect(api.calls.length).toBe(before);
  });

  it("a dropped connection shows Reconnecting…; Socket.IO reconnects it with the current token and every live view reads REST again", async () => {
    const source = fakeSource();
    const api = fakeApi(table());
    renderLive(`/applications/${f.appId}/builds`, api, source);
    await screen.findAllByRole("link", { name: "#2" });
    const c = await connected(source);
    act(() => c.drop());
    expect(await screen.findByText("Reconnecting…")).toBeInTheDocument();
    const builds = count(api, `${app}/builds`);
    const badge = count(api, "/api/v1/inbox?unread=true&limit=1");
    source.current = "token-renewed";
    await act(() => c.open());
    await waitFor(() => expect(screen.queryByText("Reconnecting…")).not.toBeInTheDocument());
    await waitFor(() => expect(count(api, `${app}/builds`)).toBe(builds + 1));
    expect(count(api, "/api/v1/inbox?unread=true&limit=1")).toBe(badge + 1);
    // Still one connection, now with the current token.
    expect(source.socks).toHaveLength(1);
    expect(c.tokens).toEqual(["token-1", "token-renewed"]);
  });

  it("a refusal (pathops-events restarting) is retried after a backoff, without any sign-in", async () => {
    const source = fakeSource();
    const api = fakeApi(table());
    renderLive(`/applications/${f.appId}/builds`, api, source);
    await screen.findAllByRole("link", { name: "#2" });
    const c = await connected(source);
    act(() => c.drop());
    act(() => c.refuse("unavailable"));
    expect(await screen.findByText("Reconnecting…")).toBeInTheDocument();
    await waitFor(() => expect(c.connects).toBe(1));
    await act(() => c.open());
    await waitFor(() => expect(screen.queryByText("Reconnecting…")).not.toBeInTheDocument());
    expect(source.socks).toHaveLength(1);
  });

  it("a token pathops-events keeps refusing ends in Live updates disconnected, never in a sign-in loop", async () => {
    const source = fakeSource();
    const api = fakeApi(table());
    renderLive(`/applications/${f.appId}/builds`, api, source);
    await screen.findAllByRole("link", { name: "#2" });
    await waitFor(() => expect(source.socks).toHaveLength(1));
    const c = source.socks[0];
    for (let i = 1; i <= 4; i++) {
      act(() => c.refuse("unauthorized"));
      if (i < 4) await waitFor(() => expect(c.connects).toBe(i));
    }
    expect(await screen.findByText("Live updates disconnected")).toBeInTheDocument();
    expect(source.socks).toHaveLength(1);
  });

  it("hands pathops-events the renewed token before the current one expires", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const source = fakeSource();
      source.exp = Date.now() + 60_000;
      renderLive(`/applications/${f.appId}/builds`, fakeApi(table()), source);
      const c = await connected(source);
      source.current = "token-renewed";
      source.exp = Date.now() + 5 * 60_000;
      await act(() => vi.advanceTimersByTimeAsync(41_000));
      await waitFor(() => expect(c.reauths.map((r) => r.token)).toEqual(["token-renewed"]));
      act(() => c.reauths[0].ack({ ok: true }));
      // The next one is scheduled from the new token's expiry.
      await act(() => vi.advanceTimersByTimeAsync(60_000));
      expect(c.reauths).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a sign-out closes the connection and nothing reopens it without a token; a sign-in opens it with the new token", async () => {
    const source = fakeSource();
    const api = fakeApi(table());
    renderLive(`/applications/${f.appId}/builds`, api, source);
    await screen.findAllByRole("link", { name: "#2" });
    const c = await connected(source);
    act(() => source.signIn(false));
    expect(c.closed).toBe(true);
    expect(c.active).toBe(false);
    await new Promise((r) => setTimeout(r, 50));
    expect(c.connects).toBe(0);
    expect(screen.queryByText(/Reconnecting|disconnected/)).not.toBeInTheDocument();
    act(() => source.signIn(true));
    expect(c.connects).toBe(1);
    await act(() => c.open());
    expect(c.tokens).toEqual(["token-1", "token-2"]);
  });

  it("a Cell without pathops-events has no connection and no note", async () => {
    const source = { ...fakeSource(), base: async () => null };
    const api = fakeApi(table());
    renderLive(`/applications/${f.appId}/builds`, api, source);
    const header = await screen.findByRole("banner");
    await screen.findAllByRole("link", { name: "#2" });
    expect(source.socks).toHaveLength(0);
    expect(within(header).queryByText(/Reconnecting|disconnected/)).not.toBeInTheDocument();
  });
});

describe("Live environment state", () => {
  const deploying = { ...f.deployment, status: "IN_PROGRESS", completedAt: null, durationSeconds: null, startedAt: new Date(Date.now() - 30_000).toISOString() };
  const done = { ...f.deployment, completedAt: new Date().toISOString() };
  const overview = (last: unknown, current: unknown) => ({
    ...f.overview,
    sections: [...f.overview.sections, "preflight", "deployments"],
    preflight: { environment: "PREFLIGHT", last, current },
  });

  it("Preflight and the header go from Deploying to Healthy without a reload, with the Deployment's delivery change", async () => {
    const source = fakeSource();
    const t = table();
    t[`${app}/overview`] = overview(deploying, null);
    const api = fakeApi(t);
    renderLive(`/applications/${f.appId}/preflight`, api, source);
    const facts = await screen.findByRole("table", { name: "Preflight environment" });
    const summary = screen.getByRole("table", { name: "Summary" });
    expect(within(facts).getByText("Deploying")).toHaveClass("status-running");
    expect(within(summary).getByText("Deploying").closest("td")).toHaveTextContent(/^Deploying — [3-9][0-9]s$/);
    const c = await connected(source);
    t[`${app}/overview`] = overview(done, done);
    act(() => c.send(ev("DELIVERY_CHANGED", f.appId, "run-ok")));
    expect(await within(facts).findByText("Healthy")).toHaveClass("status-ok");
    expect(within(facts).getByText("just now")).toBeInTheDocument();
    await waitFor(() => expect(within(summary).getByText("Healthy").closest("td")).toHaveTextContent(/^Healthy — [0-9]s$/));
    expect(screen.queryByRole("button", { name: "Refresh" })).not.toBeInTheDocument();
  });

  it("the Applications list goes from Deploying to Healthy without a reload", async () => {
    const source = fakeSource();
    const t = table();
    const row = (d: unknown, status: string) => ({ applications: [{ ...f.applications.applications[0], preflight: { status, deployedAt: null, deployment: d } }] });
    t["/api/v1/applications"] = row(deploying, "IN_PROGRESS");
    const api = fakeApi(t);
    renderLive("/applications", api, source);
    expect(await screen.findByText("Deploying")).toHaveClass("status-running");
    const c = await connected(source);
    t["/api/v1/applications"] = row(done, "SUCCEEDED");
    act(() => c.send(ev("DELIVERY_CHANGED", f.appId, "run-ok")));
    expect(await screen.findByText("Healthy")).toHaveClass("status-ok");
    expect(screen.queryByText("Deploying")).not.toBeInTheDocument();
  });

  it("Images move their Environment with the current Deployment, without a reload", async () => {
    const source = fakeSource();
    const t = table();
    t[`${app}/overview`] = overview(null, null);
    t[`${app}/images`] = { ...f.images, nextCursor: null, previousCursor: null };
    const api = fakeApi(t);
    renderLive(`/applications/${f.appId}/images`, api, source);
    const region = await screen.findByRole("region", { name: "Images" });
    await waitFor(() => expect(within(region).getAllByRole("row")).toHaveLength(2));
    expect(within(within(region).getAllByRole("row")[1]).getAllByRole("cell")[1]).toHaveTextContent(/^—$/);
    const c = await connected(source);
    t[`${app}/overview`] = overview(f.deployment, f.deployment);
    act(() => c.send(ev("DELIVERY_CHANGED", f.appId, "run-ok")));
    await waitFor(() => expect(within(within(region).getAllByRole("row")[1]).getAllByRole("cell")[1]).toHaveTextContent(/^Preflight$/));
  });
});
