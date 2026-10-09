import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type ProviderId = "qq" | "foxmail" | "exmail" | "163" | "126" | "custom";

export type ImapPreset = {
  provider: ProviderId;
  host: string;
  port: number;
  secure: true;
  sendImapId: boolean;
  disableImap4rev2: boolean;
  smtpHost: string;
  smtpPort: number;
};

const PRESETS: Record<string, ImapPreset> = {
  "qq.com": {
    provider: "qq",
    host: "imap.qq.com",
    port: 993,
    secure: true,
    sendImapId: true,
    disableImap4rev2: true,
    smtpHost: "smtp.qq.com",
    smtpPort: 465,
  },
  "foxmail.com": {
    provider: "foxmail",
    host: "imap.qq.com",
    port: 993,
    secure: true,
    sendImapId: true,
    disableImap4rev2: true,
    smtpHost: "smtp.qq.com",
    smtpPort: 465,
  },
  "vip.qq.com": {
    provider: "qq",
    host: "imap.qq.com",
    port: 993,
    secure: true,
    sendImapId: true,
    disableImap4rev2: true,
    smtpHost: "smtp.qq.com",
    smtpPort: 465,
  },
  "163.com": {
    provider: "163",
    host: "imap.163.com",
    port: 993,
    secure: true,
    sendImapId: true,
    disableImap4rev2: true,
    smtpHost: "smtp.163.com",
    smtpPort: 465,
  },
  "126.com": {
    provider: "126",
    host: "imap.126.com",
    port: 993,
    secure: true,
    sendImapId: true,
    disableImap4rev2: true,
    smtpHost: "smtp.126.com",
    smtpPort: 465,
  },
  "yeah.net": {
    provider: "163",
    host: "imap.163.com",
    port: 993,
    secure: true,
    sendImapId: true,
    disableImap4rev2: true,
    smtpHost: "smtp.163.com",
    smtpPort: 465,
  },
};

const EXMAIL_SUFFIXES = [".exmail.qq.com"];

export function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  if (at < 0 || at === address.length - 1) {
    throw new Error("mailbox address must be a full email, like you@qq.com");
  }
  return address.slice(at + 1).toLowerCase();
}

export function resolvePreset(address: string): ImapPreset {
  const domain = domainOf(address);
  const exact = PRESETS[domain];
  if (exact) return exact;
  if (EXMAIL_SUFFIXES.some((s) => domain.endsWith(s)) || domain === "exmail.qq.com") {
    return {
      provider: "exmail",
      host: "imap.exmail.qq.com",
      port: 993,
      secure: true,
      sendImapId: true,
      disableImap4rev2: true,
      smtpHost: "smtp.exmail.qq.com",
      smtpPort: 465,
    };
  }
  throw new Error(
    `no IMAP preset for @${domain}; set host (and optional port) on the account, TLS 993 required`,
  );
}

function stripHostBrackets(host: string): string {
  const h = host.trim().toLowerCase();
  if (h.startsWith("[") && h.endsWith("]")) return h.slice(1, -1);
  return h;
}

function mappedIpv4(ip: string): string | undefined {
  const dotted = ip.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (dotted?.[1]) return dotted[1];
  const hex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!hex?.[1] || !hex[2]) return undefined;
  const a = Number.parseInt(hex[1], 16);
  const b = Number.parseInt(hex[2], 16);
  return `${(a >> 8) & 255}.${a & 255}.${(b >> 8) & 255}.${b & 255}`;
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split(".").map((x) => Number(x));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const a = parts[0];
  const b = parts[1];
  if (a === undefined || b === undefined) return true;
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const h = ip.toLowerCase();
  if (h === "::" || h === "::1") return true;
  if (h.startsWith("fe80:")) return true;
  if (h.startsWith("fc") || h.startsWith("fd")) return true;
  if (h.startsWith("2001:db8:")) return true;
  return false;
}

/** True for loopback, RFC1918, link-local, ULA, metadata, IPv4-mapped private. */
export function isBlockedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isBlockedIpv4(ip);
  if (v === 6) {
    const mapped = mappedIpv4(ip);
    if (mapped) return isBlockedIpv4(mapped);
    return isBlockedIpv6(ip);
  }
  return true;
}

export function isPrivateOrMetadataHost(host: string): boolean {
  const h = stripHostBrackets(host);
  if (!h) return true;
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "metadata.google.internal") return true;
  if (isIP(h)) return isBlockedIp(h);
  return false;
}

export type HostLookup = (host: string) => Promise<Array<{ address: string }>>;

async function defaultLookup(host: string): Promise<Array<{ address: string }>> {
  return lookup(host, { all: true, verbatim: true });
}

export type AssertPublicMailHostOpts = {
  /**
   * When true, skip the DNS A-record privacy check after literal/name checks.
   * HTTP CONNECT proxies receive the hostname unresolved; local fake-IP DNS
   * (e.g. 198.18.0.0/15) is meaningless for the tunnel and must not block connect.
   * Does not relax private/metadata host *literals* or blocked names.
   */
  viaProxy?: boolean;
};

/** Reject private literals and names that resolve to private/metadata addresses. */
export async function assertPublicMailHost(
  host: string,
  lookupFn: HostLookup = defaultLookup,
  opts: AssertPublicMailHostOpts = {},
): Promise<void> {
  const h = stripHostBrackets(host);
  if (!h) throw new Error("mail host is empty");
  if (isPrivateOrMetadataHost(h)) {
    throw new Error(`host ${host} is not allowed`);
  }
  if (isIP(h)) return;
  if (opts.viaProxy) return;
  let addrs: Array<{ address: string }>;
  try {
    addrs = await lookupFn(h);
  } catch {
    throw new Error(`host ${host} could not be resolved`);
  }
  if (!addrs.length) throw new Error(`host ${host} could not be resolved`);
  for (const row of addrs) {
    if (isBlockedIp(row.address)) {
      throw new Error(`host ${host} resolved to a private or metadata address`);
    }
  }
}
