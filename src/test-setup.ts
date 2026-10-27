import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "cn-mail-mcp-vitest-"));
process.env.CN_MAIL_MCP_ACCOUNTS_FILE = join(dir, "accounts.json");
