import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadAccounts, publicAccountView, unbindAccount } from "./config/accounts.js";
import { parseSendAllowlist } from "./config/allowlist.js";
import { accountsFilePath } from "./config/store.js";
import {
  getSettings,
  patchSettings,
  settingsPath,
  type ConnectMode,
  type Settings,
} from "./config/settings.js";
import { ImapMailBackend } from "./imap/client.js";
import { commitMailbox } from "./onboarding/commit.js";

function printSettings(s: Settings): void {
  process.stdout.write(`${JSON.stringify(s, null, 2)}\n`);
}

function parseMode(raw: string | undefined): ConnectMode {
  if (raw === "read" || raw === "draft" || raw === "send") return raw;
  throw new Error("mode must be read, draft, or send");
}

export async function runCli(argv: string[]): Promise<void> {
  const [cmd, sub, ...rest] = argv;
  if (cmd === "setup") {
    await runSetup();
    return;
  }
  if (cmd === "accounts") {
    await runAccounts(sub, rest);
    return;
  }
  if (cmd !== "config") {
    throw new Error(`unknown command ${cmd}; try config, accounts, or setup`);
  }
  if (!sub || sub === "show") {
    printSettings(getSettings());
    return;
  }
  if (sub === "set-mode") {
    const mode = parseMode(rest[0]);
    const allowFlag = rest.indexOf("--allow");
    const allow =
      allowFlag >= 0 ? parseSendAllowlist(rest.slice(allowFlag + 1).join(" ")) : undefined;
    const cur = getSettings();
    printSettings(
      patchSettings({
        mode,
        send_allowlist: allow ?? cur.send_allowlist,
      }),
    );
    return;
  }
  if (sub === "allowlist") {
    const action = rest[0];
    const values = parseSendAllowlist(rest.slice(1).join(" "));
    const cur = getSettings();
    let next = [...cur.send_allowlist];
    if (action === "set") next = values;
    else if (action === "add") next = [...new Set([...next, ...values])];
    else if (action === "remove") next = next.filter((x) => !values.includes(x));
    else throw new Error("allowlist action must be add, remove, or set");
    printSettings(patchSettings({ send_allowlist: next }));
    return;
  }
  if (sub === "unbind") {
    const id = rest[0];
    if (!id) throw new Error("config unbind <account_id>");
    await unbindById(id);
    return;
  }
  if (sub === "allow-sensitive") {
    const on = rest[0] === "on" || rest[0] === "true" || rest[0] === "1";
    if (rest[0] !== "on" && rest[0] !== "off" && rest[0] !== "true" && rest[0] !== "false" && rest[0] !== "1" && rest[0] !== "0") {
      throw new Error("allow-sensitive on|off");
    }
    printSettings(patchSettings({ allow_sensitive: on }));
    return;
  }
  throw new Error("config commands: show | set-mode | allowlist | allow-sensitive | unbind");
}

async function unbindById(id: string): Promise<void> {
  const accounts = loadAccounts({ allowEmpty: true });
  const acct = accounts.find((a) => a.id === id);
  if (!acct) throw new Error(`unknown account ${id}`);
  unbindAccount(acct);
  const remaining = loadAccounts({ allowEmpty: true }).map(publicAccountView);
  process.stdout.write(`${JSON.stringify({ unbound: id, remaining }, null, 2)}\n`);
}

async function runAccounts(sub: string | undefined, rest: string[]): Promise<void> {
  if (!sub || sub === "list") {
    const accounts = loadAccounts({ allowEmpty: true }).map(publicAccountView);
    process.stdout.write(`${JSON.stringify({ accounts, accounts_file: accountsFilePath() }, null, 2)}\n`);
    return;
  }
  if (sub === "path") {
    process.stdout.write(`${accountsFilePath()}\n`);
    return;
  }
  if (sub === "unbind") {
    const id = rest[0];
    if (!id) throw new Error("accounts unbind <account_id>");
    await unbindById(id);
    return;
  }
  if (sub === "verify") {
    const accounts = loadAccounts({ allowEmpty: true });
    if (accounts.length === 0) {
      throw new Error("没有已绑定的邮箱。先运行 cn-mail-mcp accounts add，或配置 MAIL_USER / MAIL_AUTH_CODE。");
    }
    const id = rest[0];
    const selected = id ? accounts.filter((a) => a.id === id) : accounts;
    if (id && selected.length === 0) throw new Error(`unknown account ${id}`);
    const backend = new ImapMailBackend(selected);
    const results = await backend.check();
    process.stderr.write(`${JSON.stringify({ results }, null, 2)}\n`);
    if (!results.every((r) => r.ok)) process.exitCode = 1;
    return;
  }
  if (sub === "add") {
    await runAccountsAdd();
    return;
  }
  throw new Error("accounts commands: list | path | add | unbind | verify");
}

async function runAccountsAdd(): Promise<void> {
  if (!input.isTTY) {
    process.stderr.write(
      "当前不是交互终端，拒绝从管道读取授权码。请在你自己的终端运行 cn-mail-mcp accounts add，或编辑 .env / 账号文件后运行 cn-mail-mcp --check。不要把授权码贴进对话。\n",
    );
    process.exitCode = 2;
    return;
  }
  const rl = createInterface({ input, output });
  try {
    const address = (await rl.question("邮箱地址（例如 you@qq.com）：")).trim();
    const label = (await rl.question("备注（可空）：")).trim();
    const providerRaw = (await rl.question("服务商 auto/qq/163/126/exmail（默认 auto）：")).trim() || "auto";
    const provider = ["auto", "qq", "163", "126", "exmail"].includes(providerRaw) ? providerRaw : "auto";
    const authCode = (await rl.question("IMAP 授权码（只在此终端输入，不要发给助手）：")).trim();
    const backend = new ImapMailBackend([]);
    const result = await commitMailbox(
      { address, label: label || undefined, provider, accountId: undefined },
      authCode,
      (account) => backend.verifyAccount(account),
    );
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } finally {
    rl.close();
  }
}

async function runSetup(): Promise<void> {
  const rl = createInterface({ input, output });
  try {
    process.stdout.write("cn-mail-mcp 档位：1 只读  2 草稿  3 发送\n");
    const choice = (await rl.question("选 [1/2/3]（默认 1）：")).trim() || "1";
    let mode: ConnectMode = "read";
    if (choice === "2") mode = "draft";
    if (choice === "3") mode = "send";
    let allow: string[] = [];
    if (mode === "send") {
      const raw = await rl.question("发送白名单（逗号分隔，例如 you@qq.com）：");
      allow = parseSendAllowlist(raw);
    }
    const sensitiveRaw = (await rl.question("允许把验证码/密码信正文交给模型？[y/N] ")).trim().toLowerCase();
    const saved = patchSettings({
      mode,
      send_allowlist: mode === "send" ? allow : getSettings().send_allowlist,
      allow_sensitive: sensitiveRaw === "y" || sensitiveRaw === "yes",
    });
    process.stdout.write(`已写入 ${settingsPath()}\n`);
    printSettings(saved);
  } finally {
    rl.close();
  }
}
