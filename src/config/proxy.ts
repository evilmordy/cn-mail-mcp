/** Loopback-only HTTP(S) CONNECT proxy for IMAP/SMTP egress (env-configured). */

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

export type MailProxyEnv = {
  QQCONNECT_MAIL_PROXY?: string;
  QQCONNECT_IMAP_PROXY?: string;
  SAND_EGRESS_TUNNEL_PROXY_ADDR?: string;
};

function stripBrackets(host: string): string {
  const h = host.trim().toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) return h.slice(1, -1);
  return h;
}

/**
 * Parse and validate a proxy URL. Only http:/https: to loopback, no credentials, no socks.
 * Returns the normalized href (e.g. http://127.0.0.1:8791/).
 */
export function parseLoopbackHttpProxyUrl(raw: string): string {
  const text = raw.trim();
  if (!text) throw new Error("mail proxy URL is empty");
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error("mail proxy URL is invalid");
  }
  const scheme = url.protocol.toLowerCase();
  if (scheme !== "http:" && scheme !== "https:") {
    throw new Error("mail proxy must use http: or https: (socks is not allowed)");
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error("mail proxy URL must not include username or password");
  }
  const host = stripBrackets(url.hostname);
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error("mail proxy host must be loopback (127.0.0.1, localhost, or ::1)");
  }
  // Drop path/query/hash; keep scheme, host, port.
  const port = url.port ? Number(url.port) : scheme === "https:" ? 443 : 80;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("mail proxy port is invalid");
  }
  const hostOut = host.includes(":") ? `[${host}]` : host;
  return `${scheme}//${hostOut}:${port}`;
}

/**
 * Resolve optional mail proxy from env (never from tool args).
 * Preference: QQCONNECT_MAIL_PROXY → QQCONNECT_IMAP_PROXY → SAND_EGRESS_TUNNEL_PROXY_ADDR as http://HOST:PORT.
 * Returns undefined when unset. Throws if a provided value fails validation.
 */
export function resolveMailProxyUrl(env: MailProxyEnv = process.env): string | undefined {
  const preferred = env.QQCONNECT_MAIL_PROXY?.trim();
  if (preferred) return parseLoopbackHttpProxyUrl(preferred);

  const legacy = env.QQCONNECT_IMAP_PROXY?.trim();
  if (legacy) return parseLoopbackHttpProxyUrl(legacy);

  const sand = env.SAND_EGRESS_TUNNEL_PROXY_ADDR?.trim();
  if (sand) {
    // HOST:PORT or already a URL
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(sand)) {
      return parseLoopbackHttpProxyUrl(sand);
    }
    return parseLoopbackHttpProxyUrl(`http://${sand}`);
  }
  return undefined;
}

/** True when a validated loopback proxy would be used (no URL exposed). */
export function mailProxyEnabled(env: MailProxyEnv = process.env): boolean {
  try {
    return Boolean(resolveMailProxyUrl(env));
  } catch {
    return false;
  }
}
