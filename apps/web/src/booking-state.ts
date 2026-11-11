import { reactive } from 'vue';
import type { CreateBookingRequest } from '@call-calendar/api-contract';
// Ordinary drafts and unknown results intentionally live only in this SPA session (#18 adds recovery).
export const bookingState = reactive({
  guestName: '',
  guestEmail: '',
  comment: '',
  pending: undefined as CreateBookingRequest | undefined,
  sending: false,
  unknown: false,
});
export function clearBookingDraft() {
  bookingState.guestName = '';
  bookingState.guestEmail = '';
  bookingState.comment = '';
}
