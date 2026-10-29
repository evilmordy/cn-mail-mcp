import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { logInfo } from "../log.js";

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const MAX_BODY = 4096;
const MAX_SESSIONS = 8;

export type BindProfile = {
  address: string;
  label?: string;
  provider?: string;
  accountId?: string;
};

type SessionState = "open" | "submitted" | "done" | "expired";

type Session = {
  id: string;
  token: string;
  csrf: string;
  profile: BindProfile;
  expiresAt: number;
  state: SessionState;
  url: string;
  authCode?: string;
  timer?: ReturnType<typeof setTimeout>;
};

export type BindPageOptions = {
  now?: () => number;
  ttlMs?: number;
};

function tokensEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const host = address.replace(/^::ffff:/, "");
  return host === "127.0.0.1" || host === "::1";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * One-shot loopback page for URL-mode elicitation.
 * Listens on 127.0.0.1 only. The URL carries an unguessable token, not the
 * mailbox address or the authorization code. The code is accepted once via
 * POST and never written into the response or logs.
 */
export class BindPageServer {
  private server: Server | undefined;
  private port = 0;
  private readonly sessions = new Map<string, Session>();
  private readonly byToken = new Map<string, Session>();
  private readonly now: () => number;
  private readonly ttlMs: number;
  private starting: Promise<void> | undefined;

  constructor(opts: BindPageOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  }

  async create(profile: BindProfile): Promise<{ id: string; url: string }> {
    this.sweep();
    const open = [...this.sessions.values()].filter((s) => s.state === "open" || s.state === "submitted");
    if (open.length >= MAX_SESSIONS) {
      throw new Error("绑定页面过多，请先完成或等待已有页面过期");
    }
    await this.listen();
    const id = randomBytes(16).toString("hex");
    const token = randomBytes(32).toString("base64url");
    const csrf = randomBytes(32).toString("base64url");
    const url = `http://127.0.0.1:${this.port}/bind?t=${encodeURIComponent(token)}`;
    const session: Session = {
      id,
      token,
      csrf,
      profile,
      expiresAt: this.now() + this.ttlMs,
      state: "open",
      url,
    };
    session.timer = setTimeout(() => {
      this.expire(session);
    }, this.ttlMs);
    session.timer.unref?.();
    this.sessions.set(id, session);
    this.byToken.set(token, session);
    logInfo("bind.page_open", { sessionId: id, port: this.port });
    return { id, url };
  }

  status(id: string): "missing" | "open" | "ready" | "expired" | "done" {
    const session = this.sessions.get(id);
    if (!session) return "missing";
    if (session.state !== "done" && session.state !== "expired" && this.now() >= session.expiresAt) {
      this.expire(session);
    }
    if (session.state === "submitted") return "ready";
    return session.state;
  }

  /** Take a submitted code once. Clears it from memory. */
  takeSubmitted(id: string): { profile: BindProfile; authCode: string } | undefined {
    const session = this.sessions.get(id);
    if (!session || session.state !== "submitted" || !session.authCode) return undefined;
    if (this.now() >= session.expiresAt) {
      this.expire(session);
      return undefined;
    }
    const authCode = session.authCode;
    session.authCode = undefined;
    session.state = "done";
    this.byToken.delete(session.token);
    this.clearTimer(session);
    logInfo("bind.page_consumed", { sessionId: id });
    this.maybeClose();
    return { profile: session.profile, authCode };
  }

  cancel(id: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    session.authCode = undefined;
    session.state = "expired";
    this.byToken.delete(session.token);
    this.clearTimer(session);
    this.sessions.delete(id);
    logInfo("bind.page_cancel", { sessionId: id });
    this.maybeClose();
  }

  /** Test helper: pending sessions without secrets. */
  listPending(): Array<{ id: string; url: string; address: string }> {
    this.sweep();
    return [...this.sessions.values()]
      .filter((s) => s.state === "open" || s.state === "submitted")
      .map((s) => ({ id: s.id, url: s.url, address: s.profile.address }));
  }

  listeningPort(): number {
    return this.port;
  }

