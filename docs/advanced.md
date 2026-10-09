# 进阶说明

主文档只覆盖只读安装：[README.md](../README.md)。

## 主机

| 邮箱 | IMAP |
|---|---|
| `…@qq.com` / `…@foxmail.com` / `…@vip.qq.com` | `imap.qq.com:993` |
| `…@163.com` / `…@yeah.net` | `imap.163.com:993` |
| `…@126.com` | `imap.126.com:993` |
| `…@公司.exmail.qq.com` | `imap.exmail.qq.com:993` |

## 草稿与发送

不推荐作默认。`.env` 只放地址和授权码。档位在 `.cn-mail-mcp.json`（也会读已有的 `.grok-bot-cn-mail.json` / `.qqconnect.json`）。

网页邮箱须 **SMTP 已开启**（和 IMAP 同一页）。白名单为空不能进入 send。真发信还要确认卡片。不要用 `grok --always-approve`。

对 Grok 说「打开草稿」或「打开发送，白名单只有我自己」。或：

```bash
node dist/index.js config show
node dist/index.js config set-mode draft
node dist/index.js config set-mode send --allow you@qq.com
node dist/index.js setup
```

服务器强制：回复 To 取自原信；转发目标必须你指定且在白名单；无 BCC；滚动一小时最多 5 封（记在磁盘上）；验证码信不能读、回、转。打开 `allow_sensitive` 要确认卡（或本机 `config allow-sensitive on` / 手改 JSON）。

发信：第一次 `send_*` 只返回预览和 `confirm_token`；用户说发后再带 token 调一次才走 SMTP。

`pnpm build` 后新开会话（或 `/mcps` 对短名按 `r`）。改档位不用 build。

## 多账号

不要把地址或授权码发进聊天。`list_accounts` / `get_settings` 会返回下一槽的变量名（`add_mailbox`）。

**Grok Bot：** 在插件密钥框填写 `MAIL_USER_2`、`MAIL_AUTH_CODE_2`，可选 `MAIL_ACCOUNT_ID_2`。填好后重载 cn-mail-mcp。不要改仓库、不要写 `.env`、不要改 MCP 启动命令。

**本机 TUI / `.env`：** 第二封用 `_2`：

```
MAIL_USER=me@qq.com
MAIL_AUTH_CODE=……
MAIL_USER_2=work@163.com
MAIL_AUTH_CODE_2=……
MAIL_ACCOUNT_ID_2=work
```

写好 `.env` 后不必杀掉 MCP：下次 `list_accounts` 会重新读环境变量。

### 解绑

对 Bot 说「解绑某某邮箱」。正确路径是 `unbind_mailbox` + 确认卡，不是改仓库。

- **Grok Bot：** 确认后在插件密钥框删除该号的 `MAIL_USER_*` / `MAIL_AUTH_CODE_*`（见工具返回的 `cleared_env`），再重载 cn-mail-mcp。
- **本机：** `node dist/index.js config unbind <account_id>`，或让工具从 `.env` 删掉这些键。不必杀 MCP。

这不会删除 QQ/163 服务器上的邮件。JSON 多账号（`CN_MAIL_MCP_ACCOUNTS` / `QQCONNECT_ACCOUNTS`）请在密钥框改 JSON 后重载。

JSON 里只放地址，授权码指向环境变量名：`authCodeEnv`，禁止内联 `authCode`。自建邮箱须公网 `host`、993、TLS。内网和云元数据 IP 会被拒绝。

## 工具

草稿/发送在未开档时调用会失败，并提示 `set_settings`。

| 工具 | 需要 | 干什么 |
|---|---|---|
| `list_accounts` | 默认 | 列出已绑定邮箱（不含密钥）；含 add_mailbox / remove_mailbox 提示 |
| `unbind_mailbox` | 确认卡 | 解绑一个 MCP 账号，不删服务器邮件 |
| `list_folders` | 默认 | 列出文件夹 |
| `search_messages` | 默认 | 按发件人/主题/日期/未读搜索，只返回信封 |
| `get_message` | 默认 | 读一封（纯文本，包在 `<untrusted-email>` 里） |
| `list_attachments` | 默认 | 附件名、类型、大小 |
| `get_attachment` | 默认 | 按类型白名单下载，最大 2 MiB |
| `save_draft` | `draft` 或 `send` | 新邮件进草稿箱 |
| `save_reply_draft` | `draft` 或 `send` | 回复草稿；To 由服务器从原信填写 |
| `send_email` / `send_reply` / `send_forward` / `send_draft` | `send` + 白名单 + 确认卡 | SMTP |
| `get_settings` / `set_settings` | 默认 | 看/改档位；升到 send 要白名单 + 确认卡 |

没有 BCC。没有让模型直接敲 IMAP/SMTP 的入口。

## 更新 MCP

先停止 cn-mail-mcp，再换文件，再启动。不要在 connected 时删掉插件目录。`get_settings` 的 `server.needs_restart` 为真时，停再开即可，不是 IMAP 坏了。

## 常见问题

**改了 `.env` 但提示没配置邮箱。** 文件须在仓库根目录，名字就是 `.env`。Grok 里用 `-e` 写过的同名变量会盖住文件。

**`pnpm check` 认证失败。** 授权码不要带空格；网页里 IMAP 须开启；改过登录密码就重新生成授权码。

**163 提示 Unsafe Login / 找 kefu@188.com。** 本程序会发 IMAP `ID`。仍失败时到网页重新开 IMAP 并换新授权码。不要改 POP3。

**`grok mcp add` 报 `Invalid environment variable format: 'MAIL_USER'`。** 必须 `-e "MAIL_USER=${MAIL_USER}"`，不能只写 `-e MAIL_USER`。

**Bot 说找不到工具。** Grok Build 要新开会话；Grok Bot 到插件页确认短名在 Yours 里。本机先 `pnpm check`。

**我想在 grok.com 网页里用。** 不行。不要打 ngrok。

**会不会把未读标成已读？** 不会。`BODY.PEEK` + `EXAMINE`。

**主题是 `[redacted:otp]`。** 服务器拦截验证码/重置类邮件。要原文去网页邮箱。
