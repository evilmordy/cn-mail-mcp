import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getSettings, overrideSettingsForTest, saveSettings, settingsPath } from "./settings.js";
import { CONFIG_ENV_NAMES } from "./env.js";

afterEach(() => {
  for (const k of CONFIG_ENV_NAMES) delete process.env[k];
  overrideSettingsForTest(null);
});

describe("settings", () => {
  it("defaults to read with empty allowlist", () => {
    process.env.CN_MAIL_MCP_CONFIG = join(mkdtempSync(join(tmpdir(), "qq-")), "missing.json");
    expect(getSettings()).toEqual({ mode: "read", send_allowlist: [], allow_sensitive: false });
  });

  it("round-trips a draft config", () => {
    const file = join(mkdtempSync(join(tmpdir(), "qq-")), ".cn-mail-mcp.json");
    process.env.CN_MAIL_MCP_CONFIG = file;
    saveSettings({ mode: "draft", send_allowlist: [], allow_sensitive: false });
    overrideSettingsForTest(null);
    expect(getSettings().mode).toBe("draft");
    const disk = JSON.parse(readFileSync(file, "utf8")) as { mode: string };
    expect(disk.mode).toBe("draft");
  });

  it("refuses send without allowlist", () => {
    const file = join(mkdtempSync(join(tmpdir(), "qq-")), ".cn-mail-mcp.json");
    process.env.CN_MAIL_MCP_CONFIG = file;
    expect(() =>
      saveSettings({ mode: "send", send_allowlist: [], allow_sensitive: false }),
    ).toThrow(/send_allowlist/);
  });

  it("keeps using an existing .qqconnect.json next to the package", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "qq-"));
    mkdirSync(join(rootDir, "dist", "config"), { recursive: true });
    const legacy = join(rootDir, ".qqconnect.json");
    writeFileSync(
      legacy,
      JSON.stringify({ mode: "draft", send_allowlist: [], allow_sensitive: false }),
      "utf8",
    );
    const moduleUrl = pathToFileURL(join(rootDir, "dist", "config", "settings.js")).href;
    expect(settingsPath(moduleUrl)).toBe(legacy);
  });

  it("prefers .cn-mail-mcp.json over legacy names when both exist", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "qq-"));
    mkdirSync(join(rootDir, "dist", "config"), { recursive: true });
    writeFileSync(
      join(rootDir, ".qqconnect.json"),
      JSON.stringify({ mode: "draft", send_allowlist: [], allow_sensitive: false }),
      "utf8",
    );
    const preferred = join(rootDir, ".cn-mail-mcp.json");
    writeFileSync(
      preferred,
      JSON.stringify({ mode: "read", send_allowlist: [], allow_sensitive: false }),
      "utf8",
    );
    const moduleUrl = pathToFileURL(join(rootDir, "dist", "config", "settings.js")).href;
    expect(settingsPath(moduleUrl)).toBe(preferred);
  });

  it("logs and falls back to read when the file is not JSON", () => {
    const file = join(mkdtempSync(join(tmpdir(), "qq-")), ".cn-mail-mcp.json");
    process.env.CN_MAIL_MCP_CONFIG = file;
    writeFileSync(file, "{not json", "utf8");
    const spy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      expect(getSettings()).toEqual({ mode: "read", send_allowlist: [], allow_sensitive: false });
      expect(spy.mock.calls.map((c) => String(c[0])).join("")).toMatch(/settings.invalid_json/);
    } finally {
      spy.mockRestore();
    }
  });

  it("writes .cn-mail-mcp.json when no settings file exists", () => {
    const rootDir = mkdtempSync(join(tmpdir(), "qq-"));
    mkdirSync(join(rootDir, "dist", "config"), { recursive: true });
    const moduleUrl = pathToFileURL(join(rootDir, "dist", "config", "settings.js")).href;
    expect(settingsPath(moduleUrl)).toBe(join(rootDir, ".cn-mail-mcp.json"));
  });

  it("accepts legacy QQCONNECT_CONFIG env", () => {
    const file = join(mkdtempSync(join(tmpdir(), "qq-")), "legacy-config.json");
    process.env.QQCONNECT_CONFIG = file;
    writeFileSync(file, JSON.stringify({ mode: "draft", send_allowlist: [], allow_sensitive: false }), "utf8");
    expect(settingsPath()).toBe(file);
    expect(getSettings().mode).toBe("draft");
  });
});
