import { Writable } from 'node:stream';
import { randomBytes } from 'node:crypto';
import { expect, test } from 'vitest';
import {
  getScheduleException,
  replaceScheduleException,
  deleteScheduleException,
  getOwnerSchedule,
  replaceWeeklySchedule,
  getHealth,
  ownerLogin,
  ownerSession,
  ownerLogout,
  createMeetingType,
  listOwnerMeetingTypes,
  getCatalog,
  getAvailability,
} from '@call-calendar/api-contract';
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
  let now = Date.parse('2026-11-09T20:59:59Z');
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

test('owner creates a type and guests see its current conditions without private version', async () => {
  const { app, client, advance } = await server();
  try {
    expect((await getCatalog({ client })).data).toEqual({ items: [] });
    const login = await ownerLogin({ client, body: credentials(), headers: headers() });
    const created = await createMeetingType({
      client,
      headers: headers(cookie(login.response)),
      body: { title: '  Разговор  ', description: '<b>Текст</b>', durationMinutes: 17 },
    });
    expect(created.response!.status).toBe(200);
    expect(created.data).toMatchObject({
      meetingType: {
        title: 'Разговор',
        description: '<b>Текст</b>',
        durationMinutes: 17,
        hidden: false,
        version: 1,
      },
      warnings: [{ code: 'DURATION_EXCEEDS_WORKING_INTERVALS' }],
    });
    const id = created.data!.meetingType.id;
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(
      (await listOwnerMeetingTypes({ client, headers: headers(cookie(login.response)) })).data!
        .items,
    ).toHaveLength(1);
    expect((await getCatalog({ client })).data).toEqual({
      items: [
        {
          id,
          title: 'Разговор',
          description: '<b>Текст</b>',
          durationMinutes: 17,
          nearestStartsAt: null,
        },
      ],
    });
    const availability = await getAvailability({ client, path: { id } });
    expect(availability.data!.meetingType).toEqual({
      id,
      title: 'Разговор',
      description: '<b>Текст</b>',
      durationMinutes: 17,
    });
    expect(availability.data).toMatchObject({
      timeZone: 'Europe/Moscow',
      windowStart: '2026-11-10',
      windowEnd: '2026-11-23',
    });
    expect(availability.data!.days).toHaveLength(14);
    expect(availability.data!.days.every((day) => day.slots.length === 0)).toBe(true);
    advance(1000);
    expect((await getAvailability({ client, path: { id } })).data).toMatchObject({
      windowStart: '2026-11-11',
      windowEnd: '2026-11-24',
    });
    expect((await getAvailability({ client, path: { id: 'absent' } })).response!.status).toBe(404);
  } finally {
    await app.close();
  }
});

test('type validation counts Unicode code points, normalizes titles and serializes concurrent duplicates', async () => {
  const { app, client } = await server();
  try {
    const login = await ownerLogin({ client, body: credentials(), headers: headers() });
    const authorized = headers(cookie(login.response));
    for (const [field, body] of [
      ['title', { title: '   ', durationMinutes: 1 }],
      ['title', { title: '😀'.repeat(101), durationMinutes: 1 }],
      [
        'description',
        { title: 'Long description', description: '😀'.repeat(2001), durationMinutes: 1 },
      ],
      ['durationMinutes', { title: 'Duration', durationMinutes: 0 }],
      ['durationMinutes', { title: 'Duration', durationMinutes: 1441 }],
      ['durationMinutes', { title: 'Duration', durationMinutes: 1.5 }],
    ] as const) {
      const result = await createMeetingType({ client, headers: authorized, body });
      expect(result.response!.status).toBe(400);
      expect(result.error).toMatchObject({
        code: 'VALIDATION_ERROR',
        fieldErrors: { [field]: expect.any(String) },
      });
    }
    expect(
      (
        await createMeetingType({
          client,
          headers: authorized,
          body: { title: '😀'.repeat(100), description: '😀'.repeat(2000), durationMinutes: 1440 },
        })
      ).response!.status,
    ).toBe(200);
    const results = await Promise.all(
      ['  ВСТРЕЧА ', 'встреча'].map((title) =>
        createMeetingType({ client, headers: authorized, body: { title, durationMinutes: 1 } }),
      ),
    );
    expect(results.map((result) => result.response!.status).sort()).toEqual([200, 400]);
    expect(results.find((result) => result.error)?.error).toMatchObject({
      code: 'MEETING_TYPE_TITLE_EXISTS',
      fieldErrors: { title: expect.any(String) },
    });
  } finally {
    await app.close();
  }
});

