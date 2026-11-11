<script setup lang="ts">
import Button from 'primevue/button';
import Card from 'primevue/card';
import { computed, watchEffect } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const isCatalog = computed(() => route.path === '/book');
watchEffect(() => {
  document.title = isCatalog.value ? 'Записаться — Календарь звонков' : 'Календарь звонков';
});
</script>

<template>
  <main class="page">
    <header class="page-header">
      <span class="brand-mark" aria-hidden="true">К</span>
      <span>Календарь звонков</span>
    </header>
    <section class="intro" aria-labelledby="page-title">
      <p class="eyebrow">{{ isCatalog ? 'Каталог типов встреч' : 'Время для разговора' }}</p>
      <h1 v-if="isCatalog" id="page-title">Записаться</h1>
      <h1 v-else id="page-title">Ваши встречи.<br />В удобное время.</h1>
      <p v-if="isCatalog" class="description">
        Здесь появятся типы встреч. Вы сможете выбрать подходящий, а затем перейти к выбору даты и
        свободного времени.
      </p>
      <p v-else class="description">
        Календарь звонков поможет выбрать тип встречи и записаться на свободное время без
        регистрации.
      </p>
    </section>
    <Card class="status-card">
      <template #title>Готовимся к запуску</template>
      <template #content>
        <p class="launch-notice">Сервис готовится к запуску. Онлайн-запись появится позже.</p>
      </template>
      <template #footer>
        <Button
          v-if="isCatalog"
          as="a"
          href="/"
          label="Вернуться на главную"
          severity="secondary"
          outlined
        />
        <Button v-else as="a" href="/book" label="Записаться на встречу" />
      </template>
    </Card>
  </main>
</template>
