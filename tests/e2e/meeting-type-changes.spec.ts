import { test, expect } from './fixtures.js';
import type { Page } from '@playwright/test';

async function setup(page: Page, owner: { login: string; password: string }) {
  await page.goto('/owner/login');
  await page.getByLabel('Логин', { exact: true }).fill(owner.login);
  await page.getByLabel('Пароль', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page).toHaveURL('/owner/bookings');
  return page.evaluate(async () => {
    const request = async (url: string, body: unknown, method: 'POST' | 'PUT' = 'POST') =>
      (
        await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      ).json();
    await request(
      '/api/owner/schedule',
      {
        expectedVersion: 1,
        days: [1, 2, 3, 4, 5, 6, 7].map((day) => ({
          day,
          intervals: [{ start: '09:00', end: '11:00' }],
        })),
      },
      'PUT',
    );
    const result = await request('/api/owner/meeting-types', {
      title: 'Original',
      description: 'Original description',
      durationMinutes: 30,
    });
    return result.meetingType.id as string;
  });
}
async function change(page: Page, id: string, changes: Record<string, unknown>) {
  await page.evaluate(
    async ({ id, changes }) => {
      const { items } = await (await fetch('/api/owner/meeting-types')).json();
      const current = items.find((item: { id: string }) => item.id === id);
      await fetch(`/api/owner/meeting-types/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...current, expectedVersion: current.version, ...changes }),
      });
    },
    { id, changes },
  );
}

test('owner edits, reloads stale form and restores a hidden type at its original link', async ({
  page,
  owner,
}) => {
  const id = await setup(page, owner);
  await page.getByRole('link', { name: 'Типы встреч', exact: true }).click();
  const edit = page.getByRole('button', { name: 'Редактировать Original', exact: true });
  await edit.focus();
  await expect(edit).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Название', { exact: true })).toBeFocused();
  await page.getByLabel('Название', { exact: true }).fill('Mine');
  await change(page, id, { title: 'Concurrent' });
  await page.getByRole('button', { name: 'Сохранить тип встречи', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Тип встречи изменился');
  await expect(page.getByLabel('Название', { exact: true })).toHaveValue('Mine');
  await page.getByRole('button', { name: 'Загрузить актуальные данные', exact: true }).click();
  await expect(page.getByLabel('Название', { exact: true })).toHaveValue('Concurrent');
  const hide = page.getByLabel('Скрыть тип в каталоге', { exact: true });
  await hide.focus();
  await page.keyboard.press('Space');
  await expect(hide).toBeChecked();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.getByLabel('Длительность, минут', { exact: true }).fill('1440');
  await page.getByRole('button', { name: 'Сохранить тип встречи', exact: true }).click();
  await expect(page.getByText('Скрыт в каталоге', { exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('При текущем расписании запись невозможна');
  await page.getByRole('button', { name: 'Редактировать Concurrent', exact: true }).click();
  await page.getByLabel('Скрыть тип в каталоге', { exact: true }).uncheck();
  await page.getByLabel('Название', { exact: true }).fill('Restored');
  await page.getByLabel('Длительность, минут', { exact: true }).fill('17');
  await page.getByRole('button', { name: 'Сохранить тип встречи', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Restored', exact: true })).toBeVisible();
  await page.goto(`/book/${id}`);
  await expect(page.getByRole('heading', { name: 'Restored', exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});

test('guest keeps contacts after type is hidden and chooses another offer explicitly', async ({
  page,
  owner,
}) => {
  const id = await setup(page, owner);
  await page.evaluate(async () => {
    await fetch('/api/owner/meeting-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Alternative', durationMinutes: 30 }),
    });
  });
  await page.goto(`/book/${id}`);
  await page.getByRole('button', { name: '09:00', exact: true }).click();
  await page.getByLabel('Имя', { exact: true }).fill('Guest');
  await page.getByLabel('Email', { exact: true }).fill('guest@example.test');
  await page.getByLabel('Комментарий', { exact: true }).fill('Keep this');
  await change(page, id, { hidden: true });
  await page.getByRole('button', { name: 'Подтвердить запись', exact: true }).click();
  await expect(
    page.getByText('Тип встречи недоступен. Выберите другую встречу в каталоге.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Вернуться к типам встреч', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Original', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Выбрать встречу', exact: true }).click();
  await expect(page.getByLabel('Имя', { exact: true })).toHaveValue('Guest');
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('guest@example.test');
  await expect(page.getByLabel('Комментарий', { exact: true })).toHaveValue('Keep this');
  await expect(page.locator('.time-buttons button[aria-pressed="true"]')).toHaveCount(0);
});

test('guest sees actual successful conditions and can reselect after current duration no longer fits', async ({
  page,
  owner,
}) => {
  const id = await setup(page, owner);
  await page.goto(`/book/${id}`);
  await page.getByRole('button', { name: '10:30', exact: true }).click();
  await page.getByLabel('Имя', { exact: true }).fill('Guest');
  await page.getByLabel('Email', { exact: true }).fill('guest@example.test');
  await change(page, id, {
    title: 'Current',
    description: 'Current description',
    durationMinutes: 60,
  });
  await page.getByRole('button', { name: 'Подтвердить запись', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Выбранное время больше недоступно');
  await expect(page.getByRole('heading', { name: 'Current', exact: true })).toBeVisible();
  await expect(page.getByLabel('Имя', { exact: true })).toHaveValue('Guest');
  await expect(page.locator('.time-buttons button[aria-pressed="true"]')).toHaveCount(0);
  await page.getByRole('button', { name: '09:00', exact: true }).click();
  await change(page, id, { title: 'Actual', durationMinutes: 90 });
  await page.getByRole('button', { name: 'Подтвердить запись', exact: true }).click();
  await expect(page).toHaveURL(/\/confirmations\//);
  await expect(page.getByRole('heading', { name: 'Actual', exact: true })).toBeVisible();
  await expect(page.getByText(/09:00.*10:30/)).toBeVisible();
});
