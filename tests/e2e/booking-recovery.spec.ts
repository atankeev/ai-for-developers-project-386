import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

async function prepare(page: Page, owner: { login: string; password: string }) {
  await page.goto('/owner/login');
  await page.getByLabel('Логин', { exact: true }).fill(owner.login);
  await page.getByLabel('Пароль', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('link', { name: 'Расписание', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить интервал: Вторник', exact: true }).click();
  await page.getByLabel('Вторник: конец 1', { exact: true }).fill('11:00');
  await page.getByRole('button', { name: 'Сохранить неделю', exact: true }).click();
  await expect(page.getByText('Расписание сохранено', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Типы встреч', exact: true }).click();
  for (const title of ['Первая встреча', 'Другая встреча']) {
    await page.getByLabel('Название', { exact: true }).fill(title);
    await page.getByRole('button', { name: 'Создать тип встречи', exact: true }).click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
  }
  await page.goto('/book');
  await page.getByRole('article').filter({ hasText: 'Первая встреча' }).getByRole('link').click();
  await page.getByRole('button', { name: '09:00', exact: true }).click();
  await page.getByLabel('Имя', { exact: true }).fill('Гость');
  await page.getByLabel('Email', { exact: true }).fill('recovery@example.test');
  await page.getByLabel('Комментарий', { exact: true }).fill('Точный\nкомментарий');
  return page.url();
}

test('closing a tab preserves the exact sent attempt, manual retry works while browsing another type', async ({
  page,
  context,
  owner,
  bookingFault,
}) => {
  const url = await prepare(page, owner);
  const sent: unknown[] = [];
  context.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/bookings' && request.method() === 'POST')
      sent.push(request.postDataJSON());
  });
  bookingFault.dropNext = true;
  await page.getByRole('button', { name: 'Подтвердить запись', exact: true }).click();
  await expect(page.getByText(/Результат отправки неизвестен/)).toBeVisible();
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto('/book');
  await expect(reopened.getByText(/Результат отправки неизвестен/)).toBeVisible();
  await reopened
    .getByRole('article')
    .filter({ hasText: 'Другая встреча' })
    .getByRole('link')
    .click();
  await expect(reopened.getByLabel('Имя', { exact: true })).toBeDisabled();
  await expect(reopened.locator('.time-buttons button').first()).toBeDisabled();
  await expect(
    reopened.getByRole('button', { name: 'Подтвердить запись', exact: true }),
  ).toBeDisabled();
  expect(sent).toHaveLength(1);
  await reopened.getByRole('button', { name: 'Повторить ту же попытку', exact: true }).click();
  await expect(reopened).toHaveURL(/\/confirmations\//);
  await expect(reopened.getByText('Первая встреча', { exact: true })).toBeVisible();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toEqual(sent[0]);
  await reopened.goto(url);
  await expect(reopened.getByText(/Результат отправки неизвестен/)).toHaveCount(0);
  await expect(reopened.getByLabel('Имя', { exact: true })).toHaveValue('');
  await reopened.goto('/owner/bookings');
  await expect(reopened.getByText('recovery@example.test', { exact: true })).toHaveCount(1);
});

test('saved uncertainty expires at the meeting start and on returning to the tab without a POST', async ({
  page,
  owner,
  bookingFault,
  serverClock,
}) => {
  const url = await prepare(page, owner);
  bookingFault.dropBefore = true;
  await page.getByRole('button', { name: 'Подтвердить запись', exact: true }).click();
  await expect(page.getByText(/Результат отправки неизвестен/)).toBeVisible();
  serverClock.now = Date.parse('2026-11-10T05:59:59.999Z');
  await page.clock.pauseAt(serverClock.now);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByText(/Результат отправки неизвестен/)).toBeVisible();
  serverClock.now++;
  await page.clock.runFor(1);
  await expect(page.getByText(/Время встречи уже наступило/)).toBeVisible();
  await expect(page.getByLabel('Имя', { exact: true })).toBeEnabled();
  await page.goto(url);
  await expect(page.getByText(/Результат отправки неизвестен/)).toHaveCount(0);
  await expect(page.getByLabel('Имя', { exact: true })).toHaveValue('');
});

test('a definite refusal clears recovery, refreshes availability and preserves editable contacts', async ({
  page,
  owner,
  bookingFault,
}) => {
  await prepare(page, owner);
  bookingFault.dropBefore = true;
  await page.getByRole('button', { name: 'Подтвердить запись', exact: true }).click();
  await expect(page.getByText(/Результат отправки неизвестен/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Результат отправки неизвестен/)).toBeVisible();
  await page.evaluate(async () => {
    await fetch('/api/owner/schedule/exceptions/2026-11-10', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion: 0, intervals: [] }),
    });
  });
  await page.getByRole('button', { name: 'Повторить ту же попытку', exact: true }).click();
  await expect(page.getByText(/Результат отправки неизвестен/)).toHaveCount(0);
  await expect(page.getByLabel('Имя', { exact: true })).toBeEnabled();
  await expect(page.getByLabel('Имя', { exact: true })).toHaveValue('Гость');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('recovery@example.test');
  await expect(page.getByLabel('Комментарий', { exact: true })).toHaveValue('Точный\nкомментарий');
  await expect(page.getByRole('button', { name: /Выбрать дату вт, 10 ноября/ })).toBeDisabled();
  await page.reload();
  await expect(page.getByText(/Результат отправки неизвестен/)).toHaveCount(0);
  await expect(page.getByLabel('Имя', { exact: true })).toHaveValue('');
});

test('unsent contacts stay transient and malformed recovery cannot block a new booking', async ({
  page,
  owner,
}) => {
  const url = await prepare(page, owner);
  await page.reload();
  await expect(page.getByLabel('Имя', { exact: true })).toHaveValue('');
  for (const malformed of [
    '{',
    JSON.stringify({ startsAt: '2026-02-30T06:00:00Z', guestName: 'stale' }),
    JSON.stringify({}),
  ]) {
    await page.evaluate(
      (value) => localStorage.setItem('call-calendar.sent-attempt.v1', value),
      malformed,
    );
    await page.goto(url);
    await expect(page.getByText(/Результат отправки неизвестен/)).toHaveCount(0);
    await expect(page.getByLabel('Имя', { exact: true })).toBeEnabled();
    await expect(page.getByLabel('Имя', { exact: true })).toHaveValue('');
  }
});

for (const returnMethod of ['visibility', 'reload']) {
  test(`expired recovery is discarded on ${returnMethod} without resending`, async ({
    page,
    owner,
    bookingFault,
    serverClock,
  }) => {
    await prepare(page, owner);
    let creates = 0;
    page.on('request', (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/bookings')
        creates++;
    });
    bookingFault.dropBefore = true;
    await page.getByRole('button', { name: 'Подтвердить запись', exact: true }).click();
    await expect(page.getByText(/Результат отправки неизвестен/)).toBeVisible();
    // Move wall time while timers are suspended, as when a browser returns after sleeping.
    await page.clock.pauseAt('2026-11-09T08:00:00Z');
    serverClock.now = Date.parse('2026-11-10T06:00:00Z');
    await page.clock.setSystemTime(serverClock.now);
    if (returnMethod === 'reload') await page.reload();
    else await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    if (returnMethod === 'visibility')
      await expect(page.getByText(/Время встречи уже наступило/)).toBeVisible();
    await expect(page.getByText(/Результат отправки неизвестен/)).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Повторить ту же попытку', exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel('Имя', { exact: true })).toBeEnabled();
    expect(creates).toBe(1);
  });
}
