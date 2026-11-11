<script setup lang="ts">
import { useRoute } from 'vue-router';
import { watchEffect } from 'vue';
const route = useRoute();
watchEffect(() => {
  document.title = `${route.meta.title} — Календарь звонков`;
});
</script>
<template>
  <section>
    <h1>{{ route.meta.title }}</h1>
    <p>В этом разделе пока нет данных.</p>
    <p>Часовой пояс: Europe/Moscow</p>
  </section>
</template>
