<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import type { Availability } from '@call-calendar/api-contract';
const props = defineProps<{ availability: Availability }>();
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
          :disabled="!date.slots.length"
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
            :aria-pressed="selectedTime === slot.startsAt"
            severity="secondary"
            @click="selectedTime = slot.startsAt"
          />
        </div>
      </template>
    </div>
    <aside class="selection-summary" aria-live="polite">
      <h2>Ваш выбор</h2>
      <p v-if="selectedTime">
        Выбрано: {{ formatDate(selectedDate) }}, {{ formatTime(selectedTime) }} —
        {{ formatTime(day!.slots.find((slot) => slot.startsAt === selectedTime)!.endsAt) }} (Москва)
      </p>
      <p v-else>Выберите время встречи</p>
    </aside>
  </section>
</template>
