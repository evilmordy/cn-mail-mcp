# Changelog

## 0.2.0

- 定位改为通用 stdio MCP 服务，供 Cursor、VS Code、Claude Desktop 和其他客户端使用。
- **破坏性变更：** 不再提供 CLI 名 `qqconnect`、`grok-bot-cn-mail`。不再读取 `QQCONNECT_*`、`CNMAIL_*`、`.qqconnect.json`、`.grok-bot-cn-mail.json` 以及对应的发信计数文件。不再根据 `SAND_EGRESS_TUNNEL_PROXY_ADDR` 自动设置代理，也不再查找 `GROK_PLUGIN_ROOT`。删除 `plugin/`。若仍有旧设置文件，请复制为 `.cn-mail-mcp.json`；旧环境变量请改为 `CN_MAIL_MCP_*` 或 `MAIL_*`。
- 绑定邮箱走 MCP **2026-07-28** elicitation：form 只收集地址、备注和服务商；授权码经 URL elicitation 交给仅监听 `127.0.0.1` 的一次性页面，写入权限为 `0600` 的本机账号文件，并在保存后验证 IMAP。客户端缺少所需能力时，返回手动配置步骤。`MAIL_*` / `.env` / `CN_MAIL_MCP_ACCOUNTS` 仍然可用。
- 新增工具 `add_mailbox`、`verify_mailboxes`，以及 CLI `accounts list|path|add|verify|unbind`。没有邮箱时服务也能启动，以便先完成绑定。
- 保留既有安全不变式：默认只读、`BODY.PEEK`、验证码拦截、HTML 清洗、附件白名单、发送需档位 + 白名单 + 预览确认（`confirm_token`）。回环 HTTP CONNECT 代理仍只接受 `CN_MAIL_MCP_MAIL_PROXY`（或 `CN_MAIL_MCP_IMAP_PROXY`），且不能由工具参数设置。

## 0.1.0

- 默认只读的 IMAP MCP：QQ / 163 / 126 / 腾讯企业邮。
- 草稿和 SMTP 发送需显式开档；发送要白名单和确认。
- `pnpm test` / CI 用假后端；真登录用本地 `pnpm check`。
