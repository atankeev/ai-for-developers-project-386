import { test, expect } from './fixtures.js';
test('owner appends independently, retains cards on failure and expands long comments', async ({
  page,
  owner,
}) => {
  await page.goto('/owner/login');
  await page.getByLabel('Логин', { exact: true }).fill(owner.login);
  await page.getByLabel('Пароль', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.evaluate(async () => {
    const send = async (url: string, body: unknown, method: 'POST' | 'PUT' = 'POST') =>
      (
        await fetch(`/api/${url}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      ).json();
    await send(
      'owner/schedule',
      {
        expectedVersion: 1,
        days: [1, 2, 3, 4, 5, 6, 7].map((day) => ({
          day,
          intervals: [{ start: '09:00', end: '18:00' }],
        })),
      },
      'PUT',
    );
    const { meetingType } = await send('owner/meeting-types', {
      title: 'Снимок встречи',
      description: 'Описание условий',
      durationMinutes: 30,
    });
    for (let i = 0; i < 45; i++) {
      const day = String(10 + Math.floor(i / 18)).padStart(2, '0'),
        hour = String(6 + Math.floor((i % 18) / 2)).padStart(2, '0');
      await send('bookings', {
        attemptId: crypto.randomUUID(),
        meetingTypeId: meetingType.id,
        startsAt: `2026-11-${day}T${hour}:${i % 2 ? '30' : '00'}:00Z`,
        guestName: `Гость ${i}`,
        guestEmail: `guest${i}@example.test`,
        comment: i === 0 ? 'Первая\nВторая\nТретья\nЧетвёртая' : 'Короткий комментарий',
      });
    }
  });
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await expect(page.locator('.meeting-card')).toHaveCount(20);
  await expect(page.getByText('Описание условий', { exact: true })).toHaveCount(20);
  await page.getByRole('button', { name: 'Развернуть комментарий', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Свернуть комментарий', exact: true }),
  ).toHaveAttribute('aria-expanded', 'true');
  let fail = true;
  await page.route('**/api/owner/bookings?*', async (route) => {
    if (new URL(route.request().url()).searchParams.has('cursor') && fail) {
      fail = false;
      await route.abort();
    } else await route.fallback();
  });
  await page.getByRole('button', { name: 'Показать ещё', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Не удалось загрузить следующую порцию');
  await expect(page.locator('.meeting-card')).toHaveCount(20);
  await page.getByRole('button', { name: 'Повторить загрузку', exact: true }).click();
  await expect(page.locator('.meeting-card')).toHaveCount(40);
  await page.getByRole('button', { name: 'Показать ещё', exact: true }).click();
  await expect(page.locator('.meeting-card')).toHaveCount(45);
  await expect(page.getByRole('button', { name: 'Показать ещё', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Прошедшие', exact: true }).click();
  await expect(page.getByText('Прошедших встреч нет', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Предстоящие и текущие', exact: true }).click();
  await expect(page.locator('.meeting-card')).toHaveCount(45);
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await expect(page.locator('.meeting-card')).toHaveCount(20);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});

test('owner time badges and past transition follow clock boundaries without polling; visibility refreshes', async ({
  page,
  owner,
  serverClock,
}) => {
  await page.goto('/owner/login');
  await page.getByLabel('Логин', { exact: true }).fill(owner.login);
  await page.getByLabel('Пароль', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.evaluate(async () => {
    const send = async (url: string, body: unknown, method: 'POST' | 'PUT' = 'POST') =>
      (
        await fetch(`/api/${url}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      ).json();
    await send(
      'owner/schedule',
      {
        expectedVersion: 1,
        days: [1, 2, 3, 4, 5, 6, 7].map((day) => ({
          day,
          intervals: [{ start: '09:00', end: '18:00' }],
        })),
      },
      'PUT',
    );
    const { meetingType } = await send('owner/meeting-types', {
      title: 'Граница времени',
      description: 'Снимок',
      durationMinutes: 30,
    });
    await send('bookings', {
      attemptId: crypto.randomUUID(),
      meetingTypeId: meetingType.id,
      startsAt: '2026-11-10T06:00:00Z',
      guestName: 'Гость',
      guestEmail: 'boundary@example.test',
    });
  });
  serverClock.now = Date.parse('2026-11-10T05:59:59Z');
  await page.clock.setSystemTime(serverClock.now);
  await page.evaluate(async (credentials) => {
    await fetch('/api/owner/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
  }, owner);
  await page.goto('/owner/bookings');
  await expect(page.locator('.meeting-card')).toHaveCount(1);
  await expect(page.getByText('Идёт', { exact: true })).toHaveCount(0);
  let reads = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/owner/bookings') reads++;
  });
  serverClock.now += 1000;
  await page.clock.runFor(1000);
  await expect(page.getByText('Идёт', { exact: true })).toBeVisible();
  serverClock.now += 30 * 60000;
  await page.clock.runFor(30 * 60000);
  await expect(page.locator('.meeting-card')).toHaveCount(0);
  expect(reads).toBe(0);
  await page.getByRole('button', { name: 'Прошедшие', exact: true }).click();
  await expect(page.locator('.meeting-card')).toHaveCount(1);
  await expect(page.getByText('Идёт', { exact: true })).toHaveCount(0);
  const before = reads;
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => reads).toBe(before + 1);
  await expect(page.locator('.meeting-card')).toHaveCount(1);
});
