import { logInfo } from "../log.js";
import { stripKeysFromDotEnvFiles } from "./dotenv.js";
import { ACCOUNTS_ENV_NAMES, envFirst } from "./env.js";
import { domainOf, isPrivateOrMetadataHost, resolvePreset, type ImapPreset } from "./presets.js";

export type Account = {
  id: string;
  address: string;
  authCode: string;
  preset: ImapPreset;
  host: string;
  port: number;
  sendImapId: boolean;
  smtpHost: string;
  smtpPort: number;
  /** Env var names to clear on unbind. Names only, never values. */
  envKeys: string[];
  jsonBound?: boolean;
};

function readEnv(name: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? undefined : v;
}

function parseJsonAccounts(raw: string): Account[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("CN_MAIL_MCP_ACCOUNTS / QQCONNECT_ACCOUNTS must be JSON array");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new Error("CN_MAIL_MCP_ACCOUNTS / QQCONNECT_ACCOUNTS must be a non-empty JSON array");
  }
  return parsed.map((row, i) => {
    const acct = accountFromRow(row, i, false);
    acct.jsonBound = true;
    return acct;
  });
}

function accountFromRow(row: unknown, index: number, allowInlineAuth = true): Account {
  if (!row || typeof row !== "object") {
    throw new Error(`account[${index}] must be an object`);
  }
  const rec = row as Record<string, unknown>;
  const address = String(rec.address ?? rec.user ?? "").trim();
  if (!address.includes("@")) {
    throw new Error(`account[${index}] needs address like you@qq.com`);
  }
  const id = String(rec.id ?? address.split("@")[0] ?? `acct${index}`).trim();
  const authCodeEnv = rec.authCodeEnv ? String(rec.authCodeEnv) : undefined;
  const authCodeDirect = rec.authCode ? String(rec.authCode) : undefined;
  if (!allowInlineAuth && authCodeDirect && !authCodeEnv) {
    throw new Error(
      `account ${id}: do not put authCode in JSON; set authCodeEnv to an env var (fill it in the secret box)`,
    );
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
  if (smtpOverride && isPrivateOrMetadataHost(smtpOverride)) {
    throw new Error(`account ${id}: smtp host ${smtpOverride} is not allowed`);
  }
  return {
    id,
    address,
    authCode,
    preset,
    host: preset.host,
    port: preset.port,
    sendImapId,
    smtpHost: smtpOverride || preset.smtpHost,
    smtpPort: rec.smtpPort ? Number(rec.smtpPort) : preset.smtpPort,
    envKeys: authCodeEnv ? [authCodeEnv] : [],
  };
}

function envSlot(base: string, index: number): string | undefined {
  if (index <= 1) {
    return readEnv(base) ?? readEnv(`${base}_1`) ?? (base === "MAIL_USER" ? readEnv("QQCONNECT_USER") : undefined) ?? (base === "MAIL_AUTH_CODE" ? readEnv("QQCONNECT_AUTH_CODE") : undefined);
  }
  return readEnv(`${base}_${index}`);
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
    const host = envSlot("MAIL_HOST", i) ?? (i === 1 ? readEnv("QQCONNECT_HOST") : undefined);
    const row: Record<string, unknown> = {
      id: envSlot("MAIL_ACCOUNT_ID", i) ?? (i === 1 ? "default" : undefined),
      address,
      authCode,
    };
    if (host) {
      row.host = host;
      row.port = Number(envSlot("MAIL_PORT", i) ?? "993");
    }
    const smtpHost = envSlot("MAIL_SMTP_HOST", i) ?? (i === 1 ? readEnv("QQCONNECT_SMTP_HOST") : undefined);
    if (smtpHost) row.smtpHost = smtpHost;
    const smtpPort = envSlot("MAIL_SMTP_PORT", i) ?? (i === 1 ? readEnv("QQCONNECT_SMTP_PORT") : undefined);
    if (smtpPort) row.smtpPort = Number(smtpPort);
    const idFlag = envSlot("QQCONNECT_IMAP_ID", i) ?? (i === 1 ? readEnv("QQCONNECT_IMAP_ID") : undefined);
    if (idFlag === "0" || idFlag === "false") row.sendImapId = false;
    if (idFlag === "1" || idFlag === "true") row.sendImapId = true;
    const acct = accountFromRow(row, i - 1);
    acct.envKeys = envKeysForSlot(i).filter((k) => readEnv(k));
    out.push(acct);
  }
  return out;
}

export function loadAccounts(opts?: { allowEmpty?: boolean }): Account[] {
  const json = envFirst(ACCOUNTS_ENV_NAMES);
  const accounts = json ? parseJsonAccounts(json) : parseEnvAccounts();
  if (accounts.length === 0) {
    if (opts?.allowEmpty) return [];
    throw new Error(
      "no mailbox configured: set MAIL_USER + MAIL_AUTH_CODE (or MAIL_USER_2 / MAIL_AUTH_CODE_2 …), or CN_MAIL_MCP_ACCOUNTS / QQCONNECT_ACCOUNTS JSON",
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
  provider: string;
  host: string;
  unbind_env: string[];
} {
  return {
    id: account.id,
    address: account.address,
    provider: account.preset.provider,
    host: account.host,
    unbind_env: [...account.envKeys],
  };
}

export const MAX_ENV_SLOTS = 20;

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
  ];
  if (index <= 1) {
    keys.push(
      "MAIL_USER_1",
      "MAIL_AUTH_CODE_1",
      "MAIL_ACCOUNT_ID_1",
      "QQCONNECT_USER",
      "QQCONNECT_AUTH_CODE",
      "QQCONNECT_HOST",
      "QQCONNECT_SMTP_HOST",
      "QQCONNECT_SMTP_PORT",
      "QQCONNECT_IMAP_ID",
    );
  } else {
    keys.push(`QQCONNECT_IMAP_ID_${index}`);
  }
  return keys;
}

/** Clear this mailbox from process env and `.env`. Does not delete mail on the server. */
export function unbindEnvAccount(account: Account): { cleared: string[] } {
  if (account.jsonBound) {
    throw new Error(
      `account ${account.id} was loaded from CN_MAIL_MCP_ACCOUNTS / QQCONNECT_ACCOUNTS JSON; remove that entry in the secret box, then reload MCP`,
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
    guide: `密钥框填写 ${env.MAIL_USER}、${env.MAIL_AUTH_CODE}，可选 ${env.MAIL_ACCOUNT_ID}，然后重载。不要把值发到聊天或改仓库。`,
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
    guide: "调用 unbind_mailbox。不删除服务器上的邮件。",
  };
}
