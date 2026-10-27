import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { logError, logWarn } from "../log.js";
import { ACCOUNTS_FILE_ENV } from "./env.js";

/** On-disk mailbox record. `authCode` is an IMAP authorization code, never a web password. */
export type StoredAccount = {
  id: string;
  address: string;
  authCode: string;
  label?: string;
  provider?: string;
};

type StoreFile = {
  version: 1;
  accounts: StoredAccount[];
};

function configHome(): string {
  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  if (xdg) return xdg;
  if (process.platform === "win32" && process.env.APPDATA?.trim()) return process.env.APPDATA.trim();
  return join(homedir(), ".config");
}

/** User-level account file. Override with CN_MAIL_MCP_ACCOUNTS_FILE in tests. */
export function accountsFilePath(): string {
  const explicit = process.env[ACCOUNTS_FILE_ENV]?.trim();
  if (explicit) return explicit;
  return join(configHome(), "cn-mail-mcp", "accounts.json");
}

function tighten(path: string, mode: number): void {
  try {
    const current = statSync(path).mode & 0o777;
    if (current !== mode) chmodSync(path, mode);
  } catch (err) {
    logWarn("accounts.chmod", { path, message: err instanceof Error ? err.message : String(err) });
  }
}

function emptyStore(): StoreFile {
  return { version: 1, accounts: [] };
}

export function readAccountStore(): StoreFile {
  const file = accountsFilePath();
  if (!existsSync(file)) return emptyStore();
  tighten(file, 0o600);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    logError("accounts.store_invalid", err, { file });
    throw new Error(`账号文件不是合法 JSON：${file}`);
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { accounts?: unknown }).accounts)) {
    throw new Error(`账号文件格式不正确：${file}`);
  }
  const accounts: StoredAccount[] = [];
  for (const row of (parsed as { accounts: unknown[] }).accounts) {
    if (!row || typeof row !== "object") continue;
    const rec = row as Record<string, unknown>;
    const id = String(rec.id ?? "").trim();
    const address = String(rec.address ?? "").trim();
    const authCode = String(rec.authCode ?? "");
    if (!id || !address.includes("@") || !authCode) continue;
    const label = rec.label ? String(rec.label).trim() : undefined;
    const provider = rec.provider ? String(rec.provider).trim() : undefined;
    accounts.push({ id, address, authCode, label, provider });
  }
  return { version: 1, accounts };
}

function writeStore(store: StoreFile): void {
  const file = accountsFilePath();
  const dir = dirname(file);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  tighten(dir, 0o700);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file);
  chmodSync(file, 0o600);
}

export function upsertStoredAccount(account: StoredAccount): void {
  const store = readAccountStore();
  const next = store.accounts.filter((a) => a.id !== account.id && a.address.toLowerCase() !== account.address.toLowerCase());
  next.push(account);
  writeStore({ version: 1, accounts: next });
}

export function removeStoredAccount(id: string): boolean {
  const store = readAccountStore();
  const next = store.accounts.filter((a) => a.id !== id);
  if (next.length === store.accounts.length) return false;
  writeStore({ version: 1, accounts: next });
  return true;
}
