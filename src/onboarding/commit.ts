import { logInfo, scrubSecrets } from "../log.js";
import { loadAccounts, materializeAccount, type Account, type AccountProfile } from "../config/accounts.js";
import { removeStoredAccount, upsertStoredAccount } from "../config/store.js";

export type LoginVerify = (account: Account) => Promise<{ ok: boolean; error?: string }>;

export type CommitResult = {
  ok: boolean;
  id?: string;
  address?: string;
  provider?: string;
  host?: string;
  error?: string;
};

/**
 * Save an authorization code to the local 0600 store, then verify IMAP login.
 * On failure the record is removed. The returned object never includes the code.
 */
export async function commitMailbox(
  profile: AccountProfile,
  authCode: string,
  verify: LoginVerify,
): Promise<CommitResult> {
  const code = authCode.trim();
  if (!code || code.length > 256 || /[\r\n]/.test(code)) {
    return { ok: false, error: "授权码为空或含有换行，未保存。" };
  }
  let account: Account;
  try {
    const existing = loadAccounts({ allowEmpty: true }).map((a) => a.id);
    account = materializeAccount(profile, code, existing);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: scrubSecrets(message, [code]) };
  }
  if (loadAccounts({ allowEmpty: true }).some((a) => a.address.toLowerCase() === account.address.toLowerCase())) {
    return { ok: false, id: account.id, address: account.address, error: "该邮箱地址已经绑定。" };
  }
  upsertStoredAccount({
    id: account.id,
    address: account.address,
    authCode: code,
    label: account.label,
    provider: account.preset.provider,
  });
  let checked: { ok: boolean; error?: string };
  try {
    checked = await verify(account);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    checked = { ok: false, error: message };
  }
  if (!checked.ok) {
    removeStoredAccount(account.id);
    logInfo("mailbox.bind_failed", { id: account.id, provider: account.preset.provider });
    return {
      ok: false,
      id: account.id,
      address: account.address,
      error: scrubSecrets(checked.error ?? "IMAP 登录失败，授权码未保留。", [code]),
    };
  }
  logInfo("mailbox.bound", { id: account.id, provider: account.preset.provider, source: "store" });
  return {
    ok: true,
    id: account.id,
    address: account.address,
    provider: account.preset.provider,
    host: account.host,
  };
}
