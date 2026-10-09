import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { mailProxyEnabled } from "./config/proxy.js";
import { logError } from "./log.js";

export const SERVER_VERSION = "0.1.0";

const RESTART_GUIDE =
  "请停止再启动 qqconnect。不要卸载排查，不要改 MCP 启动命令，不要在进程还连着时 rm -rf 插件或工作区。";

type Boot = { path: string; mtimeMs: number; size: number; startedAt: string };

let boot: Boot | null = null;
let watchTimer: ReturnType<typeof setInterval> | undefined;

export function resetRuntimeForTest(): void {
  boot = null;
  if (watchTimer) {
    clearInterval(watchTimer);
    watchTimer = undefined;
  }
}

export function initRuntime(moduleUrl: string): void {
  const path = fileURLToPath(moduleUrl);
  const st = statSync(path);
  boot = { path, mtimeMs: st.mtimeMs, size: st.size, startedAt: new Date().toISOString() };
}

export type ServerStatus = {
  version: string;
  started_at: string;
  needs_restart: boolean;
  guide: string;
  /** Loopback HTTP CONNECT proxy active (env-configured; URL never exposed). */
  mail_proxy_enabled: boolean;
};

export function serverStatus(): ServerStatus {
  if (!boot) {
    return {
      version: SERVER_VERSION,
      started_at: "",
      needs_restart: false,
      guide: "",
      mail_proxy_enabled: mailProxyEnabled(),
    };
  }
  try {
    const st = statSync(boot.path);
    const changed = st.mtimeMs !== boot.mtimeMs || st.size !== boot.size;
    return {
      version: SERVER_VERSION,
      started_at: boot.startedAt,
      needs_restart: changed,
      guide: changed ? RESTART_GUIDE : "当前进程与磁盘上的启动脚本一致。",
      mail_proxy_enabled: mailProxyEnabled(),
    };
  } catch {
    return {
      version: SERVER_VERSION,
      started_at: boot.startedAt,
      needs_restart: true,
      guide: RESTART_GUIDE,
      mail_proxy_enabled: mailProxyEnabled(),
    };
  }
}

/** If the running script is deleted (update dug out the process), exit so the host is not "connected" while dead. */
export function watchScriptOrExit(exitFn: (code: number) => void = process.exit): void {
  if (!boot || process.env.VITEST) return;
  if (watchTimer) clearInterval(watchTimer);
  const path = boot.path;
  watchTimer = setInterval(() => {
    if (existsSync(path)) return;
    logError("mcp.script_missing", new Error(path));
    exitFn(1);
  }, 2000);
  watchTimer.unref?.();
}
