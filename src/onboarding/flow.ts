import { acceptedContent, inputRequired, inputResponse } from "@modelcontextprotocol/server";
import * as z from "zod";
import type { AccountProfile } from "../config/accounts.js";
import { BindPageServer, getSharedBindPageServer } from "./bind-page.js";
import type { ElicitationSupport } from "./capabilities.js";
import { commitMailbox, type LoginVerify } from "./commit.js";
import { manualBindInstructions } from "./fallback.js";
import { bindStateCodec, type BindState } from "./state.js";

const profileSchema = z.object({
  address: z.string().min(3).max(200),
  label: z.string().max(40).optional(),
  provider: z.enum(["auto", "qq", "163", "126", "exmail"]).optional(),
});

/** Flat elicitation schema. No authorization-code field — spec forbids secrets in form mode. */
export const PROFILE_ELICIT_SCHEMA = {
  type: "object" as const,
  properties: {
    address: {
      type: "string" as const,
      format: "email" as const,
      title: "邮箱地址",
      description: "例如 you@qq.com。不要填写授权码。",
    },
    label: {
      type: "string" as const,
      title: "备注",
      description: "可选，例如「工作」。",
      maxLength: 40,
    },
    provider: {
      type: "string" as const,
      title: "服务商",
      description: "auto 按域名选择。",
      enum: ["auto", "qq", "163", "126", "exmail"],
      default: "auto",
    },
  },
  required: ["address"],
};

export type OnboardingExtra = {
  inputResponses?: Record<string, unknown>;
  requestState?: BindState;
  elicitation?: ElicitationSupport;
};

export type OnboardingResult =
  | { content: Array<{ type: "text"; text: string }>; isError?: boolean }
  | ReturnType<typeof inputRequired>;

export type AddMailboxDeps = {
  verifyLogin: LoginVerify;
  pages?: BindPageServer;
  reload?: () => void;
  mintState?: (state: BindState) => Promise<string>;
};

const argsSchema = z.object({
  address: z.string().optional(),
  label: z.string().optional(),
  provider: z.enum(["auto", "qq", "163", "126", "exmail"]).optional(),
  account_id: z.string().optional(),
  bind_session: z.string().optional(),
});

function textResult(data: unknown, isError = false): OnboardingResult {
  return {
    content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}

function capsOf(extra: OnboardingExtra | undefined): ElicitationSupport {
  return extra?.elicitation ?? { form: false, url: false };
}

function pagesOf(deps: AddMailboxDeps): BindPageServer {
  deps.pages ??= getSharedBindPageServer();
  return deps.pages;
}

async function mint(deps: AddMailboxDeps, state: BindState): Promise<string> {
  if (deps.mintState) return deps.mintState(state);
  return bindStateCodec.mint(state);
}

function urlRequest(url: string) {
  return inputRequired.elicitUrl({
    message:
      "请在浏览器打开本机页面，填写 IMAP 授权码（不是网页密码）。页面只监听 127.0.0.1，提交后失效。不要把授权码发给助手，也不要贴进对话。",
    url,
  });
}

function assertNoSecretShape(value: unknown): void {
  const blob = JSON.stringify(value).toLowerCase();
  if (/"auth_code"|"authcode"|"password"|"authorization"/.test(blob)) {
    throw new Error("profile schema must not request secrets");
  }
}

export async function handleAddMailbox(
  args: Record<string, unknown>,
  extra: OnboardingExtra | undefined,
  deps: AddMailboxDeps,
): Promise<OnboardingResult> {
  assertNoSecretShape(PROFILE_ELICIT_SCHEMA);
  const caps = capsOf(extra);
  const parsed = argsSchema.parse(args ?? {});
  const sessionId = extra?.requestState?.sessionId || parsed.bind_session;

  if (sessionId) {
    const outcome = await resumeSession(sessionId, extra, deps, pagesOf(deps), caps);
    if (outcome) return outcome;
  }

  const profileView = inputResponse(extra?.inputResponses, "profile");
  if (profileView.kind === "elicit" && profileView.action !== "accept" && !parsed.address) {
    return textResult("已取消绑定。授权码未保存。", true);
  }
  const elicited = acceptedContent(extra?.inputResponses, "profile", profileSchema);
  const address = (parsed.address || elicited?.address || "").trim();
  const label = (parsed.label || elicited?.label || "").trim() || undefined;
  const provider = parsed.provider || elicited?.provider || "auto";
  const accountId = parsed.account_id?.trim() || undefined;

  if (!address) {
    if (caps.form) {
      return inputRequired({
        inputRequests: {
          profile: inputRequired.elicit({
            mode: "form",
            message: "绑定邮箱：只填写邮箱地址和备注。不要在此填写 IMAP 授权码或网页密码。",
            requestedSchema: PROFILE_ELICIT_SCHEMA,
          }),
        },
      });
    }
    if (caps.url) {
      return textResult(
        manualBindInstructions({ caps, reason: "need_address" }) +
          "\n助手可以先向用户询问邮箱地址和备注（不是授权码），再带 address 调用 add_mailbox，授权码仍走本机页面。",
      );
    }
    return textResult(manualBindInstructions({ caps, reason: "no_url" }));
  }

  if (!caps.url) {
    return textResult(manualBindInstructions({ caps, reason: "no_url", address }));
  }

  let opened: { id: string; url: string };
  try {
    opened = await pagesOf(deps).create({ address, label, provider, accountId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return textResult(message, true);
  }
  return inputRequired({
    inputRequests: { auth: urlRequest(opened.url) },
    requestState: await mint(deps, { sessionId: opened.id }),
  });
}

async function resumeSession(
  sessionId: string,
  extra: OnboardingExtra | undefined,
  deps: AddMailboxDeps,
  pages: BindPageServer,
  caps: ElicitationSupport,
): Promise<OnboardingResult | undefined> {
  const view = inputResponse(extra?.inputResponses, "auth");
  if (view.kind === "elicit" && (view.action === "decline" || view.action === "cancel")) {
    pages.cancel(sessionId);
    return textResult("已取消绑定。授权码未保存。", true);
  }
  const status = pages.status(sessionId);
  if (status === "missing" || status === "expired" || status === "done") {
    return textResult("绑定页面已过期或已使用。请重新调用 add_mailbox。不要向用户索取授权码。", true);
  }
  if (status === "ready") {
    const taken = pages.takeSubmitted(sessionId);
    if (!taken) return textResult("绑定页面已过期或已使用。请重新调用 add_mailbox。", true);
    const profile: AccountProfile = {
      address: taken.profile.address,
      label: taken.profile.label,
      provider: taken.profile.provider,
      accountId: taken.profile.accountId,
    };
    const result = await commitMailbox(profile, taken.authCode, deps.verifyLogin);
    if (result.ok) deps.reload?.();
    const payload = {
      ...result,
      note: result.ok
        ? "IMAP 登录成功。授权码只保存在本机账号文件，没有回显。"
        : "IMAP 登录未成功，授权码未保留。不要把授权码发到对话里。",
    };
    return textResult(payload, !result.ok);
  }
  const pending = pages.listPending().find((s) => s.id === sessionId);
  if (!pending) return textResult("绑定页面已过期。请重新调用 add_mailbox。", true);
  if (!caps.url) {
    pages.cancel(sessionId);
    return textResult(manualBindInstructions({ caps, reason: "no_url", address: pending.address }));
  }
  return inputRequired({
    inputRequests: { auth: urlRequest(pending.url) },
    requestState: await mint(deps, { sessionId }),
  });
}
