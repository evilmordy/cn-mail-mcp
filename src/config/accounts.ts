import { logInfo } from "../log.js";
import { stripKeysFromDotEnvFiles } from "./dotenv.js";
import { ACCOUNTS_ENV_NAMES, envFirst } from "./env.js";
import { domainOf, isPrivateOrMetadataHost, presetFor, resolvePreset, type ImapPreset } from "./presets.js";
import { readAccountStore, removeStoredAccount, type StoredAccount } from "./store.js";

export type AccountSource = "store" | "env" | "json";

export type Account = {
  id: string;
  address: string;
  authCode: string;
  label?: string;
  preset: ImapPreset;
  host: string;
  port: number;
  sendImapId: boolean;
  smtpHost: string;
  smtpPort: number;
  /** Env var names to clear on unbind. Names only, never values. */
  envKeys: string[];
  source: AccountSource;
};

export type AccountProfile = {
  address: string;
  label?: string;
  provider?: string;
  accountId?: string;
};

const MAX_ENV_SLOTS = 20;

function readEnv(name: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? undefined : v;
}

function assertAddress(address: string): string {
  const value = address.trim();
  if (!/^[^@\s<>]+@[^@\s<>]+$/.test(value) || /[\r\n]/.test(value)) {
    throw new Error("邮箱地址格式不正确，例如 you@qq.com");
  }
  return value;
}

function slugPart(raw: string | undefined): string {
  if (!raw) return "";
  return raw.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32);
}

function slugId(address: string, explicit?: string, label?: string): string {
  return slugPart(explicit) || slugPart(label) || slugPart(address.split("@")[0]) || "mail";
}

function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n++) {
    const next = `${base}-${n}`.slice(0, 40);
    if (!taken.has(next)) return next;
  }
  throw new Error("无法分配账号 id");
}

function finishAccount(fields: {
  id: string;
  address: string;
  authCode: string;
  label?: string;
  preset: ImapPreset;
  sendImapId: boolean;
  smtpHost?: string;
  smtpPort?: number;
  envKeys: string[];
  source: AccountSource;
}): Account {
  const smtpHost = fields.smtpHost || fields.preset.smtpHost;
  if (isPrivateOrMetadataHost(fields.preset.host)) {
    throw new Error(`account ${fields.id}: host ${fields.preset.host} is not allowed`);
  }
  if (smtpHost && isPrivateOrMetadataHost(smtpHost)) {
    throw new Error(`account ${fields.id}: smtp host ${smtpHost} is not allowed`);
  }
  return {
    id: fields.id,
    address: fields.address,
    authCode: fields.authCode,
    label: fields.label,
    preset: fields.preset,
    host: fields.preset.host,
    port: fields.preset.port,
    sendImapId: fields.sendImapId,
    smtpHost,
    smtpPort: fields.smtpPort ?? fields.preset.smtpPort,
    envKeys: fields.envKeys,
    source: fields.source,
  };
}

/** Build a store account from non-secret profile fields plus an authorization code. */
export function materializeAccount(profile: AccountProfile, authCode: string, existingIds: string[] = []): Account {
  const address = assertAddress(profile.address);
  const preset = presetFor(address, profile.provider);
  const taken = new Set(existingIds);
  const id = uniqueId(slugId(address, profile.accountId, profile.label), taken);
  return finishAccount({
    id,
    address,
    authCode,
    label: profile.label?.trim() || undefined,
    preset,
    sendImapId: preset.sendImapId,
    envKeys: [],
    source: "store",
  });
}

function accountFromStored(row: StoredAccount): Account {
  const address = assertAddress(row.address);
  const preset = row.provider ? presetFor(address, row.provider) : resolvePreset(address);
  return finishAccount({
    id: row.id,
    address,
    authCode: row.authCode,
    label: row.label,
    preset,
    sendImapId: preset.sendImapId,
    envKeys: [],
    source: "store",
  });
}

