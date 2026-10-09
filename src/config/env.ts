/** Read first non-empty env among candidate names (CN_MAIL_MCP_* preferred, QQCONNECT_* legacy). */

export function envFirst(names: readonly string[], env: NodeJS.ProcessEnv = process.env): string | undefined {
  for (const name of names) {
    const v = env[name];
    if (v !== undefined && v !== "") return v;
  }
  return undefined;
}

/** Explicit config / dotenv path aliases. */
export const CONFIG_ENV_NAMES = ["CN_MAIL_MCP_CONFIG", "CNMAIL_CONFIG", "QQCONNECT_CONFIG"] as const;
export const DOTENV_ENV_NAMES = ["CN_MAIL_MCP_DOTENV", "CNMAIL_DOTENV", "QQCONNECT_DOTENV"] as const;
export const ACCOUNTS_ENV_NAMES = ["CN_MAIL_MCP_ACCOUNTS", "CNMAIL_ACCOUNTS", "QQCONNECT_ACCOUNTS"] as const;
export const SEND_UNSAFE_ENV_NAMES = [
  "CN_MAIL_MCP_SEND_UNSAFE_NO_CONFIRM",
  "CNMAIL_SEND_UNSAFE_NO_CONFIRM",
  "QQCONNECT_SEND_UNSAFE_NO_CONFIRM",
] as const;

export const MAIL_PROXY_ENV_NAMES = [
  "CN_MAIL_MCP_MAIL_PROXY",
  "CNMAIL_MAIL_PROXY",
  "QQCONNECT_MAIL_PROXY",
] as const;

export const IMAP_PROXY_ENV_NAMES = [
  "CN_MAIL_MCP_IMAP_PROXY",
  "CNMAIL_IMAP_PROXY",
  "QQCONNECT_IMAP_PROXY",
] as const;
