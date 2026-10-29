import { describe, expect, it } from "vitest";
import { parseLoopbackHttpProxyUrl, resolveMailProxyUrl } from "./proxy.js";

describe("parseLoopbackHttpProxyUrl", () => {
  it("accepts http loopback with port", () => {
    expect(parseLoopbackHttpProxyUrl("http://127.0.0.1:8791")).toBe("http://127.0.0.1:8791");
    expect(parseLoopbackHttpProxyUrl("http://localhost:8791/")).toBe("http://localhost:8791");
  });

  it("accepts https and IPv6 loopback", () => {
    expect(parseLoopbackHttpProxyUrl("https://127.0.0.1:8443")).toBe("https://127.0.0.1:8443");
    expect(parseLoopbackHttpProxyUrl("http://[::1]:8791")).toBe("http://[::1]:8791");
  });

  it("rejects socks, non-loopback, and credentials", () => {
    expect(() => parseLoopbackHttpProxyUrl("socks5://127.0.0.1:1080")).toThrow(/http/);
    expect(() => parseLoopbackHttpProxyUrl("http://8.8.8.8:8791")).toThrow(/loopback/);
    expect(() => parseLoopbackHttpProxyUrl("http://proxy.example:8791")).toThrow(/loopback/);
    expect(() => parseLoopbackHttpProxyUrl("http://user:pass@127.0.0.1:8791")).toThrow(/password|username/);
  });
});

describe("resolveMailProxyUrl", () => {
  it("prefers CN_MAIL_MCP_MAIL_PROXY over CN_MAIL_MCP_IMAP_PROXY", () => {
    expect(
      resolveMailProxyUrl({
        CN_MAIL_MCP_MAIL_PROXY: "http://127.0.0.1:8791",
        CN_MAIL_MCP_IMAP_PROXY: "http://127.0.0.1:9999",
      }),
    ).toBe("http://127.0.0.1:8791");
  });

  it("falls back to CN_MAIL_MCP_IMAP_PROXY", () => {
    expect(resolveMailProxyUrl({ CN_MAIL_MCP_IMAP_PROXY: "http://127.0.0.1:9999" })).toBe(
      "http://127.0.0.1:9999",
    );
  });

  it("does not read removed legacy proxy env names", () => {
    expect(
      resolveMailProxyUrl({
        QQCONNECT_MAIL_PROXY: "http://127.0.0.1:8791",
        SAND_EGRESS_TUNNEL_PROXY_ADDR: "127.0.0.1:1111",
      } as NodeJS.ProcessEnv),
    ).toBeUndefined();
  });

  it("returns undefined when unset", () => {
    expect(resolveMailProxyUrl({})).toBeUndefined();
  });

  it("throws on invalid configured proxy", () => {
    expect(() => resolveMailProxyUrl({ CN_MAIL_MCP_MAIL_PROXY: "socks5://127.0.0.1:1" })).toThrow();
  });
});
