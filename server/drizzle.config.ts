import { defineConfig } from 'drizzle-kit';
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load .env from parent directory
dotenv.config({ path: resolve(process.cwd(), '..', '.env') });

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
});
