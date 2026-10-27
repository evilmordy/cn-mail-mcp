#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { runCli } from "./cli.js";
import { loadAccounts } from "./config/accounts.js";
import { loadDotEnv } from "./config/dotenv.js";
import { getSettings } from "./config/settings.js";
import { ImapMailBackend } from "./imap/client.js";
import { logError, logInfo } from "./log.js";
import { createMailServer } from "./mcp/server.js";
import { initRuntime, watchScriptOrExit } from "./runtime.js";

function usage(): void {
  process.stderr.write(`cn-mail-mcp — IMAP/SMTP MCP（QQ / 163 / 126 / 腾讯企业邮，默认只读）

Usage:
  cn-mail-mcp                     在 stdio 上启动 MCP
  cn-mail-mcp --check             登录每个已绑定邮箱后退出
  cn-mail-mcp accounts list       列出已绑定邮箱（不含授权码）
  cn-mail-mcp accounts path       打印本机账号文件路径
  cn-mail-mcp accounts add        在本机终端绑定邮箱（授权码只在终端输入）
  cn-mail-mcp accounts verify [id]
  cn-mail-mcp accounts unbind <account_id>
  cn-mail-mcp setup               交互选择档位
  cn-mail-mcp config show
  cn-mail-mcp config set-mode read|draft|send [--allow a@b.com]
  cn-mail-mcp config allowlist add|remove|set a@b.com,...
  cn-mail-mcp config allow-sensitive on|off
  cn-mail-mcp config unbind <account_id>

授权码放本机账号文件或 MAIL_AUTH_CODE，不要写入 git、对话或日志。
档位在 .cn-mail-mcp.json：mode、send_allowlist、allow_sensitive。
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes("-h") || args.includes("--help")) {
    usage();
    process.exit(0);
  }

  loadDotEnv();

  if (args[0] === "config" || args[0] === "setup") {
    await runCli(args);
    return;
  }

  const accounts = loadAccounts({ allowEmpty: true });
  const backend = new ImapMailBackend(accounts);

  if (args.includes("--check")) {
    if (accounts.length === 0) {
      process.stderr.write("没有已绑定的邮箱。先运行 cn-mail-mcp accounts add，或配置 MAIL_USER / MAIL_AUTH_CODE。\n");
      process.exit(1);
    }
    const results = await backend.check();
    process.stderr.write(`${JSON.stringify({ results }, null, 2)}\n`);
    process.exit(results.every((r) => r.ok) ? 0 : 1);
  }

  const settings = getSettings();
  logInfo("mcp.start", {
    accounts: accounts.map((a) => a.id),
    mode: settings.mode,
    allowlistCount: settings.send_allowlist.length,
  });

  initRuntime(import.meta.url);
  watchScriptOrExit();

  const handle = serveStdio(() => createMailServer(backend));

  const exit = async () => {
    try {
      await handle.close();
    } catch (err) {
      logError("mcp.close", err);
    }
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void exit();
  });
  process.on("SIGTERM", () => {
    void exit();
  });
  process.stdin.on("end", () => {
    void exit();
  });
  process.stdin.on("close", () => {
    void exit();
  });
}

main().catch((err) => {
  logError("fatal", err);
  process.exit(1);
});
