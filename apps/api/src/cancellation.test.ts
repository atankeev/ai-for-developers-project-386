import { randomBytes, randomUUID } from 'node:crypto';
import { expect, test } from 'vitest';
import {
  createBooking,
  createMeetingType,
  replaceWeeklySchedule,
  ownerLogin,
  listOwnerBookings,
  cancelBooking,
  getConfirmation,
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
  let time = Date.parse('2026-11-09T06:00:00Z');
  let advanceAfterRead: number | undefined;
  const app = buildApp({
    config,
    now: () => {
      const current = time;
      if (advanceAfterRead !== undefined) {
        time = advanceAfterRead;
        advanceAfterRead = undefined;
      }
      return current;
    },
  });
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
    advanceAtNextClockRead: (value: string) => {
      advanceAfterRead = Date.parse(value);
    },
    setNow: (value: string) => {
      time = Date.parse(value);
    },
  };
}

test('owner cancellation frees time, preserves attempt and confirmation, and isolates cancelled group', async () => {
  const { app, client, headers, body } = await server();
  try {
    const created = (await createBooking({ client, body })).data!;
    const path = { id: created.booking.id };
    expect(
      (await cancelBooking({ client, path, headers: { Origin: headers.Origin } })).response!.status,
    ).toBe(401);
    expect(
      (await cancelBooking({ client, path, headers: { Cookie: headers.Cookie } })).response!.status,
    ).toBe(403);
    const result = await cancelBooking({ client, headers, path });
    expect(result.response!.status).toBe(200);
    expect(result.response!.headers.get('cache-control')).toBe('no-store');
    expect(result.data).toMatchObject({
      status: 'cancelled',
      cancelledAt: '2026-11-09T06:00:00.000Z',
      guestName: 'Alice',
    });
    expect(result.data).not.toHaveProperty('token');
    expect(
      (
        await getConfirmation({
          client,
          path: { token: created.confirmationUrl.split('/').at(-1)! },
        })
      ).data!.status,
    ).toBe('cancelled');
    expect((await createBooking({ client, body })).data!.booking.status).toBe('cancelled');
    expect(
      (await getAvailability({ client, path: { id: body.meetingTypeId } })).data!.days[0]!.slots[0]!
        .startsAt,
    ).toBe('2026-11-10T06:00:00.000Z');
    expect(
      (await listOwnerBookings({ client, headers, query: { group: 'upcoming' } })).data!.items,
    ).toEqual([]);
    expect(
      (await listOwnerBookings({ client, headers, query: { group: 'cancelled' } })).data!.items.map(
        (b) => b.id,
      ),
    ).toEqual([path.id]);
    expect(
      (await createBooking({ client, body: { ...body, attemptId: randomUUID() } })).response!
        .status,
    ).toBe(200);
  } finally {
    await app.close();
  }
});

test.each(['2026-11-10T05:59:59.999Z', '2026-11-10T06:00:00Z', '2026-11-10T06:00:00.001Z'])(
  'cancellation compares processing time strictly at start: %s',
  async (instant) => {
    const { app, client, headers, body, setNow, login } = await server();
    try {
      const created = (await createBooking({ client, body })).data!;
      setNow(instant);
      await login();
      const result = await cancelBooking({ client, headers, path: { id: created.booking.id } });
      if (instant === '2026-11-10T05:59:59.999Z') {
        expect(result.data).toMatchObject({ status: 'cancelled', cancelledAt: instant });
        setNow('2026-11-10T07:00:00Z');
        expect(
          (await cancelBooking({ client, headers, path: { id: created.booking.id } })).data,
        ).toEqual(result.data);
        expect((await createBooking({ client, body })).data!.booking.status).toBe('cancelled');
        expect(
          (await createBooking({ client, body: { ...body, attemptId: randomUUID() } })).error?.code,
        ).toBe('TIME_UNAVAILABLE');
      } else {
        expect(result.response!.status).toBe(400);
        expect(result.error?.code).toBe('CANCELLATION_UNAVAILABLE');
        expect(
          (await listOwnerBookings({ client, headers, query: { group: 'cancelled' } })).data!.items,
        ).toEqual([]);
      }
    } finally {
      await app.close();
    }
  },
);

test('concurrent cancellation and creation follow one sequential order without overlaps', async () => {
  const { app, client, headers, body } = await server();
  try {
    const first = (await createBooking({ client, body })).data!;
    const next = { ...body, attemptId: randomUUID() };
    const [cancel, create] = await Promise.all([
      cancelBooking({ client, headers, path: { id: first.booking.id } }),
      createBooking({ client, body: next }),
    ]);
    expect(cancel.data!.status).toBe('cancelled');
    if (create.error) expect(create.error.code).toBe('SLOT_OCCUPIED');
    const repeated = await createBooking({ client, body: next });
    expect(repeated.data!.booking.status).toBe('confirmed');
    expect(
      (await listOwnerBookings({ client, headers, query: { group: 'upcoming' } })).data!.items.map(
        (b) => b.id,
      ),
    ).toEqual([repeated.data!.booking.id]);
  } finally {
    await app.close();
  }
});

test('cancelled pages sort by planned start and remain independent from current time', async () => {
  const { app, client, headers, body, setNow, login } = await server();
  try {
    const ids: string[] = [];
    for (let i = 0; i < 45; i++) {
      const startsAt = new Date(
        Date.parse('2026-11-10T06:00:00Z') + Math.floor(i / 18) * 86400000 + (i % 18) * 30 * 60000,
      ).toISOString();
      const created = (
        await createBooking({ client, body: { ...body, attemptId: randomUUID(), startsAt } })
      ).data!;
      ids.push(created.booking.id);
      expect(
        (await cancelBooking({ client, headers, path: { id: created.booking.id } })).response!
          .status,
      ).toBe(200);
    }
    setNow('2026-11-13T06:00:00Z');
    await login();
    const first = (await listOwnerBookings({ client, headers, query: { group: 'cancelled' } }))
      .data!;
    const second = (
      await listOwnerBookings({
        client,
        headers,
        query: { group: 'cancelled', cursor: first.nextCursor! },
      })
    ).data!;
    const third = (
      await listOwnerBookings({
        client,
        headers,
        query: { group: 'cancelled', cursor: second.nextCursor! },
      })
    ).data!;
    expect([first.items.length, second.items.length, third.items.length]).toEqual([20, 20, 5]);
    expect(third.nextCursor).toBeNull();
    expect([...first.items, ...second.items, ...third.items].map((b) => b.id)).toEqual(
      ids.reverse(),
    );
    expect(
      (await listOwnerBookings({ client, headers, query: { group: 'past' } })).data!.items,
    ).toEqual([]);
  } finally {
    await app.close();
  }
});

test('request authenticated before start cannot cancel when its mutation processes at start', async () => {
  const { app, client, headers, body, setNow, login, advanceAtNextClockRead } = await server();
  try {
    const created = (await createBooking({ client, body })).data!;
    setNow('2026-11-10T05:59:59.999Z');
    await login();
    // The controlled clock crosses the boundary between request authentication and processing.
    advanceAtNextClockRead('2026-11-10T06:00:00Z');
    const result = await cancelBooking({ client, headers, path: { id: created.booking.id } });
    expect(result.error?.code).toBe('CANCELLATION_UNAVAILABLE');
    expect((await createBooking({ client, body })).data!.booking.status).toBe('confirmed');
  } finally {
    await app.close();
  }
});
