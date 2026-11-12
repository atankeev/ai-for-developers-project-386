import { expect, test } from './fixtures.js';

test('гость открывает каталог и возвращается на главную', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Ваши встречи. В удобное время.' })).toBeVisible();
  await expect(
    page.getByText('Выберите тип встречи, свободное время и оставьте контакты без регистрации.'),
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

test('owner sets weekly hours and guest selects a date and time with the keyboard', async ({
  page,
  owner,
}) => {
  await page.goto('/owner/login');
  await page.getByLabel('Логин', { exact: true }).fill(owner.login);
  await page.getByLabel('Пароль', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('link', { name: 'Расписание', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Расписание', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Добавить интервал: Понедельник', exact: true }).click();
  await page.getByLabel('Понедельник: начало 1', { exact: true }).fill('09:10');
  await page.getByLabel('Понедельник: конец 1', { exact: true }).fill('10:10');
  await page.getByRole('button', { name: 'Сохранить неделю', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Расписание сохранено');
  await page.getByRole('link', { name: 'Типы встреч', exact: true }).click();
  await page.getByLabel('Название', { exact: true }).fill('Выбор времени');
  await page.getByRole('button', { name: 'Создать тип встречи', exact: true }).click();
  await page.goto('/book');
  await expect(page.getByText(/Ближайшее время:/)).toBeVisible();
  await page.getByRole('link', { name: 'Выбрать встречу', exact: true }).click();
  await expect(page.getByText('Europe/Moscow', { exact: true })).toBeVisible();
  const dates = page.getByRole('button', { name: /Выбрать дату/ });
  await expect(dates).toHaveCount(14);
  await expect(dates.filter({ has: page.locator('[disabled]') })).toHaveCount(0);
  const activeDate = page.locator('.calendar-dates button[aria-pressed="true"]');
  await expect(activeDate).toHaveCount(1);
  await expect(page.locator('.time-buttons button[aria-pressed="true"]')).toHaveCount(0);
  await activeDate.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('.calendar-dates button:focus')).toHaveCSS('outline-style', 'solid');
  const time = page.getByRole('button', { name: '09:10', exact: true });
  await time.focus();
  await page.keyboard.press('Enter');
  await expect(time).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/Выбрано:/)).toContainText('09:10');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});

test('guest books on the same screen, keeps an SPA draft and owner reads contacts', async ({
  page,
  owner,
}) => {
  await page.goto('/owner/login');
  await page.getByLabel('Логин', { exact: true }).fill(owner.login);
  await page.getByLabel('Пароль', { exact: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.getByRole('link', { name: 'Расписание', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить интервал: Вторник', exact: true }).click();
  await page.getByLabel('Вторник: начало 1', { exact: true }).fill('09:00');
  await page.getByLabel('Вторник: конец 1', { exact: true }).fill('11:00');
  await page.getByRole('button', { name: 'Сохранить неделю', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Расписание сохранено');
  await page.getByRole('link', { name: 'Типы встреч', exact: true }).click();
  await page.getByLabel('Название', { exact: true }).fill('Беседа');
  await page.getByRole('button', { name: 'Создать тип встречи', exact: true }).click();
  await page.goto('/book');
  await page.getByRole('link', { name: 'Выбрать встречу', exact: true }).click();
  const typeUrl = page.url();
  await page.getByRole('button', { name: '09:00', exact: true }).click();
  await page.getByRole('button', { name: 'Подтвердить запись', exact: true }).click();
  await expect(page.getByLabel('Имя', { exact: true })).toBeFocused();
  await page.getByLabel('Имя', { exact: true }).fill('Алиса');
  await page.getByLabel('Email', { exact: true }).fill('alice@example.test');
  await page.getByLabel('Комментарий', { exact: true }).fill('<b>Вопрос</b>');
  await page.getByRole('link', { name: 'Вернуться к типам встреч' }).click();
  await page.getByRole('link', { name: 'Выбрать встречу', exact: true }).click();
  await expect(page.getByLabel('Имя', { exact: true })).toHaveValue('Алиса');
  await page.getByRole('button', { name: '09:00', exact: true }).click();
  await page.getByRole('button', { name: 'Подтвердить запись', exact: true }).click();
  await expect(page).toHaveURL(/\/confirmations\//);
  const confirmation = page.url();
  await expect(
    page.getByRole('heading', { name: 'Запись подтверждена', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('alice@example.test', { exact: true })).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(typeUrl);
  await expect(page.getByLabel('Имя', { exact: true })).toHaveValue('');
  await expect(page.locator('.time-buttons button[aria-pressed="true"]')).toHaveCount(0);
  await page.goto('/owner/bookings');
  await expect(page.getByText('alice@example.test', { exact: true })).toBeVisible();
  await expect(page.getByText('<b>Вопрос</b>', { exact: true })).toBeVisible();
  await page.goto(confirmation);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Запись подтверждена', exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
});

for (const lostAfterSuccess of [true, false]) {
  test(`manual retry remains safe when booking response is unknown (server success: ${lostAfterSuccess})`, async ({
    page,
    owner,
    bookingFault,
  }) => {
    await page.goto('/owner/login');
    await page.getByLabel('Логин', { exact: true }).fill(owner.login);
    await page.getByLabel('Пароль', { exact: true }).fill(owner.password);
    await page.getByRole('button', { name: 'Войти', exact: true }).click();
    await page.getByRole('link', { name: 'Расписание', exact: true }).click();
    await page.getByRole('button', { name: 'Добавить интервал: Вторник', exact: true }).click();
    await page.getByLabel('Вторник: начало 1', { exact: true }).fill('09:00');
    await page.getByLabel('Вторник: конец 1', { exact: true }).fill('11:00');
    await page.getByRole('button', { name: 'Сохранить неделю', exact: true }).click();
    await expect(page.getByRole('status')).toHaveText('Расписание сохранено');
    await page.getByRole('link', { name: 'Типы встреч', exact: true }).click();
    await page.getByLabel('Название', { exact: true }).fill('Повтор');
    await page.getByRole('button', { name: 'Создать тип встречи', exact: true }).click();
    await page.goto('/book');
    await page.getByRole('link', { name: 'Выбрать встречу', exact: true }).click();
    await page.getByRole('button', { name: '09:00', exact: true }).click();
    await page.getByLabel('Имя', { exact: true }).fill('Алиса');
    await page.getByLabel('Email', { exact: true }).fill('alice@example.test');
    if (lostAfterSuccess) bookingFault.dropNext = true;
    else bookingFault.dropBefore = true;
    await page.getByRole('button', { name: 'Подтвердить запись', exact: true }).click();
    await expect(page.getByText(/Результат отправки неизвестен/)).toBeVisible();
    await expect(page.getByLabel('Имя', { exact: true })).toBeDisabled();
    await expect(
      page.getByRole('button', { name: 'Подтвердить запись', exact: true }),
    ).toBeDisabled();
    await page.reload();
    await expect(page.getByText(/Результат отправки неизвестен/)).toBeVisible();
    await expect(page.getByLabel('Имя', { exact: true })).toHaveValue('Алиса');
    await page.getByRole('button', { name: 'Повторить ту же попытку', exact: true }).click();
    await expect(page).toHaveURL(/\/confirmations\//);
    await page.goto('/owner/bookings');
    await expect(page.getByText('alice@example.test', { exact: true })).toHaveCount(1);
  });
}
