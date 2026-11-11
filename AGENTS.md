# Работа с проектом

- Установка: `mise install`, затем `mise run setup`.
- Запуск: `mise run dev`; остановка: `mise run stop`.
- При изменении кода, тестов, API-контракта, зависимостей или конфигурации приложения, сборки и CI перед завершением работы выполняйте `mise run check` (та же команда в CI).
- Если изменена только документация (включая `AGENTS.md`, спецификации, словарь и ADR), проверяйте текст, ссылки и diff; проверки кода не запускайте. При смешанных изменениях выполняйте `mise run check`.
- Отдельно: `mise run test`, `mise run lint`, `mise run format`, `mise run build`.
- `apps/web` — Vue/PrimeVue; `apps/api` — Fastify; `packages/api` — TypeSpec и SDK; npm workspaces.
- API меняется сначала в `packages/api/main.tsp`, затем выполняется `mise run generate`. Файлы `packages/api/generated/` коммитятся; вручную их не редактировать. После генерации пересоберите SDK через `mise run build` или `mise run dev`.
- Сообщения коммитов — Conventional Commits на английском: `feat:`, `fix:`, `docs:`, `chore:` и т. п.
- При реализации задачи каждый коммит должен ссылаться на её GitHub Issue: указывайте `Refs #<номер>` в теле сообщения коммита, например `Refs #12`. Для подзадачи указывайте её номер, а не только номер родительской спецификации.
- Workflow `.github/workflows/hexlet-check.yml` принадлежит Хекслету и не изменяется. Наши проверки — в `.github/workflows/check.yml`.

## Agent skills

### Issue tracker

Задачи и спецификации — GitHub Issues. См. `docs/agents/issue-tracker.md`.

### Triage labels

Пять стандартных меток состояния задач. См. `docs/agents/triage-labels.md`.

### Domain docs

Единый контекст: `GLOSSARY.md` и `docs/adr/`. См. `docs/agents/domain.md`.
