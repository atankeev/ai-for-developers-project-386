import type { ScheduleException, WorkingInterval } from '@call-calendar/api-contract';
import { CalendarError } from './calendar.js';
import { validateIntervals } from './schedule.js';

export function validateDate(date: string) {
  const instant = Date.parse(`${date}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(instant) ||
    new Date(instant).toISOString().slice(0, 10) !== date ||
    date.startsWith('0000')
  )
    throw new CalendarError('VALIDATION_ERROR', 'Укажите настоящую календарную дату YYYY-MM-DD', {
      date: 'Укажите настоящую календарную дату YYYY-MM-DD',
    });
}

/** Null entries retain the version after deletion, preventing stale forms from reviving. */
export class ScheduleExceptions {
  private readonly dates = new Map<string, ScheduleException>();
  get(date: string): ScheduleException {
    validateDate(date);
    return structuredClone(this.dates.get(date) ?? { date, version: 0, intervals: null });
  }
  list() {
    return [...this.dates.values()]
      .filter((entry) => entry.intervals !== null)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((entry) => structuredClone(entry));
  }
  replace(date: string, expectedVersion: number, input: WorkingInterval[] | null) {
    const current = this.get(date);
    const errors: Record<string, string> = {};
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0)
      errors.expectedVersion = 'Укажите версию исключения';
    const intervals = input === null ? null : validateIntervals(input, 'intervals', errors);
    if (Object.keys(errors).length)
      throw new CalendarError('VALIDATION_ERROR', 'Проверьте поля исключения', errors);
    if (expectedVersion !== current.version)
      throw new CalendarError(
        'VERSION_CONFLICT',
        'Исключение изменилось. Загрузите актуальные данные',
      );
    if (JSON.stringify(intervals) !== JSON.stringify(current.intervals))
      this.dates.set(date, { date, intervals, version: current.version + 1 });
    return this.get(date);
  }
}
