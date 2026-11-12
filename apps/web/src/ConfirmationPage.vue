<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute } from 'vue-router';
import Button from 'primevue/button';
import { getConfirmation, type GuestBooking } from '@call-calendar/api-contract';
const route = useRoute();
const booking = ref<GuestBooking>();
const loading = ref(false),
  failed = ref(false),
  missing = ref(false),
  copied = ref(false),
  copyFailed = ref(false);
const url = ref('');
const format = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(value));
let generation = 0;
async function load() {
  const current = ++generation;
  loading.value = true;
  failed.value = false;
  missing.value = false;
  booking.value = undefined;
  url.value = window.location.href;
  document.title = 'Подтверждение записи — Календарь звонков';
  try {
    const result = await getConfirmation({ path: { token: String(route.params.token) } });
    if (current !== generation) return;
    if (result.data) booking.value = result.data;
    else if (result.response?.status === 404) missing.value = true;
    else failed.value = true;
  } catch {
    if (current === generation) failed.value = true;
  } finally {
    if (current === generation) loading.value = false;
  }
}
async function copy() {
  try {
    await navigator.clipboard.writeText(url.value);
    copied.value = true;
  } catch {
    copyFailed.value = true;
  }
}
function visible() {
  if (document.visibilityState === 'visible') void load();
}
onMounted(() => document.addEventListener('visibilitychange', visible));
onBeforeUnmount(() => {
  generation++;
  document.removeEventListener('visibilitychange', visible);
});
watch(() => route.params.token, load, { immediate: true });
</script>
<template>
  <main class="page confirmation-page">
    <p v-if="loading" role="status">Загрузка…</p>
    <div v-else-if="failed" role="alert">
      Не удалось загрузить подтверждение. <Button label="Повторить" @click="load" />
    </div>
    <div v-else-if="missing">
      <h1>Подтверждение не найдено</h1>
      <p>Ссылка неверна или срок хранения записи закончился.</p>
    </div>
    <section v-else-if="booking">
      <h1>{{ booking.status === 'confirmed' ? 'Запись подтверждена' : 'Запись отменена' }}</h1>
      <h2>{{ booking.title }}</h2>
      <p>{{ format(booking.startsAt) }} — {{ format(booking.endsAt) }} (Москва)</p>
      <p>Europe/Moscow</p>
      <p>Сохраните секретную ссылку: письма не отправляются.</p>
      <label for="confirmation-url">Ссылка на подтверждение</label>
      <input
        id="confirmation-url"
        :value="url"
        readonly
        @focus="($event.target as HTMLInputElement).select()"
      />
      <Button label="Скопировать ссылку" @click="copy" />
      <p v-if="copied" role="status">Ссылка скопирована</p>
      <p v-if="copyFailed" role="status">Выделите и скопируйте ссылку из поля вручную.</p>
    </section>
    <Button label="Обновить статус" :disabled="loading" @click="load" />
    <p><RouterLink to="/book">Записаться ещё</RouterLink></p>
  </main>
</template>
