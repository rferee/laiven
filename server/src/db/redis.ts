import Redis from 'ioredis';
import { env } from '../utils/env.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err.message);
});

redis.on('connect', () => {
  console.log('Redis connected');
});

export async function closeRedis(): Promise<void> {
  await redis.quit();
}
