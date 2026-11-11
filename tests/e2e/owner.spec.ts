import { expect, test } from './fixtures.js';

test('владелец входит с клавиатуры, открывает разделы и выходит', async ({
  page,
  owner: { login, password },
}) => {
  await page.goto('/owner');
  await expect(page.getByRole('heading', { name: 'Вход владельца' })).toBeVisible();
  const loginField = page.getByLabel('Логин', { exact: true });
  await loginField.focus();
  await expect(loginField).toHaveCSS('outline-style', 'solid');
  await page.keyboard.type(login);
  await page.keyboard.press('Tab');
  await page.keyboard.type(password);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Встречи', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Расписание', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Расписание', exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Вход владельца' })).toBeVisible();
  await page.goto('/owner/schedule');
  await expect(page.getByRole('heading', { name: 'Вход владельца' })).toBeVisible();
  await page.getByLabel('Логин', { exact: true }).fill(login);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Расписание', exact: true })).toBeVisible();
});

test('утраченная сессия требует нового входа и возвращает в нужный раздел', async ({
  page,
  context,
  owner: { login, password },
}) => {
  await page.goto('/owner');
  await page.getByLabel('Логин', { exact: true }).fill(login);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Встречи', exact: true })).toBeVisible();
  await context.clearCookies();
  await page.getByRole('link', { name: 'Типы встреч', exact: true }).click();
  await expect(page.getByText('Сессия завершена, войдите снова')).toBeVisible();
  await page.getByLabel('Логин', { exact: true }).fill(login);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Типы встреч', exact: true })).toBeVisible();
});
