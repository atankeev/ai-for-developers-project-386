import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { buildApp } from './app.js';
import { hashPassword } from './auth.js';
import { registerWeb } from './web.js';

test('one server serves the SPA, assets and API without masking missing API routes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'calendar-web-'));
  const app = buildApp({
    config: {
      login: 'test',
      passwordHash: hashPassword(randomBytes(24).toString('hex')),
      cookieSecret: randomBytes(48).toString('hex'),
      allowedOrigin: 'http://localhost:3000',
      trustProxy: false,
    },
  });
  try {
    await mkdir(join(root, 'assets'));
    await writeFile(join(root, 'index.html'), '<!doctype html><div id="app"></div>');
    await writeFile(join(root, 'assets', 'app.js'), 'console.log("app")');
    await registerWeb(app, root);
    for (const url of ['/', '/book', '/owner', '/owner/login', '/confirmations/example']) {
      const response = await app.inject(url);
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.body).toContain('<div id="app">');
    }
    expect((await app.inject('/assets/app.js')).body).toBe('console.log("app")');
    expect((await app.inject('/api/health')).json()).toEqual({ status: 'ok' });
    expect((await app.inject('/api/owner/session')).statusCode).toBe(401);
    for (const url of ['/api', '/api/missing', '/assets/missing.js']) {
      expect((await app.inject(url)).statusCode).toBe(404);
    }
    expect((await app.inject({ method: 'POST', url: '/book' })).statusCode).toBe(404);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
