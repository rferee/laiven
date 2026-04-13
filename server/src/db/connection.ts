import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { env } from '../utils/env.js';
import * as schema from './schema/index.js';

const queryClient = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(queryClient, { schema });

export async function runMigrations(): Promise<void> {
  // In the production Docker image migrations live next to dist/ at /app/migrations.
  // Locally (tsx/vitest) they live in server/src/db/migrations.
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, '../../migrations'), // dist/db/connection.js → /app/migrations
    resolve(here, './migrations'), // src/db/connection.ts → src/db/migrations
  ];
  const folder = candidates.find((p) => existsSync(resolve(p, 'meta/_journal.json')));
  if (!folder) {
    throw new Error(`Drizzle migrations folder not found. Searched: ${candidates.join(', ')}`);
  }
  await migrate(db, { migrationsFolder: folder });
}

export async function closeDatabase(): Promise<void> {
  await queryClient.end();
}
