import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { loadAccounts, publicAccountView, unbindEnvAccount } from "./config/accounts.js";
import { parseSendAllowlist } from "./config/allowlist.js";
import {
  getSettings,
  patchSettings,
  settingsPath,
  type ConnectMode,
  type Settings,
} from "./config/settings.js";

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
  if (cmd !== "config") {
    throw new Error(`unknown command ${cmd}; try config or setup`);
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
    const accounts = loadAccounts({ allowEmpty: true });
    const acct = accounts.find((a) => a.id === id);
    if (!acct) throw new Error(`unknown account ${id}`);
    unbindEnvAccount(acct);
    const remaining = loadAccounts({ allowEmpty: true }).map(publicAccountView);
    process.stdout.write(`${JSON.stringify({ unbound: id, remaining }, null, 2)}\n`);
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
