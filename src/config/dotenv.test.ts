import { afterEach, describe, expect, it } from "vitest";
import { applyDotEnvText, envFileCandidates, stripKeysFromDotEnvText } from "./dotenv.js";

describe("applyDotEnvText", () => {
  it("fills empty keys and ignores comments", () => {
    const env: NodeJS.ProcessEnv = {};
    applyDotEnvText(
      `# hi\nMAIL_USER=you@qq.com\nexport QQCONNECT_PERMISSIONS=read,draft\n`,
      env,
    );
    expect(env.MAIL_USER).toBe("you@qq.com");
    expect(env.QQCONNECT_PERMISSIONS).toBeUndefined();
  });

  it("does not override a value already in the process env", () => {
    const env: NodeJS.ProcessEnv = { MAIL_USER: "from-grok@qq.com" };
    applyDotEnvText("MAIL_USER=from-file@qq.com\nQQCONNECT_AUTH_CODE=from-file\n", env);
    expect(env.MAIL_USER).toBe("from-grok@qq.com");
    expect(env.QQCONNECT_AUTH_CODE).toBe("from-file");
  });

  it("strips matching quotes", () => {
    const env: NodeJS.ProcessEnv = {};
    applyDotEnvText(`MAIL_AUTH_CODE='ab cd'\nMAIL_USER="a@b.com"\n`, env);
    expect(env.MAIL_AUTH_CODE).toBe("ab cd");
    expect(env.MAIL_USER).toBe("a@b.com");
  });

  it("allows QQCONNECT_MAIL_PROXY from dotenv", () => {
    const env: NodeJS.ProcessEnv = {};
    applyDotEnvText("QQCONNECT_MAIL_PROXY=http://127.0.0.1:8791\n", env);
    expect(env.QQCONNECT_MAIL_PROXY).toBe("http://127.0.0.1:8791");
  });
});

describe("envFileCandidates", () => {
  afterEach(() => {
    delete process.env.GROK_PLUGIN_ROOT;
    delete process.env.QQCONNECT_DOTENV;
  });

  it("strips named keys and keeps comments", () => {
    const next = stripKeysFromDotEnvText(
      "# keep\nMAIL_USER=a@qq.com\nMAIL_USER_2=b@163.com\nMAIL_AUTH_CODE_2=secret\n",
      new Set(["MAIL_USER_2", "MAIL_AUTH_CODE_2"]),
    );
    expect(next).toContain("MAIL_USER=a@qq.com");
    expect(next).toContain("# keep");
    expect(next).not.toContain("MAIL_USER_2");
    expect(next).not.toContain("secret");
  });

  it("includes GROK_PLUGIN_ROOT/.env so plugin and workspace files can both apply", () => {
    process.env.GROK_PLUGIN_ROOT = "/tmp/qqconnect-plugin";
    expect(envFileCandidates()).toContain("/tmp/qqconnect-plugin/.env");
  });
});
