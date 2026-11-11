import { test, expect } from './fixtures.js';

test('confirmation and owner contacts remain until planned end plus thirty days and disappear on refresh', async ({
  page,
  owner,
  serverClock,
}) => {
  await page.goto('/owner/login');
  await page.getByLabel('Логин', { exact: true }).fill(owner.login);
  await page.getByLabel('Пароль', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  const confirmation = await page.evaluate(async () => {
    const send = async (url: string, body: unknown, method: 'POST' | 'PUT' = 'POST') => {
      const response = await fetch(`/api/${url}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`Setup failed: ${response.status}`);
      return response.json();
    };
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
      title: 'Срок хранения',
      durationMinutes: 30,
    });
    const result = await send('bookings', {
      attemptId: crypto.randomUUID(),
      meetingTypeId: meetingType.id,
      startsAt: '2026-11-10T06:00:00Z',
      guestName: 'Гость',
      guestEmail: 'retention@example.test',
      comment: 'Контакт до срока',
    });
    return result.confirmationUrl as string;
  });
  serverClock.now = Date.parse('2026-12-10T06:29:59.999Z');
  await page.clock.setSystemTime(serverClock.now);
  await page.evaluate(async (credentials) => {
    await fetch('/api/owner/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
  }, owner);
  await page.goto(confirmation);
  await expect(
    page.getByRole('heading', { name: 'Запись подтверждена', exact: true }),
  ).toBeVisible();
  await page.goto('/owner/bookings');
  await page.getByRole('button', { name: 'Прошедшие', exact: true }).click();
  await expect(page.getByText('retention@example.test', { exact: true })).toBeVisible();
  await expect(page.getByText('Контакт до срока', { exact: true })).toBeVisible();
  serverClock.now += 1;
  await page.clock.setSystemTime(serverClock.now);
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await expect(page.getByText('Прошедших встреч нет', { exact: true })).toBeVisible();
  await expect(page.getByText('retention@example.test', { exact: true })).toHaveCount(0);
  await page.goto(confirmation);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Подтверждение не найдено', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Срок хранения', { exact: true })).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});
