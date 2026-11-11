<script setup lang="ts">
import { ref, onMounted } from 'vue';
import Button from 'primevue/button';
import { listOwnerBookings, type OwnerBooking } from '@call-calendar/api-contract';
import { SessionExpired } from './api.js';
const loading = ref(false),
  failed = ref(false);
const items = ref<OwnerBooking[]>([]);
const format = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(value));
async function load() {
  loading.value = true;
  failed.value = false;
  try {
    const result = await listOwnerBookings({ query: { group: 'upcoming' } });
    if (!result.data) throw new Error();
    items.value = result.data.items;
  } catch (error) {
    if (!(error instanceof SessionExpired)) failed.value = true;
  } finally {
    loading.value = false;
  }
}
onMounted(load);
</script>
<template>
  <section class="owner-bookings">
    <h1>Встречи</h1>
    <h2>Предстоящие и текущие</h2>
    <Button label="Обновить" :disabled="loading" @click="load" />
    <p v-if="loading" role="status">Загрузка…</p>
    <div v-else-if="failed" role="alert">
      Не удалось загрузить встречи. <Button label="Повторить" @click="load" />
    </div>
    <p v-else-if="!items.length">Предстоящих встреч нет</p>
    <template v-else
      ><article v-for="booking in items" :key="booking.id" class="meeting-card">
        <h3>{{ booking.title }}</h3>
        <p>{{ format(booking.startsAt) }} — {{ format(booking.endsAt) }} (Москва)</p>
        <p>{{ booking.durationMinutes }} минут</p>
        <p class="plain-text">{{ booking.description }}</p>
        <p>{{ booking.guestName }}</p>
        <p>{{ booking.guestEmail }}</p>
        <p class="plain-text">{{ booking.comment }}</p>
      </article></template
    >
  </section>
</template>
