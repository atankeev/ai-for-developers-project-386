import { randomBytes, randomUUID } from 'node:crypto';
import type {
  CreateBookingRequest,
  OwnerBooking,
  GuestBooking,
  MeetingType,
} from '@call-calendar/api-contract';
import { CalendarError } from './calendar.js';
export type Booking = Omit<OwnerBooking, 'startsAt' | 'endsAt' | 'cancelledAt'> & {
  token: string;
  startsAt: number;
  endsAt: number;
  cancelledAt: number | null;
};
export function normalizeBooking(input: CreateBookingRequest) {
  const errors: Record<string, string> = {};
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(input.attemptId)) errors.attemptId = 'Некорректный идентификатор попытки';
  if (!uuid.test(input.meetingTypeId)) errors.meetingTypeId = 'Некорректный тип встречи';
  const guestName = input.guestName.trim(),
    guestEmail = input.guestEmail.trim(),
    comment = (input.comment ?? '').replace(/\r\n?/g, '\n');
  if (![...guestName].length || [...guestName].length > 100)
    errors.guestName = 'Введите имя от 1 до 100 символов';
  if ([...guestEmail].length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail))
    errors.guestEmail = 'Введите корректный email';
  if ([...comment].length > 2000) errors.comment = 'Не более 2000 символов';
  const match = /^(\d{4}-\d{2}-\d{2})[Tt](\d{2}):(\d{2}):00(?:\.0+)?([Zz]|[+-]\d{2}:\d{2})$/.exec(
    input.startsAt,
  );
  const instant = Date.parse(input.startsAt);
  if (
    !match ||
    !Number.isFinite(instant) ||
    match[2]! > '23' ||
    match[3]! > '59' ||
    !Number.isFinite(Date.parse(`${match[1]}T00:00:00Z`)) ||
    new Date(`${match[1]}T00:00:00Z`).toISOString().slice(0, 10) !== match[1] ||
    (match[4]!.length > 1 && (+match[4]!.slice(1, 3) > 23 || +match[4]!.slice(4) > 59))
  )
    errors.startsAt = 'Укажите корректное время с часовым поясом и нулевыми секундами';
  if (Object.keys(errors).length)
    throw new CalendarError('VALIDATION_ERROR', 'Проверьте поля запроса', errors);
  return {
    attemptId: input.attemptId.toLowerCase(),
    meetingTypeId: input.meetingTypeId.toLowerCase(),
    startsAt: instant,
    guestName,
    guestEmail,
    comment,
  };
}
export function makeBooking(
  input: ReturnType<typeof normalizeBooking>,
  type: MeetingType,
): Booking {
  return {
    id: randomUUID(),
    meetingTypeId: type.id,
    title: type.title,
    description: type.description,
    durationMinutes: type.durationMinutes,
    startsAt: input.startsAt,
    endsAt: input.startsAt + type.durationMinutes * 60000,
    status: 'confirmed',
    cancelledAt: null,
    guestName: input.guestName,
    guestEmail: input.guestEmail,
    comment: input.comment,
    token: randomBytes(32).toString('base64url'),
  };
}
export function guestBooking(booking: Booking): GuestBooking {
  return {
    id: booking.id,
    title: booking.title,
    startsAt: new Date(booking.startsAt).toISOString(),
    endsAt: new Date(booking.endsAt).toISOString(),
    timeZone: 'Europe/Moscow',
    status: booking.status,
  };
}
export function ownerBooking(booking: Booking): OwnerBooking {
  return {
    id: booking.id,
    meetingTypeId: booking.meetingTypeId,
    title: booking.title,
    description: booking.description,
    durationMinutes: booking.durationMinutes,
    startsAt: new Date(booking.startsAt).toISOString(),
    endsAt: new Date(booking.endsAt).toISOString(),
    status: booking.status,
    cancelledAt: booking.cancelledAt === null ? null : new Date(booking.cancelledAt).toISOString(),
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    comment: booking.comment,
  };
}
export function overlaps(booking: Booking, start: number, end: number) {
  return booking.status === 'confirmed' && booking.startsAt < end && booking.endsAt > start;
}
