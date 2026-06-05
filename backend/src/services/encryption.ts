import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ENCRYPTION_KEY = process.env.SPOTIFY_TOKEN_ENCRYPTION_KEY || null;
export const isEncryptionEnabled = !!(ENCRYPTION_KEY && ENCRYPTION_KEY.length >= 32);

let KEY: Buffer | null = null;
if (isEncryptionEnabled) {
  KEY = scryptSync(ENCRYPTION_KEY!, 'rina-salt', 32);
} else {
  console.warn('[Encryption] SPOTIFY_TOKEN_ENCRYPTION_KEY missing or short — Spotify tokens will be stored plaintext');
}

export function encrypt(text: string): string | null {
  if (!isEncryptionEnabled || !KEY) {
    console.warn('[Encryption] Encryption disabled, cannot encrypt');
    return null;
  }
  const iv = randomBytes(16);
  const cipher = createCipheriv('aes-256-gcm', KEY, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return iv.toString('base64') + ':' + authTag.toString('base64') + ':' + encrypted.toString('base64');
}

export function decrypt(encryptedText: string): string | null {
  if (!isEncryptionEnabled || !KEY) {
    console.warn('[Encryption] Encryption disabled, cannot decrypt');
    return null;
  }
  const [ivB64, authTagB64, dataB64] = encryptedText.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const encrypted = Buffer.from(dataB64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', KEY, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}
