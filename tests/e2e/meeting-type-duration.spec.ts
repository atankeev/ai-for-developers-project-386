import { test, expect } from './fixtures.js';

test('scrolling a focused duration field preserves the entered minutes', async ({
  page,
  owner,
}) => {
  await page.goto('/owner/login');
  await page.getByLabel('Логин', { exact: true }).fill(owner.login);
  await page.getByLabel('Пароль', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('link', { name: 'Типы встреч', exact: true }).click();
  await page.getByLabel('Название', { exact: true }).fill('Два часа');
  const duration = page.getByLabel('Длительность, минут', { exact: true });
  await duration.fill('120');
  await duration.hover();
  await page.mouse.wheel(0, 380);
  await expect(duration).toHaveValue('120');
  await page.getByRole('button', { name: 'Создать тип встречи', exact: true }).click();
  await expect(page.locator('.meeting-card')).toContainText('120 минут');
  await page.reload();
  await expect(page.locator('.meeting-card')).toContainText('120 минут');
  await page.goto('/book');
  await expect(page.getByText('120 минут', { exact: true })).toBeVisible();
});