function accountFromRow(row: unknown, index: number, source: "env" | "json"): Account {
  if (!row || typeof row !== "object") {
    throw new Error(`account[${index}] must be an object`);
  }
  const rec = row as Record<string, unknown>;
  const address = assertAddress(String(rec.address ?? rec.user ?? ""));
  const id = String(rec.id ?? (source === "env" && index === 0 ? "default" : address.split("@")[0] ?? `acct${index}`)).trim();
  const authCodeEnv = rec.authCodeEnv ? String(rec.authCodeEnv) : undefined;
  const authCodeDirect = rec.authCode ? String(rec.authCode) : undefined;
  if (source === "json" && authCodeDirect && !authCodeEnv) {
    throw new Error(`account ${id}: do not put authCode in JSON; set authCodeEnv to an env var`);
  }
  const authCode = authCodeEnv ? readEnv(authCodeEnv) : authCodeDirect;
  if (!authCode) {
    throw new Error(
      `account ${id}: set authCodeEnv to an env var holding the IMAP authorization code (not the web password)`,
    );
  }
  const hostOverride = rec.host ? String(rec.host).trim() : undefined;
  if (hostOverride && isPrivateOrMetadataHost(hostOverride)) {
    throw new Error(`account ${id}: host ${hostOverride} is not allowed`);
  }
  let preset: ImapPreset;
  if (hostOverride) {
    const smtpHost = rec.smtpHost ? String(rec.smtpHost).trim() : "";
    if (smtpHost && isPrivateOrMetadataHost(smtpHost)) {
      throw new Error(`account ${id}: smtp host ${smtpHost} is not allowed`);
    }
    preset = {
      provider: "custom",
      host: hostOverride,
      port: rec.port ? Number(rec.port) : 993,
      secure: true,
      sendImapId: rec.sendImapId === true,
      disableImap4rev2: true,
      smtpHost,
      smtpPort: rec.smtpPort ? Number(rec.smtpPort) : 465,
    };
  } else {
    preset = resolvePreset(address);
  }
  const sendImapId =
    rec.sendImapId === false ? false : rec.sendImapId === true ? true : preset.sendImapId;
  const smtpOverride = rec.smtpHost ? String(rec.smtpHost).trim() : undefined;
  return finishAccount({
    id,
    address,
    authCode,
    preset,
    sendImapId,
    smtpHost: smtpOverride || preset.smtpHost,
    smtpPort: rec.smtpPort ? Number(rec.smtpPort) : preset.smtpPort,
    envKeys: authCodeEnv ? [authCodeEnv] : [],
    source,
  });
}

function envSlot(base: string, index: number): string | undefined {
  if (index <= 1) return readEnv(base) ?? readEnv(`${base}_1`);
  return readEnv(`${base}_${index}`);
}

function imapIdFlag(index: number): boolean | undefined {
  const names = index <= 1 ? ["MAIL_IMAP_ID", "MAIL_IMAP_ID_1", "CN_MAIL_MCP_IMAP_ID"] : [`MAIL_IMAP_ID_${index}`];
  for (const name of names) {
    const flag = readEnv(name);
    if (flag === "0" || flag === "false") return false;
    if (flag === "1" || flag === "true") return true;
  }
  return undefined;
}

function parseEnvAccounts(): Account[] {
  const out: Account[] = [];
  for (let i = 1; i <= MAX_ENV_SLOTS; i++) {
    const address = envSlot("MAIL_USER", i);
    const authCode = envSlot("MAIL_AUTH_CODE", i);
    if (!address && !authCode) continue;
    if (!address || !authCode) {
      const n = i <= 1 ? "" : `_${i}`;
      throw new Error(`mailbox ${i}: set both MAIL_USER${n} and MAIL_AUTH_CODE${n}`);
    }
    const host = envSlot("MAIL_HOST", i);
    const row: Record<string, unknown> = {
      id: envSlot("MAIL_ACCOUNT_ID", i) ?? (i === 1 ? "default" : undefined),
      address,
      authCode,
    };
    if (host) {
      row.host = host;
      row.port = Number(envSlot("MAIL_PORT", i) ?? "993");
    }
    const smtpHost = envSlot("MAIL_SMTP_HOST", i);
    if (smtpHost) row.smtpHost = smtpHost;
    const smtpPort = envSlot("MAIL_SMTP_PORT", i);
    if (smtpPort) row.smtpPort = Number(smtpPort);
    const idFlag = imapIdFlag(i);
    if (idFlag === false) row.sendImapId = false;
    if (idFlag === true) row.sendImapId = true;
    const acct = accountFromRow(row, i - 1, "env");
    acct.envKeys = envKeysForSlot(i).filter((k) => readEnv(k));
    out.push(acct);
  }
  return out;
}

function parseJsonAccounts(raw: string): Account[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("CN_MAIL_MCP_ACCOUNTS must be a JSON array");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("CN_MAIL_MCP_ACCOUNTS must be a non-empty JSON array");
  }
  return parsed.map((row, i) => accountFromRow(row, i, "json"));
}

function loadStoreAccounts(): Account[] {
  return readAccountStore().accounts.map(accountFromStored);
}

function mergeAccounts(primary: Account[], extra: Account[]): Account[] {
  const addresses = new Set(primary.map((a) => a.address.toLowerCase()));
  const ids = new Set(primary.map((a) => a.id));
  const out = [...primary];
  for (const acct of extra) {
    if (addresses.has(acct.address.toLowerCase())) {
      logInfo("mailbox.skipped_duplicate_address", { id: acct.id, source: acct.source });
      continue;
    }
    if (ids.has(acct.id)) throw new Error(`duplicate account id ${acct.id}`);
    ids.add(acct.id);
    addresses.add(acct.address.toLowerCase());
    out.push(acct);
  }
  return out;
}

