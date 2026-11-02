# Работа с проектом

- Установка: `mise install`, затем `mise run setup`.
- Запуск: `mise run dev`; остановка: `mise run stop`.
- Проверки перед завершением изменений: `mise run check` (та же команда в CI).
- Отдельно: `mise run test`, `mise run lint`, `mise run format`, `mise run build`.
- `apps/web` — Vue/PrimeVue; `apps/api` — Fastify; `packages/api` — TypeSpec и SDK; npm workspaces.
- API меняется сначала в `packages/api/main.tsp`, затем выполняется `mise run generate`. Файлы `packages/api/generated/` коммитятся; вручную их не редактировать. После генерации пересоберите SDK через `mise run build` или `mise run dev`.
- Сообщения коммитов — Conventional Commits на английском: `feat:`, `fix:`, `docs:`, `chore:` и т. п.
- Workflow `.github/workflows/hexlet-check.yml` принадлежит Хекслету и не изменяется. Наши проверки — в `.github/workflows/check.yml`.
