<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import { ownerLogin } from '@call-calendar/api-contract';
import './api.js';

const route = useRoute();
const router = useRouter();
const login = ref('');
const password = ref('');
const message = ref('');
const busy = ref(false);
document.title = 'Вход владельца — Календарь звонков';
async function submit() {
  busy.value = true;
  message.value = '';
  try {
    const { data, error, response } = await ownerLogin({
      body: { login: login.value, password: password.value },
    });
    if (data) {
      password.value = '';
      const target =
        typeof route.query.returnTo === 'string' &&
        /^\/owner\/(bookings|meeting-types|schedule)$/.test(route.query.returnTo)
          ? route.query.returnTo
          : '/owner/bookings';
      await router.replace(target);
    } else {
      message.value =
        response?.status === 429
          ? 'Слишком много попыток. Попробуйте позже.'
          : (error?.message ?? 'Не удалось войти');
    }
  } catch {
    message.value = 'Не удалось связаться с сервером. Попробуйте снова.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <main class="page owner-page">
    <h1>Вход владельца</h1>
    <p v-if="route.query.expired" role="status">Сессия завершена, войдите снова</p>
    <form class="login-form" @submit.prevent="submit">
      <label for="owner-login">Логин</label>
      <InputText id="owner-login" v-model="login" autocomplete="username" required />
      <label for="owner-password">Пароль</label>
      <InputText
        id="owner-password"
        v-model="password"
        type="password"
        autocomplete="current-password"
        required
      />
      <p v-if="message" role="alert">{{ message }}</p>
      <Button type="submit" label="Войти" :loading="busy" />
    </form>
  </main>
</template>
