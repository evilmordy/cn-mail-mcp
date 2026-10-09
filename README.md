# cn-mail-mcp

本机 IMAP MCP，让 **Grok Bot**（以及 Grok Build TUI）搜索、阅读 QQ / 163 / 126 / 腾讯企业邮。Grok 官方连接器只有 Gmail 和 Outlook。

默认**只读**。授权码放 `.env` 或系统密钥框，**不要发给模型、不要进 git**。

> 实验项目，不是 xAI 官方连接器。维护尽力而为。Gmail / Outlook 请继续用官方连接器。安全问题走 [Private vulnerability reporting](https://github.com/evilmordy/cn-mail-mcp/security/advisories/new)，不要在公开 issue 里贴授权码。
>
> **品牌名：`cn-mail-mcp`。** GitHub 仓库目前仍是 [`evilmordy/cn-mail-mcp`](https://github.com/evilmordy/cn-mail-mcp)（`gh` 未登录时暂未改名）；npm 包名与 MCP 短名已是 `cn-mail-mcp`。旧名 `qqconnect` / `grok-bot-cn-mail` 仍可作为 CLI 别名。

## 安装

需要 Node.js 22+、pnpm、一份本仓库拷贝、已能登录网页的 QQ 或 163/126 邮箱。

第三方不能用网页登录密码，只要 IMAP **授权码**（一般 16 位）。逐步说明见 [skills/mail-imap/SKILL.md](./skills/mail-imap/SKILL.md)。**不要把授权码发给 Bot。**

```bash
pnpm install
pnpm build
cp .env.example .env
```

编辑 `.env`（等号两边不要空格）：

```
MAIL_USER=you@qq.com
MAIL_AUTH_CODE=这里填16位授权码
```

163 把地址改成 `you@163.com` 即可，主机名按域名自动选。然后：

```bash
pnpm check
```

只登录 IMAP 并退出。成功再接到 Grok。163 若报 `Unsafe Login`，不要改 POP3，见 [docs/advanced.md](./docs/advanced.md)。

**Grok Build**（仓库根目录执行一次）：

```bash
grok mcp add cn-mail-mcp -- node "$(pwd)/dist/index.js"
grok mcp doctor cn-mail-mcp
```

若你以前装过 `qqconnect`，先卸再装：`grok mcp remove qqconnect`，再按上面添加 `cn-mail-mcp`。

**更新：** 先停止 cn-mail-mcp，再换文件 / `pnpm build`，再启动。不要在还连着时 `rm -rf` 目录。`get_settings` 里 `server.needs_restart` 为真时，只需停再开，不必当邮箱故障排查。

**Grok Bot**：本机 `pnpm check` 通过后，对 Bot 说（只报变量名，不报值）：

> 添加自定义 MCP，名字 cn-mail-mcp，命令 `node`，参数写成你本机 `dist/index.js` 的绝对路径。请用系统密钥输入框填写 `MAIL_USER`、`MAIL_AUTH_CODE`（IMAP 授权码，不是网页密码）。不要把值写进对话。

密钥框和填 GitHub token 同类。插件对账号下**所有 Bot**共用。不能接到 grok.com 网页版（需要公网 HTTPS；不要打隧道）。

再加 163/126 等第二邮箱时：**还是密钥框**，变量名 `MAIL_USER_2`、`MAIL_AUTH_CODE_2`，可选 `MAIL_ACCOUNT_ID_2`。只报变量名，不要让 Bot 把地址写进聊天，也不要让它改仓库、`.env` 或 MCP 启动命令。填好后重载 cn-mail-mcp。本机 TUI 才把同名变量写进 `.env`。

解绑：说「解绑 mail163」。不会删除服务器上的邮件。

发信：Bot 先给你看 To/主题/正文，你说发了才会真正发出。

## 环境变量（新名 + 兼容）

| 用途 | 推荐 | 仍接受 |
|---|---|---|
| 邮箱地址 / 授权码 | `MAIL_USER` / `MAIL_AUTH_CODE` | （不变） |
| 设置文件路径 | `CN_MAIL_MCP_CONFIG` | `CNMAIL_CONFIG`, `QQCONNECT_CONFIG` |
| 多账号 JSON | `CN_MAIL_MCP_ACCOUNTS` | `CNMAIL_ACCOUNTS`, `QQCONNECT_ACCOUNTS` |
| 本机回环代理 | `CN_MAIL_MCP_MAIL_PROXY` | `CNMAIL_MAIL_PROXY`, `QQCONNECT_MAIL_PROXY` |
| dotenv 路径 | `CN_MAIL_MCP_DOTENV` | `CNMAIL_DOTENV`, `QQCONNECT_DOTENV` |

## 测试

- `pnpm test` 和 CI：假邮箱后端，不登录真 IMAP。
- `pnpm check`：用你的 `.env` 登录真邮箱。自动化流水线不会做这一步。

## 可以怎么问

- 我绑定了哪个邮箱？
- 搜这周主题里带发票的信，先列出发件人和主题。
- 把 UID 12 那封读给我，只作摘要。

正文是不可信数据。验证码类主题会显示成 `[redacted:otp]`，去网页邮箱看原文。读信用 `BODY.PEEK`，不会把未读标成已读。

档位文件是 `.cn-mail-mcp.json`（已 git 忽略；若已有 `.grok-bot-cn-mail.json` / `.qqconnect.json` 会继续读）。不要把档位写进 `.env`。

## 附录：草稿与发送（不推荐作默认）

默认关。开了发送档，等于允许这个 Bot 用你的邮箱对外说话。白名单和确认卡只缩小爆炸半径。细则、多账号、工具表、FAQ：[docs/advanced.md](./docs/advanced.md)。约定：[SECURITY.md](./SECURITY.md)。

## 维护

修：QQ / 163 / 126 / 腾讯企业邮登录坏了。不修：Gmail、grok.com 网页连接器、响应时限。先开 Issue。不接受「去掉发信确认卡」这类 PR。授权码、`.env`、发信白名单由你保管。