test('private types require session and Origin; app restart loses types and old links', async () => {
  const first = await server();
  const second = await server();
  try {
    expect((await listOwnerMeetingTypes({ client: first.client })).response!.status).toBe(401);
    expect(
      (
        await createMeetingType({
          client: first.client,
          headers: headers(),
          body: { title: 'Private', durationMinutes: 30 },
        })
      ).response!.status,
    ).toBe(401);
    const login = await ownerLogin({
      client: first.client,
      headers: headers(),
      body: credentials(),
    });
    expect(
      (
        await createMeetingType({
          client: first.client,
          headers: { Cookie: cookie(login.response) },
          body: { title: 'Private', durationMinutes: 30 },
        })
      ).response!.status,
    ).toBe(403);
    const result = await createMeetingType({
      client: first.client,
      headers: headers(cookie(login.response)),
      body: { title: 'Private', durationMinutes: 30 },
    });
    expect(result.response!.headers.get('cache-control')).toBe('no-store');
    expect((await getCatalog({ client: second.client })).data).toEqual({ items: [] });
    expect(
      (await getAvailability({ client: second.client, path: { id: result.data!.meetingType.id } }))
        .response!.status,
    ).toBe(404);
  } finally {
    await first.app.close();
    await second.app.close();
  }
});

test('weekly schedule saves all seven days atomically with optimistic concurrency', async () => {
  const { app, client } = await server();
  try {
    expect((await getOwnerSchedule({ client })).response!.status).toBe(401);
    const login = await ownerLogin({ client, body: credentials(), headers: headers() });
    const auth = headers(cookie(login.response));
    const initial = (await getOwnerSchedule({ client, headers: auth })).data!;
    expect(initial).toEqual({
      version: 1,
      exceptions: [],
      days: [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, intervals: [] })),
    });
    const days = initial.days.map((day) => ({
      ...day,
      intervals: [{ start: '09:10', end: '10:10' }],
    }));
    const results = await Promise.all(
      [1, 2].map(() =>
        replaceWeeklySchedule({ client, headers: auth, body: { expectedVersion: 1, days } }),
      ),
    );
    expect(results.map((r) => r.response!.status).sort()).toEqual([200, 400]);
    expect(results.find((r) => r.error)?.error?.code).toBe('VERSION_CONFLICT');
    const invalid = days.map((day) => ({
      ...day,
      intervals:
        day.day === 2 ? [{ start: '24:00', end: '24:00' }] : [{ start: '12:00', end: '13:00' }],
    }));
    expect(
      (
        await replaceWeeklySchedule({
          client,
          headers: auth,
          body: { expectedVersion: 2, days: invalid },
        })
      ).error?.code,
    ).toBe('VALIDATION_ERROR');
    expect((await getOwnerSchedule({ client, headers: auth })).data).toEqual({
      version: 2,
      days,
      exceptions: [],
    });
    expect(
      (await replaceWeeklySchedule({ client, headers: auth, body: { expectedVersion: 2, days } }))
        .data?.version,
    ).toBe(2);
  } finally {
    await app.close();
  }
});

test.each([
  [30, ['06:10', '06:25', '06:40']],
  [45, ['06:10', '06:25']],
  [60, ['06:10']],
  [75, []],
  [17, ['06:10', '06:25', '06:40']],
])('availability uses the interval grid for duration %i', async (duration, expected) => {
  const { app, client } = await server();
  try {
    const login = await ownerLogin({ client, body: credentials(), headers: headers() });
    const auth = headers(cookie(login.response));
    await replaceWeeklySchedule({
      client,
      headers: auth,
      body: {
        expectedVersion: 1,
        days: [1, 2, 3, 4, 5, 6, 7].map((day) => ({
          day,
          intervals: [{ start: '09:10', end: '10:10' }],
        })),
      },
    });
    const created = (
      await createMeetingType({
        client,
        headers: auth,
        body: { title: 'Grid', durationMinutes: duration },
      })
    ).data!;
    expect(created.warnings.length).toBe(duration > 60 ? 1 : 0);
    const availability = (await getAvailability({ client, path: { id: created.meetingType.id } }))
      .data!;
    expect(availability.days).toHaveLength(14);
    expect(availability.days[0]).toEqual({ date: '2026-11-10', slots: [] });
    expect(availability.days[1]!.slots.map((slot) => slot.startsAt)).toEqual(
      expected.map((time) => `2026-11-11T${time}:00.000Z`),
    );
    expect(availability.windowEnd).toBe('2026-11-23');
    expect((await getCatalog({ client })).data!.items[0]!.nearestStartsAt).toBe(
      expected.length ? `2026-11-11T${expected[0]}:00.000Z` : null,
    );
  } finally {
    await app.close();
  }
});

