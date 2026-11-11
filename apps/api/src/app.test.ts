import { Writable } from 'node:stream';
import { randomBytes } from 'node:crypto';
import { expect, test } from 'vitest';
import { getHealth, ownerLogin, ownerSession, ownerLogout } from '@call-calendar/api-contract';
import { createClient } from '@call-calendar/api-contract/client';
import { buildApp } from './app.js';
import { hashPassword, readOwnerConfig } from './auth.js';

const password = randomBytes(24).toString('hex');
const config = readOwnerConfig({
  OWNER_LOGIN: randomBytes(12).toString('hex'),
  OWNER_PASSWORD_HASH: hashPassword(password),
  OWNER_COOKIE_SECRET: randomBytes(48).toString('hex'),
  OWNER_ALLOWED_ORIGIN: 'http://localhost:5173',
});

async function server() {
  let now = Date.now();
  const app = buildApp({ config, now: () => now });
  const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
  const client = createClient({ baseUrl });
  return {
    app,
    client,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
  };
}

function credentials() {
  return { login: config.login, password };
}
function headers(cookie?: string) {
  return { Origin: config.allowedOrigin, ...(cookie ? { Cookie: cookie } : {}) };
}
function cookie(response: Response | undefined) {
  return response!.headers.get('set-cookie')!.split(';')[0]!;
}

test('owner signs in through HTTP and generated SDK; health stays public', async () => {
  const { app, client } = await server();
  try {
    expect((await getHealth({ client })).data).toEqual({ status: 'ok' });
    expect((await ownerSession({ client })).response!.status).toBe(401);
    const login = await ownerLogin({ client, body: credentials(), headers: headers() });
    expect(login.data).toEqual({ authenticated: true });
    expect(login.response!.headers.get('set-cookie')).toMatch(/HttpOnly/);
    expect(login.response!.headers.get('set-cookie')).toMatch(/SameSite=Strict/);
    expect(login.response!.headers.get('set-cookie')).not.toContain('Secure');
    expect(login.response!.headers.get('set-cookie')).toContain('Expires=');
    const result = await ownerSession({ client, headers: headers(cookie(login.response)) });
    expect(result.data).toEqual({ authenticated: true });
    expect(result.response!.headers.get('cache-control')).toBe('no-store');
  } finally {
    await app.close();
  }
});

test('session has an absolute twelve-hour boundary and login rotates its id', async () => {
  const { app, client, advance } = await server();
  try {
    const first = await ownerLogin({ client, body: credentials(), headers: headers() });
    const second = await ownerLogin({
      client,
      body: credentials(),
      headers: headers(cookie(first.response)),
    });
    expect(cookie(second.response)).not.toBe(cookie(first.response));
    expect(
      (await ownerSession({ client, headers: headers(cookie(first.response)) })).response!.status,
    ).toBe(401);
    advance(12 * 60 * 60 * 1000 - 1);
    const active = await ownerSession({ client, headers: headers(cookie(second.response)) });
    expect(active.response!.status).toBe(200);
    expect(active.response!.headers.get('set-cookie')).toBeNull();
    advance(1);
    expect(
      (await ownerSession({ client, headers: headers(cookie(second.response)) })).response!.status,
    ).toBe(401);
  } finally {
    await app.close();
  }
});

