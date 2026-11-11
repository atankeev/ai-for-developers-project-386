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
  await expect(page.getByText('Сейчас нет доступных типов встреч')).toBeVisible();
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

test('владелец создаёт тип, гость открывает постоянную ссылку без формы контактов', async ({
  page,
  owner,
}) => {
  await page.goto('/owner/login');
  await page.getByLabel('Логин', { exact: true }).fill(owner.login);
  await page.getByLabel('Пароль', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('link', { name: 'Типы встреч', exact: true }).click();
  await page.getByRole('button', { name: 'Создать тип встречи', exact: true }).click();
  await expect(page.getByText('Название должно содержать от 1 до 100 символов')).toBeVisible();
  await page.getByLabel('Название', { exact: true }).fill('  Знакомство  ');
  await page.getByLabel('Описание', { exact: true }).fill('<img src=x onerror=alert(1)>');
  await page.getByLabel('Длительность, минут', { exact: true }).fill('17');
  await page.getByRole('button', { name: 'Создать тип встречи', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('При текущем расписании запись невозможна');
  await page.getByLabel('Название', { exact: true }).fill('😀'.repeat(101));
  await page.getByRole('button', { name: 'Создать тип встречи', exact: true }).click();
  await expect(page.getByText('Название должно содержать от 1 до 100 символов')).toBeVisible();
  await page.getByLabel('Название', { exact: true }).fill('  ЗНАКОМСТВО ');
  await page.getByRole('button', { name: 'Создать тип встречи', exact: true }).click();
  await expect(page.locator('#title-error')).toHaveText('Название уже используется');
  await page.goto('/book');
  await expect(page.getByRole('heading', { name: 'Знакомство', exact: true })).toBeVisible();
  await expect(page.getByText('17 минут', { exact: true })).toBeVisible();
  const open = page.getByRole('link', { name: 'Выбрать встречу', exact: true });
  await open.focus();
  await expect(open).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  const url = page.url();
  await expect(
    page.getByText('Нет свободного времени для этой встречи в ближайшие 14 дней'),
  ).toBeVisible();
  await expect(page.locator('input')).toHaveCount(0);
  await expect(page.locator('img')).toHaveCount(0);
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole('heading', { name: 'Знакомство', exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.getByRole('link', { name: 'Вернуться к типам встреч' }).click();
  await expect(page).toHaveURL('/book');
});

test('загрузка, пустой каталог, сбой и отсутствующий тип различаются', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/meeting-types', async (route) => {
    await gate;
    await route.fallback();
  });
  await page.goto('/book');
  await expect(page.getByRole('status')).toHaveText('Загрузка…');
  await expect(page.getByText('Сейчас нет доступных типов встреч')).toHaveCount(0);
  release();
  await expect(page.getByText('Сейчас нет доступных типов встреч')).toBeVisible();
  await page.route('**/api/meeting-types', (route) => route.abort());
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('Не удалось загрузить данные');
  await expect(page.getByText('Сейчас нет доступных типов встреч')).toHaveCount(0);
  await page.unroute('**/api/meeting-types');
  // Reinstall the fixture's real HTTP forwarder by falling through on this narrower boundary.
  await page.getByRole('button', { name: 'Повторить' }).click();
  await expect(page.getByText('Сейчас нет доступных типов встреч')).toBeVisible();
  await page.route('**/api/meeting-types/unknown/availability', (route) => route.abort());
  await page.goto('/book/unknown');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('Тип встречи не найден')).toHaveCount(0);
  await page.unroute('**/api/meeting-types/unknown/availability');
  await page.getByRole('button', { name: 'Повторить' }).click();
  await expect(page.getByText('Тип встречи не найден')).toBeVisible();
});
