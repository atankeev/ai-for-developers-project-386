import { randomBytes, randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import {
  createBooking,
  createMeetingType,
  replaceWeeklySchedule,
  ownerLogin,
  listOwnerBookings,
} from '@call-calendar/api-contract';
import { createClient } from '@call-calendar/api-contract/client';
import { buildApp } from './app.js';
import { hashPassword, readOwnerConfig } from './auth.js';

async function server() {
  const password = randomBytes(24).toString('hex');
  const config = readOwnerConfig({
    OWNER_LOGIN: randomUUID(),
    OWNER_PASSWORD_HASH: hashPassword(password),
    OWNER_COOKIE_SECRET: randomBytes(48).toString('hex'),
    OWNER_ALLOWED_ORIGIN: 'http://localhost:5173',
  });
  let time = Date.parse('2026-11-09T06:00:00Z');
  const app = buildApp({ config, now: () => time });
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
  return {
    app,
    client,
    headers,
    type,
    body,
    login: async () => {
      const result = await ownerLogin({
        client,
        body: { login: config.login, password },
        headers: { Origin: config.allowedOrigin },
      });
      headers.Cookie = result.response!.headers.get('set-cookie')!.split(';')[0]!;
    },
    setNow: (value: string) => {
      time = Date.parse(value);
    },
  };
}

test('owner independently continues twenty-item pages and time categories use the exact end boundary', async () => {
  const { app, client, headers, body, setNow, login } = await server();
  try {
    for (let i = 44; i >= 0; i--) {
      const day = String(10 + Math.floor(i / 18)).padStart(2, '0');
      const hour = String(6 + Math.floor((i % 18) / 2)).padStart(2, '0');
      const minute = i % 2 ? '30' : '00';
      expect(
        (
          await createBooking({
            client,
            body: {
              ...body,
              attemptId: randomUUID(),
              startsAt: `2026-11-${day}T${hour}:${minute}:00Z`,
            },
          })
        ).response!.status,
      ).toBe(200);
    }
    const first = (await listOwnerBookings({ client, headers, query: { group: 'upcoming' } }))
      .data!;
    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = (
      await listOwnerBookings({
        client,
        headers,
        query: { group: 'upcoming', cursor: first.nextCursor! },
      })
    ).data!;
    expect(second.items).toHaveLength(20);
    const third = (
      await listOwnerBookings({
        client,
        headers,
        query: { group: 'upcoming', cursor: second.nextCursor! },
      })
    ).data!;
    expect(third.items).toHaveLength(5);
    expect(third.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items, ...third.items].map((b) => b.id)).size).toBe(
      45,
    );
    setNow('2026-11-10T05:59:59.999Z');
    await login();
    expect(
      (await listOwnerBookings({ client, headers, query: { group: 'upcoming' } })).data!.items[0]!
        .id,
    ).toBe(first.items[0]!.id);
    setNow('2026-11-10T06:00:00Z');
    expect(
      (await listOwnerBookings({ client, headers, query: { group: 'upcoming' } })).data!.items[0]!
        .id,
    ).toBe(first.items[0]!.id);
    setNow('2026-11-10T06:29:59.999Z');
    await login();
    expect(
      (await listOwnerBookings({ client, headers, query: { group: 'past' } })).data!.items,
    ).toHaveLength(0);
    setNow('2026-11-10T06:30:00Z');
    const past = (await listOwnerBookings({ client, headers, query: { group: 'past' } })).data!;
    expect(past.items.map((b) => b.startsAt)).toEqual(['2026-11-10T06:00:00.000Z']);
    expect(
      (await listOwnerBookings({ client, headers, query: { group: 'upcoming' } })).data!.items[0]!
        .startsAt,
    ).toBe('2026-11-10T06:30:00.000Z');
    expect(
      (await listOwnerBookings({ client, headers, query: { group: 'cancelled' } })).data!.items,
    ).toEqual([]);
    setNow('2026-11-13T06:00:00Z');
    await login();
    const pastFirst = (await listOwnerBookings({ client, headers, query: { group: 'past' } }))
      .data!;
    const pastSecond = (
      await listOwnerBookings({
        client,
        headers,
        query: { group: 'past', cursor: pastFirst.nextCursor! },
      })
    ).data!;
    const pastThird = (
      await listOwnerBookings({
        client,
        headers,
        query: { group: 'past', cursor: pastSecond.nextCursor! },
      })
    ).data!;
    expect([pastFirst.items.length, pastSecond.items.length, pastThird.items.length]).toEqual([
      20, 20, 5,
    ]);
    expect(pastThird.nextCursor).toBeNull();
    expect([...pastFirst.items, ...pastSecond.items, ...pastThird.items].map((b) => b.id)).toEqual(
      [...first.items, ...second.items, ...third.items].reverse().map((b) => b.id),
    );
  } finally {
    await app.close();
  }
});

test('keyset validates cursor fields, ignores missing cursor records, and excludes new records before its boundary', async () => {
  const { app, client, headers, body } = await server();
  try {
    for (let i = 1; i <= 22; i++) {
      const startsAt = new Date(Date.parse('2026-11-10T06:00:00Z') + i * 30 * 60000).toISOString();
      // Continue the next date after the working day.
      const instant =
        i < 18
          ? startsAt
          : new Date(Date.parse('2026-11-11T06:00:00Z') + (i - 18) * 30 * 60000).toISOString();
      expect(
        (
          await createBooking({
            client,
            body: { ...body, attemptId: randomUUID(), startsAt: instant },
          })
        ).response!.status,
      ).toBe(200);
    }
    const first = (await listOwnerBookings({ client, headers, query: { group: 'upcoming' } }))
      .data!;
    expect(first.items).toHaveLength(20);
    expect((await createBooking({ client, body })).response!.status).toBe(200);
    const next = (
      await listOwnerBookings({
        client,
        headers,
        query: { group: 'upcoming', cursor: first.nextCursor! },
      })
    ).data!;
    expect(next.items).toHaveLength(2);
    expect(next.items.some((b) => first.items.some((a) => a.id === b.id))).toBe(false);
    expect(
      (await listOwnerBookings({ client, headers, query: { group: 'upcoming' } })).data!.items[0]!
        .startsAt,
    ).toBe('2026-11-10T06:00:00.000Z');
    const decoded = JSON.parse(Buffer.from(first.nextCursor!, 'base64url').toString());
    const missing = Buffer.from(
      JSON.stringify({ ...decoded, id: 'ffffffff-ffff-4fff-bfff-ffffffffffff' }),
    ).toString('base64url');
    expect(
      (
        await listOwnerBookings({ client, headers, query: { group: 'upcoming', cursor: missing } })
      ).data!.items.map((b) => b.startsAt),
    ).toEqual(next.items.map((b) => b.startsAt));
    for (const cursor of [
      '',
      'broken',
      Buffer.from('{}').toString('base64url'),
      ...[
        { ...decoded, group: 'past' },
        { ...decoded, startsAt: '2026-02-30T06:00:00.000Z' },
        { ...decoded, id: 'bad' },
        { ...decoded, startsAt: '2026-11-10T06:00:01.000Z' },
      ].map((v) => Buffer.from(JSON.stringify(v)).toString('base64url')),
    ]) {
      const result = await listOwnerBookings({
        client,
        headers,
        query: { group: 'upcoming', cursor },
      });
      expect(result.response!.status).toBe(400);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
      expect(result.response!.headers.get('cache-control')).toBe('no-store');
    }
    const absent = await client.get({ url: '/api/owner/bookings', headers });
    expect(absent.response!.status).toBe(400);
  } finally {
    await app.close();
  }
});
