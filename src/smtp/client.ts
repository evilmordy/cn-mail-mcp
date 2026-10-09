import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import nodemailer from "nodemailer";
import type { Account } from "../config/accounts.js";
import { resolveMailProxyUrl } from "../config/proxy.js";
import { assertPublicMailHost } from "../config/presets.js";

export const MAX_SENDS_PER_WINDOW = 5;
export const SEND_WINDOW_MS = 60 * 60 * 1000;

type SendBucket = { startedAt: number; count: number };

export type SendLimiterOptions = {
  file?: string;
  now?: () => number;
  windowMs?: number;
};

export class SendLimiter {
  private memory: SendBucket = { startedAt: 0, count: 0 };
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(
    private readonly max = MAX_SENDS_PER_WINDOW,
    private readonly opts: SendLimiterOptions = {},
  ) {
    this.windowMs = opts.windowMs ?? SEND_WINDOW_MS;
    this.now = opts.now ?? Date.now;
  }

  take(): void {
    const bucket = this.load();
    const t = this.now();
    const current =
      bucket.startedAt > 0 && t - bucket.startedAt < this.windowMs
        ? bucket
        : { startedAt: t, count: 0 };
    if (current.count >= this.max) {
      throw new Error(`send rate limit: at most ${this.max} messages per hour`);
    }
    current.count += 1;
    this.save(current);
  }

  private load(): SendBucket {
    const file = this.opts.file;
    if (!file || !existsSync(file)) return this.memory;
    try {
      const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<SendBucket>;
      const startedAt = typeof raw.startedAt === "number" ? raw.startedAt : 0;
      const count = typeof raw.count === "number" ? raw.count : 0;
      this.memory = { startedAt, count };
    } catch {
      this.memory = { startedAt: 0, count: 0 };
    }
    return this.memory;
  }

  private save(bucket: SendBucket): void {
    this.memory = bucket;
    const file = this.opts.file;
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(bucket)}\n`, "utf8");
    renameSync(tmp, file);
  }
}

export type SmtpPayload = {
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  messageId: string;
  inReplyTo?: string;
  references?: string;
};

export async function sendSmtp(account: Account, payload: SmtpPayload): Promise<void> {
  if (!account.smtpHost) {
    throw new Error(`account ${account.id} has no SMTP host; set smtpHost`);
  }
  const proxy = resolveMailProxyUrl();
  await assertPublicMailHost(account.smtpHost, undefined, { viaProxy: Boolean(proxy) });
  const transport = nodemailer.createTransport({
    host: account.smtpHost,
    port: account.smtpPort || 465,
    secure: true,
    auth: { user: account.address, pass: account.authCode },
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    ...(proxy ? { proxy } : {}),
  });
  try {
    await transport.sendMail({
      from: payload.from,
      to: payload.to.join(", "),
      cc: payload.cc && payload.cc.length > 0 ? payload.cc.join(", ") : undefined,
      subject: payload.subject,
      text: payload.text,
      messageId: payload.messageId,
      inReplyTo: payload.inReplyTo,
      references: payload.references,
    });
  } finally {
    transport.close();
  }
}
