import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildApp } from '../index.js';
import { main as seedDatabase } from '../db/seeds/seed.js';
import { closeDatabase } from '../db/connection.js';
import { redis, closeRedis } from '../db/redis.js';

type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>;

export interface TestContext {
  app: FastifyInstance;
  adminCookies: string;
  adminUserId: string;
  eldarianProjectId: string;
}

export async function setupTestApp(): Promise<TestContext> {
  if (redis.status !== 'ready' && redis.status !== 'connecting') {
    await redis.connect();
  }
  await seedDatabase();
  const app = await buildApp();
  await app.ready();

  const loginRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email: 'admin@laiven.local', password: 'admin123!' },
  });
  const adminCookies = extractCookies(loginRes);
  const adminUserId = loginRes.json().id;

  const projRes = await app.inject({
    method: 'GET',
    url: '/api/v1/projects',
    headers: { cookie: adminCookies },
  });
  const eldarianProjectId = projRes.json().items.find((p: any) => p.name === 'Eldarian').id;

  return { app, adminCookies, adminUserId, eldarianProjectId };
}

export async function teardownTestApp(ctx: TestContext): Promise<void> {
  if (ctx?.app) await ctx.app.close();
  await closeRedis();
  await closeDatabase();
}

export function inject(
  app: FastifyInstance,
  cookies: string,
  opts: InjectOptions,
): Promise<InjectResponse> {
  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string> ?? {}),
  };
  if (cookies) headers.cookie = cookies;
  return app.inject({ ...opts, headers });
}

export function injectNoAuth(
  app: FastifyInstance,
  opts: InjectOptions,
): Promise<InjectResponse> {
  return app.inject(opts);
}

export async function login(
  app: FastifyInstance,
  email: string,
  password: string,
): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password },
  });
  return extractCookies(res);
}

export function extractCookies(res: InjectResponse): string {
  const setCookie = res.headers['set-cookie'];
  if (!setCookie) return '';
  const raw = Array.isArray(setCookie) ? setCookie : [setCookie];
  return raw.map((c: string) => c.split(';')[0]).join('; ');
}

export async function createUserAndLogin(
  app: FastifyInstance,
  adminCookies: string,
  data: { email: string; displayName: string; password: string; role?: string },
): Promise<{ id: string; cookies: string }> {
  const res = await inject(app, adminCookies, {
    method: 'POST',
    url: '/api/v1/users',
    payload: data,
  });
  const id = res.json().id;
  const cookies = await login(app, data.email, data.password);
  return { id, cookies };
}

export async function addProjectMember(
  app: FastifyInstance,
  adminCookies: string,
  projectId: string,
  userId: string,
  role: string,
): Promise<void> {
  await inject(app, adminCookies, {
    method: 'POST',
    url: `/api/v1/projects/${projectId}/members`,
    payload: { userId, role },
  });
}

export async function getAttributeId(
  app: FastifyInstance,
  cookies: string,
  projectId: string,
  identifier: string,
): Promise<string> {
  const res = await inject(app, cookies, {
    method: 'GET',
    url: `/api/v1/projects/${projectId}/attributes`,
  });
  const attr = res.json().items.find((a: any) => a.identifier === identifier);
  return attr?.id;
}

export async function getVariableId(
  app: FastifyInstance,
  cookies: string,
  projectId: string,
  name: string,
): Promise<string> {
  const res = await inject(app, cookies, {
    method: 'GET',
    url: `/api/v1/projects/${projectId}/variables`,
  });
  const v = res.json().items.find((v: any) => v.name === name);
  return v?.id;
}

export async function getDerivativeTypeId(
  app: FastifyInstance,
  cookies: string,
  projectId: string,
  identifier: string,
): Promise<string> {
  const res = await inject(app, cookies, {
    method: 'GET',
    url: `/api/v1/projects/${projectId}/derivative-types`,
  });
  const dt = res.json().items.find((d: any) => d.identifier === identifier);
  return dt?.id;
}

export async function getBuilderId(
  app: FastifyInstance,
  cookies: string,
  projectId: string,
  name: string,
): Promise<string> {
  const res = await inject(app, cookies, {
    method: 'GET',
    url: `/api/v1/projects/${projectId}/builders`,
  });
  const b = res.json().items.find((b: any) => b.name === name);
  return b?.id;
}

export async function getRuleId(
  app: FastifyInstance,
  cookies: string,
  projectId: string,
  name: string,
): Promise<string> {
  const res = await inject(app, cookies, {
    method: 'GET',
    url: `/api/v1/projects/${projectId}/rules`,
  });
  const r = res.json().items.find((r: any) => r.name === name);
  return r?.id;
}

export async function createWord(
  app: FastifyInstance,
  cookies: string,
  projectId: string,
  attributeValues: Record<string, unknown>,
): Promise<any> {
  const res = await inject(app, cookies, {
    method: 'POST',
    url: `/api/v1/projects/${projectId}/words`,
    payload: { attributeValues },
  });
  return res.json();
}
