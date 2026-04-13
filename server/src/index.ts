import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import session from '@fastify/session';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import rateLimit from '@fastify/rate-limit';
import { RedisStore } from 'connect-redis';
import { env } from './utils/env.js';
import { VERSION } from './utils/version.js';
import { redis, closeRedis } from './db/redis.js';
import { closeDatabase, runMigrations } from './db/connection.js';
import { authRoutes } from './modules/auth/routes.js';
import { userRoutes } from './modules/users/routes.js';
import { projectRoutes } from './modules/projects/routes.js';
import { attributeRoutes } from './modules/attributes/routes.js';
import { variableRoutes } from './modules/variables/routes.js';
import { ruleRoutes } from './modules/rules/routes.js';
import { wordRuleLinkRoutes } from './modules/rules/word-rule-routes.js';
import { builderRoutes } from './modules/builders/routes.js';
import { derivativeTypeRoutes } from './modules/derivatives/routes.js';
import { wordRoutes } from './modules/words/routes.js';
import { searchRoutes } from './modules/search/routes.js';
import { nodeEngineRoutes } from './modules/node-engine/routes.js';

function redactBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const redacted = { ...(body as Record<string, unknown>) };
  for (const key of ['password', 'currentPassword', 'newPassword']) {
    if (key in redacted) redacted[key] = '[REDACTED]';
  }
  return redacted;
}

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'test' ? 'silent' : 'info',
    },
    // Cap request body size. Graph payloads are the largest legitimate
    // bodies; 1 MB comfortably fits a graph at the per-graph node/edge caps.
    bodyLimit: 1 * 1024 * 1024,
    // Behind Caddy (or any reverse proxy) we need to honour the
    // X-Forwarded-Proto header. Without this, `request.protocol` is always
    // "http" and @fastify/session refuses to issue a `secure` cookie, so
    // logins succeed but the session cookie is never persisted — every
    // subsequent /auth/me call comes back as 401.
    trustProxy: true,
  });

  await app.register(cors, { origin: env.CLIENT_URL, credentials: true });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Laiven API',
        description: [
          'Two authentication modes are supported:',
          '',
          '- **Session cookie** — intended for the web UI. Call `POST /api/v1/auth/login`',
          '  with an email and password; the response sets a `sessionId` cookie that must',
          '  be sent on subsequent requests. Use `POST /api/v1/auth/logout` to end the',
          '  session.',
          '- **API key** — intended for programmatic access. Send the key in the',
          '  `X-API-Key` header on every request. Keys are created via',
          '  `POST /api/v1/auth/api-keys` while authenticated with a session and may be',
          '  scoped to a single project and role.',
        ].join('\n'),
        version: '1.0.0',
      },
      servers: [{ url: `http://localhost:${env.PORT}`, description: 'Local development' }],
      tags: [
        { name: 'Auth', description: 'Authentication, sessions, setup wizard, API keys' },
        { name: 'Users', description: 'Instance-level user management (admin only)' },
        { name: 'Projects', description: 'Projects and project membership' },
        { name: 'Attributes', description: 'Per-project word schema' },
        { name: 'Variables', description: 'Reusable variables and value collections' },
        { name: 'Rules', description: 'Reusable rules library' },
        { name: 'Word Rules', description: 'Links attaching rules to word validation' },
        { name: 'Builders', description: 'Derivative value generators' },
        { name: 'Derivative Types', description: 'Derivative definitions and applicability rules' },
        { name: 'Words', description: 'Word CRUD, derivatives, versions, search, live validation' },
        { name: 'Search', description: 'Advanced word search' },
        { name: 'Node Types', description: 'Node graph engine metadata' },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/api/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });

  await app.register(cookie);
  await app.register(session, {
    secret: env.SESSION_SECRET,
    store: new RedisStore({
      client: redis,
      prefix: 'sess:',
      ttl: env.SESSION_TTL,
    }),
    cookie: {
      secure: env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: env.SESSION_TTL * 1000,
      sameSite: 'lax',
    },
    saveUninitialized: false,
  });

  // Log request context on errors for easier debugging.
  // Use onError hook so Fastify's default error handler still runs and
  // interacts correctly with the session plugin's response lifecycle.
  app.addHook('onError', async (request, _reply, error) => {
    request.log.error({
      method: request.method,
      url: request.url,
      params: request.params,
      body: redactBody(request.body),
    }, `${request.method} ${request.url} failed: ${error.message}`);
  });

  // Health check
  app.get('/api/health', async () => ({
    status: 'ok',
    version: VERSION,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }));

  // Register all route modules
  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(projectRoutes);
  await app.register(attributeRoutes);
  await app.register(variableRoutes);
  await app.register(ruleRoutes);
  await app.register(wordRuleLinkRoutes);
  await app.register(builderRoutes);
  await app.register(derivativeTypeRoutes);
  await app.register(wordRoutes);
  await app.register(searchRoutes);
  await app.register(nodeEngineRoutes);

  return app;
}

async function start() {
  const app = await buildApp();

  const shutdown = async () => {
    app.log.info('Shutting down...');
    await app.close();
    await closeRedis();
    await closeDatabase();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    app.log.info('Running database migrations...');
    await runMigrations();
    app.log.info('Migrations complete.');
    await redis.connect();
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`Laiven server v${VERSION} running at http://${env.HOST}:${env.PORT}`);
    app.log.info(`API docs at http://${env.HOST}:${env.PORT}/api/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

const isDirectRun = process.argv[1] &&
  (process.argv[1].endsWith('/src/index.ts') || process.argv[1].endsWith('/dist/index.js'));

if (isDirectRun) {
  start();
}
