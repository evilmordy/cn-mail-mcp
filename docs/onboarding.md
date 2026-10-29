# 绑定邮箱

本服务按 MCP 规范 **2026-07-28** 收集凭据。参考：

- [Elicitation](https://modelcontextprotocol.io/specification/2026-07-28/client/elicitation)（2026-07-28）
- [Multi Round-Trip Requests](https://modelcontextprotocol.io/specification/2026-07-28/basic/patterns/mrtr)（2026-07-28）
- TypeScript SDK：[`inputRequired`](https://ts.sdk.modelcontextprotocol.io/v2/servers/input-required.html)

URL elicitation 在 `2025-11-25` 引入。`2026-07-28` 起，服务器在处理 `tools/call` 时返回 `InputRequiredResult`，而不是再向客户端推送请求。旧客户端由 SDK 的 legacy shim 转成当时的 `elicitation/create`。

## 客户端能力

`2026-07-28` 的客户端在**每次请求**的 `_meta["io.modelcontextprotocol/clientCapabilities"]` 里声明能力，而不是只在 `initialize` 时声明一次。`2025` 连接仍使用 `initialize` 的 capabilities。空的 `elicitation: {}` 只表示支持 form。

| 声明 | 服务器行为 |
|---|---|
| `form` + `url` | form 收集地址、备注、服务商；URL 打开本机页面收集授权码 |
| 只有 `form` | 可以收集地址；授权码改为手动配置说明 |
| 只有 `url` | 请助手在对话里询问地址（地址不是授权码），再打开本机页面 |
| 都没有 | 返回手动步骤，不收集授权码 |

form 模式的 schema 是扁平对象，字段只有 `address`、`label`、`provider`。没有授权码、密码或 token 字段。规范要求：服务器不得用 form 收集密码、API key 一类密钥。

## URL 模式

`inputRequired.elicitUrl` 的 `url` 形如 `http://127.0.0.1:<随机端口>/bind?t=<一次性令牌>`。

- 令牌是随机的，URL 里没有邮箱地址，也没有授权码。
- 页面只绑定 `127.0.0.1`。非回环来源、错误的 `Host`、错误的 `Origin` 会被拒绝。
- 表单带 CSRF 字段。令牌和 CSRF 都只接受一次。
- 提交或超时（5 分钟）后页面失效，没有待处理会话时监听端口会关闭。
- 成功页不回显授权码。
- `action: "accept"` 只表示用户同意打开 URL，不表示授权码已经提交。服务器查看本机会话：还没提交就再返回一次 URL elicitation；已经提交才验证 IMAP。
- 跨轮次状态放在签名的 `requestState` 里，内容只有会话 id。编码是 HMAC，不是加密，所以这里不放授权码。

规范写了非开发环境应使用 HTTPS。这里的页面是本机 stdio 进程的回环地址，密钥不出这台机器，因此使用 `http://127.0.0.1`。这不是一个可从公网打开的 URL。

同一用户的绑定方式：一次性令牌只通过这次 elicitation 交给当前客户端，页面只接受来自 `127.0.0.1` 的请求。这是本地 stdio 进程能做的对应措施；它不是远程 OAuth 的会话 cookie。

## 保存与验证

授权码写入账号文件后立刻做 IMAP 登录。失败则删除这条记录，工具结果里的错误会抹掉授权码文本。成功时结果只有 id、地址、服务商和主机。

文件权限为 `0600`，目录为 `0700`。若发现文件权限过宽，读取前会收紧到 `0600`。没有使用系统钥匙串：那需要额外的原生依赖。

`MAIL_USER` / `MAIL_AUTH_CODE` 和 `CN_MAIL_MCP_ACCOUNTS` 仍然有效。本机账号文件里已有的地址，同地址的环境变量条目会被跳过。

## 手动回退

工具结果会包含这些步骤，且不会包含授权码：

1. 在邮箱网页生成 IMAP 授权码。
2. 在自己的终端运行 `cn-mail-mcp accounts add`（不是交互终端时会直接拒绝，避免从管道读入授权码），或编辑 `.env` / 账号文件。
3. 运行 `cn-mail-mcp --check`，或让助手调用 `verify_mailboxes`。

助手不应读取账号文件或 `.env` 中的授权码，也不应要求用户把授权码贴进对话。
