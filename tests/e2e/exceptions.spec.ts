import { test, expect } from './fixtures.js';

test('исключение заменяет часы, закрывает день и удаляется с восстановлением недели', async ({
  page,
  owner,
}) => {
  await page.goto('/owner');
  await page.getByLabel('Логин', { exact: true }).fill(owner.login);
  await page.getByLabel('Пароль', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('link', { name: 'Расписание', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить интервал: Вторник', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить неделю', exact: true }).click();
  await expect(page.getByText('Расписание сохранено', { exact: true })).toBeVisible();
  await page.getByLabel('Дата исключения').fill('2026-11-10');
  await page.getByRole('button', { name: 'Загрузить дату', exact: true }).click();
  await expect(page.getByText('Исключения нет: действуют недельные часы')).toBeVisible();
  await page.getByRole('button', { name: 'Добавить интервал исключения', exact: true }).click();
  await page.getByLabel('Исключение: начало 1').fill('14:10');
  await page.getByLabel('Исключение: конец 1').fill('15:10');
  await page.getByRole('button', { name: 'Сохранить исключение', exact: true }).click();
  await expect(page.getByText('Исключение сохранено', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Типы встреч', exact: true }).click();
  await page.getByLabel('Название', { exact: true }).fill('Разговор');
  await page.getByLabel('Длительность, минут').fill('30');
  await page.getByRole('button', { name: 'Создать тип встречи', exact: true }).click();
  await page.goto('/book');
  await page.getByRole('link', { name: 'Выбрать встречу', exact: true }).click();
  await expect(page.getByRole('button', { name: '14:10', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '14:25', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '09:00', exact: true })).toHaveCount(0);
  await page.goto('/owner/schedule');
  await page.getByLabel('Дата исключения').fill('2026-11-10');
  await page.getByRole('button', { name: 'Загрузить дату', exact: true }).click();
  await page.getByRole('button', { name: 'Закрыть день', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить исключение', exact: true }).click();
  await expect(page.getByText('Исключение сохранено', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Удалить исключение', exact: true }).click();
  await expect(page.getByText('Исключение удалено', { exact: true })).toBeVisible();
  await expect(page.getByText('Исключения нет: действуют недельные часы')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});

test('ошибки загрузки, даты и часов можно исправить; устаревшая форма требует свежей версии', async ({
  page,
  owner,
}) => {
  await page.goto('/owner');
  await page.getByLabel('Логин', { exact: true }).fill(owner.login);
  await page.getByLabel('Пароль', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('link', { name: 'Расписание', exact: true }).click();
  const date = page.getByLabel('Дата исключения');
  await date.focus();
  await expect(date).toHaveCSS('outline-style', 'solid');
  await date.fill('2026-02-30');
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('alert').filter({ hasText: 'настоящую календарную дату' }).first(),
  ).toBeVisible();
  await date.fill('2026-11-11');
  await page.route('**/api/owner/schedule/exceptions/2026-11-11', (route) => route.abort(), {
    times: 1,
  });
  await page.getByRole('button', { name: 'Загрузить дату', exact: true }).click();
  await expect(
    page.getByText('Не удалось загрузить исключение. Повторите загрузку даты.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Загрузить дату', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить интервал исключения', exact: true }).click();
  await page.getByLabel('Исключение: начало 1').fill('24:00');
  await page.getByRole('button', { name: 'Сохранить исключение', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Часы должны быть HH:mm' })).toBeVisible();
  await page.getByLabel('Исключение: начало 1').fill('09:00');
  await page.evaluate(async () => {
    await fetch('/api/owner/schedule/exceptions/2026-11-11', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expectedVersion: 0, intervals: [] }),
    });
  });
  await page.getByRole('button', { name: 'Сохранить исключение', exact: true }).click();
  await expect(page.getByText('Исключение изменилось. Загрузите актуальные данные')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Сохранить исключение', exact: true }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Загрузить актуальное исключение', exact: true }).click();
  await expect(page.getByText('День закрыт', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Добавить интервал исключения', exact: true }).click();
  await page.route('**/api/owner/schedule/exceptions/2026-11-11', (route) => route.abort(), {
    times: 1,
  });
  await page.getByRole('button', { name: 'Сохранить исключение', exact: true }).click();
  await expect(
    page.getByText('Не удалось связаться с сервером. Повторите сохранение.'),
  ).toBeVisible();
  await expect(page.getByLabel('Исключение: начало 1')).toHaveValue('09:00');
  await page.getByRole('button', { name: 'Сохранить исключение', exact: true }).click();
  await expect(page.getByText('Исключение сохранено', { exact: true })).toBeVisible();
});
