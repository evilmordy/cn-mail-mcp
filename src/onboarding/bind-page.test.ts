import { request as httpRequest } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { BindPageServer } from "./bind-page.js";

const SECRET = "zq-auth-9f3c1a7e";

async function text(url: string, init?: RequestInit): Promise<{ status: number; body: string }> {
  const res = await fetch(url, init);
  return { status: res.status, body: await res.text() };
}

function rawRequest(port: number, hostHeader: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { hostname: "127.0.0.1", port, path: "/bind?t=nope", method: "GET", headers: { host: hostHeader } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.from(c)));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("BindPageServer", () => {
  const pages: BindPageServer[] = [];

  afterEach(async () => {
    await Promise.all(pages.splice(0).map((p) => p.close()));
  });

  it("listens on 127.0.0.1 and rejects a foreign Host", async () => {
    const page = new BindPageServer();
    pages.push(page);
    const opened = await page.create({ address: "you@qq.com" });
    const url = new URL(opened.url);
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.searchParams.get("t")).toBeTruthy();
    expect(opened.url).not.toContain("you@");
    expect(opened.url).not.toContain("qq.com");
    const bad = await rawRequest(Number(url.port), "evil.example");
    expect(bad.status).toBe(421);
    expect(bad.body).not.toContain(SECRET);
  });

  it("rejects a bad token, a bad csrf, and a second submit", async () => {
    const page = new BindPageServer();
    pages.push(page);
    const opened = await page.create({ address: "you@qq.com", label: "个人" });
    const missing = await text(opened.url.replace(/t=[^&]+/, "t=not-the-token"));
    expect(missing.status).toBe(404);

    const form = await text(opened.url);
    expect(form.status).toBe(200);
    expect(form.body).toContain("you@qq.com");
    expect(form.body).not.toContain(SECRET);
    const csrf = /name="csrf" value="([^"]+)"/.exec(form.body)?.[1];
    const token = /name="t" value="([^"]+)"/.exec(form.body)?.[1];
    expect(csrf).toBeTruthy();
    expect(token).toBeTruthy();

    const badCsrf = await text(opened.url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: new URL(opened.url).origin },
      body: new URLSearchParams({ t: token!, csrf: "nope", auth_code: SECRET }).toString(),
    });
    expect(badCsrf.status).toBe(403);
    expect(badCsrf.body).not.toContain(SECRET);
    expect(page.status(opened.id)).toBe("open");

    const badOrigin = await text(opened.url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: "https://evil.example" },
      body: new URLSearchParams({ t: token!, csrf: csrf!, auth_code: SECRET }).toString(),
    });
    expect(badOrigin.status).toBe(403);
    expect(badOrigin.body).not.toContain(SECRET);

    const ok = await text(opened.url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: new URL(opened.url).origin },
      body: new URLSearchParams({ t: token!, csrf: csrf!, auth_code: SECRET }).toString(),
    });
    expect(ok.status).toBe(200);
    expect(ok.body).not.toContain(SECRET);
    expect(page.status(opened.id)).toBe("ready");

    const again = await text(opened.url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", origin: new URL(opened.url).origin },
      body: new URLSearchParams({ t: token!, csrf: csrf!, auth_code: SECRET }).toString(),
    });
    expect(again.status).toBe(404);
    expect(again.body).not.toContain(SECRET);

    const taken = page.takeSubmitted(opened.id);
    expect(taken?.authCode).toBe(SECRET);
    expect(page.takeSubmitted(opened.id)).toBeUndefined();
  });

  it("expires a token when the clock passes the deadline", async () => {
    let now = 1_000_000;
    const page = new BindPageServer({ now: () => now, ttlMs: 1_000 });
    pages.push(page);
    const opened = await page.create({ address: "you@qq.com" });
    now += 5_000;
    const res = await text(opened.url);
    expect(res.status).toBe(404);
    expect(page.status(opened.id)).toBe("missing");
  });
});
