<script setup lang="ts">
import { onMounted, ref } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import {
  getOwnerSchedule,
  replaceWeeklySchedule,
  type WeeklySchedule,
} from '@call-calendar/api-contract';
import ScheduleExceptions from './ScheduleExceptions.vue';
import { SessionExpired } from './api.js';
const week = ref<WeeklySchedule>();
const names = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const loading = ref(true);
const failed = ref(false);
const busy = ref(false);
const conflict = ref(false);
const message = ref('');
const saved = ref(false);
const errors = ref<Record<string, string>>({});
async function load() {
  loading.value = true;
  failed.value = false;
  try {
    const result = await getOwnerSchedule();
    if (!result.data) throw new Error();
    week.value = result.data;
    conflict.value = false;
    message.value = '';
    errors.value = {};
    saved.value = false;
  } catch (error) {
    if (!(error instanceof SessionExpired)) failed.value = true;
  } finally {
    loading.value = false;
  }
}
async function refreshExceptions() {
  try {
    const result = await getOwnerSchedule();
    if (result.data && week.value) week.value.exceptions = result.data.exceptions;
  } catch (error) {
    if (!(error instanceof SessionExpired))
      message.value = 'Не удалось обновить список исключений. Загрузите расписание заново.';
  }
}
async function save() {
  if (!week.value) return;
  busy.value = true;
  message.value = '';
  errors.value = {};
  saved.value = false;
  try {
    const { data, error } = await replaceWeeklySchedule({
      body: { expectedVersion: week.value.version, days: week.value.days },
    });
    if (data) {
      week.value = data;
      saved.value = true;
    } else {
      message.value = error?.message ?? 'Не удалось сохранить расписание';
      errors.value = error?.fieldErrors ?? {};
      conflict.value = error?.code === 'VERSION_CONFLICT';
    }
  } catch (error) {
    if (!(error instanceof SessionExpired))
      message.value = 'Не удалось связаться с сервером. Повторите сохранение.';
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>
<template>
  <section>
    <h1>Расписание</h1>
    <p>
      Рабочие часы — Europe/Moscow. Закрытый день оставьте без интервалов. Конец дня можно указать
      как 24:00.
    </p>
    <p v-if="loading" role="status">Загрузка расписания…</p>
    <div v-else-if="failed" role="alert">
      Не удалось загрузить расписание. <Button label="Повторить" @click="load" />
    </div>
    <form v-else-if="week" novalidate @submit.prevent="save">
      <fieldset v-for="day in week.days" :key="day.day" class="schedule-day" :disabled="busy">
        <legend>{{ names[day.day - 1] }}</legend>
        <p v-if="!day.intervals.length">Закрыто</p>
        <div v-for="(interval, index) in day.intervals" :key="index" class="working-interval">
          <label
            >Начало
            <InputText
              v-model="interval.start"
              :aria-label="`${names[day.day - 1]}: начало ${index + 1}`"
              :aria-invalid="!!errors[`days.${day.day}`]"
              placeholder="HH:mm"
          /></label>
          <label
            >Конец
            <InputText
              v-model="interval.end"
              :aria-label="`${names[day.day - 1]}: конец ${index + 1}`"
              :aria-invalid="!!errors[`days.${day.day}`]"
              placeholder="HH:mm"
          /></label>
          <Button
            label="Удалить"
            :aria-label="`Удалить интервал ${index + 1}: ${names[day.day - 1]}`"
            severity="secondary"
            @click="day.intervals.splice(index, 1)"
          />
        </div>
        <p v-if="errors[`days.${day.day}`]" role="alert">{{ errors[`days.${day.day}`] }}</p>
        <Button
          label="Добавить интервал"
          :aria-label="`Добавить интервал: ${names[day.day - 1]}`"
          severity="secondary"
          @click="day.intervals.push({ start: '09:00', end: '18:00' })"
        />
      </fieldset>
      <p v-if="message" role="alert">{{ message }}</p>
      <Button v-if="conflict" label="Загрузить актуальное расписание" @click="load" />
      <p v-if="saved" role="status">Расписание сохранено</p>
      <Button type="submit" label="Сохранить неделю" :disabled="busy || conflict" :loading="busy" />
    </form>
    <ScheduleExceptions
      v-if="week && !loading && !failed"
      :items="week.exceptions"
      @changed="refreshExceptions"
    />
  </section>
</template>
