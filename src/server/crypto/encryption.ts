import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;
  if (!envKey) {
    // Fallback deterministic key for dev if unset, with warning
    console.warn('WARNING: ENCRYPTION_KEY not set in environment. Using default dev key.');
    return crypto.scryptSync('default_dev_fallback_secret', 'salt', 32);
  }
  if (envKey.length === 64) {
    return Buffer.from(envKey, 'hex');
  }
  return crypto.scryptSync(envKey, 'salt', 32);
}

/**
 * Encrypt a plaintext string or object to an encrypted string representation (hex: iv + tag + ciphertext)
 */
export function encryptSecret(plainText: string | object): string {
  const text = typeof plainText === 'object' ? JSON.stringify(plainText) : plainText;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt an encrypted string back to plaintext
 */
export function decryptSecret(encryptedPayload: string): string {
  try {
    const parts = encryptedPayload.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted payload format');
    }

    const [ivHex, tagHex, cipherTextHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(cipherTextHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err: any) {
    throw new Error(`Failed to decrypt secret: ${err.message}`);
  }
}

/**
 * Mask a secret string for safe UI display (Rule 8, I5.3)
 * E.g. "sk_test_51Mz0891abcdef" -> "sk_test_...cdef"
 */
export function maskSecret(secret: string): string {
  if (!secret) return '';
  if (secret.length <= 8) return '****';
  const prefix = secret.slice(0, 4);
  const suffix = secret.slice(-4);
  return `${prefix}...${suffix}`;
}

/**
 * Mask all values in a key-value secrets object
 */
export function maskCredentialsObject(creds: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(creds)) {
    masked[key] = maskSecret(value);
  }
  return masked;
}
