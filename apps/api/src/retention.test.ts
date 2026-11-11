import { randomBytes, randomUUID } from 'node:crypto';
import { expect, test, vi } from 'vitest';
import {
  createBooking,
  createMeetingType,
  replaceWeeklySchedule,
  ownerLogin,
  getConfirmation,
  listOwnerBookings,
  getOwnerBooking,
} from '@call-calendar/api-contract';
import { createClient } from '@call-calendar/api-contract/client';
import { buildApp } from './app.js';
import { hashPassword, readOwnerConfig } from './auth.js';

async function server() {
  const clock = { now: Date.parse('2026-11-09T06:00:00Z') };
  const password = randomBytes(24).toString('hex');
  const config = readOwnerConfig({
    OWNER_LOGIN: randomUUID(),
    OWNER_PASSWORD_HASH: hashPassword(password),
    OWNER_COOKIE_SECRET: randomBytes(48).toString('hex'),
    OWNER_ALLOWED_ORIGIN: 'http://localhost:5173',
  });
  const app = buildApp({ config, now: () => clock.now });
  const client = createClient({ baseUrl: await app.listen({ host: '127.0.0.1', port: 0 }) });
  const login = await ownerLogin({
    client,
    body: { login: config.login, password },
    headers: { Origin: config.allowedOrigin },
  });
  const headers = {
    Origin: config.allowedOrigin,
    Cookie: login.response!.headers.get('set-cookie')!.split(';')[0]!,
  };
  await replaceWeeklySchedule({
    client,
    headers,
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
      headers,
      body: { title: 'Consultation', description: 'Private snapshot', durationMinutes: 30 },
    })
  ).data!.meetingType;
  const body = {
    attemptId: randomUUID(),
    meetingTypeId: type.id,
    startsAt: '2026-11-10T06:00:00Z',
    guestName: ' Alice ',
    guestEmail: ' Alice@Example.test ',
    comment: 'a\r\nb',
  };
  const authenticate = async () => {
    const result = await ownerLogin({
      client,
      body: { login: config.login, password },
      headers: { Origin: config.allowedOrigin },
    });
    headers.Cookie = result.response!.headers.get('set-cookie')!.split(';')[0]!;
  };
  return { app, client, headers, type, body, clock, authenticate };
}

test('booking, contacts and secret disappear exactly thirty days after planned end without waiting for cleanup', async () => {
  const { app, client, headers, body, clock, authenticate } = await server();
  try {
    const created = (await createBooking({ client, body })).data!;
    const token = created.confirmationUrl.split('/').at(-1)!;
    clock.now = Date.parse('2026-12-10T06:29:59.999Z');
    await authenticate();
    expect((await getConfirmation({ client, path: { token } })).data).toEqual(created.booking);
    expect(
      (await getOwnerBooking({ client, headers, path: { id: created.booking.id } })).data
        ?.guestName,
    ).toBe('Alice');
    expect(
      (await listOwnerBookings({ client, headers, query: { group: 'past' } })).data!.items,
    ).toHaveLength(1);
    expect((await createBooking({ client, body })).data).toEqual(created);
    clock.now = Date.parse('2026-12-10T06:30:00.000Z');
    const expired = await getConfirmation({ client, path: { token } });
    const missing = await getConfirmation({ client, path: { token: 'invalid' } });
    expect(expired.response!.status).toBe(404);
    expect(expired.error).toEqual({ code: 'NOT_FOUND', message: 'Запись не найдена' });
    expect(expired.error).toEqual(missing.error);
    expect(expired.response!.headers.get('cache-control')).toBe('no-store');
    expect(
      (await getOwnerBooking({ client, headers, path: { id: created.booking.id } })).response!
        .status,
    ).toBe(404);
    for (const group of ['past', 'upcoming', 'cancelled'] as const)
      expect((await listOwnerBookings({ client, headers, query: { group } })).data!.items).toEqual(
        [],
      );
    expect((await createBooking({ client, body })).error?.code).toBe('TIME_UNAVAILABLE');
    const replacement = await createBooking({
      client,
      body: { ...body, startsAt: '2026-12-11T07:00:00Z', guestName: 'New contact' },
    });
    expect(replacement.response!.status).toBe(200);
    expect(replacement.data!.booking.id).not.toBe(created.booking.id);
  } finally {
    await app.close();
  }
});

