import { describe, expect, it } from "vitest";
import { assertPublicMailHost, isBlockedIp, isPrivateOrMetadataHost, resolvePreset } from "./presets.js";

describe("resolvePreset", () => {
  it("maps QQ and Foxmail to imap.qq.com:993", () => {
    expect(resolvePreset("a@qq.com").host).toBe("imap.qq.com");
    expect(resolvePreset("a@foxmail.com").host).toBe("imap.qq.com");
    expect(resolvePreset("a@qq.com").sendImapId).toBe(true);
    expect(resolvePreset("a@qq.com").smtpHost).toBe("smtp.qq.com");
  });

  it("maps 163/126 and Tencent exmail", () => {
    expect(resolvePreset("a@163.com")).toMatchObject({ host: "imap.163.com", sendImapId: true });
    expect(resolvePreset("a@126.com").host).toBe("imap.126.com");
    expect(resolvePreset("user@corp.exmail.qq.com").host).toBe("imap.exmail.qq.com");
  });

  it("rejects unknown domains without an explicit host", () => {
    expect(() => resolvePreset("a@gmail.com")).toThrow(/no IMAP preset/);
  });
});

describe("isPrivateOrMetadataHost", () => {
  it("blocks loopback, RFC1918, and cloud metadata", () => {
    expect(isPrivateOrMetadataHost("127.0.0.1")).toBe(true);
    expect(isPrivateOrMetadataHost("10.0.0.5")).toBe(true);
    expect(isPrivateOrMetadataHost("192.168.1.1")).toBe(true);
    expect(isPrivateOrMetadataHost("169.254.169.254")).toBe(true);
    expect(isPrivateOrMetadataHost("imap.qq.com")).toBe(false);
  });

  it("blocks IPv6 loopback, link-local, ULA, and mapped IPv4", () => {
    expect(isBlockedIp("::1")).toBe(true);
    expect(isBlockedIp("fe80::1")).toBe(true);
    expect(isBlockedIp("fd12:3456:789a::1")).toBe(true);
    expect(isBlockedIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateOrMetadataHost("[::1]")).toBe(true);
    expect(isBlockedIp("8.8.8.8")).toBe(false);
  });
});

describe("assertPublicMailHost", () => {
  it("rejects names that resolve to a private address", async () => {
    await expect(
      assertPublicMailHost("evil.example", async () => [{ address: "127.0.0.1" }]),
    ).rejects.toThrow(/private or metadata/);
  });

  it("allows names that resolve only to public addresses", async () => {
    await expect(
      assertPublicMailHost("imap.qq.com", async () => [{ address: "8.8.8.8" }]),
    ).resolves.toBeUndefined();
  });

  it("rejects private host literals even when viaProxy", async () => {
    await expect(assertPublicMailHost("127.0.0.1", async () => [], { viaProxy: true })).rejects.toThrow(
      /not allowed/,
    );
  });

  it("skips DNS privacy check when viaProxy", async () => {
    await expect(
      assertPublicMailHost(
        "imap.qq.com",
        async () => {
          throw new Error("lookup should not run");
        },
        { viaProxy: true },
      ),
    ).resolves.toBeUndefined();
  });
});
