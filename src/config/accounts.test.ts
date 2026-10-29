import { afterEach, describe, expect, it } from "vitest";
import { addMailboxHint, loadAccounts, unbindAccount, unbindMailboxHint } from "./accounts.js";

const KEYS = [
  "MAIL_USER",
  "MAIL_AUTH_CODE",
  "MAIL_USER_2",
  "MAIL_AUTH_CODE_2",
  "MAIL_ACCOUNT_ID_2",
  "MAIL_HOST",
  "MAIL_SMTP_HOST",
  "CN_MAIL_MCP_ACCOUNTS",
  "MAIL_IMAP_ID",
];

afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

describe("loadAccounts", () => {
  it("builds a QQ account from MAIL_USER", () => {
    process.env.MAIL_USER = "me@qq.com";
    process.env.MAIL_AUTH_CODE = "abcdefghijklmnop";
    const [acct] = loadAccounts();
    expect(acct.host).toBe("imap.qq.com");
    expect(acct.sendImapId).toBe(true);
    expect(acct.address).toBe("me@qq.com");
    expect(acct.smtpHost).toBe("smtp.qq.com");
    expect(acct.smtpPort).toBe(465);
    expect(acct.source).toBe("env");
  });

  it("rejects private hosts", () => {
    process.env.MAIL_USER = "me@example.com";
    process.env.MAIL_AUTH_CODE = "abcdefghijklmnop";
    process.env.MAIL_HOST = "169.254.169.254";
    expect(() => loadAccounts()).toThrow(/not allowed/);
  });

  it("rejects private SMTP hosts", () => {
    process.env.MAIL_USER = "me@example.com";
    process.env.MAIL_AUTH_CODE = "abcdefghijklmnop";
    process.env.MAIL_HOST = "imap.example.com";
    process.env.MAIL_SMTP_HOST = "192.168.0.9";
    expect(() => loadAccounts()).toThrow(/not allowed/);
  });

  it("reads JSON accounts with authCodeEnv", () => {
    process.env.QQ_CODE = "sixteencharscode1";
    process.env.CN_MAIL_MCP_ACCOUNTS = JSON.stringify([
      { id: "work", address: "a@163.com", authCodeEnv: "QQ_CODE" },
    ]);
    const [acct] = loadAccounts();
    expect(acct.id).toBe("work");
    expect(acct.host).toBe("imap.163.com");
    expect(acct.authCode).toBe("sixteencharscode1");
    expect(acct.source).toBe("json");
    delete process.env.QQ_CODE;
  });

  it("rejects inline authCode in CN_MAIL_MCP_ACCOUNTS JSON", () => {
    process.env.CN_MAIL_MCP_ACCOUNTS = JSON.stringify([
      { id: "qq", address: "a@qq.com", authCode: "abcdefghijklmnop" },
    ]);
    expect(() => loadAccounts()).toThrow(/authCodeEnv/);
  });

  it("loads a second mailbox from MAIL_USER_2", () => {
    process.env.MAIL_USER = "me@qq.com";
    process.env.MAIL_AUTH_CODE = "abcdefghijklmnop";
    process.env.MAIL_USER_2 = "work@163.com";
    process.env.MAIL_AUTH_CODE_2 = "sixteencharscode1";
    process.env.MAIL_ACCOUNT_ID_2 = "work";
    const accts = loadAccounts();
    expect(accts.map((a) => a.id)).toEqual(["default", "work"]);
    expect(accts[1]?.host).toBe("imap.163.com");
    expect(accts[1]?.smtpHost).toBe("smtp.163.com");
  });
});

describe("addMailboxHint", () => {
  it("names slot 2 after one account and never includes secret values", () => {
    const hint = addMailboxHint(1);
    expect(hint.next_slot).toBe(2);
    expect(hint.env).toEqual({
      MAIL_USER: "MAIL_USER_2",
      MAIL_AUTH_CODE: "MAIL_AUTH_CODE_2",
      MAIL_ACCOUNT_ID: "MAIL_ACCOUNT_ID_2",
    });
    expect(hint.guide).toMatch(/add_mailbox/);
    expect(hint.guide).toMatch(/不要向用户索取授权码/);
    expect(hint.guide).not.toMatch(/@qq\.com|@163\.com/);
  });

  it("points unbind at the tool and lists env key names only", () => {
    const hint = unbindMailboxHint([
      { id: "work", address: "a@163.com", unbind_env: ["MAIL_USER_2", "MAIL_AUTH_CODE_2"] },
    ]);
    expect(hint.accounts[0]?.env).toEqual(["MAIL_USER_2", "MAIL_AUTH_CODE_2"]);
    expect(hint.guide).toMatch(/unbind_mailbox/);
  });
});

describe("unbindAccount", () => {
  it("clears MAIL_USER_2 from the process env", () => {
    process.env.MAIL_USER = "me@qq.com";
    process.env.MAIL_AUTH_CODE = "abcdefghijklmnop";
    process.env.MAIL_USER_2 = "work@163.com";
    process.env.MAIL_AUTH_CODE_2 = "sixteencharscode1";
    process.env.MAIL_ACCOUNT_ID_2 = "work";
    const accts = loadAccounts();
    const work = accts.find((a) => a.id === "work");
    expect(work).toBeTruthy();
    unbindAccount(work!);
    expect(process.env.MAIL_USER_2).toBeUndefined();
    expect(process.env.MAIL_AUTH_CODE_2).toBeUndefined();
    const left = loadAccounts({ allowEmpty: true });
    expect(left.map((a) => a.id)).toEqual(["default"]);
  });
});
