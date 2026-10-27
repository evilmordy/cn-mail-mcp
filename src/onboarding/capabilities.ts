import { CLIENT_CAPABILITIES_META_KEY } from "@modelcontextprotocol/server";

/** What the connected client declared for MCP elicitation (spec 2026-07-28). */
export type ElicitationSupport = {
  form: boolean;
  url: boolean;
};

type ElicitationDecl = {
  form?: unknown;
  url?: unknown;
};

type CapabilitiesDecl = {
  elicitation?: ElicitationDecl;
};

/**
 * Map a client capability object to form/url support.
 *
 * Spec 2026-07-28: capabilities travel on each request at
 * `_meta["io.modelcontextprotocol/clientCapabilities"]`. A bare
 * `elicitation: {}` means form only (pre-mode clients). Declaring any
 * mode explicitly drops that implication.
 * On a 2025-era connection the same object is the `initialize` capabilities.
 */
export function elicitationSupport(capabilities: CapabilitiesDecl | undefined): ElicitationSupport {
  const el = capabilities?.elicitation;
  if (!el || typeof el !== "object") return { form: false, url: false };
  const hasForm = Object.prototype.hasOwnProperty.call(el, "form");
  const hasUrl = Object.prototype.hasOwnProperty.call(el, "url");
  if (!hasForm && !hasUrl) return { form: true, url: false };
  return { form: hasForm, url: hasUrl };
}

export function elicitationFromEnvelope(envelope: object | undefined): CapabilitiesDecl | undefined {
  if (!envelope) return undefined;
  const value = (envelope as Record<string, unknown>)[CLIENT_CAPABILITIES_META_KEY];
  if (!value || typeof value !== "object") return undefined;
  return value as CapabilitiesDecl;
}
