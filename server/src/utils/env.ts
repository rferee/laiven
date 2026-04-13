import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load .env from project root (parent of server/)
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '..', '..', '..', '.env') });

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

const NODE_ENV = optionalEnv('NODE_ENV', 'development');

function requireSessionSecret(): string {
  if (NODE_ENV === 'production') {
    const value = requireEnv('SESSION_SECRET');
    if (value.length < 32) {
      throw new Error('SESSION_SECRET must be at least 32 characters in production (try `openssl rand -hex 32`)');
    }
    return value;
  }
  return optionalEnv('SESSION_SECRET', 'laiven-dev-session-secret-change-me');
}

export const env = {
  PORT: parseInt(optionalEnv('PORT', '3001'), 10),
  HOST: optionalEnv('HOST', '0.0.0.0'),
  NODE_ENV,
  DATABASE_URL: requireEnv('DATABASE_URL'),
  REDIS_URL: optionalEnv('REDIS_URL', 'redis://localhost:6379'),
  CLIENT_URL: optionalEnv('CLIENT_URL', 'http://localhost:5173'),
  SESSION_SECRET: requireSessionSecret(),
  SESSION_TTL: parseInt(optionalEnv('SESSION_TTL', '86400'), 10),
};

if (isNaN(env.PORT)) throw new Error('PORT must be a valid number');
if (isNaN(env.SESSION_TTL)) throw new Error('SESSION_TTL must be a valid number');