test('breaks, adjacent intervals and midnight keep their boundaries', async () => {
  const { app, client } = await server();
  try {
    const login = await ownerLogin({ client, body: credentials(), headers: headers() });
    const auth = headers(cookie(login.response));
    const days = [1, 2, 3, 4, 5, 6, 7].map((day) => ({
      day,
      intervals: [
        { start: '13:00', end: '18:00' },
        { start: '09:00', end: '12:00' },
      ],
    }));
    await replaceWeeklySchedule({ client, headers: auth, body: { expectedVersion: 1, days } });
    const type = (
      await createMeetingType({
        client,
        headers: auth,
        body: { title: 'Boundaries', durationMinutes: 60 },
      })
    ).data!.meetingType;
    let slots = (await getAvailability({ client, path: { id: type.id } })).data!.days[1]!.slots;
    expect(slots.map((slot) => slot.startsAt)).toContain('2026-11-11T08:00:00.000Z');
    expect(slots.map((slot) => slot.startsAt)).not.toContain('2026-11-11T08:15:00.000Z');
    expect(slots.at(-1)).toEqual({
      startsAt: '2026-11-11T14:00:00.000Z',
      endsAt: '2026-11-11T15:00:00.000Z',
    });
    await replaceWeeklySchedule({
      client,
      headers: auth,
      body: {
        expectedVersion: 2,
        days: days.map((day) => ({
          ...day,
          intervals: [
            { start: '09:00', end: '09:30' },
            { start: '09:30', end: '10:00' },
          ],
        })),
      },
    });
    expect((await getAvailability({ client, path: { id: type.id } })).data!.days[1]!.slots).toEqual(
      [],
    );
    await replaceWeeklySchedule({
      client,
      headers: auth,
      body: {
        expectedVersion: 3,
        days: days.map((day) => ({ ...day, intervals: [{ start: '23:00', end: '24:00' }] })),
      },
    });
    slots = (await getAvailability({ client, path: { id: type.id } })).data!.days[1]!.slots;
    expect(slots).toEqual([
      { startsAt: '2026-11-11T20:00:00.000Z', endsAt: '2026-11-11T21:00:00.000Z' },
    ]);
    await replaceWeeklySchedule({
      client,
      headers: auth,
      body: {
        expectedVersion: 4,
        days: days.map((day) => ({ ...day, intervals: [{ start: '00:00', end: '24:00' }] })),
      },
    });
    const full = (
      await createMeetingType({
        client,
        headers: auth,
        body: { title: 'Full day', durationMinutes: 1440 },
      })
    ).data!;
    expect(full.warnings).toEqual([]);
    expect(
      (await getAvailability({ client, path: { id: full.meetingType.id } })).data!.days[1]!.slots,
    ).toEqual([{ startsAt: '2026-11-10T21:00:00.000Z', endsAt: '2026-11-11T21:00:00.000Z' }]);
  } finally {
    await app.close();
  }
});

test('Moscow midnight shifts dates; the exact 24h threshold filters without shifting the grid', async () => {
  const { app, client, advance } = await server();
  try {
    advance(-14 * 3600000 - 59 * 60000 - 59000); // Nov 9 09:00 Moscow
    const login = await ownerLogin({ client, body: credentials(), headers: headers() });
    const auth = headers(cookie(login.response));
    await replaceWeeklySchedule({
      client,
      headers: auth,
      body: {
        expectedVersion: 1,
        days: [1, 2, 3, 4, 5, 6, 7].map((day) => ({
          day,
          intervals: [{ start: '09:10', end: '10:10' }],
        })),
      },
    });
    const type = (
      await createMeetingType({
        client,
        headers: auth,
        body: { title: 'Threshold', durationMinutes: 30 },
      })
    ).data!.meetingType;
    advance(10 * 60000);
    expect(
      (await getAvailability({ client, path: { id: type.id } })).data!.days[0]!.slots[0]!.startsAt,
    ).toBe('2026-11-10T06:10:00.000Z');
    advance(10 * 60000);
    expect(
      (await getAvailability({ client, path: { id: type.id } })).data!.days[0]!.slots[0]!.startsAt,
    ).toBe('2026-11-10T06:25:00.000Z');
    advance(14 * 3600000 + 40 * 60000 - 1);
    expect((await getAvailability({ client, path: { id: type.id } })).data!.windowStart).toBe(
      '2026-11-10',
    );
    advance(1);
    const data = (await getAvailability({ client, path: { id: type.id } })).data!;
    expect([data.windowStart, data.windowEnd]).toEqual(['2026-11-11', '2026-11-24']);
  } finally {
    await app.close();
  }
});