test('minute cleanup and concurrent retries cannot recover an expired successful attempt', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const { app, client, headers, body, clock, authenticate } = await server();
  try {
    const created = (await createBooking({ client, body })).data!;
    clock.now = Date.parse('2026-12-10T06:30:00.000Z');
    await authenticate();
    const replacement = { ...body, startsAt: '2026-12-11T07:00:00Z', guestName: 'New contact' };
    const [first, second] = await Promise.all([
      createBooking({ client, body: replacement }),
      createBooking({ client, body: replacement }),
      vi.advanceTimersByTimeAsync(60_000),
    ]);
    expect(first.response!.status).toBe(200);
    expect(first.data).toEqual(second.data);
    expect(first.data!.booking.id).not.toBe(created.booking.id);
    expect(
      (await listOwnerBookings({ client, headers, query: { group: 'upcoming' } })).data!.items,
    ).toHaveLength(1);
    expect(
      (await listOwnerBookings({ client, headers, query: { group: 'past' } })).data!.items,
    ).toEqual([]);
  } finally {
    await app.close();
    vi.useRealTimers();
  }
});

test('minute cleanup permanently removes old links and stops when the app closes', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const { app, client, body, clock } = await server();
  try {
    const created = (await createBooking({ client, body })).data!;
    const token = created.confirmationUrl.split('/').at(-1)!;
    clock.now = Date.parse('2026-12-10T06:30:00.000Z');
    await vi.advanceTimersByTimeAsync(59_999);
    // Correcting the injected clock distinguishes physical deletion from read-time invisibility.
    clock.now = Date.parse('2026-12-10T06:29:59.999Z');
    expect((await getConfirmation({ client, path: { token } })).response!.status).toBe(200);
    clock.now = Date.parse('2026-12-10T06:30:00.000Z');
    await vi.advanceTimersByTimeAsync(1);
    clock.now = Date.parse('2026-12-10T06:29:59.999Z');
    expect((await getConfirmation({ client, path: { token } })).response!.status).toBe(404);
  } finally {
    await app.close();
    // A closed application must never consult its clock for further cleanup.
    Object.defineProperty(clock, 'now', {
      get() {
        throw new Error('Closed application clock accessed');
      },
    });
    try {
      await vi.advanceTimersByTimeAsync(120_000);
    } finally {
      vi.useRealTimers();
    }
  }
});

test('restart before retention loses domain data and links while the same attempt can create afresh', async () => {
  const first = await server();
  const created = (await createBooking({ client: first.client, body: first.body })).data!;
  await first.app.close();
  const second = await server();
  try {
    const token = created.confirmationUrl.split('/').at(-1)!;
    expect(
      (await getConfirmation({ client: second.client, path: { token } })).response!.status,
    ).toBe(404);
    expect(
      (
        await getOwnerBooking({
          client: second.client,
          headers: second.headers,
          path: { id: created.booking.id },
        })
      ).response!.status,
    ).toBe(404);
    expect(
      (
        await listOwnerBookings({
          client: second.client,
          headers: second.headers,
          query: { group: 'upcoming' },
        })
      ).data!.items,
    ).toEqual([]);
    expect((await createBooking({ client: second.client, body: first.body })).error?.code).toBe(
      'NOT_FOUND',
    );
    const replacement = await createBooking({
      client: second.client,
      body: { ...second.body, attemptId: first.body.attemptId },
    });
    expect(replacement.response!.status).toBe(200);
    expect(replacement.data!.booking.id).not.toBe(created.booking.id);
    expect(replacement.data!.confirmationUrl).not.toBe(created.confirmationUrl);
  } finally {
    await second.app.close();
  }
});
