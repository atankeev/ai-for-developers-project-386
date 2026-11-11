import { test, expect } from './fixtures.js';
import type { Page } from '@playwright/test';
async function setup(page: Page, owner: { login: string; password: string }) {
  await page.goto('/owner/login');
  await page.getByLabel('Логин', { exact: true }).fill(owner.login);
  await page.getByLabel('Пароль', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  const created = await page.evaluate(async () => {
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
      title: 'Встреча для отмены',
      durationMinutes: 30,
    });
    return send('bookings', {
      attemptId: crypto.randomUUID(),
      meetingTypeId: meetingType.id,
      startsAt: '2026-11-10T06:00:00Z',
      guestName: 'Александра',
      guestEmail: 'guest@example.test',
    });
  });
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await expect(page.locator('.meeting-card')).toHaveCount(1);
  return created as { booking: { id: string }; confirmationUrl: string };
}
test('cancellation dialog is safe by keyboard and cancelled result reaches the guest', async ({
  page,
  owner,
}) => {
  const created = await setup(page, owner);
  const cancel = page.getByRole('button', { name: 'Отменить запись', exact: true });
  await cancel.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Встреча для отмены');
  await expect(dialog).toContainText('Александра');
  await expect(dialog).toContainText('10 ноября 2026');
  await expect(dialog.getByRole('button', { name: 'Оставить запись' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(cancel).toBeFocused();
  await page.keyboard.press('Enter');
  await dialog.getByRole('button', { name: 'Оставить запись' }).click();
  await expect(cancel).toBeFocused();
  await cancel.click();
  await dialog.getByRole('button', { name: 'Подтвердить отмену' }).click();
  await expect(page.getByRole('status')).toContainText('Запись отменена');
  await expect(page.locator('.meeting-card')).toHaveCount(0);
  await page.getByRole('button', { name: 'Отменённые', exact: true }).click();
  await expect(page.locator('.meeting-card')).toHaveCount(1);
  await expect(cancel).toHaveCount(0);
  await page.goto(created.confirmationUrl);
  await expect(page.getByRole('heading', { name: 'Запись отменена', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Обновить статус' })).toBeVisible();
  await expect(page.getByText('Александра', { exact: true })).toHaveCount(0);
});

test('lost successful cancellation response reads current card; failed checks never repeat cancellation', async ({
  page,
  owner,
  bookingFault,
}) => {
  await setup(page, owner);
  let posts = 0,
    reads = 0,
    failChecks = true;
  page.on('request', (request) => {
    if (request.url().endsWith('/cancel')) posts++;
  });
  await page.route('**/api/owner/bookings/*', async (route) => {
    if (route.request().method() === 'GET') {
      reads++;
      if (failChecks) {
        await route.abort();
        return;
      }
    }
    await route.fallback();
  });
  bookingFault.cancelDropNext = true;
  await page.getByRole('button', { name: 'Отменить запись', exact: true }).click();
  await page.getByRole('button', { name: 'Подтвердить отмену', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Не удалось проверить результат отмены');
  expect(posts).toBe(1);
  await page.getByRole('button', { name: 'Повторить проверку' }).click();
  await expect.poll(() => reads).toBe(2);
  expect(posts).toBe(1);
  failChecks = false;
  await page.getByRole('button', { name: 'Повторить проверку' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Запись отменена');
  expect(posts).toBe(1);
});

test('unknown cancellation with no server change permits only a manual new cancellation', async ({
  page,
  owner,
}) => {
  await setup(page, owner);
  let posts = 0;
  await page.route('**/api/owner/bookings/*/cancel', async (route) => {
    posts++;
    if (posts === 1) await route.abort();
    else await route.fallback();
  });
  await page.getByRole('button', { name: 'Отменить запись', exact: true }).click();
  await page.getByRole('button', { name: 'Подтвердить отмену' }).click();
  await expect(page.getByRole('dialog')).toContainText(
    'Запись действует. Можно подтвердить отмену вручную.',
  );
  expect(posts).toBe(1);
  await page.getByRole('button', { name: 'Подтвердить отмену' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(posts).toBe(2);
});

test('meeting starting inside the dialog is rejected and current meeting has no cancellation', async ({
  page,
  owner,
  serverClock,
}) => {
  const created = await setup(page, owner);
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
  await page.getByRole('button', { name: 'Отменить запись', exact: true }).click();
  serverClock.now += 1000;
  await page.clock.runFor(1000);
  await page.getByRole('button', { name: 'Подтвердить отмену' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('Отмена недоступна: встреча уже началась');
  await expect(page.getByRole('button', { name: 'Отменить запись', exact: true })).toHaveCount(0);
  await page.goto(created.confirmationUrl);
  await expect(
    page.getByRole('heading', { name: 'Запись подтверждена', exact: true }),
  ).toBeVisible();
});

test('guest refreshes cancellation by button and visibility; expired owner session never replays cancellation', async ({
  page,
  owner,
  serverClock,
}) => {
  const created = await setup(page, owner);
  await page.goto(created.confirmationUrl);
  await page.evaluate(async (id) => {
    await fetch(`/api/owner/bookings/${id}/cancel`, { method: 'POST' });
  }, created.booking.id);
  await expect(
    page.getByRole('heading', { name: 'Запись подтверждена', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Обновить статус' }).click();
  await expect(page.getByRole('heading', { name: 'Запись отменена', exact: true })).toBeVisible();
  let reads = 0;
  page.on('request', (r) => {
    if (r.url().includes('/api/confirmations/')) reads++;
  });
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => reads).toBe(1);
  await page.goto('/owner/bookings');
  // Another upcoming booking tests session loss with an open confirmation dialog.
  await page.evaluate(async () => {
    const types = await (await fetch('/api/owner/meeting-types')).json();
    await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        attemptId: crypto.randomUUID(),
        meetingTypeId: types.items[0].id,
        startsAt: '2026-11-10T07:00:00Z',
        guestName: 'Другой гость',
        guestEmail: 'other@example.test',
      }),
    });
  });
  await page.getByRole('button', { name: 'Обновить', exact: true }).click();
  await page.getByRole('button', { name: 'Отменить запись', exact: true }).click();
  serverClock.now += 12 * 60 * 60 * 1000;
  await page.getByRole('button', { name: 'Подтвердить отмену' }).click();
  await expect(page).toHaveURL(/\/owner\/login/);
  await page.getByLabel('Логин', { exact: true }).fill(owner.login);
  await page.getByLabel('Пароль', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page).toHaveURL(/\/owner\/bookings$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Отменить запись', exact: true })).toHaveCount(1);
});