test.each([
  [{ start: '9:00', end: '10:00' }],
  [{ start: '23:00', end: '24:01' }],
  [{ start: '10:00', end: '09:00' }],
  [{ start: '09:00', end: '09:00' }],
  [{ start: '09:00:00', end: '10:00' }],
  [
    { start: '09:00', end: '10:00' },
    { start: '09:59', end: '11:00' },
  ],
])('invalid working intervals do not save: %j', async (...intervals) => {
  const { app, client } = await server();
  try {
    const login = await ownerLogin({ client, body: credentials(), headers: headers() });
    const auth = headers(cookie(login.response));
    const initial = (await getOwnerSchedule({ client, headers: auth })).data!;
    const result = await replaceWeeklySchedule({
      client,
      headers: auth,
      body: {
        expectedVersion: 1,
        days: initial.days.map((day) => ({ ...day, intervals: day.day === 1 ? intervals : [] })),
      },
    });
    expect(result.error?.code).toBe('VALIDATION_ERROR');
    expect((await getOwnerSchedule({ client, headers: auth })).data).toEqual(initial);
  } finally {
    await app.close();
  }
});

test('date exceptions replace weekly hours, close and restore a date without resetting its version', async () => {
  const { app, client } = await server();
  try {
    const login = await ownerLogin({ client, body: credentials(), headers: headers() });
    const auth = headers(cookie(login.response));
    const path = { date: '2026-11-11' };
    expect((await getScheduleException({ client, headers: auth, path })).data).toEqual({
      date: path.date,
      version: 0,
      intervals: null,
    });
    await replaceWeeklySchedule({
      client,
      headers: auth,
      body: {
        expectedVersion: 1,
        days: [1, 2, 3, 4, 5, 6, 7].map((day) => ({
          day,
          intervals: [{ start: '09:00', end: '18:00' }],
        })),
      },
    });
    const type = (
      await createMeetingType({
        client,
        headers: auth,
        body: { title: 'Exception', durationMinutes: 30 },
      })
    ).data!.meetingType;
    const saved = await replaceScheduleException({
      client,
      headers: auth,
      path,
      body: { expectedVersion: 0, intervals: [{ start: '14:10', end: '15:10' }] },
    });
    expect(saved.data).toEqual({
      date: path.date,
      version: 1,
      intervals: [{ start: '14:10', end: '15:10' }],
    });
    expect(
      (await getAvailability({ client, path: { id: type.id } })).data!.days[1]!.slots.map(
        (s) => s.startsAt,
      ),
    ).toEqual(['2026-11-11T11:10:00.000Z', '2026-11-11T11:25:00.000Z', '2026-11-11T11:40:00.000Z']);
    expect((await getCatalog({ client })).data!.items[0]!.nearestStartsAt).toBe(
      '2026-11-11T11:10:00.000Z',
    );
    expect((await getOwnerSchedule({ client, headers: auth })).data!.exceptions).toEqual([
      saved.data,
    ]);
    expect(
      (
        await replaceScheduleException({
          client,
          headers: auth,
          path,
          body: { expectedVersion: 1, intervals: [] },
        })
      ).data!.version,
    ).toBe(2);
    expect((await getAvailability({ client, path: { id: type.id } })).data!.days[1]!.slots).toEqual(
      [],
    );
    expect(
      (await deleteScheduleException({ client, headers: auth, path, body: { expectedVersion: 2 } }))
        .data,
    ).toEqual({ date: path.date, version: 3, intervals: null });
    expect(
      (await getAvailability({ client, path: { id: type.id } })).data!.days[1]!.slots[0]!.startsAt,
    ).toBe('2026-11-11T06:00:00.000Z');
    expect(
      (
        await replaceScheduleException({
          client,
          headers: auth,
          path,
          body: { expectedVersion: 0, intervals: [] },
        })
      ).error?.code,
    ).toBe('VERSION_CONFLICT');
  } finally {
    await app.close();
  }
});

