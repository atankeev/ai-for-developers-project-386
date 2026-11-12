import { reactive, watch } from 'vue';
import { createBooking, type CreateBookingRequest } from '@call-calendar/api-contract';

const storageKey = 'call-calendar.sent-attempt.v1';
let sendingRequest: AbortController | undefined;
export const bookingState = reactive({
  guestName: '',
  guestEmail: '',
  comment: '',
  pending: undefined as CreateBookingRequest | undefined,
  sending: false,
  unknown: false,
  recoveryMessage: '',
});
export function clearBookingDraft() {
  bookingState.guestName = '';
  bookingState.guestEmail = '';
  bookingState.comment = '';
}
function removeRecovery() {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // Storage can be disabled by the browser.
  }
  bookingState.pending = undefined;
  bookingState.unknown = false;
}
export function expireBookingAttempt() {
  if (bookingState.pending && Date.now() >= Date.parse(bookingState.pending.startsAt)) {
    sendingRequest?.abort();
    sendingRequest = undefined;
    bookingState.sending = false;
    removeRecovery();
    bookingState.recoveryMessage = 'Время встречи уже наступило. Можно выбрать новую запись.';
  }
}
function restoreAttempt() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') throw new Error();
    const attempt = value as Record<string, unknown>;
    const uuid = /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
    if (
      typeof attempt.attemptId !== 'string' ||
      !uuid.test(attempt.attemptId) ||
      typeof attempt.meetingTypeId !== 'string' ||
      !uuid.test(attempt.meetingTypeId) ||
      typeof attempt.startsAt !== 'string' ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:00(?:\.000)?Z$/.test(attempt.startsAt) ||
      !Number.isFinite(Date.parse(attempt.startsAt)) ||
      new Date(attempt.startsAt).toISOString().replace('.000Z', 'Z') !==
        attempt.startsAt.replace('.000Z', 'Z') ||
      typeof attempt.guestName !== 'string' ||
      !attempt.guestName.trim() ||
      [...attempt.guestName.trim()].length > 100 ||
      typeof attempt.guestEmail !== 'string' ||
      [...attempt.guestEmail.trim()].length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(attempt.guestEmail.trim()) ||
      (attempt.comment !== undefined &&
        (typeof attempt.comment !== 'string' || [...attempt.comment].length > 2000))
    )
      throw new Error();
    bookingState.pending = {
      attemptId: attempt.attemptId,
      meetingTypeId: attempt.meetingTypeId,
      startsAt: attempt.startsAt,
      guestName: attempt.guestName,
      guestEmail: attempt.guestEmail,
      ...(attempt.comment === undefined ? {} : { comment: attempt.comment as string }),
    };
    bookingState.unknown = true;
    expireBookingAttempt();
    if (bookingState.pending) {
      bookingState.guestName = bookingState.pending.guestName;
      bookingState.guestEmail = bookingState.pending.guestEmail;
      bookingState.comment = bookingState.pending.comment ?? '';
    }
  } catch {
    removeRecovery();
  }
}
export function initializeBookingRecovery() {
  restoreAttempt();
  let timer: number | undefined;
  const check = () => {
    window.clearTimeout(timer);
    expireBookingAttempt();
    if (bookingState.pending) {
      timer = window.setTimeout(
        check,
        Math.min(
          2_147_483_647,
          Math.max(0, Date.parse(bookingState.pending.startsAt) - Date.now()),
        ),
      );
    }
  };
  const stop = watch(() => bookingState.pending?.startsAt, check, { immediate: true });
  const synchronize = (event: StorageEvent) => {
    if (event.key !== storageKey || bookingState.sending) return;
    if (event.newValue) restoreAttempt();
    else {
      bookingState.pending = undefined;
      bookingState.unknown = false;
    }
  };
  window.addEventListener('storage', synchronize);
  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
  return () => {
    window.clearTimeout(timer);
    stop();
    window.removeEventListener('storage', synchronize);
    document.removeEventListener('visibilitychange', check);
    window.removeEventListener('focus', check);
  };
}
export async function sendBookingAttempt(attempt?: CreateBookingRequest) {
  expireBookingAttempt();
  if (bookingState.sending || (attempt && bookingState.pending)) return;
  if (attempt) {
    // Persist the exact POST before it can reach the server, never an ordinary draft.
    try {
      localStorage.setItem(storageKey, JSON.stringify(attempt));
    } catch {
      bookingState.recoveryMessage =
        'Не удалось сохранить попытку в браузере. Запись не отправлена.';
      return;
    }
    bookingState.pending = { ...attempt };
  }
  if (!bookingState.pending) return;
  const request = new AbortController();
  sendingRequest = request;
  bookingState.sending = true;
  bookingState.unknown = false;
  bookingState.recoveryMessage = '';
  try {
    const result = await createBooking({
      body: { ...bookingState.pending },
      signal: request.signal,
    });
    if (request.signal.aborted) return;
    if (result.data) {
      removeRecovery();
      clearBookingDraft();
    } else if (result.response && result.response.status < 500) {
      removeRecovery();
      bookingState.recoveryMessage = result.error?.message ?? 'Не удалось создать запись';
    } else bookingState.unknown = !!bookingState.pending;
    return result;
  } catch {
    if (!request.signal.aborted) bookingState.unknown = !!bookingState.pending;
  } finally {
    if (sendingRequest === request) {
      sendingRequest = undefined;
      bookingState.sending = false;
      expireBookingAttempt();
    }
  }
}
