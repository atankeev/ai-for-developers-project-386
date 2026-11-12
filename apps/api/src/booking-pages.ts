import { CalendarError } from './calendar.js';
import { ownerBooking, type Booking } from './bookings.js';
type Group = 'upcoming' | 'past' | 'cancelled';
type Key = { startsAt: number; id: string };
const compare = (a: Key, b: Key) =>
  a.startsAt < b.startsAt
    ? -1
    : a.startsAt > b.startsAt
      ? 1
      : a.id < b.id
        ? -1
        : a.id > b.id
          ? 1
          : 0;
export function bookingPage(
  bookings: Iterable<Booking>,
  group: string,
  cursor: string | undefined,
  now: number,
) {
  const invalid = () => {
    throw new CalendarError('VALIDATION_ERROR', 'Некорректная группа или курсор');
  };
  if (!['upcoming', 'past', 'cancelled'].includes(group)) invalid();
  let key: Key | undefined;
  if (cursor !== undefined) {
    try {
      if (!/^[A-Za-z0-9_-]+$/.test(cursor) || cursor.length > 512) return invalid();
      const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      if (
        !value ||
        typeof value !== 'object' ||
        Object.keys(value).sort().join(',') !== 'group,id,startsAt' ||
        value.group !== group ||
        typeof value.id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id) ||
        typeof value.startsAt !== 'string' ||
        !Number.isFinite(Date.parse(value.startsAt)) ||
        new Date(value.startsAt).toISOString() !== value.startsAt ||
        Date.parse(value.startsAt) % 60000 !== 0 ||
        Buffer.from(JSON.stringify(value)).toString('base64url') !== cursor
      )
        return invalid();
      key = { startsAt: Date.parse(value.startsAt), id: value.id };
    } catch {
      return invalid();
    }
  }
  const direction = group === 'upcoming' ? 1 : -1;
  const matches = [...bookings]
    .filter((b) =>
      group === 'cancelled'
        ? b.status === 'cancelled'
        : b.status === 'confirmed' && (group === 'upcoming' ? b.endsAt > now : b.endsAt <= now),
    )
    .filter((b) => !key || direction * compare(b, key) > 0)
    .sort((a, b) => direction * compare(a, b));
  const items = matches.slice(0, 20).map(ownerBooking);
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      matches.length > 20 && last
        ? Buffer.from(
            JSON.stringify({ group: group as Group, startsAt: last.startsAt, id: last.id }),
          ).toString('base64url')
        : null,
  };
}
