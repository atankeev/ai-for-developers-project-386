# Issue tracker: GitHub

Задачи и спецификации хранятся в GitHub Issues:
atankeev/ai-for-developers-project-386. Используйте gh CLI.

- Перед созданием задачи проверяйте репозиторий:
  `gh repo view --json nameWithOwner`.
- Создание: `gh issue create --title "..." --body-file <file>`.
- Чтение: `gh issue view <number> --json number,title,body,labels,comments`.
- Список: `gh issue list --state open`; при необходимости добавьте `--label`.
- Комментарий: `gh issue comment <number> --body-file <file>`.
- Метки: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`.
- Закрытие: сначала опубликуйте объяснение комментарием, затем
  `gh issue close <number>`. Для уже закрытой задачи добавьте комментарий отдельно.

Используйте нативные подзадачи и зависимости GitHub, если они доступны.
Иначе укажите `Part of #<parent>` и `Blocked by: #<number>` в теле задачи.
Задача готова к работе, когда все блокирующие задачи закрыты.

«Опубликовать в трекере» означает создать GitHub Issue.
«Прочитать задачу» означает прочитать соответствующий GitHub Issue.

PRs as a request surface: no.
