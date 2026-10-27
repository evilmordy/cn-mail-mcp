import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "./cli.js";
import { overrideSettingsForTest } from "./config/settings.js";

afterEach(() => {
  delete process.env.CN_MAIL_MCP_CONFIG;
  overrideSettingsForTest(null);
  process.exitCode = undefined;
});

describe("config CLI", () => {
  it("set-mode draft writes json", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "cn-mail-")), ".cn-mail-mcp.json");
    process.env.CN_MAIL_MCP_CONFIG = file;
    await runCli(["config", "set-mode", "draft"]);
    const saved = JSON.parse(readFileSync(file, "utf8")) as { mode: string };
    expect(saved.mode).toBe("draft");
  });

  it("refuses accounts add when stdin is not a terminal", async () => {
    await runCli(["accounts", "add"]);
    expect(process.exitCode).toBe(2);
  });
});
