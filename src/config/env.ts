/** Read the first non-empty env var among candidate names. */

export function envFirst(names: readonly string[], env: NodeJS.ProcessEnv = process.env): string | undefined {
  for (const name of names) {
    const v = env[name];
    if (v !== undefined && v !== "") return v;
  }
  return undefined;
}

export const CONFIG_ENV_NAMES = ["CN_MAIL_MCP_CONFIG"] as const;
export const DOTENV_ENV_NAMES = ["CN_MAIL_MCP_DOTENV"] as const;
export const ACCOUNTS_ENV_NAMES = ["CN_MAIL_MCP_ACCOUNTS"] as const;
export const SEND_UNSAFE_ENV_NAMES = ["CN_MAIL_MCP_SEND_UNSAFE_NO_CONFIRM"] as const;
export const MAIL_PROXY_ENV_NAMES = ["CN_MAIL_MCP_MAIL_PROXY"] as const;
export const IMAP_PROXY_ENV_NAMES = ["CN_MAIL_MCP_IMAP_PROXY"] as const;
export const ACCOUNTS_FILE_ENV = "CN_MAIL_MCP_ACCOUNTS_FILE";
