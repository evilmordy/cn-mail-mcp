import type { ElicitationSupport } from "./capabilities.js";
import { accountsFilePath } from "../config/store.js";

export type FallbackReason = "no_url" | "need_address";

/**
 * Step-by-step manual binding. The text must never contain an authorization code.
 * Tool descriptions tell the model not to ask the user to paste one into chat.
 */
export function manualBindInstructions(opts: {
  caps: ElicitationSupport;
  reason: FallbackReason;
  address?: string;
}): string {
  const where = accountsFilePath();
  const addressLine = opts.address
    ? `本次要绑定的地址是 ${opts.address}。授权码仍然不要出现在对话里。`
    : "邮箱地址可以告诉助手（它不是授权码）。授权码不要出现在对话里。";
  const why =
    opts.reason === "need_address"
      ? "当前客户端声明了 URL elicitation，但没有 form elicitation，服务器不能弹出表单收集地址。"
      : "当前客户端没有声明 URL elicitation，服务器不能把授权码收集页交给用户。form elicitation 按规范不能用来收集授权码。";
  return [
    "无法在对话里安全收集 IMAP 授权码。",
    why,
    `客户端 elicitation：form=${opts.caps.form ? "yes" : "no"}，url=${opts.caps.url ? "yes" : "no"}。`,
    addressLine,
    "",
    "请任选一种本机方式（不要把授权码贴进对话，也不要让助手读取它）：",
    "1. 在邮箱网页开启 IMAP/SMTP，生成授权码。这不是网页登录密码。",
    "   QQ：设置 → 账号与安全 → 安全设置 → IMAP/SMTP → 生成授权码。",
    "   163/126：设置 → POP3/SMTP/IMAP → 开启 IMAP → 生成客户端授权码。",
    "   腾讯企业邮：开启 IMAP/SMTP 后使用客户端专用密码。",
    "2. 在你自己的终端执行 `cn-mail-mcp accounts add`，按提示输入地址和授权码（只在终端里输入）。",
    "   或者编辑环境变量 / 项目 `.env`（等号两边不要空格，文件不要提交到 git）：",
    "   MAIL_USER=you@qq.com",
    "   MAIL_AUTH_CODE=这里填写授权码",
    "   第二个邮箱用 MAIL_USER_2 与 MAIL_AUTH_CODE_2，可选 MAIL_ACCOUNT_ID_2。",
    `   也可以直接编辑本机账号文件（权限应为 0600）：${where}`,
    "3. 验证登录：在终端运行 `cn-mail-mcp --check`，或让助手调用 `verify_mailboxes`。",
    "   结果只有成功或失败，不会回显授权码。",
    "",
    "配置好之后不必把授权码发给助手。若要再绑一个邮箱，重复以上步骤或再次调用 add_mailbox。",
  ].join("\n");
}