test('exception dates, hours and versions validate without changes; access is private', async () => {
  const { app, client } = await server();
  try {
    const path = { date: '2026-11-11' };
    expect((await getScheduleException({ client, path })).response!.status).toBe(401);
    const login = await ownerLogin({ client, body: credentials(), headers: headers() });
    const auth = headers(cookie(login.response));
    expect(
      (
        await replaceScheduleException({
          client,
          path,
          headers: { Cookie: cookie(login.response) },
          body: { expectedVersion: 0, intervals: [] },
        })
      ).response!.status,
    ).toBe(403);
    for (const date of ['2026-02-30', '2026-02-29', '2026-13-01', '2026-1-01', '0000-01-01']) {
      for (const result of [
        await getScheduleException({ client, headers: auth, path: { date } }),
        await replaceScheduleException({
          client,
          headers: auth,
          path: { date },
          body: { expectedVersion: 0, intervals: [] },
        }),
        await deleteScheduleException({
          client,
          headers: auth,
          path: { date },
          body: { expectedVersion: 0 },
        }),
      ])
        expect(result.error?.code).toBe('VALIDATION_ERROR');
    }
    for (const intervals of [
      [{ start: '24:00', end: '24:00' }],
      [
        { start: '09:00', end: '10:00' },
        { start: '09:30', end: '11:00' },
      ],
    ])
      expect(
        (
          await replaceScheduleException({
            client,
            headers: auth,
            path,
            body: { expectedVersion: 0, intervals },
          })
        ).error?.code,
      ).toBe('VALIDATION_ERROR');
    const results = await Promise.all(
      [1, 2].map(() =>
        replaceScheduleException({
          client,
          headers: auth,
          path,
          body: { expectedVersion: 0, intervals: [] },
        }),
      ),
    );
    expect(results.map((r) => r.response!.status).sort()).toEqual([200, 400]);
    expect(results.find((r) => r.error)!.error!.code).toBe('VERSION_CONFLICT');
    expect(
      (
        await replaceScheduleException({
          client,
          headers: auth,
          path,
          body: { expectedVersion: 1, intervals: [] },
        })
      ).data!.version,
    ).toBe(1);
    expect(
      (await deleteScheduleException({ client, headers: auth, path, body: { expectedVersion: 0 } }))
        .error!.code,
    ).toBe('VERSION_CONFLICT');
    expect(
      (await deleteScheduleException({ client, headers: auth, path, body: { expectedVersion: 1 } }))
        .data!.version,
    ).toBe(2);
    expect(
      (await deleteScheduleException({ client, headers: auth, path, body: { expectedVersion: 2 } }))
        .data!.version,
    ).toBe(2);
    expect(
      (
        await replaceScheduleException({
          client,
          headers: auth,
          path,
          body: { expectedVersion: 2, intervals: [] },
        })
      ).data!.version,
    ).toBe(3);
    expect(
      (
        await replaceScheduleException({
          client,
          headers: auth,
          path,
          body: { expectedVersion: 1, intervals: [] },
        })
      ).error!.code,
    ).toBe('VERSION_CONFLICT');
    expect(
      (await getScheduleException({ client, headers: auth, path })).response!.headers.get(
        'cache-control',
      ),
    ).toBe('no-store');
    expect(
      (await getScheduleException({ client, headers: auth, path: { date: '2028-02-29' } })).data!
        .intervals,
    ).toBeNull();
  } finally {
    await app.close();
  }
});

test('duration warnings consider today and future exception intervals, excluding past and closed dates', async () => {
  const { app, client } = await server();
  try {
    const login = await ownerLogin({ client, body: credentials(), headers: headers() });
    const auth = headers(cookie(login.response));
    await replaceScheduleException({
      client,
      headers: auth,
      path: { date: '2026-11-08' },
      body: { expectedVersion: 0, intervals: [{ start: '00:00', end: '24:00' }] },
    });
    expect(
      (
        await createMeetingType({
          client,
          headers: auth,
          body: { title: 'Past ignored', durationMinutes: 60 },
        })
      ).data!.warnings,
    ).toHaveLength(1);
    await replaceScheduleException({
      client,
      headers: auth,
      path: { date: '2026-11-09' },
      body: { expectedVersion: 0, intervals: [{ start: '09:00', end: '10:00' }] },
    });
    expect(
      (
        await createMeetingType({
          client,
          headers: auth,
          body: { title: 'Today included', durationMinutes: 60 },
        })
      ).data!.warnings,
    ).toEqual([]);
    await replaceScheduleException({
      client,
      headers: auth,
      path: { date: '2030-01-01' },
      body: { expectedVersion: 0, intervals: [{ start: '09:00', end: '11:00' }] },
    });
    expect(
      (
        await createMeetingType({
          client,
          headers: auth,
          body: { title: 'Future outside window', durationMinutes: 120 },
        })
      ).data!.warnings,
    ).toEqual([]);
    await replaceScheduleException({
      client,
      headers: auth,
      path: { date: '2030-01-01' },
      body: { expectedVersion: 1, intervals: [] },
    });
    expect(
      (
        await createMeetingType({
          client,
          headers: auth,
          body: { title: 'Closed ignored', durationMinutes: 120 },
        })
      ).data!.warnings,
    ).toHaveLength(1);
  } finally {
    await app.close();
  }
});
