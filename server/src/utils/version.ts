import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Single source of truth is server/package.json. Read it lazily at startup
// so a version bump reaches runtime without touching any other file.
//
// Path works in both layouts:
//   dev  — src/utils/version.ts  ↔ ../../package.json = server/package.json
//   prod — dist/utils/version.js ↔ ../../package.json = /app/package.json
//          (the Dockerfile copies package.json into /app so this resolves.)
const here = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(here, '..', '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };

export const VERSION: string = pkg.version;
