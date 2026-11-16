import { act, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { ApiContext, type Api } from "../api/client";
import { AppRoutes } from "../App";
import { fakeApi } from "../test/render";
import * as f from "../test/fixtures";
import { EventProvider, type Connection, type LiveSource } from "./EventProvider";
import type { LiveEvent } from "./topics";

const EVENTS = "https://events-canary.demo.pathops.io";
const app = `/api/v1/applications/${f.appId}`;
const otherApp = "22222222-2222-4222-8222-222222222222";

// conn is a fake EventSource the test drives.
class FakeConnection implements Connection {
  readyState = 0;
  onopen: ((ev: Event) => unknown) | null = null;
  onmessage: ((ev: MessageEvent) => unknown) | null = null;
  onerror: ((ev: Event) => unknown) | null = null;
  closed = false;
  constructor(public url: string) {}
  close() {
    this.closed = true;
    this.readyState = 2;
  }
  open() {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }
  send(e: LiveEvent | string) {
    this.onmessage?.(new MessageEvent("message", { data: typeof e === "string" ? e : JSON.stringify(e) }));
  }
  // drop: the stream ended; EventSource reconnects by itself.
  drop() {
    this.readyState = 0;
    this.onerror?.(new Event("error"));
  }
  // refuse: an HTTP error; EventSource gives up.
  refuse() {
    this.readyState = 2;
    this.onerror?.(new Event("error"));
  }
}

function fakeSource(signed: boolean | null = true) {
  const s = {
    conns: [] as FakeConnection[],
    signIns: [] as string[],
    signed,
    async base() {
      return EVENTS;
    },
    open(url: string) {
      const c = new FakeConnection(url);
      s.conns.push(c);
      return c;
    },
    async signedIn() {
      return s.signed;
    },
    signIn(base: string) {
      s.signIns.push(base);
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

// connected opens the one stream once the page is up.
async function connected(source: ReturnType<typeof fakeSource>) {
  await waitFor(() => expect(source.conns.length).toBe(1));
  act(() => source.conns[0].open());
  return source.conns[0];
}

function table() {
  return {
    [`${app}/overview`]: f.overview,
    [`${app}/builds`]: { builds: [f.buildBad, f.buildOk], previousCursor: null, nextCursor: null },
    [`${app}/deliveries`]: { ...f.deliveries, previousCursor: null, nextCursor: null },
    [`${app}/deliveries/run-ok`]: f.deliveryOk,
    "/api/v1/builds/build-ok": f.buildOk,
    "/api/v1/builds/build-ok/tasks": f.tasksOk,
    "/api/v1/inbox?unread=true&limit=1": { messages: [], unread: 0, previousCursor: null, nextCursor: null },
    "/api/v1/inbox": { messages: [], unread: 0, previousCursor: null, nextCursor: null },
  } as Record<string, unknown>;
}

beforeEach(() => sessionStorage.clear());
afterEach(() => sessionStorage.clear());

describe("Live updates", () => {
  it("opens one stream for the whole UI, with credentials, to pathops-events", async () => {
    const source = fakeSource();
    const api = fakeApi(table());
    renderLive(`/applications/${f.appId}/builds`, api, source);
    await screen.findAllByRole("link", { name: "#2" });
    await connected(source);
    // The header, the overview and the Builds list all listen; one stream.
    expect(source.conns).toHaveLength(1);
    expect(source.conns[0].url).toBe(`${EVENTS}/api/v1/events`);
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

  it("a Build's page refetches for that Build only", async () => {
    const source = fakeSource();
    const api = fakeApi(table());
    renderLive(`/applications/${f.appId}/builds/build-ok`, api, source);
    await screen.findByRole("heading", { name: "Build #1" });
    const c = await connected(source);
    const before = count(api, "/api/v1/builds/build-ok");
    act(() => c.send(ev("BUILD_CHANGED", f.appId, "build-bad")));
    expect(count(api, "/api/v1/builds/build-ok")).toBe(before);
    act(() => c.send(ev("BUILD_CHANGED", f.appId, "build-ok")));
    await waitFor(() => expect(count(api, "/api/v1/builds/build-ok")).toBe(before + 1));
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
    act(() => c.send("not json"));
    act(() => c.send(JSON.stringify({ type: "BUILD_CHANGED" })));
    act(() => c.send(JSON.stringify({ type: "APPLICATION_DELETED", applicationId: f.appId, occurredAt: "x" })));
    expect(api.calls.length).toBe(before);
  });

  it("a dropped stream shows Reconnecting…; once back, every live view reads REST again", async () => {
    const source = fakeSource();
    const api = fakeApi(table());
    renderLive(`/applications/${f.appId}/builds`, api, source);
    await screen.findAllByRole("link", { name: "#2" });
    const c = await connected(source);
    act(() => c.drop());
    expect(await screen.findByText("Reconnecting…")).toBeInTheDocument();
    const builds = count(api, `${app}/builds`);
    const badge = count(api, "/api/v1/inbox?unread=true&limit=1");
    act(() => c.open());
    await waitFor(() => expect(screen.queryByText("Reconnecting…")).not.toBeInTheDocument());
    await waitFor(() => expect(count(api, `${app}/builds`)).toBe(builds + 1));
    expect(count(api, "/api/v1/inbox?unread=true&limit=1")).toBe(badge + 1);
    // Still one stream: EventSource reconnected it.
    expect(source.conns).toHaveLength(1);
  });

  it("a refused stream (pathops-events restarting) is opened again after a backoff", async () => {
    const source = fakeSource(null);
    const api = fakeApi(table());
    renderLive(`/applications/${f.appId}/builds`, api, source);
    await screen.findAllByRole("link", { name: "#2" });
    const c = await connected(source);
    act(() => c.refuse());
    expect(await screen.findByText("Reconnecting…")).toBeInTheDocument();
    await waitFor(() => expect(source.conns).toHaveLength(2));
    expect(c.closed).toBe(true);
    act(() => source.conns[1].open());
    await waitFor(() => expect(screen.queryByText("Reconnecting…")).not.toBeInTheDocument());
    expect(source.signIns).toHaveLength(0);
  });

  it("without a session at pathops-events it signs in there once, then shows Live updates disconnected", async () => {
    const source = fakeSource(false);
    const api = fakeApi(table());
    renderLive(`/applications/${f.appId}/builds`, api, source);
    await screen.findAllByRole("link", { name: "#2" });
    await waitFor(() => expect(source.conns).toHaveLength(1));
    act(() => source.conns[0].refuse());
    await waitFor(() => expect(source.signIns).toEqual([EVENTS]));
    // Back from that sign-in, still refused (a loop is never started).
    const again = fakeSource(false);
    const { unmount } = renderLive(`/applications/${f.appId}/builds`, fakeApi(table()), again);
    await waitFor(() => expect(again.conns).toHaveLength(1));
    act(() => again.conns[0].refuse());
    expect(await screen.findByText("Live updates disconnected")).toBeInTheDocument();
    expect(again.signIns).toHaveLength(0);
    unmount();
  });

  it("a Cell without pathops-events has no stream and no note", async () => {
    const source = { ...fakeSource(), base: async () => null };
    const api = fakeApi(table());
    renderLive(`/applications/${f.appId}/builds`, api, source);
    const header = await screen.findByRole("banner");
    await screen.findAllByRole("link", { name: "#2" });
    expect(source.conns).toHaveLength(0);
    expect(within(header).queryByText(/Reconnecting|disconnected/)).not.toBeInTheDocument();
  });
});
