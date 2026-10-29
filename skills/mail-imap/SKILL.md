---
name: mail-imap
description: Enable IMAP/SMTP and create an authorization code (授权码) for QQ, 163, or 126 mail so cn-mail-mcp can read (and optionally draft/send). Never ask the user to paste the authorization code into chat.
---

# IMAP 授权码

cn-mail-mcp 只用 **IMAP 授权码**，不要网页登录密码，也不要让用户把授权码贴进对话。

## 绑定

优先调用 `add_mailbox`。

- 客户端声明了 form elicitation：只用它收集邮箱地址、备注、服务商。
- 客户端声明了 url elicitation：授权码由用户在本机 `127.0.0.1` 页面提交。`accept` 只表示同意打开页面；页面提交后再次调用才会完成绑定。
- 客户端缺少所需能力：把工具返回的步骤交给用户，让用户自己编辑 `.env` 或运行 `cn-mail-mcp accounts add`，然后调用 `verify_mailboxes` 或请用户运行 `cn-mail-mcp --check`。

不要读取账号文件或 `.env` 里的授权码。不要发明会把授权码打进命令行参数的启动方式。

## QQ / Foxmail

1. 打开 https://mail.qq.com → 设置 → 账号与安全 → 安全设置
2. 开启 IMAP/SMTP
3. 生成授权码
4. 服务器：`imap.qq.com:993`（按域名自动选择）

作废：同一页的授权码管理。改 QQ 密码会使授权码失效。

## 163 / 126

1. 网页邮箱 → 设置 → POP3/SMTP/IMAP → 开启 IMAP
2. 按提示生成客户端授权码
3. 163 在 LOGIN 之后必须发 IMAP `ID`。本服务默认会发。若仍报 `SELECT Unsafe Login`，先确认授权码是新的，不要改用 POP3。

## 解绑与更新

解绑调用 `unbind_mailbox`。不删除服务器上的邮件。

`get_settings` 里 `server.needs_restart` 为真时，请用户停止再启动 cn-mail-mcp。

## 不要做的

- 不要向用户索取授权码或网页密码
- 不要把授权码写进工具参数、仓库或聊天
- 不要用 POP3
- 不要为了连上而关闭 TLS 校验
- 不要在用户尚未同意时带上 `confirm_token` 发信
