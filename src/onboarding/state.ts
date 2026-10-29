import { randomBytes } from "node:crypto";
import { createRequestStateCodec } from "@modelcontextprotocol/server";

export type BindState = { sessionId: string };

/**
 * Signed requestState for the bind flow (spec 2026-07-28 MRTR).
 * The codec is signed, not encrypted — the payload is only a session id,
 * never an authorization code.
 */
export const bindStateCodec = createRequestStateCodec<BindState>({
  key: randomBytes(32),
  ttlSeconds: 600,
});
