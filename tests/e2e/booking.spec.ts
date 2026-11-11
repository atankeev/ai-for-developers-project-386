import { expect, test } from './fixtures.js';

test('гость открывает каталог и возвращается на главную', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Ваши встречи. В удобное время.' })).toBeVisible();
  await expect(
    page.getByText('Сервис готовится к запуску. Онлайн-запись появится позже.'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /админка/i })).toHaveCount(0);

  await page.getByRole('link', { name: 'Записаться на встречу' }).click();
  await expect(page).toHaveURL('/book');
  await expect(page.getByRole('heading', { name: 'Записаться', exact: true })).toBeVisible();
  await expect(page.getByText('Каталог типов встреч', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Сервис готовится к запуску. Онлайн-запись появится позже.'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /админка/i })).toHaveCount(0);

  await page.goBack();
  await expect(page.getByRole('link', { name: 'Записаться на встречу' })).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL('/book');
  await page.getByRole('link', { name: 'Вернуться на главную' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Ваши встречи. В удобное время.' })).toBeVisible();
});

test('каталог доступен по прямой ссылке и после обновления', async ({ page }) => {
  await page.goto('/book');
  await expect(page.getByRole('heading', { name: 'Записаться', exact: true })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL('/book');
  await expect(page).toHaveTitle('Записаться — Календарь звонков');
  await expect(page.getByRole('heading', { name: 'Записаться', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Вернуться на главную' })).toBeVisible();
});

test('гость проходит путь туда и обратно с клавиатуры', async ({ page }) => {
  await page.goto('/');
  const openCatalog = page.getByRole('link', { name: 'Записаться на встречу' });
  await expect(openCatalog).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(openCatalog).toBeFocused();
  await expect(openCatalog).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/book');

  const returnHome = page.getByRole('link', { name: 'Вернуться на главную' });
  await expect(returnHome).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(returnHome).toBeFocused();
  await expect(returnHome).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/');
});

for (const path of ['/', '/book']) {
  test(`страница ${path} помещается в ширину экрана`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const action = page.getByRole('link', {
      name: path === '/' ? 'Записаться на встречу' : 'Вернуться на главную',
    });
    await expect(action).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
      .toBe(true);
  });
}
