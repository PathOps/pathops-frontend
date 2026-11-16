import { describe, expect, it, vi } from "vitest";

const io = vi.fn(() => ({ active: true, on: vi.fn(), io: { on: vi.fn() }, emit: vi.fn(), connect: vi.fn(), disconnect: vi.fn() }));
vi.mock("socket.io-client", () => ({ io }));

describe("the browser's live connection", () => {
  it("uses Socket.IO's default transports (polling, then the WebSocket upgrade) and the token in auth, not the URL", async () => {
    const { browserSource } = await import("./EventProvider");
    const auth = (cb: (d: { token: string }) => void) => cb({ token: "t" });
    browserSource.open("https://events-canary.example", auth);
    expect(io).toHaveBeenCalledTimes(1);
    const [url, opts] = io.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(url).toBe("https://events-canary.example");
    expect(opts).not.toHaveProperty("transports");
    expect(opts.auth).toBe(auth);
    expect(opts).not.toHaveProperty("query");
    expect(opts).not.toHaveProperty("withCredentials");
  });
});
