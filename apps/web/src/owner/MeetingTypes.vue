<script setup lang="ts">
import { onMounted, ref } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import {
  createMeetingType,
  listOwnerMeetingTypes,
  type MeetingType,
} from '@call-calendar/api-contract';
import { SessionExpired } from './api.js';
const items = ref<MeetingType[]>([]);
const loading = ref(true);
const failed = ref(false);
const busy = ref(false);
const title = ref('');
const description = ref('');
const duration = ref('30');
const errors = ref<Record<string, string>>({});
const message = ref('');
const warning = ref('');
async function load() {
  loading.value = true;
  failed.value = false;
  try {
    const result = await listOwnerMeetingTypes();
    if (!result.data) throw new Error();
    items.value = result.data.items;
  } catch (error) {
    if (!(error instanceof SessionExpired)) failed.value = true;
  } finally {
    loading.value = false;
  }
}
async function submit() {
  errors.value = {};
  message.value = '';
  warning.value = '';
  if ([...title.value.trim()].length < 1 || [...title.value.trim()].length > 100)
    errors.value.title = 'Название должно содержать от 1 до 100 символов';
  if ([...description.value].length > 2000)
    errors.value.description = 'Описание должно содержать не более 2000 символов';
  const minutes = Number(duration.value);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440)
    errors.value.durationMinutes = 'Длительность должна быть целым числом от 1 до 1440 минут';
  if (Object.keys(errors.value).length) return;
  busy.value = true;
  try {
    const { data, error } = await createMeetingType({
      body: { title: title.value, description: description.value, durationMinutes: minutes },
    });
    if (data) {
      items.value.push(data.meetingType);
      title.value = '';
      description.value = '';
      duration.value = '30';
      warning.value = data.warnings.map((item) => item.message).join(' ');
    } else {
      errors.value = error?.fieldErrors ?? {};
      message.value = error?.message ?? 'Не удалось создать тип встречи';
    }
  } catch (error) {
    if (!(error instanceof SessionExpired))
      message.value = 'Не удалось связаться с сервером. Попробуйте снова.';
  } finally {
    busy.value = false;
  }
}
onMounted(load);
</script>
<template>
  <section>
    <h1>Типы встреч</h1>
    <p v-if="loading" role="status">Загрузка типов встреч…</p>
    <div v-else-if="failed" role="alert">
      Не удалось загрузить типы встреч. <Button label="Повторить" @click="load" />
    </div>
    <template v-else>
      <p v-if="!items.length">Вы ещё не создали типы встреч</p>
      <article v-for="item in items" :key="item.id" class="meeting-card">
        <h2>{{ item.title }}</h2>
        <p class="plain-text">{{ item.description }}</p>
        <p>{{ item.durationMinutes }} минут</p>
        <RouterLink :to="`/book/${item.id}`">Открыть страницу встречи</RouterLink>
      </article>
      <h2>Новый тип встречи</h2>
      <form class="login-form" novalidate @submit.prevent="submit">
        <label for="type-title">Название</label
        ><InputText
          id="type-title"
          v-model="title"
          :aria-invalid="!!errors.title"
          aria-describedby="title-error"
          :disabled="busy"
        />
        <small v-if="errors.title" id="title-error" role="alert">{{ errors.title }}</small>
        <label for="type-description">Описание</label
        ><Textarea
          id="type-description"
          v-model="description"
          :aria-invalid="!!errors.description"
          aria-describedby="description-error"
          :disabled="busy"
        />
        <small v-if="errors.description" id="description-error" role="alert">{{
          errors.description
        }}</small>
        <label for="type-duration">Длительность, минут</label
        ><InputText
          id="type-duration"
          v-model="duration"
          type="number"
          min="1"
          max="1440"
          step="1"
          :aria-invalid="!!errors.durationMinutes"
          aria-describedby="duration-error"
          :disabled="busy"
        />
        <small v-if="errors.durationMinutes" id="duration-error" role="alert">{{
          errors.durationMinutes
        }}</small>
        <p v-if="message" role="alert">{{ message }}</p>
        <p v-if="warning" role="status">{{ warning }}</p>
        <Button type="submit" label="Создать тип встречи" :loading="busy" :disabled="busy" />
      </form>
    </template>
  </section>
</template>
