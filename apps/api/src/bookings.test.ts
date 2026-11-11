import { randomBytes, randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import {
  createBooking,
  createMeetingType,
  replaceWeeklySchedule,
  ownerLogin,
  getConfirmation,
  listOwnerBookings,
  getOwnerBooking,
  getAvailability,
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
  const app = buildApp({ config, now: () => Date.parse('2026-11-09T06:00:00Z') });
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
  return { app, client, headers, type, body };
}

test('guest creates one private booking and reads a public confirmation; owner sees contacts', async () => {
  const { app, client, headers, body } = await server();
  try {
    const created = await createBooking({ client, body });
    expect(created.response!.status).toBe(200);
    expect(created.response!.headers.get('cache-control')).toBe('no-store');
    expect(created.data!.booking).toEqual({
      id: expect.any(String),
      title: 'Consultation',
      startsAt: '2026-11-10T06:00:00.000Z',
      endsAt: '2026-11-10T06:30:00.000Z',
      timeZone: 'Europe/Moscow',
      status: 'confirmed',
    });
    const token = created.data!.confirmationUrl.split('/').at(-1)!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await getConfirmation({ client, path: { token } })).data).toEqual(
      created.data!.booking,
    );
    expect(
      (await listOwnerBookings({ client, query: { group: 'upcoming' } })).response!.status,
    ).toBe(401);
    const list = (await listOwnerBookings({ client, headers, query: { group: 'upcoming' } })).data!;
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      guestName: 'Alice',
      guestEmail: 'Alice@Example.test',
      comment: 'a\nb',
      description: 'Private snapshot',
    });
    expect(Object.keys(list.items[0]!)).not.toEqual(expect.arrayContaining(['attemptId', 'token']));
    expect(
      (await getOwnerBooking({ client, headers, path: { id: list.items[0]!.id } })).data,
    ).toEqual(list.items[0]);
  } finally {
    await app.close();
  }
});

test('parallel overlapping types create one booking; adjacent intervals and normalized repeats remain safe', async () => {
  const { app, client, headers, body } = await server();
  try {
    const other = (
      await createMeetingType({
        client,
        headers,
        body: { title: 'Other type', durationMinutes: 60 },
      })
    ).data!.meetingType;
    const results = await Promise.all([
      createBooking({ client, body }),
      createBooking({
        client,
        body: {
          ...body,
          attemptId: randomUUID(),
          meetingTypeId: other.id,
          startsAt: '2026-11-10T06:15:00Z',
        },
      }),
    ]);
    expect(results.map((r) => r.response!.status).sort()).toEqual([200, 400]);
    expect(results.find((r) => r.error)?.error?.code).toBe('SLOT_OCCUPIED');
    const winner = results.find((r) => r.data)!.data!;
    const original = results[0]!.data ? body : { ...body, meetingTypeId: other.id };
    if (results[0]!.data) {
      const repeat = await createBooking({
        client,
        body: {
          ...body,
          guestName: 'Alice',
          guestEmail: 'Alice@Example.test',
          comment: 'a\nb',
          startsAt: '2026-11-10T09:00:00+03:00',
        },
      });
      expect(repeat.data).toEqual(winner);
      expect(
        (await createBooking({ client, body: { ...body, guestEmail: 'alice@Example.test' } })).error
          ?.code,
      ).toBe('ATTEMPT_DATA_MISMATCH');
    }
    const adjacent = await createBooking({
      client,
      body: { ...original, attemptId: randomUUID(), startsAt: winner.booking.endsAt },
    });
    expect(adjacent.response!.status).toBe(200);
    const available = (await getAvailability({ client, path: { id: body.meetingTypeId } })).data!;
    expect(available.days[0]!.slots.some((slot) => slot.startsAt === winner.booking.startsAt)).toBe(
      false,
    );
  } finally {
    await app.close();
  }
});

