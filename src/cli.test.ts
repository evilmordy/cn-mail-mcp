import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "./cli.js";
import { overrideSettingsForTest } from "./config/settings.js";

afterEach(() => {
  delete process.env.QQCONNECT_CONFIG;
  delete process.env.CN_MAIL_MCP_CONFIG;
  delete process.env.CNMAIL_CONFIG;
  overrideSettingsForTest(null);
});

describe("config CLI", () => {
  it("set-mode draft writes json", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "qq-")), ".qqconnect.json");
    process.env.QQCONNECT_CONFIG = file;
    await runCli(["config", "set-mode", "draft"]);
    const saved = JSON.parse(readFileSync(file, "utf8")) as { mode: string };
    expect(saved.mode).toBe("draft");
  });
});
