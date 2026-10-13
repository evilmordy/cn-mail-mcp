# cn-mail-mcp

个人 IMAP MCP，用来搜索、阅读 QQ / 163 / 126 / 腾讯企业邮。Grok 和 Cursor 的官方连接器只有 Gmail 和 Outlook，没有通用 IMAP，也没有 QQ / 163 插件。这个仓库补的就是这一段。

默认**只读**。授权码放 `.env` 或系统密钥框，**不要发给模型、不要进 git**。

最稳的跑法：装在能直连 IMAP 的机器上（自己的电脑、本机 TUI）。Grok Bot 云端盒子能不能扫到 QQ，看那台机器的出口，不看授权码和 `dist` 对不对。

> 实验项目，不是 xAI / Cursor 官方连接器。维护尽力而为。Gmail / Outlook 请继续用官方连接器。安全问题走 [Private vulnerability reporting](https://github.com/evilmordy/cn-mail-mcp/security/advisories/new)，不要在公开 issue 里贴授权码。
>
> **品牌名：`cn-mail-mcp`。** 公开仓库：[evilmordy/cn-mail-mcp](https://github.com/evilmordy/cn-mail-mcp)。旧路径 `evilmordy/grok-bot-cn-mail` 会跳转到这里。代码里仍接受的旧名只是别名：CLI `qqconnect` / `grok-bot-cn-mail`，设置文件 `.qqconnect.json` / `.grok-bot-cn-mail.json`，环境变量 `QQCONNECT_*`。

## 适用场景与限制

- 官方 Grok / Cursor 连接器只有 Gmail 和 Outlook。没有官方通用 IMAP 插件，也没有 QQ / 163 插件。
- 本项目读信用 IMAP `:993`，发信走 SMTP `:465`，覆盖 QQ、163、126、腾讯企业邮（例如 `imap.qq.com`、`smtp.qq.com`）。
- 在你自己的电脑或本机 TUI 上跑，并且这台机器能连这些端口时，按下面的安装步骤用即可。
- Grok Bot 云端盒子上，出站经常只放行 HTTPS `:443`。对 IMAP `:993` / SMTP `:465` 做 HTTP CONNECT 可能超时。DNS 还可能返回假 IP（`198.18.0.x`），不走代理的直连 TCP 也会失败。这时从 Bot 盒子扫 QQ 会失败，授权码和 `dist` 都正常也一样。同一台盒子上，官方 Gmail 走 HTTPS，仍然可以用。
- 可选的本机回环 HTTP CONNECT 代理（`CN_MAIL_MCP_MAIL_PROXY`，旧名 `QQCONNECT_MAIL_PROXY` 等仍可用）只有在出口代理自己能到达 `:993` / `:465` 时才有用。它不会把 IMAP 改接到 `:443`。
- Bot 盒子是可选用法，成败取决于那台环境的出口。项目仍可作为个人国内邮箱的 IMAP MCP 使用。

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

只登录 IMAP 并退出。成功说明**跑这条命令的那台机器**能连上邮箱。163 若报 `Unsafe Login`，不要改 POP3，见 [docs/advanced.md](./docs/advanced.md)。

**Grok Build**（推荐。仓库根目录执行一次，MCP 跑在本机）：

```bash
grok mcp add cn-mail-mcp -- node "$(pwd)/dist/index.js"
grok mcp doctor cn-mail-mcp
```

若你以前装过 `qqconnect`，先卸再装：`grok mcp remove qqconnect`，再按上面添加 `cn-mail-mcp`。

**更新：** 先停止 cn-mail-mcp，再换文件 / `pnpm build`，再启动。不要在还连着时 `rm -rf` 目录。`get_settings` 里 `server.needs_restart` 为真时，只需停再开，不必当邮箱故障排查。

**Grok Bot**（可选）：本机 `pnpm check` 通过，只说明你这台电脑的授权码和 IMAP 是通的。Bot 云端盒子若出站到不了 `:993` / `:465`，同一套密钥和 `dist` 仍会登录失败，见上面的「适用场景与限制」。出口允许时，对 Bot 说（只报变量名，不报值）：

> 添加自定义 MCP，名字 cn-mail-mcp，命令 `node`，参数写成能跑这个进程的机器上 `dist/index.js` 的绝对路径。请用系统密钥输入框填写 `MAIL_USER`、`MAIL_AUTH_CODE`（IMAP 授权码，不是网页密码）。不要把值写进对话。

密钥框和填 GitHub token 同类。插件对账号下**所有 Bot**共用。不能接到 grok.com 网页版（需要公网 HTTPS；不要打隧道）。

再加 163/126 等第二邮箱时：**还是密钥框**，变量名 `MAIL_USER_2`、`MAIL_AUTH_CODE_2`，可选 `MAIL_ACCOUNT_ID_2`。只报变量名，不要让 Bot 把地址写进聊天，也不要让它改仓库、`.env` 或 MCP 启动命令。填好后重载 cn-mail-mcp。本机 TUI 才把同名变量写进 `.env`。

解绑：说「解绑 mail163」。不会删除服务器上的邮件。

发信：Bot 先给你看 To/主题/正文，你说发了才会真正发出。发信同样要能连上 SMTP `:465`。

## 环境变量（新名 + 兼容）

| 用途 | 推荐 | 仍接受 |
|---|---|---|
| 邮箱地址 / 授权码 | `MAIL_USER` / `MAIL_AUTH_CODE` | （不变） |
| 设置文件路径 | `CN_MAIL_MCP_CONFIG` | `CNMAIL_CONFIG`, `QQCONNECT_CONFIG` |
| 多账号 JSON | `CN_MAIL_MCP_ACCOUNTS` | `CNMAIL_ACCOUNTS`, `QQCONNECT_ACCOUNTS` |
| 本机回环代理 | `CN_MAIL_MCP_MAIL_PROXY` | `CNMAIL_MAIL_PROXY`, `QQCONNECT_MAIL_PROXY` |
| dotenv 路径 | `CN_MAIL_MCP_DOTENV` | `CNMAIL_DOTENV`, `QQCONNECT_DOTENV` |

回环代理只有在它自己能连上 `:993` / `:465` 时才有用，不会把 IMAP 改到 `:443`。没设 `CN_MAIL_MCP_MAIL_PROXY` 时，若环境里已有 `SAND_EGRESS_TUNNEL_PROXY_ADDR`，会自动用它，限制相同。

## 测试

- `pnpm test` 和 CI：假邮箱后端，不登录真 IMAP。
- `pnpm check`：用你的 `.env` 登录真邮箱。自动化流水线不会做这一步。`pnpm check` 通过也不表示 Bot 云端盒子出站允许 IMAP。

## 可以怎么问

- 我绑定了哪个邮箱？
- 搜这周主题里带发票的信，先列出发件人和主题。
- 把 UID 12 那封读给我，只作摘要。

正文是不可信数据。验证码类主题会显示成 `[redacted:otp]`，去网页邮箱看原文。读信用 `BODY.PEEK`，不会把未读标成已读。

档位文件是 `.cn-mail-mcp.json`（已 git 忽略；若已有 `.grok-bot-cn-mail.json` / `.qqconnect.json` 会继续读）。不要把档位写进 `.env`。

## 附录：草稿与发送（不推荐作默认）

默认关。开了发送档，等于允许这个 Bot 用你的邮箱对外说话。白名单和确认卡只缩小爆炸半径。细则、多账号、工具表、FAQ：[docs/advanced.md](./docs/advanced.md)。约定：[SECURITY.md](./SECURITY.md)。

## 维护

修：在能连上 IMAP 的网络上，QQ / 163 / 126 / 腾讯企业邮登录坏了。不修：Gmail、grok.com 网页连接器、响应时限、Bot 云端禁止 `:993` / `:465` 的出口。先开 Issue。不接受「去掉发信确认卡」这类 PR。授权码、`.env`、发信白名单由你保管。
