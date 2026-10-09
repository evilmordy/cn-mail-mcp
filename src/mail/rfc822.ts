export const MAX_COMPOSE_BODY = 64 * 1024;
export const MAX_RECIPIENTS = 10;

export type Rfc822Input = {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  messageId: string;
  inReplyTo?: string;
  references?: string;
};

export function generateMessageId(domain: string): string {
  const rand = crypto.randomUUID();
  return `<cn-mail-mcp.${rand}@${domain}>`;
}

export function replySubject(original?: string): string {
  const s = (original ?? "").trim() || "(no subject)";
  return /^re\s*:/i.test(s) ? s : `Re: ${s}`;
}

export function forwardSubject(original?: string): string {
  const s = (original ?? "").trim() || "(no subject)";
  return /^(fwd|fw)\s*:/i.test(s) ? s : `Fwd: ${s}`;
}

export function quoteOriginal(from: string | undefined, date: string | undefined, body: string): string {
  const header = `On ${date ?? "an unknown date"}, ${from ?? "someone"} wrote:`;
  const quoted = body
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
  return `${header}\n${quoted}`;
}

export function assertComposeBody(body: string): void {
  if (body.length > MAX_COMPOSE_BODY) {
    throw new Error(`message body exceeds ${MAX_COMPOSE_BODY} bytes`);
  }
}

function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function assertHeaderAtom(value: string, field: string): void {
  if (/[\r\n\0]/.test(value)) {
    throw new Error(`${field} contains CR/LF`);
  }
}

export function buildRfc822(input: Rfc822Input): string {
  assertComposeBody(input.body);
  assertHeaderAtom(input.from, "From");
  for (const addr of input.to) assertHeaderAtom(addr, "To");
  for (const addr of input.cc ?? []) assertHeaderAtom(addr, "Cc");
  assertHeaderAtom(input.subject, "Subject");
  assertHeaderAtom(input.messageId, "Message-ID");
  if (input.inReplyTo) assertHeaderAtom(input.inReplyTo, "In-Reply-To");
  if (input.references) assertHeaderAtom(input.references, "References");
  const headers = [
    `From: ${input.from}`,
    `To: ${input.to.join(", ")}`,
    ...(input.cc && input.cc.length > 0 ? [`Cc: ${input.cc.join(", ")}`] : []),
    `Subject: ${encodeHeader(input.subject)}`,
    `Message-ID: ${input.messageId}`,
    `Date: ${new Date().toUTCString()}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    `Content-Transfer-Encoding: 8bit`,
    ...(input.inReplyTo ? [`In-Reply-To: ${input.inReplyTo}`] : []),
    ...(input.references ? [`References: ${input.references}`] : []),
  ];
  return `${headers.join("\r\n")}\r\n\r\n${input.body.replace(/\n/g, "\r\n")}`;
}
