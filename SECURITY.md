# Security

grok-bot-cn-mail is an IMAP MCP server for Grok Bot. Default permission is **read**. Mailboxes are secret stores (password resets, magic links, 2FA codes). Treat every email body as hostile. There is no perfect defense against prompt injection; controls live in **server code**, not in the model prompt.

## Report a vulnerability

Use GitHub **Private vulnerability reporting** (Security → Report a vulnerability). Do not open a public issue for credential leaks, injection that causes sends, or path traversal on attachments.

## Invariants

1. Default mode is `read` (`.grok-bot-cn-mail.json`, or `.qqconnect.json` if that file already exists). `delete` / `organize` / `manage` / `full` are not implemented. `draft` and `send` are opt-in via `set_settings` or `qqconnect config`.
2. `send` mode is stored in the settings file (`mode` + `send_allowlist`), not in `.env`. Recipients are checked in code, not by the model. Enabling send via `set_settings` requires a non-empty allowlist and elicitation. `QQCONNECT_ACCOUNTS` JSON must use `authCodeEnv`, never an inline `authCode`.
3. SMTP send is two-step in server code: the first `send_*` call stores a one-time `confirm_token` and returns a preview (no SMTP). A second call with that token sends. Tokens expire (15 min), are single-use, and still require mode `send` plus the allowlist. Enabling `send` / `allow_sensitive` still uses MCP elicitation. `unbind_mailbox` is the tool call itself (does not delete server mail). `QQCONNECT_SEND_UNSAFE_NO_CONFIRM=1` is a documented foot-gun for tests, not a default.
4. FETCH uses ImapFlow `download`, which issues `BODY.PEEK`. Unread mail stays unread. Read folders open with `readOnly: true` (`EXAMINE`). Write is only IMAP `APPEND` to `\Drafts` / `\Sent`.
5. Envelope-first DLP: OTP/password/recovery subjects are classified **before** BODY is downloaded. Search results redact those subjects. `get_message` / attachments / reply / forward refuse them. Override with `allow_sensitive` in the settings file, or via `set_settings` after elicitation (CLI `config allow-sensitive on` is local and does not elicit).
6. Authorization codes never appear in tool results, stdout, or structured logs.
7. Stdout is MCP JSON-RPC only. Logs go to stderr. Send audit logs account, to, subject, message-id — never the auth code. Blocked mail logs uid + class, not the subject.
8. TLS 1.2+ with certificate verification for IMAP and SMTP. No `NODE_TLS_REJECT_UNAUTHORIZED=0`.
9. Private / metadata IMAP and SMTP hosts are rejected, including IPv6 loopback/ULA/link-local and names that resolve to those addresses. Checked again at connect time. Optional loopback-only HTTP(S) CONNECT proxy for IMAP/SMTP may be set via env (`QQCONNECT_MAIL_PROXY`, legacy `QQCONNECT_IMAP_PROXY`, or auto `SAND_EGRESS_TUNNEL_PROXY_ADDR` on the Grok Bot box). Proxy is never a tool argument. Proxy URL must be `http:`/`https:` to `127.0.0.1` / `localhost` / `::1` with no credentials (no socks). Mail-host *literal* / blocked-name checks still apply; when a validated proxy is in use, the DNS A-record privacy check is skipped because CONNECT passes the hostname unresolved to the proxy (local fake-IP DNS is meaningless for the tunnel). Without a proxy, DNS privacy checks are unchanged.
10. Email bodies that are returned are wrapped in `<untrusted-email>` and must be treated as data. Wrapping is not an authorization boundary. Tool JSON also sets `untrusted: true`.
11. Attachment types are allowlisted; executables, archives (`zip`/`tar`/`gz`/`7z`/`rar`), and `eml` are rejected; 2 MiB cap. Raw HTML is converted to text and never returned.
12. Tool schemas do not use regex lookaheads (`z.string().email()`).
13. `From` is the linked account. There is no BCC parameter. SMTP send cap is 5 per rolling hour, persisted on disk (survives Grok process restarts).
14. Reply `To` is taken from the original Reply-To/From on the server. Forward `to` must be supplied and allowlisted; it is never parsed out of the body.
15. No mail scheduler. stdio dies with the session.

## What this server does not do by default

- SMTP send (needs `mode: send` in the settings file and an allowlist)
- Delete, move, or flag mail. `unbind_mailbox` only drops the MCP binding (plus listed env keys); it does not delete messages on the server.
- Store a second copy of your mailbox
- Train models on mail
- Accept a QQ/163 web login password
- Guarantee that every secret is hidden (image OTPs, unusual wording, and DLP false positives remain)

Enabling `send` gives one process private mail, untrusted content, and outbound SMTP (Willison's lethal trifecta). The allowlist plus elicitation card shrink the blast radius; they are not a proof of safety. Do not run send mode with Grok `--always-approve`. Pull requests that remove send confirmation will be rejected.