export function loadAccounts(opts?: { allowEmpty?: boolean }): Account[] {
  const stored = loadStoreAccounts();
  const json = envFirst(ACCOUNTS_ENV_NAMES);
  const rest = json ? parseJsonAccounts(json) : parseEnvAccounts();
  const accounts = mergeAccounts(stored, rest);
  if (accounts.length === 0) {
    if (opts?.allowEmpty) return [];
    throw new Error(
      "没有已绑定的邮箱。调用 add_mailbox，或设置 MAIL_USER + MAIL_AUTH_CODE（第二个邮箱用 _2），或 CN_MAIL_MCP_ACCOUNTS JSON。不要把授权码发到对话里。",
    );
  }
  const ids = new Set<string>();
  for (const a of accounts) {
    if (ids.has(a.id)) throw new Error(`duplicate account id ${a.id}`);
    ids.add(a.id);
    domainOf(a.address);
  }
  return accounts;
}

export function publicAccountView(account: Account): {
  id: string;
  address: string;
  label?: string;
  provider: string;
  host: string;
  source: AccountSource;
  unbind_env: string[];
} {
  return {
    id: account.id,
    address: account.address,
    label: account.label,
    provider: account.preset.provider,
    host: account.host,
    source: account.source,
    unbind_env: account.source === "env" || account.source === "json" ? [...account.envKeys] : [],
  };
}

function envKeysForSlot(index: number): string[] {
  const suffix = index <= 1 ? "" : `_${index}`;
  const keys = [
    `MAIL_USER${suffix}`,
    `MAIL_AUTH_CODE${suffix}`,
    `MAIL_ACCOUNT_ID${suffix}`,
    `MAIL_HOST${suffix}`,
    `MAIL_PORT${suffix}`,
    `MAIL_SMTP_HOST${suffix}`,
    `MAIL_SMTP_PORT${suffix}`,
    `MAIL_IMAP_ID${suffix}`,
  ];
  if (index <= 1) {
    keys.push("MAIL_USER_1", "MAIL_AUTH_CODE_1", "MAIL_ACCOUNT_ID_1", "MAIL_IMAP_ID_1", "CN_MAIL_MCP_IMAP_ID");
  }
  return keys;
}

/** Clear this mailbox from the local store or from process env and `.env`. Does not delete server mail. */
export function unbindAccount(account: Account): { cleared: string[] } {
  if (account.source === "store") {
    removeStoredAccount(account.id);
    logInfo("mail.unbound", { accountId: account.id, source: "store" });
    return { cleared: [] };
  }
  if (account.source === "json") {
    throw new Error(
      `account ${account.id} was loaded from CN_MAIL_MCP_ACCOUNTS JSON; remove that entry, then reload MCP`,
    );
  }
  const keys = account.envKeys.filter((k) => !(ACCOUNTS_ENV_NAMES as readonly string[]).includes(k));
  if (keys.length === 0) {
    throw new Error(`account ${account.id} has no env keys to clear`);
  }
  for (const k of keys) delete process.env[k];
  const files = stripKeysFromDotEnvFiles(new Set(keys));
  logInfo("mail.unbound", { accountId: account.id, keys: keys.length, files: files.length });
  return { cleared: keys };
}

export type AddMailboxHint = {
  next_slot: number | null;
  env: { MAIL_USER: string; MAIL_AUTH_CODE: string; MAIL_ACCOUNT_ID: string } | null;
  guide: string;
};

/** How to bind the next mailbox. Never includes secret values. */
export function addMailboxHint(accountCount: number): AddMailboxHint {
  if (accountCount >= MAX_ENV_SLOTS) {
    return { next_slot: null, env: null, guide: "已达到 20 个邮箱上限。" };
  }
  const n = accountCount + 1;
  const suffix = n <= 1 ? "" : `_${n}`;
  const env = {
    MAIL_USER: `MAIL_USER${suffix}`,
    MAIL_AUTH_CODE: `MAIL_AUTH_CODE${suffix}`,
    MAIL_ACCOUNT_ID: `MAIL_ACCOUNT_ID${suffix}`,
  };
  return {
    next_slot: n,
    env,
    guide: `优先调用 add_mailbox。form elicitation 只收集邮箱地址和备注；授权码只通过 URL elicitation 的本机页面提交。若客户端不支持，请用户自行填写 ${env.MAIL_USER}、${env.MAIL_AUTH_CODE}（可选 ${env.MAIL_ACCOUNT_ID}），或在终端运行 cn-mail-mcp accounts add。不要向用户索取授权码，不要把授权码写进对话。`,
  };
}

export type UnbindMailboxHint = {
  guide: string;
  accounts: Array<{ id: string; address: string; env: string[] }>;
};

export function unbindMailboxHint(
  accounts: Array<{ id: string; address: string; unbind_env?: string[] }>,
): UnbindMailboxHint {
  return {
    accounts: accounts.map((a) => ({ id: a.id, address: a.address, env: a.unbind_env ?? [] })),
    guide: "调用 unbind_mailbox。不删除服务器上的邮件，也不要让用户把授权码发到对话里。",
  };
}
