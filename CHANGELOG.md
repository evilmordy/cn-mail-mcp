# Changelog

## Unreleased

- **Rename / brand:** public name is `cn-mail-mcp` (npm package, MCP short name, primary CLI bin). Deprecated CLI aliases: `grok-bot-cn-mail`, `qqconnect`. Settings prefer `.cn-mail-mcp.json` (still reads legacy files). Env: prefer `CN_MAIL_MCP_*` (also `CNMAIL_*`); `QQCONNECT_*` still accepted. GitHub repo path may remain `evilmordy/cn-mail-mcp` until renamed.
- 可选本机回环 HTTP CONNECT 代理（`CN_MAIL_MCP_MAIL_PROXY` / `QQCONNECT_MAIL_PROXY` 等，或自动用 `SAND_EGRESS_TUNNEL_PROXY_ADDR`）：仅 http(s)+loopback、无凭据；工具参数不可设；经代理时跳过邮件主机 DNS 私网检查（字面量仍拦）。
- 打开 `allow_sensitive` 要确认卡（本机改 JSON / `config allow-sensitive on` 除外）。
- 拒绝收件人和 RFC822 头里的 CR/LF。
- 附件下载与读信走同一套验证码拦截；IMAP 下载有字节上限。
- `--check` 与运行时一样拒绝解析到私网的主机。
- 发草稿时按与新邮件相同的规则解析 To/Cc；确认卡主题与实际发出一致。
- 发信计数先写临时文件再 rename，避免半截 JSON。
- 设置文件不是合法 JSON 时记日志并回退只读。
- 工具参数里 UID 必须是正整数，附件 part 必须是点分数字。
- 加邮箱：`list_accounts` 给出下一槽变量名；Grok Bot 走密钥框，禁止改仓库或启动命令。`.env` 变更在下次 list 时热加载，不必杀 MCP。
- 解绑邮箱：`unbind_mailbox` + 确认卡；不删服务器邮件。Grok Bot 还需在密钥框删变量并重载；本机可改 `.env` 或 `config unbind`。
- 更新：`get_settings.server.needs_restart` 表示磁盘上的脚本已变，停再开 cn-mail-mcp，不要当邮箱故障排查。
- 发信确认卡：Accept 即确认（不必再勾 confirm）；宿主 cancel 时改走 inputRequired，避免 Grok Bot 秒取消。
- 确认卡去掉 confirm 勾选：Grok 未勾选会提交 `confirm: false`，点 Accept 仍被当成取消。
- 发信确认改为 `inputRequired`，不再在工具里嵌套 `elicitInput`。Grok Bot 的「始终允许」是 Auto-review，嵌套 elicitation 会被 Decline。
- 发信两步：预览 + `confirm_token`，用户同意后再发送。Grok Bot 可在对话里完成，不依赖 MCP 确认卡。

## 0.1.0

- 默认只读的 IMAP MCP：QQ / 163 / 126 / 腾讯企业邮。
- 草稿和 SMTP 发送需显式开档；发送要白名单和确认卡。
- `pnpm test` / CI 用假后端；真登录用本地 `pnpm check`。
