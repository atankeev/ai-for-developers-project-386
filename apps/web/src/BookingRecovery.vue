<script setup lang="ts">
import { onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import {
  bookingState as state,
  initializeBookingRecovery,
  sendBookingAttempt,
} from './booking-state.js';
const router = useRouter();
onUnmounted(initializeBookingRecovery());
async function retry() {
  const result = await sendBookingAttempt();
  if (result?.data) await router.push(result.data.confirmationUrl);
  else if (result?.response && result.response.status < 500)
    window.dispatchEvent(new Event('booking-refused'));
}
</script>
<template>
  <section
    v-if="state.unknown || state.recoveryMessage"
    class="recovery-notice"
    aria-label="Результат записи"
  >
    <div v-if="state.unknown" role="alert">
      <p>
        Результат отправки неизвестен. Новая запись заблокирована. Повтор безопасно проверит ту же
        попытку.
      </p>
      <p v-if="state.pending">
        Отправленное время:
        {{
          new Intl.DateTimeFormat('ru-RU', {
            timeZone: 'Europe/Moscow',
            dateStyle: 'long',
            timeStyle: 'short',
          }).format(new Date(state.pending.startsAt))
        }}
        (Москва)
      </p>
      <Button
        label="Повторить ту же попытку"
        type="button"
        :disabled="state.sending"
        @click="retry"
      />
    </div>
    <p v-if="state.recoveryMessage" role="alert">{{ state.recoveryMessage }}</p>
  </section>
</template>
