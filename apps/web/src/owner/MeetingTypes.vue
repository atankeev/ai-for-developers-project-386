<script setup lang="ts">
import { onMounted, ref, nextTick } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Textarea from 'primevue/textarea';
import {
  createMeetingType,
  replaceMeetingType,
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
const editing = ref<MeetingType>();
const hidden = ref(false);
const conflict = ref(false);
const form = ref<HTMLFormElement>();
function reset() {
  editing.value = undefined;
  title.value = '';
  description.value = '';
  duration.value = '30';
  hidden.value = false;
  errors.value = {};
  message.value = '';
  conflict.value = false;
}
async function edit(item: MeetingType) {
  editing.value = { ...item };
  title.value = item.title;
  description.value = item.description;
  duration.value = String(item.durationMinutes);
  hidden.value = item.hidden;
  errors.value = {};
  message.value = '';
  conflict.value = false;
  warning.value = '';
  await nextTick();
  form.value?.querySelector<HTMLInputElement>('input')?.focus();
}
async function reloadEditing() {
  const id = editing.value?.id;
  await load();
  const current = items.value.find((item) => item.id === id);
  if (!failed.value && current) await edit(current);
}
async function focusError() {
  await nextTick();
  form.value?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
}
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
  if (Object.keys(errors.value).length) {
    await focusError();
    return;
  }
  busy.value = true;
  try {
    const body = { title: title.value, description: description.value, durationMinutes: minutes };
    const { data, error } = editing.value
      ? await replaceMeetingType({
          path: { id: editing.value.id },
          body: { ...body, hidden: hidden.value, expectedVersion: editing.value.version },
        })
      : await createMeetingType({ body });
    if (data) {
      const index = items.value.findIndex((item) => item.id === data.meetingType.id);
      if (index < 0) items.value.push(data.meetingType);
      else items.value[index] = data.meetingType;
      reset();
      warning.value = data.warnings.map((item) => item.message).join(' ');
    } else {
      errors.value = error?.fieldErrors ?? {};
      conflict.value = error?.code === 'VERSION_CONFLICT';
      message.value = error?.message ?? 'Не удалось сохранить тип встречи';
      if (Object.keys(errors.value).length) await focusError();
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
        <p v-if="item.hidden">Скрыт в каталоге</p>
        <Button :label="`Редактировать ${item.title}`" :disabled="busy" @click="edit(item)" />
        <RouterLink :to="`/book/${item.id}`">Открыть страницу встречи</RouterLink>
      </article>
      <h2>{{ editing ? 'Редактировать тип встречи' : 'Новый тип встречи' }}</h2>
      <form ref="form" class="login-form" novalidate @submit.prevent="submit">
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
        <label v-if="editing" for="type-hidden">
          <input id="type-hidden" v-model="hidden" type="checkbox" :disabled="busy" />
          Скрыть тип в каталоге
        </label>
        <p v-if="message" role="alert">{{ message }}</p>
        <p v-if="warning" role="status">{{ warning }}</p>
        <Button
          v-if="conflict"
          label="Загрузить актуальные данные"
          :disabled="busy"
          @click="reloadEditing"
        />
        <Button
          type="submit"
          :label="editing ? 'Сохранить тип встречи' : 'Создать тип встречи'"
          :loading="busy"
          :disabled="busy || conflict"
        />
        <Button v-if="editing" label="Отменить редактирование" :disabled="busy" @click="reset" />
      </form>
    </template>
  </section>
</template>
