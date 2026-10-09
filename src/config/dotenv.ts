import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logInfo } from "../log.js";

const KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Secrets and connection facts only. Policy (mode/allowlist) lives in .grok-bot-cn-mail.json. */
const SECRET_OR_CONN =
  /^(MAIL_[A-Z0-9_]+|QQCONNECT_(USER|AUTH_CODE|ACCOUNTS|HOST|SMTP_HOST|SMTP_PORT|IMAP_ID|MAIL_PROXY|IMAP_PROXY))$/;

/** Apply KEY=VALUE lines. Does not override non-empty existing env (Grok `-e` wins). */
export function applyDotEnvText(text: string, env: NodeJS.ProcessEnv = process.env): string[] {
  const applied: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith("export ")) line = line.slice(7).trim();
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    if (!KEY.test(key) || !SECRET_OR_CONN.test(key)) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    const current = env[key];
    if (current !== undefined && current !== "") continue;
    env[key] = value;
    applied.push(key);
  }
  return applied;
}

export function envFileCandidates(fromModuleUrl: string = import.meta.url): string[] {
  const dir = dirname(fileURLToPath(fromModuleUrl));
  const out: string[] = [];
  const pluginRoot = process.env.GROK_PLUGIN_ROOT?.trim();
  if (pluginRoot) out.push(join(pluginRoot, ".env"));
  out.push(join(dir, "..", "..", ".env"), join(process.cwd(), ".env"));
  const explicit = process.env.QQCONNECT_DOTENV?.trim();
  if (explicit) out.push(explicit);
  return [...new Set(out)];
}

/** Load every candidate `.env`. Later files fill keys that are still empty. Safe to call more than once. */
export function loadDotEnv(): string | undefined {
  const seen = new Set<string>();
  let first: string | undefined;
  for (const file of envFileCandidates()) {
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const applied = applyDotEnvText(readFileSync(file, "utf8"));
    logInfo("env.dotenv", { file, appliedKeys: applied.length });
    first ??= file;
  }
  return first;
}

export function stripKeysFromDotEnvText(text: string, keys: Set<string>): string {
  const nl = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const kept = lines.filter((raw) => {
    let line = raw.trim();
    if (!line || line.startsWith("#")) return true;
    if (line.startsWith("export ")) line = line.slice(7).trim();
    const eq = line.indexOf("=");
    if (eq <= 0) return true;
    const key = line.slice(0, eq).trim();
    return !keys.has(key);
  });
  let out = kept.join(nl);
  if (text.endsWith("\n") && !out.endsWith(nl)) out += nl;
  return out;
}

/** Drop keys from on-disk `.env` files. Does not log values. */
export function stripKeysFromDotEnvFiles(keys: Set<string>): string[] {
  if (keys.size === 0) return [];
  const changed: string[] = [];
  const seen = new Set<string>();
  for (const file of envFileCandidates()) {
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    const prev = readFileSync(file, "utf8");
    const next = stripKeysFromDotEnvText(prev, keys);
    if (next === prev) continue;
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, next, "utf8");
    renameSync(tmp, file);
    changed.push(file);
  }
  return changed;
}
