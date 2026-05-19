/**
 * Client-side encryption using PBKDF2 + AES-256-GCM.
 * Both partners must share the same passphrase to encrypt/decrypt capsules.
 */

const SALT_LEN = 16;
const IV_LEN = 12;
const ITERATIONS = 100_000;

function arrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArray(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptText(plaintext: string, passphrase: string): Promise<string> {
  if (!window.isSecureContext) {
    throw new Error('Encryption requires a secure context (HTTPS or localhost).');
  }
  const salt = new Uint8Array(crypto.getRandomValues(new Uint8Array(SALT_LEN)));
  const iv = new Uint8Array(crypto.getRandomValues(new Uint8Array(IV_LEN)));

  const key = await deriveKey(passphrase, salt);
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, encoded);

  const result = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  result.set(salt, 0);
  result.set(iv, salt.length);
  result.set(new Uint8Array(ciphertext), salt.length + iv.length);

  return arrayToBase64(result);
}

export async function decryptText(ciphertextBase64: string, passphrase: string): Promise<string> {
  if (!window.isSecureContext) {
    throw new Error('Decryption requires a secure context (HTTPS or localhost).');
  }
  const data = base64ToArray(ciphertextBase64);

  const salt = data.slice(0, SALT_LEN);
  const iv = data.slice(SALT_LEN, SALT_LEN + IV_LEN);
  const ciphertext = data.slice(SALT_LEN + IV_LEN);

  const key = await deriveKey(passphrase, salt);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}