test('logout only destroys the current device and a restart clears all sessions', async () => {
  const first = await server();
  let savedCookie = '';
  try {
    const login = await ownerLogin({
      client: first.client,
      body: credentials(),
      headers: headers(),
    });
    savedCookie = cookie(login.response);
    const other = await ownerLogin({
      client: first.client,
      body: credentials(),
      headers: headers(),
    });
    const logout = await ownerLogout({ client: first.client, headers: headers(savedCookie) });
    expect(logout.data).toEqual({ authenticated: false });
    expect(logout.response!.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(
      (await ownerSession({ client: first.client, headers: headers(savedCookie) })).response!
        .status,
    ).toBe(401);
    savedCookie = cookie(other.response);
    expect(
      (await ownerSession({ client: first.client, headers: headers(savedCookie) })).response!
        .status,
    ).toBe(200);
  } finally {
    await first.app.close();
  }
  const restarted = await server();
  try {
    expect(
      (await ownerSession({ client: restarted.client, headers: headers(savedCookie) })).response!
        .status,
    ).toBe(401);
  } finally {
    await restarted.app.close();
  }
});

test('all owner mutations require exact Origin before changing a session', async () => {
  const { app, client } = await server();
  try {
    const login = await ownerLogin({ client, body: credentials(), headers: headers() });
    const signedIn = cookie(login.response);
    for (const origin of [
      undefined,
      'null',
      'https://localhost:5173',
      'http://localhost:5174',
      'http://foreign.test',
    ]) {
      const requestHeaders = { Cookie: signedIn, ...(origin ? { Origin: origin } : {}) };
      for (const result of [
        await ownerLogin({ client, body: credentials(), headers: requestHeaders }),
        await ownerLogout({ client, headers: requestHeaders }),
      ]) {
        expect(result.response!.status).toBe(403);
        expect(result.error).toMatchObject({ code: 'ORIGIN_FORBIDDEN' });
        expect(result.response!.headers.get('cache-control')).toBe('no-store');
      }
    }
    expect((await ownerSession({ client, headers: headers(signedIn) })).response!.status).toBe(200);
  } finally {
    await app.close();
  }
});

test('sixth login is limited by actual IP, including successes, then resets at one minute', async () => {
  const { app, client, advance } = await server();
  try {
    const wrongLogin = await ownerLogin({
      client,
      body: { ...credentials(), login: 'unknown' },
      headers: headers(),
    });
    const wrongPassword = await ownerLogin({
      client,
      body: { ...credentials(), password: 'incorrect' },
      headers: headers(),
    });
    expect(wrongLogin.response!.status).toBe(401);
    expect(wrongLogin.error).toEqual(wrongPassword.error);
    expect(wrongLogin.response!.headers.get('set-cookie')).toBeNull();
    for (let index = 0; index < 3; index++) {
      expect(
        (await ownerLogin({ client, body: credentials(), headers: headers() })).response!.status,
      ).toBe(200);
    }
    const sixth = await ownerLogin({
      client,
      body: credentials(),
      headers: { ...headers(), 'X-Forwarded-For': '198.51.100.2' },
    });
    expect(sixth.response!.status).toBe(429);
    expect(sixth.error).toMatchObject({ code: 'LOGIN_RATE_LIMITED' });
    expect(sixth.response!.headers.get('retry-after')).toBe('60');
    advance(60_000);
    expect(
      (await ownerLogin({ client, body: credentials(), headers: headers() })).response!.status,
    ).toBe(200);
  } finally {
    await app.close();
  }
});

test('another actual client IP is independent behind an explicitly trusted local proxy; HTTPS cookies are secure', async () => {
  const secureConfig = {
    ...config,
    allowedOrigin: 'https://calendar.test',
    trustProxy: ['127.0.0.1'],
  };
  const app = buildApp({ config: secureConfig });
  const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
  const client = createClient({ baseUrl });
  const proxyHeaders = (ip: string) => ({
    Origin: secureConfig.allowedOrigin,
    'X-Forwarded-For': ip,
    'X-Forwarded-Proto': 'https',
  });
  try {
    for (let index = 0; index < 5; index++) {
      expect(
        (await ownerLogin({ client, body: credentials(), headers: proxyHeaders('198.51.100.1') }))
          .response!.status,
      ).toBe(200);
    }
    expect(
      (await ownerLogin({ client, body: credentials(), headers: proxyHeaders('198.51.100.1') }))
        .response!.status,
    ).toBe(429);
    const other = await ownerLogin({
      client,
      body: credentials(),
      headers: proxyHeaders('198.51.100.2'),
    });
    expect(other.response!.status).toBe(200);
    expect(other.response!.headers.get('set-cookie')).toContain('Secure');
  } finally {
    await app.close();
  }
});

test('invalid or missing owner configuration prevents startup without fallback credentials', () => {
  const valid = {
    OWNER_LOGIN: config.login,
    OWNER_PASSWORD_HASH: config.passwordHash,
    OWNER_COOKIE_SECRET: config.cookieSecret,
    OWNER_ALLOWED_ORIGIN: config.allowedOrigin,
  };
  for (const key of Object.keys(valid)) {
    expect(() => readOwnerConfig({ ...valid, [key]: '' })).toThrow();
  }
  for (const bad of [
    { OWNER_PASSWORD_HASH: 'invalid' },
    { OWNER_COOKIE_SECRET: randomBytes(2).toString('hex') },
    { OWNER_COOKIE_SECRET: password },
    { OWNER_ALLOWED_ORIGIN: 'http://localhost:5173/' },
    { OWNER_ALLOWED_ORIGIN: 'null' },
    { TRUSTED_PROXIES: '*' },
  ])
    expect(() => readOwnerConfig({ ...valid, ...bad })).toThrow();
});

test('responses and logs never serialize credentials, cookies or secret request URLs', async () => {
  let logs = '';
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      logs += chunk.toString();
      callback();
    },
  });
  const app = buildApp({ config, logger: { stream } });
  const baseUrl = await app.listen({ host: '127.0.0.1', port: 0 });
  const client = createClient({ baseUrl });
  const secretPath = randomBytes(32).toString('hex');
  try {
    const login = await ownerLogin({ client, body: credentials(), headers: headers() });
    const savedCookie = cookie(login.response);
    const invalid = await ownerLogin({
      client,
      body: { ...credentials(), password: '' },
      headers: headers(savedCookie),
    });
    const unknown = await getHealth({
      client: createClient({ baseUrl: `${baseUrl}/confirmations/${secretPath}` }),
      headers: headers(savedCookie),
    });
    expect(unknown.error).toMatchObject({ code: 'NOT_FOUND' });
    for (const secret of [
      password,
      config.passwordHash,
      config.cookieSecret,
      savedCookie,
      secretPath,
    ]) {
      expect(
        JSON.stringify([login.data, invalid.data, invalid.error, unknown.error]),
      ).not.toContain(secret);
      expect(logs).not.toContain(secret);
    }
    // Ordinary operational messages still reach the configured sink.
    expect(logs).toContain('Server listening');
  } finally {
    await app.close();
  }
});
