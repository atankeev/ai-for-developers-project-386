import {
  normalizeBooking,
  makeBooking,
  guestBooking,
  ownerBooking,
  overlaps,
  type Booking,
} from './bookings.js';
import { randomUUID } from 'node:crypto';
import type {
  CreateBookingRequest,
  CreateMeetingTypeRequest,
  ReplaceMeetingTypeRequest,
  MeetingType,
  PublicMeetingType,
  WeeklySchedule,
  ReplaceWeeklyScheduleRequest,
} from '@call-calendar/api-contract';

import { validateWeek, bookingDates, slotsForDate, minutes } from './schedule.js';

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
  private schedule: WeeklySchedule = {
    version: 1,
    days: [1, 2, 3, 4, 5, 6, 7].map((day) => ({ day, intervals: [] })),
  };
  getOwnerSchedule() {
    return structuredClone(this.schedule);
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
        this.schedule = { version: this.schedule.version + 1, days };
      return this.getOwnerSchedule();
    });
  }
  readonly bookings = new Map<string, Booking>();
  readonly confirmationIndex = new Map<string, string>();
  readonly successfulAttempts = new Map<string, { request: string; bookingId: string }>();
  createBooking(input: CreateBookingRequest) {
    return this.mutate((now) => {
      const normalized = normalizeBooking(input);
      const request = JSON.stringify(normalized);
      const attempt = this.successfulAttempts.get(normalized.attemptId);
      if (attempt) {
        if (attempt.request !== request)
          throw new CalendarError(
            'ATTEMPT_DATA_MISMATCH',
            'Данные попытки отличаются от успешной записи',
          );
        return this.bookingResult(this.bookings.get(attempt.bookingId)!);
      }
      const type = this.meetingTypes.get(normalized.meetingTypeId);
      if (!type || type.hidden)
        throw new CalendarError('NOT_FOUND', 'Тип встречи не найден', undefined, 404);
      const candidate = this.availability(type, now, false)
        .days.flatMap((day) => day.slots)
        .find((slot) => slot.startsAt === normalized.startsAt);
      if (!candidate)
        throw new CalendarError('TIME_UNAVAILABLE', 'Выбранное время больше недоступно');
      if (
        [...this.bookings.values()].some((booking) =>
          overlaps(booking, candidate.startsAt, candidate.endsAt),
        )
      )
        throw new CalendarError('SLOT_OCCUPIED', 'Это время уже занято');
      const booking = makeBooking(normalized, type);
      this.bookings.set(booking.id, booking);
      this.confirmationIndex.set(booking.token, booking.id);
      this.successfulAttempts.set(normalized.attemptId, { request, bookingId: booking.id });
      return this.bookingResult(booking);
    });
  }
  private bookingResult(booking: Booking) {
    return { booking: guestBooking(booking), confirmationUrl: `/confirmations/${booking.token}` };
  }
  getConfirmation(token: string) {
    const booking = this.bookings.get(this.confirmationIndex.get(token) ?? '');
    if (!booking) throw new CalendarError('NOT_FOUND', 'Подтверждение не найдено', undefined, 404);
    return guestBooking(booking);
  }
  getOwnerBooking(id: string) {
    const booking = this.bookings.get(id);
    if (!booking) throw new CalendarError('NOT_FOUND', 'Запись не найдена', undefined, 404);
    return ownerBooking(booking);
  }
  listOwnerBookings(group: string, cursor?: string) {
    if (group !== 'upcoming' || cursor)
      throw new CalendarError('VALIDATION_ERROR', 'Недоступная группа или курсор');
    const now = this.now();
    return {
      items: [...this.bookings.values()]
        .filter((b) => b.status === 'confirmed' && Date.parse(b.endsAt) > now)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id))
        .slice(0, 20)
        .map(ownerBooking),
      nextCursor: null,
    };
  }
  private readonly meetingTypeTitles = new Map<string, string>();
  readonly meetingTypes = new Map<string, MeetingType>();
  private mutations: Promise<unknown> = Promise.resolve();
  constructor(readonly now: () => number) {}

  mutate<T>(operation: (now: number) => T): Promise<T> {
    const result = this.mutations.then(() => operation(this.now()));
    this.mutations = result.catch(() => undefined);
    return result;
  }

  createMeetingType(input: CreateMeetingTypeRequest) {
    return this.mutate(() => {
      const { title, description } = this.validateMeetingType(input);
      const meetingType: MeetingType = {
        id: randomUUID(),
        title,
        description,
        durationMinutes: input.durationMinutes,
        hidden: false,
        version: 1,
      };
      this.meetingTypes.set(meetingType.id, meetingType);
      this.meetingTypeTitles.set(title.toLowerCase(), meetingType.id);
      return this.meetingTypeResult(meetingType);
    });
  }

  replaceMeetingType(id: string, input: ReplaceMeetingTypeRequest) {
    return this.mutate(() => {
      const { title, description } = this.validateMeetingType(input, id);
      const current = this.meetingTypes.get(id);
      if (!current) throw new CalendarError('NOT_FOUND', 'Тип встречи не найден', undefined, 404);
      if (input.expectedVersion !== current.version)
        throw new CalendarError(
          'VERSION_CONFLICT',
          'Тип встречи изменился. Загрузите актуальные данные',
        );
      const changed =
        current.title !== title ||
        current.description !== description ||
        current.durationMinutes !== input.durationMinutes ||
        current.hidden !== input.hidden;
      const meetingType = {
        ...current,
        title,
        description,
        durationMinutes: input.durationMinutes,
        hidden: input.hidden,
        version: current.version + (changed ? 1 : 0),
      };
      this.meetingTypeTitles.delete(current.title.toLowerCase());
      this.meetingTypeTitles.set(title.toLowerCase(), id);
      this.meetingTypes.set(id, meetingType);
      return this.meetingTypeResult(meetingType);
    });
  }

  private validateMeetingType(input: CreateMeetingTypeRequest, excludingId?: string) {
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
      this.meetingTypeTitles.has(title.toLowerCase()) &&
      this.meetingTypeTitles.get(title.toLowerCase()) !== excludingId
    )
      throw new CalendarError('MEETING_TYPE_TITLE_EXISTS', 'Название уже используется', {
        title: 'Название уже используется',
      });
    return { title, description };
  }

  private meetingTypeResult(meetingType: MeetingType) {
    return {
      meetingType: { ...meetingType },
      warnings: this.schedule.days.some((day) =>
        day.intervals.some(
          (interval) =>
            minutes(interval.end) - minutes(interval.start) >= meetingType.durationMinutes,
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
  private availability(type: MeetingType, now: number, filterOccupied = true) {
    const days = bookingDates(now).map((date) => ({
      date,
      slots: slotsForDate(date, type.durationMinutes, this.schedule, now).filter(
        (slot) =>
          !filterOccupied ||
          ![...this.bookings.values()].some((booking) =>
            overlaps(booking, slot.startsAt, slot.endsAt),
          ),
      ),
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
