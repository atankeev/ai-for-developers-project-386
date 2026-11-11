<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import Button from 'primevue/button';
import {
  getCatalog,
  getAvailability,
  type CatalogItem,
  type PublicMeetingType,
} from '@call-calendar/api-contract';
import './owner/api.js';
const route = useRoute();
const loading = ref(true);
const failed = ref(false);
const missing = ref(false);
const items = ref<CatalogItem[]>([]);
const type = ref<PublicMeetingType>();
let generation = 0;
async function load() {
  const current = ++generation;
  loading.value = true;
  failed.value = false;
  missing.value = false;
  type.value = undefined;
  document.title = 'Записаться — Календарь звонков';
  try {
    if (typeof route.params.id === 'string') {
      const result = await getAvailability({ path: { id: route.params.id } });
      if (current !== generation) return;
      if (result.response?.status === 404) missing.value = true;
      else if (result.data) type.value = result.data.meetingType;
      else throw new Error();
    } else {
      const result = await getCatalog();
      if (current !== generation) return;
      if (!result.data) throw new Error();
      items.value = result.data.items;
    }
  } catch {
    if (current === generation) failed.value = true;
  } finally {
    if (current === generation) loading.value = false;
  }
}
watch(() => route.params.id, load, { immediate: true });
</script>
<template>
  <main class="page">
    <header class="page-header">
      <span class="brand-mark" aria-hidden="true">К</span><span>Календарь звонков</span>
    </header>
    <section class="intro">
      <p class="eyebrow">Каталог типов встреч</p>
      <h1>{{ type?.title ?? 'Записаться' }}</h1>
    </section>
    <p v-if="loading" role="status">Загрузка…</p>
    <div v-else-if="failed" role="alert">
      Не удалось загрузить данные. <Button label="Повторить" @click="load" />
    </div>
    <p v-else-if="missing">Тип встречи не найден</p>
    <template v-else-if="type">
      <p class="plain-text">{{ type.description }}</p>
      <p>{{ type.durationMinutes }} минут</p>
      <p>Нет свободного времени для этой встречи в ближайшие 14 дней</p>
    </template>
    <template v-else>
      <p v-if="!items.length">Сейчас нет доступных типов встреч</p>
      <article v-for="item in items" :key="item.id" class="meeting-card">
        <h2>{{ item.title }}</h2>
        <p class="plain-text">{{ item.description }}</p>
        <p>{{ item.durationMinutes }} минут</p>
        <p>
          {{
            item.nearestStartsAt
              ? `Ближайшее время: ${item.nearestStartsAt}`
              : 'Нет свободного времени в ближайшие 14 дней'
          }}
        </p>
        <RouterLink :to="`/book/${item.id}`">Выбрать встречу</RouterLink>
      </article>
    </template>
    <p>
      <RouterLink v-if="route.params.id" to="/book">Вернуться к типам встреч</RouterLink
      ><RouterLink v-else to="/">Вернуться на главную</RouterLink>
    </p>
  </main>
</template>
