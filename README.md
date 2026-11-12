# Календарь звонков

[![hexlet-check](https://github.com/atankeev/ai-for-developers-project-386/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/atankeev/ai-for-developers-project-386/actions)

Учебный сервис бронирования времени по мотивам Cal.com.

Сейчас реализованы главная страница и заглушка каталога типов встреч «Записаться» по адресу `/book`. На обеих страницах указано, что онлайн-запись появится позже. Создание типов встреч и бронирование появятся на следующих шагах. Доступность API проверяется дымовым тестом через сгенерированный SDK.

Учебный проект Хекслета: https://ru.hexlet.io/programs/ai-for-developers
Как это должно работать: https://files.hexlet.app/a/2ipc5m

## Стек

- Фронтенд: Vue, TypeScript, Vite и PrimeVue с темой Aura.
- Бекенд: Node.js, TypeScript и Fastify.
- Контракт: TypeSpec → OpenAPI 3.0 → SDK и типы Hey API. Fastify подключает маршруты и схемы проверки через fastify-openapi-glue.
- Окружение: mise, npm workspaces, hk и pitchfork. Версии закреплены в `mise.toml`, `package.json` и `package-lock.json`.

```text
apps/web/       — интерфейс
apps/api/       — HTTP-сервер и дымовой тест
packages/api/   — контракт и сгенерированный SDK
scripts/        — генерация и проверка её актуальности
```

## Установка

Установите [mise](https://mise.jdx.dev/getting-started.html) версии 2026.10.25 или новее. Команды ниже выполняются из корня репозитория. Для установки зависимостей нужен интернет; база данных и секреты для каркаса не требуются.

```bash
git clone https://github.com/atankeev/ai-for-developers-project-386.git
cd ai-for-developers-project-386
mise trust
mise install
mise run setup
mise run dev
```

Откройте http://127.0.0.1:5173. API доступен по http://127.0.0.1:3000/api/health и возвращает `{"status":"ok"}`. Vite проксирует `/api` на бекенд, поэтому браузер использует тот же адрес, что и страница.

### Лицензия PrimeVue

PrimeVue 5 требует действующий ключ PrimeUI, в том числе для бесплатной Community License. Без ключа библиотека показывает лицензионное уведомление.

Создайте в корне проекта локальный файл `mise.local.toml`:

```toml
[env]
VITE_PRIMEUI_LICENSE = "ваш_ключ"
```

Этот файл исключён из Git. Выполните `mise trust mise.local.toml`, затем `mise run stop` и `mise run dev`. После изменения ключа перезапустите серверы теми же командами.

Ключ передаётся в параметр `license` плагина PrimeVue. Как и любые переменные `VITE_*`, он попадает в браузерную сборку: это не способ хранения серверных секретов. Для сборки в другом окружении задайте ту же переменную перед `mise run build`.

`mise run dev` запускает оба сервера в фоне через pitchfork. Они продолжают работать после завершения команды. Управление:

```bash
mise daemons status
mise daemons logs api
mise daemons logs web
mise run stop
```

После изменения контракта выполните `mise run generate`, затем перезапустите `mise run dev`, чтобы пересобрать SDK.

## Проверки

```bash
mise run check     # все проверки, как в GitHub Actions
mise run lint      # Oxlint и проверка Vue-шаблонов через ESLint
mise run format    # исправление форматирования Oxfmt
mise run test      # Vitest: реальный HTTP-запрос через SDK
mise run test:e2e  # Playwright: гостевой сценарий в Chromium
mise run build    # сборка SDK, бекенда и фронтенда
mise run generate # обновление OpenAPI и SDK из TypeSpec
```

Перед первым запуском `check` или `test:e2e` установите браузер: `mise exec -- npx playwright install chromium`. В Linux при необходимости используйте `mise exec -- npx playwright install --with-deps chromium` для установки системных зависимостей; CI выполняет эту команду автоматически.

`check` проверяет актуальность генерации, линтинг, форматирование, сборку, типы TypeScript, дымовой тест, браузерные тесты, конфигурацию hk и собственный workflow через jactionlint. Генерация для сравнения идёт во временную папку и не изменяет рабочие файлы. Сгенерированные файлы в `packages/api/generated/` входят в Git и обновляются только командой генерации.

Playwright проверяет переходы между главной и каталогом, историю браузера, прямое открытие и обновление каталога, клавиатурную навигацию и отсутствие горизонтальной прокрутки на экранах 1440 × 900 и 320 × 740. Тесты автоматически запускают Vite preview на порту 4174 для собранного фронтенда; запускать `dev` и API не требуется. При ошибке трасса сохраняется в `test-results/`.

GitHub Actions вызывает `mise run check` на каждый push. Существующий workflow Хекслета сохранён отдельно. Проверка shellcheck не подключена: собственный workflow содержит только вызовы готовых команд.

`mise run setup` устанавливает локальные Git-хуки из `hk.pkl`: `pre-commit` проверяет линтинг и форматирование, `commit-msg` — Conventional Commits, `pre-push` — полный `check`. Хуки не исправляют файлы автоматически. Примеры сообщений: `feat: add event types`, `fix: reject overlapping bookings`, `docs: describe local setup`.

Для запуска собранного каркаса сначала выполните `mise run build`, затем в двух терминалах:

```bash
mise exec -- npm run start --workspace @call-calendar/api
mise exec -- npm run preview --workspace @call-calendar/web
```

Preview доступен на http://127.0.0.1:4173 и предназначен для локальной проверки сборки, а не для публикации в интернете.

Переходы между главной и `/book` выполняются обычными ссылками. Vite dev и preview поддерживают прямое открытие и обновление `/book`. При будущей публикации веб-сервер должен возвращать `index.html` для этого адреса.

## Источники настройки

- [Vite Getting Started](https://vite.dev/guide/) — каркас создан через `create-vite` с шаблоном `vue-ts`.
- [Vue Quick Start](https://vuejs.org/guide/quick-start.html), [PrimeVue с Vite](https://primevue.org/vite/).
- [Fastify Getting Started](https://fastify.dev/docs/latest/Guides/Getting-Started/) и [fastify-openapi-glue](https://github.com/seriousme/fastify-openapi-glue).
- [TypeSpec OpenAPI emitter](https://typespec.io/docs/emitters/openapi3/reference/emitter/), [Hey API](https://heyapi.dev/docs/openapi/typescript/get-started), [Vitest](https://vitest.dev/guide/).
- [mise daemons](https://mise.jdx.dev/daemons.html), [hk](https://hk.jdx.dev/getting_started.html), [dev-quality-gates](https://github.com/mokevnin/dev-quality-gates) (бывший dev-guardrails).

TypeScript закреплён на 6.x для совместимости с инструментами, использующими API компилятора. Oxlint проверяет скрипты, ESLint — Vue-шаблоны. Дополнительные сканеры, инфраструктура БД и автоматические релизы не входят в текущий шаг.

В `package.json` закреплены исправленные транзитивные версии `js-yaml` и `undici` через `overrides`: генераторы пока требуют старые версии. На момент сборки каркаса `npm audit` сообщает о предупреждениях средней серьёзности в цепочке зависимостей ESLint (`minimatch`). Их устранение требует отдельной проверки совместимости; `audit fix --force` не применяется.

## Релизы

[Release Please](https://github.com/googleapis/release-please-action) запускается
при push в `main` и вручную через GitHub Actions. По Conventional Commits он
создаёт и обновляет release PR с новой версией и `CHANGELOG.md`. После слияния
этого PR следующий запуск создаёт тег `vX.Y.Z` и GitHub Release.

Приложение выпускается целиком: версия хранится в корневом `package.json` и
синхронизируется с `package-lock.json` и `.release-please-manifest.json`.
Начальная версия — `0.0.0`; до `1.0.0` коммиты `feat:` повышают minor,
`fix:` — patch, breaking changes — minor. Внутренние workspace-пакеты остаются
приватными со своими версиями; публикация в npm не выполняется.

Workflow использует встроенный `GITHUB_TOKEN`, отдельный секрет не нужен.
В Settings → Actions → General должно быть включено
«Allow GitHub Actions to create and approve pull requests».
PR и теги, созданные этим токеном, не запускают другие workflows автоматически.
Перед слиянием release PR проверьте его ветку командой `mise run check`;
после слияния push в `main` запускает обычные проверки проекта.

## Использование

Целевой сценарий от создания типа встречи до появления записи в списке владельца (будет реализован на следующих шагах):

1. Владелец открывает «Админку» и создаёт тип встречи: «Консультация», описание «Обсудим ваши вопросы», длительность — 30 минут.
2. После сохранения тип встречи сразу появляется в каталоге «Записаться».
3. Гость открывает каталог без регистрации и выбирает «Консультацию».
4. В календаре на ближайшие 14 дней гость выбирает дату и свободное время, затем нажимает «Продолжить».
5. Гость вводит обязательные имя и email, при желании добавляет комментарий и подтверждает запись.
6. Приложение показывает подтверждение: название встречи, дату, время и часовой пояс. Письмо не отправляется.
7. Владелец открывает список предстоящих встреч и видит новую запись: тип встречи, дату, время, имя и email гостя.

**Дополнительная проверка:** после бронирования занятый интервал нельзя забронировать повторно, в том числе через другой тип встречи с частично пересекающимся временем.

<!-- Добавьте примеры запуска и запись asciinema — именно это смотрит работодатель -->

---

<details>
<summary>Автоматические тесты Хекслета</summary>

Тесты запускаются на каждый коммит. За запуск отвечает файл `.github/workflows/hexlet-check.yml` — не удаляйте и не переименовывайте ни его, ни репозиторий.

</details>

## О Хекслете

[Хекслет](https://ru.hexlet.io/) — школа программирования: авторские программы обучения с практикой, поддержкой наставников и реальными проектами, которые остаются в резюме. Этот репозиторий — один из таких проектов.

### Owner access

The server requires `OWNER_LOGIN`, `OWNER_PASSWORD_HASH`, `OWNER_COOKIE_SECRET`
(at least 32 characters, different from the password), and `OWNER_ALLOWED_ORIGIN`
(the exact site origin including scheme and port, without a trailing slash).
There are no default credentials. Set these in your shell or hosting secret settings.
Run `mise exec -- npm run password:hash` in a terminal to generate a scrypt hash;
password input is hidden and never passed as a command argument. Generate the
independent cookie secret with a cryptographically secure random generator.

Local development uses `OWNER_ALLOWED_ORIGIN=http://127.0.0.1:5173` and HTTP.
Open `/owner` directly to enter the cabinet. Published deployments use one site/API
domain, HTTPS terminated by the host, and the exact HTTPS origin. `TRUSTED_PROXIES`
is an optional comma-separated list of trusted proxy IP addresses or CIDRs; leave
it unset for direct connections. Configure only your actual hosting proxy addresses
so forwarded client addresses and HTTPS are trusted only from those proxies.

Sessions and application data belong to one process and disappear on restart.
Sessions expire twelve hours after login; activity does not extend them. Logout
ends the current session only. Do not run multiple independent API replicas.
