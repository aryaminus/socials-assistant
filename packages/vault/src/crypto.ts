import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";

/**
 * Local token encryption: AES-256-GCM with a scrypt-derived key stored in
 * `~/.socials-assistant/key` (0600). The key file never contains plaintext tokens;
 * ciphertext blobs are safe at rest in the SQLite vault.
 */
export class SecretBox {
  private key: Buffer;

  constructor(keyFile: string) {
    if (existsSync(keyFile)) {
      this.key = readFileSync(keyFile);
      if (this.key.length !== 32) {
        throw new Error(`Corrupt key file (expected 32 bytes): ${keyFile}. Delete it to re-create (stored tokens will be unreadable).`);
      }
    } else {
      mkdirSync(join(keyFile, ".."), { recursive: true });
      const salt = randomBytes(16);
      this.key = scryptSync(randomBytes(32).toString("hex"), salt, 32);
      writeFileSync(keyFile, this.key, { mode: 0o600 });
      chmodSync(keyFile, 0o600);
    }
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([salt0(), iv, tag, enc]).toString("base64");
  }

  decrypt(blob: string): string {
    const raw = Buffer.from(blob, "base64");
    // skip 1-byte format version
    const iv = raw.subarray(1, 13);
    const tag = raw.subarray(13, 29);
    const data = raw.subarray(29);
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  }

  equals(other: SecretBox): boolean {
    return this.key.length === other.key.length && timingSafeEqual(this.key, other.key);
  }
}

function salt0(): Buffer {
  return Buffer.from([0x01]); // format version byte
}

export interface StoredCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string; // ISO
  scope?: string;
  tokenType?: string;
  /** Platform-specific extras (tiktok open_id, google project id, meta page/ig ids...). */
  extra?: Record<string, unknown>;
}
