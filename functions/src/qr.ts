// functions/src/qr.ts
// AES-256 token encryption and decryption helpers for QR codes.

import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';

/**
 * Encrypts a plaintext payload using AES-256-CBC
 */
export function encryptToken(payload: string, secretKey: string): string {
  // Key must be exactly 32 bytes (hash if needed)
  const key = crypto.createHash('sha256').update(secretKey).digest();
  const iv = crypto.randomBytes(16);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(payload, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  // Return iv and ciphertext joined by a colon
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypts an encrypted token back into plaintext
 */
export function decryptToken(encryptedToken: string, secretKey: string): string {
  const parts = encryptedToken.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid token format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = parts[1]; // Keep as hex string
  const key = crypto.createHash('sha256').update(secretKey).digest();

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
