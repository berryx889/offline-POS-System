// License-key activation (v4). Format: SPT-XXXX-XXXX-CCCC, where CCCC is a
// checksum of the two middle groups.
//
// Honest limitation: this app is fully offline with no license server to call,
// so verifyLicenseKey() only checks the key's format/checksum locally. That is
// NOT real piracy protection — it has no revocation, no hardware/device
// binding, and anyone who reads this file can construct a key that passes.
// It exists to (a) catch typos/copy errors when a real key is entered, and
// (b) give the activation *flow* (install → enter key → verify → stored →
// first-time setup) a real seam to plug a genuine licensing server into
// later — see the marked spot below. Building that server is out of scope
// here; it needs hosting/provider decisions only the business owner can make.

const PREFIX = "SPT";
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GROUP_LEN = 4;

function checksum(groups: string[]): string {
  const s = groups.join("");
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    n = (n * 31 + s.charCodeAt(i) * (i + 1)) % 1_000_000_007;
  }
  let out = "";
  for (let i = 0; i < GROUP_LEN; i++) {
    out = ALPHABET[n % ALPHABET.length] + out;
    n = Math.floor(n / ALPHABET.length);
  }
  return out;
}

function randomGroup(): string {
  let out = "";
  for (let i = 0; i < GROUP_LEN; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return out;
}

/** Generate a key that passes verifyLicenseKey() — for seeding a demo key or
 *  for whoever issues keys by hand until a real activation server exists. */
export function generateLicenseKey(): string {
  const g1 = randomGroup();
  const g2 = randomGroup();
  return `${PREFIX}-${g1}-${g2}-${checksum([g1, g2])}`;
}

export function isValidLicenseKeyFormat(key: string): boolean {
  const parts = key.trim().toUpperCase().split("-");
  if (parts.length !== 4 || parts[0] !== PREFIX) return false;
  const [, g1, g2, cc] = parts;
  if (g1.length !== GROUP_LEN || g2.length !== GROUP_LEN || cc.length !== GROUP_LEN) return false;
  return checksum([g1, g2]) === cc;
}

export interface LicenseVerifyResult {
  valid: boolean;
  reason?: string;
}

/** Pluggable verification. Swap the body for a real online check once a
 *  licensing server exists:
 *
 *    const res = await fetch("https://license.example.com/verify", {
 *      method: "POST",
 *      body: JSON.stringify({ key, machineId }),
 *    });
 *    if (!res.ok) return { valid: false, reason: "Could not verify online." };
 *    return res.json();
 *
 *  Until then this only checks the format/checksum locally (see file header).
 */
export async function verifyLicenseKey(key: string): Promise<LicenseVerifyResult> {
  const normalized = key.trim().toUpperCase();
  if (!isValidLicenseKeyFormat(normalized)) {
    return { valid: false, reason: "That license key doesn't look right — check for typos." };
  }
  return { valid: true };
}