test('same attempt concurrent requests share one link and mismatched data never creates duplicates', async () => {
  const { app, client, headers, body } = await server();
  try {
    const results = await Promise.all([1, 2].map(() => createBooking({ client, body })));
    expect(results[0]!.data).toEqual(results[1]!.data);
    const mismatch = await createBooking({
      client,
      body: { ...body, startsAt: '2026-11-10T07:00:00Z' },
    });
    expect(mismatch.error?.code).toBe('ATTEMPT_DATA_MISMATCH');
    expect(
      (await listOwnerBookings({ client, headers, query: { group: 'upcoming' } })).data!.items,
    ).toHaveLength(1);
  } finally {
    await app.close();
  }
});

test.each([
  '2026-02-30T06:00:00Z',
  '2026-13-10T06:00:00Z',
  '2026-11-10T06:00:01Z',
  '2026-11-10T06:00:00.001Z',
  '2026-11-10T06:00:00',
  '2026-11-10T25:00:00Z',
  '2026-11-10T06:00:00+24:00',
])('invalid instant %s is rejected before attempting creation', async (startsAt) => {
  const { app, client, body } = await server();
  try {
    expect((await createBooking({ client, body: { ...body, startsAt } })).error).toMatchObject({
      code: 'VALIDATION_ERROR',
      fieldErrors: { startsAt: expect.any(String) },
    });
  } finally {
    await app.close();
  }
});

test('failed attempts are editable and contacts use Unicode limits independently of email identity', async () => {
  const { app, client, body } = await server();
  try {
    expect(
      (await createBooking({ client, body: { ...body, startsAt: '2026-11-10T06:01:00Z' } })).error
        ?.code,
    ).toBe('TIME_UNAVAILABLE');
    expect(
      (await createBooking({ client, body: { ...body, guestName: '😀'.repeat(101) } })).error
        ?.fieldErrors,
    ).toHaveProperty('guestName');
    expect(
      (
        await createBooking({
          client,
          body: { ...body, guestName: '😀'.repeat(100), comment: '😀'.repeat(2000) },
        })
      ).response!.status,
    ).toBe(200);
    expect(
      (
        await createBooking({
          client,
          body: { ...body, attemptId: randomUUID(), startsAt: '2026-11-10T06:30:00Z' },
        })
      ).response!.status,
    ).toBe(200);
  } finally {
    await app.close();
  }
});

test('concurrent different data for one attempt creates at most one booking', async () => {
  const { app, client, body, headers } = await server();
  try {
    const results = await Promise.all(
      ['Alice', 'Bob'].map((guestName) => createBooking({ client, body: { ...body, guestName } })),
    );
    expect(results.map((result) => result.response!.status).sort()).toEqual([200, 400]);
    expect(results.find((result) => result.error)?.error?.code).toBe('ATTEMPT_DATA_MISMATCH');
    expect(
      (await listOwnerBookings({ client, headers, query: { group: 'upcoming' } })).data!.items,
    ).toHaveLength(1);
  } finally {
    await app.close();
  }
});

test('restart loses bookings, confirmation links and successful attempts', async () => {
  const first = await server(),
    second = await server();
  try {
    const created = (await createBooking({ client: first.client, body: first.body })).data!;
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
    expect((await createBooking({ client: second.client, body: first.body })).error?.code).toBe(
      'NOT_FOUND',
    );
    expect(
      (
        await listOwnerBookings({
          client: second.client,
          headers: second.headers,
          query: { group: 'upcoming' },
        })
      ).data!.items,
    ).toEqual([]);
  } finally {
    await first.app.close();
    await second.app.close();
  }
});

test('owner first view returns at most twenty bookings in start order', async () => {
  const { app, client, headers, body } = await server();
  try {
    for (let index = 20; index >= 0; index--) {
      const day = index < 18 ? '10' : '11';
      const offset = index % 18;
      const hour = String(6 + Math.floor(offset / 2)).padStart(2, '0');
      const minute = offset % 2 ? '30' : '00';
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
    const result = (await listOwnerBookings({ client, headers, query: { group: 'upcoming' } }))
      .data!;
    expect(result.items).toHaveLength(20);
    expect(result.items[0]!.startsAt).toBe('2026-11-10T06:00:00.000Z');
    expect(result.items[19]!.startsAt).toBe('2026-11-11T06:30:00.000Z');
  } finally {
    await app.close();
  }
});
