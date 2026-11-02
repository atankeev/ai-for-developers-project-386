<script setup lang="ts">
import { onMounted, ref } from 'vue';
import Button from 'primevue/button';
import Card from 'primevue/card';
import Tag from 'primevue/tag';
import { getHealth } from '@call-calendar/api-contract';

const status = ref<'loading' | 'online' | 'offline'>('loading');

async function checkConnection() {
  status.value = 'loading';
  try {
    const { data } = await getHealth({
      signal: AbortSignal.timeout(5000),
      throwOnError: true,
    });
    status.value = data.status === 'ok' ? 'online' : 'offline';
  } catch {
    status.value = 'offline';
  }
}

onMounted(checkConnection);
</script>

<template>
  <main class="page">
    <header class="page-header">
      <span class="brand-mark" aria-hidden="true">К</span>
      <span>Календарь звонков</span>
    </header>
    <section class="intro" aria-labelledby="page-title">
      <p class="eyebrow">Время для разговора</p>
      <h1 id="page-title">Ваши встречи.<br />В одном месте.</h1>
      <p class="description">
        Здесь можно будет выбрать удобное время и записаться на звонок. Сейчас сервис готовится к
        первым встречам.
      </p>
    </section>
    <Card class="status-card">
      <template #title>Готовимся к запуску</template>
      <template #content>
        <div class="connection" role="status" aria-live="polite" aria-atomic="true">
          <Tag v-if="status === 'loading'" severity="secondary" value="Проверяем соединение" />
          <Tag v-else-if="status === 'online'" severity="success" value="Сервис доступен" />
          <Tag v-else severity="danger" value="Нет соединения с сервисом" />
          <p v-if="status === 'offline'">Не удалось получить ответ. Попробуйте ещё раз.</p>
          <p v-else>Запись на встречи появится здесь позже.</p>
        </div>
      </template>
      <template #footer>
        <Button
          label="Проверить соединение"
          severity="secondary"
          outlined
          :loading="status === 'loading'"
          :disabled="status === 'loading'"
          @click="checkConnection"
        />
      </template>
    </Card>
  </main>
</template>
