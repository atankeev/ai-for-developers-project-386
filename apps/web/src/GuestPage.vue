<script setup lang="ts">
import Button from 'primevue/button';
import { RouterLink } from 'vue-router';
import { onMounted } from 'vue';
onMounted(() => {
  document.title = 'Календарь звонков';
});
</script>
<template>
  <main class="page">
    <header class="page-header">
      <span class="brand-mark" aria-hidden="true">К</span><span>Календарь звонков</span>
    </header>
    <section class="intro" aria-labelledby="page-title">
      <p class="eyebrow">Время для разговора</p>
      <h1 id="page-title">Ваши встречи.<br />В удобное время.</h1>
      <p class="description">
        Выберите тип встречи, свободное время и оставьте контакты без регистрации.
      </p>
    </section>
    <Button :as="RouterLink" to="/book" label="Записаться на встречу" />
  </main>
</template>
