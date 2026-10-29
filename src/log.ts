const SECRET_KEYS = /auth.?code|password|pass\b|secret|token|authorization|csrf/i;

/** Remove known secret strings from a message before it reaches a tool result or log. */
export function scrubSecrets(message: string, secrets: Array<string | undefined>): string {
  let out = message;
  for (const secret of secrets) {
    if (!secret || secret.length < 4) continue;
    out = out.split(secret).join("[redacted]");
  }
  return out;
}

function redactValue(key: string, value: unknown): unknown {
  if (SECRET_KEYS.test(key)) return "[redacted]";
  return value;
}

function writeLog(level: string, fields: Record<string, unknown>): void {
  const body: Record<string, unknown> = { level, ts: new Date().toISOString() };
  for (const [k, v] of Object.entries(fields)) body[k] = redactValue(k, v);
  process.stderr.write(`${JSON.stringify(body)}\n`);
}

export function logInfo(event: string, fields: Record<string, unknown> = {}): void {
  writeLog("info", { event, ...fields });
}

export function logWarn(event: string, fields: Record<string, unknown> = {}): void {
  writeLog("warn", { event, ...fields });
}

export function logError(event: string, err: unknown, fields: Record<string, unknown> = {}): void {
  const message = err instanceof Error ? err.message : String(err);
  const safe = message.replace(/(pass(word)?|authcode|secret|token)\s*[:=]\s*\S+/gi, "$1=[redacted]");
  writeLog("error", { event, message: safe, ...fields });
}
