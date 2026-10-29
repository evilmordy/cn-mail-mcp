import { unlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { initRuntime, resetRuntimeForTest, serverStatus, watchScriptOrExit } from "./runtime.js";

afterEach(() => {
  resetRuntimeForTest();
});

describe("serverStatus", () => {
  it("is not stale before init", () => {
    expect(serverStatus().needs_restart).toBe(false);
    expect(serverStatus().version).toBe("0.2.0");
  });

  it("sets needs_restart when the boot script mtime changes", () => {
    const file = join(tmpdir(), `qq-rt-${Date.now()}.js`);
    writeFileSync(file, "export {}\n");
    initRuntime(pathToFileURL(file).href);
    expect(serverStatus().needs_restart).toBe(false);
    utimesSync(file, 1, 1);
    expect(serverStatus().needs_restart).toBe(true);
    expect(serverStatus().guide).toMatch(/停止再启动/);
  });

  it("sets needs_restart when the boot script is missing", () => {
    const file = join(tmpdir(), `qq-gone-${Date.now()}.js`);
    writeFileSync(file, "export {}\n");
    initRuntime(pathToFileURL(file).href);
    unlinkSync(file);
    expect(serverStatus().needs_restart).toBe(true);
    expect(serverStatus().guide).toMatch(/停止再启动/);
  });
});

describe("watchScriptOrExit", () => {
  it("does not start a watcher under VITEST", () => {
    const file = join(tmpdir(), `qq-rt-watch-${Date.now()}.js`);
    writeFileSync(file, "export {}\n");
    initRuntime(pathToFileURL(file).href);
    let exited: number | undefined;
    watchScriptOrExit((code) => {
      exited = code;
    });
    expect(exited).toBeUndefined();
  });
});
