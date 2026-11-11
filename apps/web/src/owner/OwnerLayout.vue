<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ownerSession, ownerLogout } from '@call-calendar/api-contract';
import Button from 'primevue/button';
import { SessionExpired } from './api.js';

const route = useRoute();
const router = useRouter();
const ready = ref(false);
const message = ref('');
const busy = ref(false);
async function expired() {
  ready.value = false;
  await router.replace({ path: '/owner/login', query: { returnTo: route.path, expired: '1' } });
}
async function checkSession() {
  ready.value = false;
  message.value = '';
  try {
    const result = await ownerSession();
    ready.value = !!result.data;
    if (!result.data) message.value = 'Не удалось загрузить кабинет';
  } catch (error) {
    if (!(error instanceof SessionExpired)) message.value = 'Не удалось связаться с сервером';
  }
}
async function logout() {
  busy.value = true;
  try {
    const result = await ownerLogout();
    if (result.data) await router.replace('/owner/login');
    else message.value = 'Не удалось выйти. Попробуйте снова.';
  } catch (error) {
    if (!(error instanceof SessionExpired))
      message.value = 'Не удалось выйти. Проверьте соединение и повторите.';
  } finally {
    busy.value = false;
  }
}
function visible() {
  if (document.visibilityState === 'visible') void checkSession();
}
onMounted(() => {
  window.addEventListener('owner-session-expired', expired);
  document.addEventListener('visibilitychange', visible);
});
onBeforeUnmount(() => {
  window.removeEventListener('owner-session-expired', expired);
  document.removeEventListener('visibilitychange', visible);
});
watch(() => route.path, checkSession, { immediate: true });
</script>

<template>
  <main class="page owner-page">
    <p v-if="message" role="alert">
      {{ message }} <Button label="Повторить" @click="checkSession" />
    </p>
    <template v-if="ready">
      <nav class="owner-nav" aria-label="Кабинет владельца">
        <RouterLink to="/owner/bookings">Встречи</RouterLink>
        <RouterLink to="/owner/meeting-types">Типы встреч</RouterLink>
        <RouterLink to="/owner/schedule">Расписание</RouterLink>
        <Button label="Выйти" :loading="busy" severity="secondary" @click="logout" />
      </nav>
      <RouterView />
    </template>
    <p v-else-if="!message" role="status">Загрузка…</p>
  </main>
</template>
