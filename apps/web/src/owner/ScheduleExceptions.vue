<script setup lang="ts">
import { ref } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import {
  getScheduleException,
  replaceScheduleException,
  deleteScheduleException,
  type ScheduleException,
} from '@call-calendar/api-contract';
import { SessionExpired } from './api.js';
const props = defineProps<{ items: ScheduleException[] }>();
const emit = defineEmits<{ changed: [] }>();
const date = ref('');
const loaded = ref<ScheduleException>();
const busy = ref(false);
const conflict = ref(false);
const message = ref('');
const errors = ref<Record<string, string>>({});
async function load(value = date.value) {
  date.value = value;
  busy.value = true;
  loaded.value = undefined;
  message.value = '';
  errors.value = {};
  conflict.value = false;
  try {
    const result = await getScheduleException({ path: { date: value } });
    if (result.data) loaded.value = result.data;
    else {
      message.value = result.response
        ? (result.error?.message ?? 'Не удалось загрузить исключение')
        : 'Не удалось загрузить исключение. Повторите загрузку даты.';
      errors.value = result.error?.fieldErrors ?? {};
    }
  } catch (error) {
    if (!(error instanceof SessionExpired))
      message.value = 'Не удалось загрузить исключение. Повторите загрузку даты.';
  } finally {
    busy.value = false;
  }
}
async function save(remove = false) {
  if (!loaded.value) return;
  busy.value = true;
  message.value = '';
  errors.value = {};
  const path = { date: loaded.value.date };
  const expectedVersion = loaded.value.version;
  try {
    const result = remove
      ? await deleteScheduleException({ path, body: { expectedVersion } })
      : await replaceScheduleException({
          path,
          body: { expectedVersion, intervals: loaded.value.intervals ?? [] },
        });
    if (result.data) {
      loaded.value = result.data;
      message.value = remove ? 'Исключение удалено' : 'Исключение сохранено';
      emit('changed');
    } else {
      message.value = result.response
        ? (result.error?.message ?? 'Не удалось сохранить исключение')
        : 'Не удалось связаться с сервером. Повторите сохранение.';
      errors.value = result.error?.fieldErrors ?? {};
      conflict.value = result.error?.code === 'VERSION_CONFLICT';
    }
  } catch (error) {
    if (!(error instanceof SessionExpired))
      message.value = 'Не удалось связаться с сервером. Повторите сохранение.';
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <section aria-labelledby="exceptions-heading">
    <h2 id="exceptions-heading">Исключения на дату</h2>
    <p>
      Часы исключения полностью заменяют недельные часы. Пустое исключение закрывает день. Удаление
      возвращает недельные часы.
    </p>
    <p v-if="!props.items.length">Сохранённых исключений нет</p>
    <ul v-else>
      <li v-for="item in props.items" :key="item.date">
        <Button :label="item.date" :disabled="busy" severity="secondary" @click="load(item.date)" />
        {{
          item.intervals?.length
            ? item.intervals.map((i) => `${i.start}–${i.end}`).join(', ')
            : 'Закрыто'
        }}
      </li>
    </ul>
    <form class="login-form" @submit.prevent="load()">
      <label for="exception-date">Дата исключения</label
      ><InputText
        id="exception-date"
        v-model="date"
        placeholder="YYYY-MM-DD"
        :disabled="busy"
        :aria-invalid="!!errors.date"
      />
      <p v-if="errors.date" role="alert">{{ errors.date }}</p>
      <Button type="submit" label="Загрузить дату" :disabled="busy" />
    </form>
    <p v-if="busy" role="status">Загрузка или сохранение исключения…</p>
    <form v-if="loaded" @submit.prevent="save()">
      <fieldset :disabled="busy || conflict">
        <legend>{{ loaded.date }} — Europe/Moscow</legend>
        <p v-if="loaded.intervals === null">Исключения нет: действуют недельные часы</p>
        <p v-else-if="!loaded.intervals.length">День закрыт</p>
        <div
          v-for="(interval, index) in loaded.intervals ?? []"
          :key="index"
          class="working-interval"
        >
          <label
            >Начало
            <InputText
              v-model="interval.start"
              :aria-label="`Исключение: начало ${index + 1}`"
              :aria-invalid="!!errors.intervals"
          /></label>
          <label
            >Конец
            <InputText
              v-model="interval.end"
              :aria-label="`Исключение: конец ${index + 1}`"
              :aria-invalid="!!errors.intervals"
          /></label>
          <Button
            label="Удалить интервал"
            :aria-label="`Удалить интервал исключения ${index + 1}`"
            @click="loaded.intervals!.splice(index, 1)"
          />
        </div>
        <p v-if="errors.intervals" role="alert">{{ errors.intervals }}</p>
        <Button
          label="Добавить интервал исключения"
          severity="secondary"
          @click="(loaded.intervals ??= []).push({ start: '09:00', end: '18:00' })"
        />
        <Button label="Закрыть день" severity="secondary" @click="loaded.intervals = []" />
        <Button type="submit" label="Сохранить исключение" />
        <Button label="Удалить исключение" severity="secondary" @click="save(true)" />
      </fieldset>
    </form>
    <p v-if="message" :role="conflict || Object.keys(errors).length ? 'alert' : 'status'">
      {{ message }}
    </p>
    <Button v-if="conflict" label="Загрузить актуальное исключение" @click="load(loaded!.date)" />
  </section>
</template>
