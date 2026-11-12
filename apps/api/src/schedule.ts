import type {
  ReplaceWeeklyScheduleRequest,
  WeeklySchedule,
  WorkingInterval,
} from '@call-calendar/api-contract';
import { CalendarError } from './calendar.js';

/** Local working hours stay local; adjacent intervals deliberately remain separate. */
export function validateWeek(input: ReplaceWeeklyScheduleRequest): WeeklySchedule['days'] {
  const errors: Record<string, string> = {};
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1)
    errors.expectedVersion = 'Укажите версию расписания';
  if (
    input.days.length !== 7 ||
    new Set(input.days.map((day) => day.day)).size !== 7 ||
    input.days.some((day) => !Number.isInteger(day.day) || day.day < 1 || day.day > 7)
  )
    errors.days = 'Укажите все семь дней недели ровно один раз';
  const days = input.days
    .map((day) => {
      const intervals = validateIntervals(day.intervals, `days.${day.day}`, errors);
      return { day: day.day, intervals };
    })
    .sort((a, b) => a.day - b.day);
  if (Object.keys(errors).length)
    throw new CalendarError('VALIDATION_ERROR', 'Проверьте часы расписания', errors);
  return days;
}
export function validateIntervals(
  input: WorkingInterval[],
  field: string,
  errors: Record<string, string>,
) {
  const intervals = input
    .map((interval) => ({ ...interval }))
    .sort((a, b) => a.start.localeCompare(b.start));
  let previousEnd = 0;
  for (const interval of intervals) {
    if (
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(interval.start) ||
      !/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(interval.end) ||
      minutes(interval.start) >= minutes(interval.end) ||
      minutes(interval.start) < previousEnd
    )
      errors[field] =
        'Часы должны быть HH:mm: начало раньше конца, без пересечений; 24:00 допустимо только в конце';
    previousEnd = minutes(interval.end);
  }
  return intervals;
}
export function minutes(value: string) {
  const [h, m] = value.split(':').map(Number);
  return h! * 60 + m!;
}
export function moscowDate(now: number) {
  return new Date(now + 10800000).toISOString().slice(0, 10);
}
export function bookingDates(now: number) {
  return Array.from({ length: 14 }, (_, i) =>
    new Date(Date.parse(moscowDate(now)) + (i + 1) * 86400000).toISOString().slice(0, 10),
  );
}
export function slotsForDate(
  date: string,
  duration: number,
  intervals: WorkingInterval[],
  now: number,
) {
  const midnight = Date.parse(`${date}T00:00:00+03:00`);
  const slots: { startsAt: string; endsAt: string }[] = [];
  for (const interval of intervals) {
    for (
      let start = minutes(interval.start);
      start + duration <= minutes(interval.end);
      start += 15
    ) {
      const startsAt = midnight + start * 60000;
      if (startsAt >= now + 86400000)
        slots.push({
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(startsAt + duration * 60000).toISOString(),
        });
    }
  }
  return slots;
}
