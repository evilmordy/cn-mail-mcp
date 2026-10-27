# 安全

cn-mail-mcp 是面向任意 MCP 客户端的 IMAP/SMTP 服务。默认权限是**只读**。邮箱里有重置链接和验证码。每封邮件正文都按不可信数据处理。没有能靠提示词完成的完美防护；控制在**服务器代码**里。

## 报告漏洞

使用 GitHub **Private vulnerability reporting**（Security → Report a vulnerability）。凭据泄漏、导致发信的注入、附件路径穿越，不要开公开 issue，也不要贴授权码。

## 不变式

1. 默认档位是 `read`（`.cn-mail-mcp.json`）。`delete` / `organize` / `manage` / `full` 没有实现。`draft` 和 `send` 要通过 `set_settings` 或 `cn-mail-mcp config` 显式打开。
2. `send` 存在设置文件里（`mode` + `send_allowlist`），不在 `.env`。收件人由代码检查。通过 `set_settings` 打开 send 必须有非空白名单，并且先经过 elicitation 确认。`CN_MAIL_MCP_ACCOUNTS` JSON 必须使用 `authCodeEnv`，不能内联 `authCode`。
3. SMTP 在服务器代码里分两步：第一次 `send_*` 只保存一次性 `confirm_token` 并返回预览，不连接 SMTP。第二次带上该 token 才发送。token 15 分钟过期、只能用一次，并且仍然要求档位 `send` 和白名单。打开 `send` / `allow_sensitive` 仍使用 MCP elicitation。`unbind_mailbox` 只解除绑定，不删除服务器邮件。`CN_MAIL_MCP_SEND_UNSAFE_NO_CONFIRM=1` 是测试用的危险开关，不是默认值。
4. FETCH 使用 ImapFlow `download`，发出的是 `BODY.PEEK`。未读保持未读。读文件夹用 `readOnly: true`（`EXAMINE`）。写入只包括向 `\Drafts` / `\Sent` 做 IMAP `APPEND`。
5. 先看信封再决定要不要下载正文。验证码、密码、找回类主题在下载 BODY 之前就分类。搜索结果会涂掉这些主题。`get_message`、附件、回复、转发都会拒绝它们。只有设置文件里的 `allow_sensitive`，或 elicitation 确认后的 `set_settings`，才能打开例外。本机 `config allow-sensitive on` 不弹确认卡。
6. 授权码不出现在工具结果、stdout 或结构化日志里。绑定页面的响应也不回显授权码。
7. stdout 只有 MCP JSON-RPC。日志走 stderr。发信审计记录账号、收件人、主题、message-id，不记录授权码。被拦截的邮件只记录 uid 和类别，不记录主题。
8. IMAP 和 SMTP 使用 TLS 1.2+，并校验证书。不要设置 `NODE_TLS_REJECT_UNAUTHORIZED=0`。
9. 拒绝私网和元数据上的 IMAP/SMTP 主机，包括 IPv6 回环、ULA、链路本地，以及解析到这些地址的名字。连接前会再查一次。可选的回环 HTTP(S) CONNECT 代理只能来自环境变量（`CN_MAIL_MCP_MAIL_PROXY`，或 `CN_MAIL_MCP_IMAP_PROXY`），不能来自工具参数。代理必须是 `http:` / `https:`，主机为 `127.0.0.1` / `localhost` / `::1`，且不能带用户名密码，也不接受 socks。邮件主机的字面量和被禁名字仍然检查；使用已校验的代理时，跳过 DNS A 记录私网检查，因为 CONNECT 把未解析的主机名交给代理。没有代理时，DNS 私网检查保持不变。
10. 返回的正文包在 `<untrusted-email>` 里，必须当数据。这个包裹不是授权边界。工具 JSON 同时设置 `untrusted: true`。
11. 附件类型有白名单。可执行文件、压缩包（`zip` / `tar` / `gz` / `7z` / `rar`）和 `eml` 会被拒绝。上限 2 MiB。原始 HTML 会转成文本，不会原样返回。
12. 工具 schema 不使用正则前瞻（不用 `z.string().email()`）。
13. `From` 是已绑定账号。没有 BCC 参数。SMTP 在滚动的一小时内最多 5 封，计数写在磁盘上，进程重启后仍然有效。
14. 回复的 `To` 取自原信的 Reply-To / From。转发的 `to` 必须由调用方提供且在白名单内，不会从正文里解析。
15. 没有邮件定时任务。stdio 进程随会话结束。

## 绑定凭据

按规范 2026-07-28，form elicitation 不收集授权码。授权码只经过 URL elicitation 指向的本机页面，或由用户自己写入 `.env` / 账号文件。账号文件权限为 `0600`。工具描述要求模型不要让用户把授权码贴进对话。详见 [docs/onboarding.md](./docs/onboarding.md)。

本机页面使用 `http://127.0.0.1` 而不是 HTTPS：监听地址只有回环，令牌一次性、有 CSRF 校验、提交或超时后关闭。这是 stdio 本机进程的例外，不是公网入口。

## 默认不会做的事

- SMTP 发送（需要设置文件里的 `mode: send` 和非空白名单，以及预览确认）
- 删除、移动或标记邮件。`unbind_mailbox` 只解除 MCP 绑定
- 再存一份邮箱副本
- 用邮件训练模型
- 接受 QQ/163 的网页登录密码
- 保证每一种秘密都被挡住（图片验证码、异常措辞、误报仍然存在）

打开 `send` 会让一个进程同时拥有私人邮件、不可信内容和对外 SMTP。白名单和确认只是缩小影响范围，不是安全证明。不接受去掉发信确认的 pull request。
