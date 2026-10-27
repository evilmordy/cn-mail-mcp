import { chmodSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadAccounts, publicAccountView, unbindAccount } from "../config/accounts.js";
import { accountsFilePath } from "../config/store.js";
import { BindPageServer } from "./bind-page.js";
import { PROFILE_ELICIT_SCHEMA, handleAddMailbox } from "./flow.js";

const SECRET = "zq-auth-9f3c1a7e";

type AnyResult = {
  isError?: boolean;
  content?: Array<{ text: string }>;
  inputRequests?: Record<string, { method?: string; params?: Record<string, unknown> }>;
  requestState?: string;
};

function blob(result: unknown): string {
  return JSON.stringify(result);
}

function elicit(result: AnyResult, key: string): { method?: string; params?: Record<string, unknown> } | undefined {
  return result.inputRequests?.[key];
}

describe("add_mailbox elicitation", () => {
  const pages: BindPageServer[] = [];
  let file: string;

  afterEach(async () => {
    await Promise.all(pages.splice(0).map((p) => p.close()));
    delete process.env.MAIL_USER;
    delete process.env.MAIL_AUTH_CODE;
  });

  function useStore(): string {
    file = join(mkdtempSync(join(tmpdir(), "cn-mail-store-")), "accounts.json");
    process.env.CN_MAIL_MCP_ACCOUNTS_FILE = file;
    return file;
  }

  function deps(verify: (code: string) => Promise<{ ok: boolean; error?: string }>) {
    const page = new BindPageServer();
    pages.push(page);
    return {
      pages: page,
      verifyLogin: async (account: { authCode: string }) => verify(account.authCode),
      reload: () => {},
    };
  }

  it("falls back to manual steps when the client declares no elicitation", async () => {
    useStore();
    const result = (await handleAddMailbox({}, { elicitation: { form: false, url: false } }, deps(async () => ({ ok: true })))) as AnyResult;
    const text = result.content?.[0]?.text ?? "";
    expect(result.inputRequests).toBeUndefined();
    expect(text).toContain("cn-mail-mcp --check");
    expect(text).toContain("cn-mail-mcp accounts add");
    expect(text).toContain("MAIL_AUTH_CODE");
    expect(text).toContain("不要把授权码");
    expect(text).not.toContain(SECRET);
    expect(blob(PROFILE_ELICIT_SCHEMA)).not.toMatch(/auth_code|authCode|password/i);
  });

  it("asks for a profile form and never a secret when only form mode exists", async () => {
    useStore();
    const first = (await handleAddMailbox({}, { elicitation: { form: true, url: false } }, deps(async () => ({ ok: true })))) as AnyResult;
    const profile = elicit(first, "profile");
    expect(profile?.params?.mode ?? "form").not.toBe("url");
    expect(JSON.stringify(profile?.params?.requestedSchema)).not.toMatch(/auth_code|authCode|password/i);
    expect(blob(first)).not.toContain(SECRET);

    const second = (await handleAddMailbox(
      { address: "you@qq.com" },
      { elicitation: { form: true, url: false } },
      deps(async () => ({ ok: true })),
    )) as AnyResult;
    expect(second.inputRequests?.auth).toBeUndefined();
    expect(second.content?.[0]?.text).toContain("不要把授权码");
    expect(second.content?.[0]?.text).toContain("you@qq.com");
  });

  it("asks the model for an address in chat when only url mode exists", async () => {
    useStore();
    const result = (await handleAddMailbox({}, { elicitation: { form: false, url: true } }, deps(async () => ({ ok: true })))) as AnyResult;
    expect(result.inputRequests).toBeUndefined();
    expect(result.content?.[0]?.text).toContain("邮箱地址");
    expect(result.content?.[0]?.text).toContain("不是授权码");
  });

  it("saves via the loopback page and keeps the code out of results and logs", async () => {
    useStore();
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const pageDeps = deps(async (code) => {
      expect([SECRET, "second-code-bbbb"]).toContain(code);
      return { ok: true };
    });
    try {
      const opened = (await handleAddMailbox(
        { address: "you@qq.com", label: "个人", provider: "qq" },
        { elicitation: { form: true, url: true } },
        pageDeps,
      )) as AnyResult;
      const auth = elicit(opened, "auth");
      expect(auth?.params?.mode).toBe("url");
      const url = String(auth?.params?.url);
      expect(new URL(url).hostname).toBe("127.0.0.1");
      expect(url).not.toContain("you@");
      expect(url).not.toContain(SECRET);
      expect(blob(opened)).not.toContain(SECRET);

      const html = await (await fetch(url)).text();
      const csrf = /name="csrf" value="([^"]+)"/.exec(html)?.[1];
      const token = /name="t" value="([^"]+)"/.exec(html)?.[1];
      const posted = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", origin: new URL(url).origin },
        body: new URLSearchParams({ t: token!, csrf: csrf!, auth_code: SECRET }).toString(),
      });
      const postedBody = await posted.text();
      expect(posted.status).toBe(200);
      expect(postedBody).not.toContain(SECRET);

      const sessionId = pageDeps.pages.listPending()[0]?.id;
      expect(sessionId).toBeTruthy();
      const done = (await handleAddMailbox(
        {},
        {
          elicitation: { form: true, url: true },
          requestState: { sessionId },
          inputResponses: { auth: { action: "accept" } },
        },
        pageDeps,
      )) as AnyResult;
      const text = done.content?.[0]?.text ?? "";
      expect(done.isError).toBeFalsy();
      expect(text).toContain("you@qq.com");
      expect(text).toContain('"ok": true');
      expect(text).not.toContain(SECRET);
      expect(stderr.mock.calls.map((c) => String(c[0])).join("")).not.toContain(SECRET);

      const disk = readFileSync(file, "utf8");
      expect(disk).toContain(SECRET);
      expect(statSync(file).mode & 0o777).toBe(0o600);
      expect(statSync(file).mode & 0o077).toBe(0);
      const listed = loadAccounts().map(publicAccountView);
      expect(listed.map((a) => a.address)).toEqual(["you@qq.com"]);
      expect(JSON.stringify(listed)).not.toContain(SECRET);

      const second = (await handleAddMailbox(
        { address: "work@163.com", account_id: "work" },
        { elicitation: { form: true, url: true } },
        pageDeps,
      )) as AnyResult;
      const url2 = String(elicit(second, "auth")?.params?.url);
      expect(url2).toContain("127.0.0.1");
      const htmlRes = await fetch(url2);
      const html2 = await htmlRes.text();
      expect(htmlRes.status).toBe(200);
      const csrf2 = /name="csrf" value="([^"]+)"/.exec(html2)?.[1];
      const token2 = /name="t" value="([^"]+)"/.exec(html2)?.[1];
      expect(csrf2).toBeTruthy();
      const posted2 = await fetch(url2, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", origin: new URL(url2).origin },
        body: new URLSearchParams({ t: token2!, csrf: csrf2!, auth_code: "second-code-bbbb" }).toString(),
      });
      expect(posted2.status).toBe(200);
      const session2 = pageDeps.pages.listPending().find((s) => s.address === "work@163.com")?.id;
      expect(session2).toBeTruthy();
      const saved2 = (await handleAddMailbox(
        {},
        {
          elicitation: { form: true, url: true },
          requestState: { sessionId: session2 },
          inputResponses: { auth: { action: "accept" } },
        },
        pageDeps,
      )) as AnyResult;
      expect(saved2.isError).toBeFalsy();
      expect(saved2.content?.[0]?.text).toContain("work@163.com");
      expect(saved2.content?.[0]?.text).not.toContain("second-code-bbbb");
      expect(loadAccounts().map((a) => a.id).sort()).toEqual(["work", "you"].sort());

      const work = loadAccounts().find((a) => a.id === "work");
      unbindAccount(work!);
      expect(loadAccounts().map((a) => a.id)).toEqual(["you"]);
      expect(readFileSync(accountsFilePath(), "utf8")).not.toContain("second-code-bbbb");
    } finally {
      stderr.mockRestore();
    }
  });

  it("drops the stored code when IMAP verification fails", async () => {
    useStore();
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    const pageDeps = deps(async () => ({ ok: false, error: `login failed for ${SECRET}` }));
    try {
      const opened = (await handleAddMailbox(
        { address: "you@126.com" },
        { elicitation: { form: true, url: true } },
        pageDeps,
      )) as AnyResult;
      const url = String(elicit(opened, "auth")?.params?.url);
      const html = await (await fetch(url)).text();
      const csrf = /name="csrf" value="([^"]+)"/.exec(html)?.[1];
      const token = /name="t" value="([^"]+)"/.exec(html)?.[1];
      await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", origin: new URL(url).origin },
        body: new URLSearchParams({ t: token!, csrf: csrf!, auth_code: SECRET }).toString(),
      });
      const sessionId = pageDeps.pages.listPending()[0]?.id;
      const done = (await handleAddMailbox(
        {},
        {
          elicitation: { form: true, url: true },
          requestState: { sessionId },
          inputResponses: { auth: { action: "accept" } },
        },
        pageDeps,
      )) as AnyResult;
      expect(done.isError).toBe(true);
      expect(done.content?.[0]?.text).not.toContain(SECRET);
      expect(done.content?.[0]?.text).toContain("[redacted]");
      expect(stderr.mock.calls.map((c) => String(c[0])).join("")).not.toContain(SECRET);
      expect(loadAccounts({ allowEmpty: true })).toEqual([]);
    } finally {
      stderr.mockRestore();
    }
  });

  it("cancels when the user declines the url elicitation", async () => {
    useStore();
    const pageDeps = deps(async () => ({ ok: true }));
    const opened = (await handleAddMailbox(
      { address: "you@qq.com" },
      { elicitation: { form: true, url: true } },
      pageDeps,
    )) as AnyResult;
    const sessionId = pageDeps.pages.listPending()[0]?.id;
    expect(elicit(opened, "auth")?.params?.url).toBeTruthy();
    const done = (await handleAddMailbox(
      {},
      {
        elicitation: { form: true, url: true },
        requestState: { sessionId },
        inputResponses: { auth: { action: "decline" } },
      },
      pageDeps,
    )) as AnyResult;
    expect(done.isError).toBe(true);
    expect(done.content?.[0]?.text).toContain("已取消");
    expect(loadAccounts({ allowEmpty: true })).toEqual([]);
  });

  it("re-issues the url when the page has not been submitted yet", async () => {
    useStore();
    const pageDeps = deps(async () => ({ ok: true }));
    await handleAddMailbox(
      { address: "you@qq.com" },
      { elicitation: { form: true, url: true } },
      pageDeps,
    );
    const sessionId = pageDeps.pages.listPending()[0]?.id;
    const again = (await handleAddMailbox(
      {},
      {
        elicitation: { form: true, url: true },
        requestState: { sessionId },
        inputResponses: { auth: { action: "accept" } },
      },
      pageDeps,
    )) as AnyResult;
    expect(elicit(again, "auth")?.params?.mode).toBe("url");
    expect(String(elicit(again, "auth")?.params?.url)).toContain("127.0.0.1");
    expect(blob(again)).not.toContain(SECRET);
  });
});

describe("account file permissions", () => {
  it("tightens a loose store file before reading it", async () => {
    const file = join(mkdtempSync(join(tmpdir(), "cn-mail-mode-")), "accounts.json");
    process.env.CN_MAIL_MCP_ACCOUNTS_FILE = file;
    const { writeFileSync } = await import("node:fs");
    writeFileSync(file, JSON.stringify({ version: 1, accounts: [] }), { mode: 0o644 });
    chmodSync(file, 0o644);
    expect(statSync(file).mode & 0o777).toBe(0o644);
    loadAccounts({ allowEmpty: true });
    expect(statSync(file).mode & 0o777).toBe(0o600);
  });
});
