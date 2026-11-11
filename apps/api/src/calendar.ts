import { randomUUID } from 'node:crypto';
import type {
  CreateMeetingTypeRequest,
  MeetingType,
  PublicMeetingType,
  WeeklySchedule,
  ReplaceWeeklyScheduleRequest,
  ReplaceScheduleExceptionRequest,
  DeleteScheduleExceptionRequest,
} from '@call-calendar/api-contract';

import { ScheduleExceptions } from './exceptions.js';
import { validateWeek, bookingDates, slotsForDate, minutes, moscowDate } from './schedule.js';

export class CalendarError extends Error {
  constructor(
    public code: string,
    message: string,
    public fieldErrors?: Record<string, string>,
    public status = 400,
  ) {
    super(message);
  }
}

/** One instance per app. All domain mutations share this queue; callbacks stay synchronous. */
export class Calendar {
  private readonly exceptions = new ScheduleExceptions();
  private schedule: WeeklySchedule = {
    exceptions: [],
    version: 1,
    days: [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, intervals: [] })),
  };
  getOwnerSchedule() {
    return { ...structuredClone(this.schedule), exceptions: this.exceptions.list() };
  }
  replaceWeeklySchedule(input: ReplaceWeeklyScheduleRequest) {
    return this.mutate(() => {
      const days = validateWeek(input);
      if (input.expectedVersion !== this.schedule.version)
        throw new CalendarError(
          'VERSION_CONFLICT',
          'Расписание изменилось. Загрузите актуальные данные',
        );
      if (JSON.stringify(days) !== JSON.stringify(this.schedule.days))
        this.schedule = { version: this.schedule.version + 1, days, exceptions: [] };
      return this.getOwnerSchedule();
    });
  }
  getScheduleException(date: string) {
    return this.exceptions.get(date);
  }
  replaceScheduleException(date: string, input: ReplaceScheduleExceptionRequest) {
    return this.mutate(() => this.exceptions.replace(date, input.expectedVersion, input.intervals));
  }
  deleteScheduleException(date: string, input: DeleteScheduleExceptionRequest) {
    return this.mutate(() => this.exceptions.replace(date, input.expectedVersion, null));
  }
  effectiveIntervals(date: string) {
    return (
      this.exceptions.get(date).intervals ??
      this.schedule.days.find((entry) => entry.day === (new Date(date).getUTCDay() || 7))!.intervals
    );
  }
  readonly meetingTypes = new Map<string, MeetingType>();
  private mutations: Promise<unknown> = Promise.resolve();
  constructor(readonly now: () => number) {}

  mutate<T>(operation: (now: number) => T): Promise<T> {
    const result = this.mutations.then(() => operation(this.now()));
    this.mutations = result.catch(() => undefined);
    return result;
  }

  createMeetingType(input: CreateMeetingTypeRequest) {
    return this.mutate((now) => {
      const title = input.title.trim();
      const description = input.description ?? '';
      const errors: Record<string, string> = {};
      if ([...title].length < 1 || [...title].length > 100)
        errors.title = 'Название должно содержать от 1 до 100 символов';
      if ([...description].length > 2000)
        errors.description = 'Описание должно содержать не более 2000 символов';
      if (
        !Number.isInteger(input.durationMinutes) ||
        input.durationMinutes < 1 ||
        input.durationMinutes > 1440
      )
        errors.durationMinutes = 'Длительность должна быть целым числом от 1 до 1440 минут';
      if (Object.keys(errors).length)
        throw new CalendarError('VALIDATION_ERROR', 'Проверьте поля запроса', errors);
      if (
        [...this.meetingTypes.values()].some(
          (type) => type.title.toLowerCase() === title.toLowerCase(),
        )
      )
        throw new CalendarError('MEETING_TYPE_TITLE_EXISTS', 'Название уже используется', {
          title: 'Название уже используется',
        });
      const meetingType: MeetingType = {
        id: randomUUID(),
        title,
        description,
        durationMinutes: input.durationMinutes,
        hidden: false,
        version: 1,
      };
      this.meetingTypes.set(meetingType.id, meetingType);
      return {
        meetingType: { ...meetingType },
        warnings: [
          ...this.schedule.days,
          ...this.exceptions.list().filter((entry) => entry.date >= moscowDate(now)),
        ].some((day) =>
          day.intervals?.some(
            (interval) => minutes(interval.end) - minutes(interval.start) >= input.durationMinutes,
          ),
        )
          ? []
          : [
              {
                code: 'DURATION_EXCEEDS_WORKING_INTERVALS' as const,
                message:
                  'Длительность встречи превышает любой рабочий интервал. При текущем расписании запись невозможна',
              },
            ],
      };
    });
  }

  listOwnerMeetingTypes() {
    return { items: [...this.meetingTypes.values()].map((type) => ({ ...type })) };
  }
  getCatalog() {
    const now = this.now();
    return {
      items: [...this.meetingTypes.values()]
        .filter((type) => !type.hidden)
        .map((type) => ({
          ...publicType(type),
          nearestStartsAt:
            this.availability(type, now).days.flatMap((day) => day.slots)[0]?.startsAt ?? null,
        })),
    };
  }
  getAvailability(id: string) {
    const type = this.meetingTypes.get(id);
    if (!type || type.hidden)
      throw new CalendarError('NOT_FOUND', 'Тип встречи не найден', undefined, 404);
    return this.availability(type, this.now());
  }
  private availability(type: MeetingType, now: number) {
    const days = bookingDates(now).map((date) => ({
      date,
      slots: slotsForDate(date, type.durationMinutes, this.effectiveIntervals(date), now),
    }));
    return {
      meetingType: publicType(type),
      timeZone: 'Europe/Moscow' as const,
      windowStart: days[0]!.date,
      windowEnd: days[13]!.date,
      days,
    };
  }
}

function publicType(type: MeetingType): PublicMeetingType {
  return {
    id: type.id,
    title: type.title,
    description: type.description,
    durationMinutes: type.durationMinutes,
  };
}
