# cn-mail-mcp

给任意 MCP 客户端用的 IMAP/SMTP 服务器，覆盖 QQ、163、126 和腾讯企业邮。默认**只读**。

授权码放在本机账号文件或 `.env`，不要写进 git，不要发给模型，不要出现在工具结果或日志里。

> 实验项目，不是各家官方邮箱连接器。Gmail / Outlook 请继续用官方连接器。安全问题走 [Private vulnerability reporting](https://github.com/evilmordy/cn-mail-mcp/security/advisories/new)，不要在公开 issue 里贴授权码。

## 快速开始

需要 Node.js 22+ 和 pnpm。

```bash
pnpm install
pnpm build
```

### 获取 IMAP 授权码

第三方客户端不能使用网页登录密码，只要 IMAP **授权码**。

1. **QQ / Foxmail**：https://mail.qq.com → 设置 → 账号与安全 → 安全设置 → 开启 IMAP/SMTP → 生成授权码。
2. **163 / 126**：网页邮箱 → 设置 → POP3/SMTP/IMAP → 开启 IMAP → 按提示生成客户端授权码。163 登录后必须发 IMAP `ID`，本服务默认会发。
3. **腾讯企业邮**：开启 IMAP/SMTP 后使用客户端专用密码。主机为 `imap.exmail.qq.com:993` / `smtp.exmail.qq.com:465`。

更细的步骤见 [skills/mail-imap/SKILL.md](./skills/mail-imap/SKILL.md)。

### 最小配置

推荐先不把授权码写进客户端配置。把下面任一客户端配好并重启后，对助手说「绑定邮箱」。支持的客户端会：

1. 用 form elicitation 收集邮箱地址、备注、服务商（不含授权码）；
2. 用 URL elicitation 打开只监听 `127.0.0.1` 的一次性页面，让你在浏览器里填写授权码；
3. 把授权码写入本机 `0600` 账号文件，登录 IMAP，只回报成功或失败。

账号文件默认在 `$XDG_CONFIG_HOME/cn-mail-mcp/accounts.json`，否则是 `~/.config/cn-mail-mcp/accounts.json`（Windows 为 `%APPDATA%\cn-mail-mcp\accounts.json`）。查看路径：`node dist/index.js accounts path`。

若客户端没有对应的 elicitation 能力，助手会给出手动步骤。你也可以自己做：

```bash
cp .env.example .env
# 编辑 .env：MAIL_USER 与 MAIL_AUTH_CODE，等号两边不要空格
pnpm check
```

`pnpm check` 只在运行命令的这台机器上登录 IMAP，然后退出。成功说明这台机器和授权码可用。

终端交互绑定（授权码只在终端输入，不要贴进对话）：

```bash
node dist/index.js accounts add
node dist/index.js accounts list
node dist/index.js --check
```

## 客户端配置

把 `/ABS/PATH/cn-mail-mcp` 换成仓库绝对路径。配置里不要写授权码。

### Cursor

文件：项目 `.cursor/mcp.json`，或全局 `~/.cursor/mcp.json`。

stdio 字段以官方说明为准：`type` 必填，另有 `command`、`args`、`env`、`envFile`（[Cursor MCP](https://cursor.com/docs/mcp)）。

```json
{
  "mcpServers": {
    "cn-mail-mcp": {
      "type": "stdio",
      "command": "node",
      "args": ["/ABS/PATH/cn-mail-mcp/dist/index.js"],
      "envFile": "${workspaceFolder}/.env"
    }
  }
}
```

`envFile` 只在你打算用 `.env` 时需要。只用本机账号文件时可以删掉这一行。

### VS Code

文件：工作区 `.vscode/mcp.json`（用户级用命令面板 “MCP: Open User Configuration”）。顶层键是 `servers`，stdio 的 `type` 必填（[VS Code MCP configuration](https://code.visualstudio.com/docs/agents/reference/mcp-configuration)）。

```json
{
  "servers": {
    "cn-mail-mcp": {
      "type": "stdio",
      "command": "node",
      "args": ["/ABS/PATH/cn-mail-mcp/dist/index.js"],
      "envFile": "${workspaceFolder}/.env"
    }
  }
}
```

### Claude Desktop

官方快速开始使用 `mcpServers` + `command` + `args`，示例里没有 `type`（[Connect to local MCP servers](https://modelcontextprotocol.io/quickstart/user)）。配置文件：

- macOS：`~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows：`%APPDATA%\Claude\claude_desktop_config.json`

改完后完全退出并重启 Claude Desktop。不要把授权码写进这个 JSON。

```json
{
  "mcpServers": {
    "cn-mail-mcp": {
      "command": "node",
      "args": ["/ABS/PATH/cn-mail-mcp/dist/index.js"]
    }
  }
}
```

### 通用 stdio

与 Claude Desktop 相同的 `mcpServers` 形状，适用于其他本地 stdio 客户端：

```json
{
  "mcpServers": {
    "cn-mail-mcp": {
      "command": "node",
      "args": ["/ABS/PATH/cn-mail-mcp/dist/index.js"]
    }
  }
}
```

stdout 只走 MCP JSON-RPC。日志在 stderr。

## 多账号

再绑第 2、第 3 个邮箱：再调用一次 `add_mailbox`，或在终端运行 `accounts add`。

手动 `.env` 时用后缀 `_2`、`_3`：

```
MAIL_USER=me@qq.com
MAIL_AUTH_CODE=
MAIL_USER_2=work@163.com
MAIL_AUTH_CODE_2=
MAIL_ACCOUNT_ID_2=work
```

`list_accounts` 只返回 id、地址、服务商和来源，不含授权码。多个邮箱时，后续工具要带 `account_id`。

解绑：`unbind_mailbox`，或 `node dist/index.js accounts unbind <account_id>`。这只解除本机绑定，不删除服务器上的邮件。

JSON 多账号仍可用 `CN_MAIL_MCP_ACCOUNTS`，但必须用 `authCodeEnv` 指向环境变量，不能内联 `authCode`。

## 工具

| 工具 | 作用 |
|---|---|
| `add_mailbox` | 绑定邮箱。禁止向用户索取授权码 |
| `list_accounts` | 列出已绑定邮箱，不含授权码 |
| `unbind_mailbox` | 解除绑定，不删服务器邮件 |
| `verify_mailboxes` | 登录检查，只回报成功或失败 |
| `list_folders` / `search_messages` | 列文件夹 / 按信封搜索 |
| `get_message` | 读一封。正文在 `<untrusted-email>` 里，`BODY.PEEK` 不标已读 |
| `list_attachments` / `get_attachment` | 附件元数据 / 按白名单下载（最大 2 MiB） |
| `save_draft` / `save_reply_draft` | 草稿。需要档位 `draft` 或 `send` |
| `send_email` / `send_reply` / `send_forward` / `send_draft` | 先返回预览和 `confirm_token`，用户同意后再带 token 发送 |
| `get_settings` / `set_settings` | 查看或修改档位。打开 `send` 或 `allow_sensitive` 需要确认 |

档位在 `.cn-mail-mcp.json`（示例见 [.cn-mail-mcp.example.json](./.cn-mail-mcp.example.json)），不要写进 `.env`。默认 `read`。打开发送：

```bash
node dist/index.js config set-mode send --allow you@qq.com
```

或让助手调用 `set_settings`。`mode=send` 必须带非空白名单，并且先经过用户可见的确认。第一次 `send_*` 不发信，只给出预览；用户明确同意后，第二次调用才带 `confirm_token` 走 SMTP。

## 安全

- 默认只读。删除、移动、改旗标都没有实现。
- 正文是不可信数据。验证码 / 重置类邮件显示为 `[redacted:otp]`，正文不会下载。
- 读信使用 `BODY.PEEK`，文件夹以 `EXAMINE` 只读打开。
- 发送默认关闭。需要档位 `send`、收件人白名单，以及预览确认。不接受去掉发信确认的改动。
- 授权码、网页密码不要进入 git、模型上下文、工具结果或日志。

细节见 [SECURITY.md](./SECURITY.md)。绑定流程如何对应 MCP 规范见 [docs/onboarding.md](./docs/onboarding.md)。

## 故障排除

- **`pnpm check` 认证失败**：授权码不要带空格；网页里 IMAP 须开启；改过登录密码后要重新生成授权码。
- **163 `Unsafe Login`**：确认授权码是新的。不要改用 POP3。
- **没有预设主机**：地址不是 QQ / 163 / 126 / 企业邮时，在 `.env` 里设置公网 `MAIL_HOST`（993）和 `MAIL_SMTP_HOST`（465）。内网和云元数据地址会被拒绝。
- **工具列表对不上**：看 `get_settings` 的 `server.needs_restart`。为真就停掉再启动 cn-mail-mcp。
- **改了 `.env` 仍提示没配置**：文件要叫 `.env`，等号两边不要空格。已经在环境里的同名变量不会被文件覆盖。`list_accounts` 会重新读 `.env`。

## 限制

客户端能不能在对话之外安全收下授权码，取决于它有没有声明 MCP elicitation 的 `url` 模式（`form` 按规范不能用来收集授权码）。托管或云端环境可能拦截 IMAP `993` 和 SMTP `465`；可选的本机回环 HTTP CONNECT 代理（`CN_MAIL_MCP_MAIL_PROXY`）只有在代理自己能到达这两个端口时才有用，它不会把 IMAP 改到 `443`。

## 开发

```bash
pnpm typecheck
pnpm test
pnpm knip
```

`pnpm test` 使用假邮箱后端，不登录真 IMAP。真登录用本地 `pnpm check`。
