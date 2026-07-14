// Recovery phrase (pos-prd.md §2). Set by the admin; it can reset any PIN when
// someone is locked out — there's no server to email a reset link from. Stored
// argon2-hashed (never plaintext), reusing the PIN hasher.

import { native } from "@/native";
import { getSettings, setSetting } from "./settings";
import { logAudit } from "./audit";

const KEY = "recovery_hash";

export async function hasRecoveryPhrase(): Promise<boolean> {
  const s = await getSettings();
  return Boolean(s[KEY]);
}

export async function setRecoveryPhrase(phrase: string, actorId: number): Promise<void> {
  const hash = await native.hashPin(phrase.trim());
  await setSetting(KEY, hash);
  await logAudit(actorId, "recovery_set", {});
}

export async function verifyRecoveryPhrase(phrase: string): Promise<boolean> {
  const s = await getSettings();
  if (!s[KEY]) return false;
  return native.verifyPin(phrase.trim(), s[KEY]);
}

/** Reset a user's PIN using the recovery phrase (no admin session needed). Verify
 *  the phrase first with verifyRecoveryPhrase. */
export async function resetPinViaRecovery(userId: number, newPin: string): Promise<void> {
  const hash = await native.hashPin(newPin);
  await native.execute("UPDATE users SET pin_hash = ? WHERE id = ?", [hash, userId]);
  await logAudit(null, "pin_reset", { user_id: userId, via: "recovery" });
}
