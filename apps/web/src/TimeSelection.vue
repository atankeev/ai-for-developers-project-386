<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import { bookingState as state, clearBookingDraft, sendBookingAttempt } from './booking-state.js';
import Button from 'primevue/button';
import type { Availability } from '@call-calendar/api-contract';
const props = defineProps<{ availability: Availability; unavailable?: boolean }>();
const emit = defineEmits<{ refresh: [] }>();
const router = useRouter();
const errors = ref<Record<string, string>>({});
const message = ref('');
const form = ref<HTMLFormElement>();
const selectionLocked = computed(() => locked.value || props.unavailable);
const locked = computed(() => state.sending || !!state.pending);
async function submit() {
  if (selectionLocked.value) return;
  errors.value = {};
  message.value = '';
  const name = state.guestName.trim(),
    email = state.guestEmail.trim();
  if (![...name].length || [...name].length > 100)
    errors.value.guestName = 'Введите имя от 1 до 100 символов';
  if ([...email].length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.value.guestEmail = 'Введите корректный email';
  if ([...state.comment.replace(/\r\n?/g, '\n')].length > 2000)
    errors.value.comment = 'Не более 2000 символов';
  if (Object.keys(errors.value).length) {
    await focusError();
    return;
  }
  if (!selectedTime.value) {
    message.value = 'Выберите время встречи';
    return;
  }
  const result = await sendBookingAttempt({
    attemptId: crypto.randomUUID(),
    meetingTypeId: props.availability.meetingType.id,
    startsAt: selectedTime.value,
    guestName: state.guestName,
    guestEmail: state.guestEmail,
    comment: state.comment,
  });
  if (result?.data) {
    selectedTime.value = '';
    await router.push(result.data.confirmationUrl);
  } else if (result?.response && result.response.status < 500) {
    errors.value = result.error?.fieldErrors ?? {};
    selectedTime.value = '';
    if (Object.keys(errors.value).length) await focusError();
    else emit('refresh');
  }
}
async function focusError() {
  await nextTick();
  form.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
}
const selectedDate = ref('');
const selectedTime = ref('');
const focusDate = ref('');
const dates = ref<HTMLElement>();
const day = computed(() => props.availability.days.find((day) => day.date === selectedDate.value));
const offset = computed(
  () => (new Date(`${props.availability.windowStart}T00:00:00Z`).getUTCDay() + 6) % 7,
);
const formatDate = (date: string) =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: 'numeric',
    month: 'long',
    weekday: 'short',
  }).format(new Date(`${date}T12:00:00Z`));
const formatTime = (time: string) =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(time));
watch(
  () => props.availability,
  (value) => {
    selectedDate.value = value.days.find((day) => day.slots.length)?.date ?? '';
    focusDate.value = selectedDate.value;
    selectedTime.value = '';
  },
  { immediate: true },
);
function selectDate(date: string) {
  selectedDate.value = date;
  selectedTime.value = '';
}
function move(event: KeyboardEvent, index: number) {
  const delta: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
  const step = delta[event.key];
  if (!step) return;
  event.preventDefault();
  let next = index + step;
  while (next >= 0 && next < props.availability.days.length) {
    const target = props.availability.days[next]!;
    if (target.slots.length) {
      focusDate.value = target.date;
      dates.value?.querySelector<HTMLButtonElement>(`button[data-date="${target.date}"]`)?.focus();
      return;
    }
    next += step;
  }
}
</script>
<template>
  <section class="booking-selection" aria-label="Выбор даты и времени">
    <div>
      <h2>Дата и время</h2>
      <p>Europe/Moscow</p>
      <p>
        Окно записи: {{ formatDate(availability.windowStart) }} —
        {{ formatDate(availability.windowEnd) }}
      </p>
      <div ref="dates" class="calendar-dates" role="group" aria-label="Даты записи">
        <span
          v-for="name in ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']"
          :key="name"
          aria-hidden="true"
          >{{ name }}</span
        >
        <span v-for="blank in offset" :key="`blank-${blank}`" aria-hidden="true" />
        <button
          v-for="(date, index) in availability.days"
          :key="date.date"
          type="button"
          :data-date="date.date"
          :aria-label="`Выбрать дату ${formatDate(date.date)}`"
          :disabled="selectionLocked || !date.slots.length"
          :aria-pressed="date.date === selectedDate"
          :tabindex="date.date === focusDate ? 0 : -1"
          @focus="focusDate = date.date"
          @click="selectDate(date.date)"
          @keydown="move($event, index)"
        >
          {{ Number(date.date.slice(-2)) }}
        </button>
      </div>
      <p v-if="!selectedDate">Нет свободного времени для этой встречи в ближайшие 14 дней</p>
      <template v-if="day">
        <h3>{{ formatDate(day.date) }}</h3>
        <div class="time-buttons" role="group" aria-label="Время начала">
          <Button
            v-for="slot in day.slots"
            :key="slot.startsAt"
            :label="formatTime(slot.startsAt)"
            :disabled="selectionLocked"
            :aria-pressed="selectedTime === slot.startsAt"
            severity="secondary"
            @click="selectedTime = slot.startsAt"
          />
        </div>
      </template>
    </div>
    <aside class="selection-summary" aria-live="polite">
      <h2>Ваш выбор</h2>
      <p>{{ availability.meetingType.title }}</p>
      <p v-if="selectedTime">
        Выбрано: {{ formatDate(selectedDate) }}, {{ formatTime(selectedTime) }} —
        {{ formatTime(day!.slots.find((slot) => slot.startsAt === selectedTime)!.endsAt) }} (Москва)
      </p>
      <p v-else>Выберите время встречи</p>
      <p v-if="message" role="alert">{{ message }}</p>
      <form
        v-if="availability.days.some((day) => day.slots.length)"
        ref="form"
        class="contact-form"
        novalidate
        @submit.prevent="submit()"
      >
        <h3>Контакты</h3>
        <label for="guest-name">Имя</label>
        <InputText
          id="guest-name"
          v-model="state.guestName"
          :disabled="locked"
          :aria-invalid="!!errors.guestName"
          :aria-describedby="errors.guestName ? 'guest-name-error' : undefined"
          autocomplete="name"
        />
        <p v-if="errors.guestName" id="guest-name-error" role="alert">{{ errors.guestName }}</p>
        <label for="guest-email">Email</label>
        <InputText
          id="guest-email"
          v-model="state.guestEmail"
          type="email"
          :disabled="locked"
          :aria-invalid="!!errors.guestEmail"
          :aria-describedby="errors.guestEmail ? 'guest-email-error' : undefined"
          autocomplete="email"
        />
        <p v-if="errors.guestEmail" id="guest-email-error" role="alert">{{ errors.guestEmail }}</p>
        <label for="guest-comment">Комментарий</label>
        <Textarea
          id="guest-comment"
          v-model="state.comment"
          :disabled="locked"
          :aria-invalid="!!errors.comment"
          :aria-describedby="errors.comment ? 'guest-comment-error' : undefined"
          rows="4"
        />
        <p v-if="errors.comment" id="guest-comment-error" role="alert">{{ errors.comment }}</p>
        <p v-if="state.sending" role="status">Отправляем запись…</p>
        <Button label="Подтвердить запись" type="submit" :disabled="selectionLocked" />
        <Button
          label="Очистить черновик"
          type="button"
          severity="secondary"
          :disabled="locked"
          @click="
            clearBookingDraft();
            selectedTime = '';
            errors = {};
            message = '';
          "
        />
        <p>Письма не отправляются. Сохраните ссылку после записи.</p>
      </form>
    </aside>
  </section>
</template>
