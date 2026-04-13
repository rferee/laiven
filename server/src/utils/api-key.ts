import { createHmac, randomUUID } from 'crypto';
import { env } from './env.js';

export function generateApiKey(): { rawKey: string; keyHash: string; keyPrefix: string } {
  const rawKey = `lv_${randomUUID().replace(/-/g, '')}`;
  return {
    rawKey,
    keyHash: hashApiKey(rawKey),
    keyPrefix: rawKey.substring(0, 8),
  };
}

export function hashApiKey(rawKey: string): string {
  return createHmac('sha256', env.SESSION_SECRET).update(rawKey).digest('hex');
}