  async close(): Promise<void> {
    for (const session of this.sessions.values()) this.clearTimer(session);
    this.sessions.clear();
    this.byToken.clear();
    const server = this.server;
    this.server = undefined;
    this.port = 0;
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  private async listen(): Promise<void> {
    if (this.server && this.port) return;
    if (this.starting) return this.starting;
    this.starting = new Promise<void>((resolve, reject) => {
      const server = createServer((req, res) => {
        void this.handle(req, res);
      });
      server.requestTimeout = 10_000;
      server.headersTimeout = 5_000;
      server.maxHeadersCount = 32;
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (!addr || typeof addr === "string") {
          reject(new Error("bind page failed to listen"));
          return;
        }
        this.server = server;
        this.port = addr.port;
        resolve();
      });
    }).finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }

  private expire(session: Session): void {
    session.authCode = undefined;
    session.state = "expired";
    this.byToken.delete(session.token);
    this.clearTimer(session);
    this.sessions.delete(session.id);
    logInfo("bind.page_expired", { sessionId: session.id });
    this.maybeClose();
  }

  private clearTimer(session: Session): void {
    if (session.timer) {
      clearTimeout(session.timer);
      session.timer = undefined;
    }
  }

  private sweep(): void {
    for (const session of [...this.sessions.values()]) {
      if (session.state !== "done" && this.now() >= session.expiresAt) this.expire(session);
    }
  }

  private maybeClose(): void {
    const alive = [...this.sessions.values()].some((s) => s.state === "open" || s.state === "submitted");
    if (alive) return;
    const server = this.server;
    this.server = undefined;
    this.port = 0;
    server?.close();
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const remote = req.socket.remoteAddress;
      if (!isLoopbackAddress(remote)) {
        this.send(res, 403, "forbidden");
        return;
      }
      const host = (req.headers.host ?? "").toLowerCase();
      const expectedHost = `127.0.0.1:${this.port}`;
      if (host !== expectedHost) {
        this.send(res, 421, "bad host");
        return;
      }
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${this.port}`);
      if (url.pathname !== "/bind") {
        this.send(res, 404, "not found");
        return;
      }
      const token = url.searchParams.get("t") ?? "";
      const session = token ? this.byToken.get(token) : undefined;
      if (!session || !tokensEqual(session.token, token) || this.now() >= session.expiresAt || session.state === "expired" || session.state === "done") {
        if (session && this.now() >= session.expiresAt) this.expire(session);
        this.send(res, 404, page("链接无效或已过期", "<p>这个绑定链接无效、已使用或已过期。请回到客户端重新发起绑定。</p>"));
        return;
      }
      if (req.method === "GET") {
        this.send(res, 200, renderForm(session), "text/html; charset=utf-8");
        return;
      }
      if (req.method !== "POST") {
        this.send(res, 405, "method not allowed");
        return;
      }
      if (!originOk(req, this.port)) {
        this.send(res, 403, page("已拒绝", "<p>来源校验失败。</p>"));
        return;
      }
      const ctype = String(req.headers["content-type"] ?? "");
      if (!ctype.toLowerCase().startsWith("application/x-www-form-urlencoded")) {
        this.send(res, 415, page("已拒绝", "<p>不支持的提交格式。</p>"));
        return;
      }
      const raw = await readBody(req, MAX_BODY);
      const form = new URLSearchParams(raw);
      const postedToken = form.get("t") ?? "";
      const postedCsrf = form.get("csrf") ?? "";
      const authCode = (form.get("auth_code") ?? "").trim();
      if (!tokensEqual(postedToken, session.token) || !tokensEqual(postedCsrf, session.csrf)) {
        this.send(res, 403, page("已拒绝", "<p>校验失败。请重新打开链接。</p>"));
        return;
      }
      if (!authCode || authCode.length > 256 || /[\r\n]/.test(authCode)) {
        this.send(res, 400, page("未保存", "<p>授权码为空或格式不正确。请返回重试。</p>"));
        return;
      }
      session.authCode = authCode;
      session.state = "submitted";
      this.byToken.delete(session.token);
      logInfo("bind.page_submitted", { sessionId: session.id });
      this.send(
        res,
        200,
        page("已提交", "<p>授权码已交给本机 cn-mail-mcp，没有回显。可以关闭此页，然后回到客户端继续。</p>"),
      );
    } catch {
      if (!res.headersSent) this.send(res, 400, page("未保存", "<p>请求无效。</p>"));
    }
  }

  private send(res: ServerResponse, status: number, body: string, contentType = "text/html; charset=utf-8"): void {
    const payload = Buffer.from(body, "utf8");
    res.writeHead(status, {
      "Content-Type": contentType,
      "Content-Length": String(payload.length),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; form-action 'self'; base-uri 'none'",
      Connection: "close",
    });
    res.end(payload);
  }
}

function originOk(req: IncomingMessage, port: number): boolean {
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin !== `http://127.0.0.1:${port}`) return false;
  const fetchSite = req.headers["sec-fetch-site"];
  if (typeof fetchSite === "string" && fetchSite !== "same-origin" && fetchSite !== "none") return false;
  return true;
}

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buf.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(buf);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function page(title: string, inner: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${inner}
</body>
</html>`;
}

function renderForm(session: Session): string {
  const address = escapeHtml(session.profile.address);
  return page(
    "填写 IMAP 授权码",
    `<p>cn-mail-mcp 正在绑定 <strong>${address}</strong>。请填写该邮箱的 IMAP 授权码（不是网页登录密码）。此页只在本机 127.0.0.1 上提供，提交后即失效。</p>
<form method="post" action="/bind?t=${encodeURIComponent(session.token)}">
<input type="hidden" name="t" value="${escapeHtml(session.token)}">
<input type="hidden" name="csrf" value="${escapeHtml(session.csrf)}">
<label>IMAP 授权码 <input type="password" name="auth_code" autocomplete="off" required></label>
<button type="submit">保存到本机</button>
</form>`,
  );
}

let shared: BindPageServer | undefined;

export function getSharedBindPageServer(): BindPageServer {
  shared ??= new BindPageServer();
  return shared;
}
