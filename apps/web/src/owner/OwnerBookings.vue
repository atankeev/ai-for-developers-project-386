<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import Button from 'primevue/button';
import { listOwnerBookings, type OwnerBooking } from '@call-calendar/api-contract';
import { SessionExpired } from './api.js';
type Group = 'upcoming' | 'past';
type Page = {
  items: OwnerBooking[];
  nextCursor: string | null;
  loaded: boolean;
  loading: boolean;
  failed: boolean;
  generation: number;
};
const groups = [
  { id: 'upcoming' as const, label: 'Предстоящие и текущие', empty: 'Предстоящих встреч нет' },
  { id: 'past' as const, label: 'Прошедшие', empty: 'Прошедших встреч нет' },
];
const pages = reactive<Record<Group, Page>>({ upcoming: empty(), past: empty() });
function empty(): Page {
  return {
    items: [],
    nextCursor: null,
    loaded: false,
    loading: false,
    failed: false,
    generation: 0,
  };
}
const group = ref<Group>('upcoming');
const current = computed(() => pages[group.value]);
const expanded = reactive(new Set<string>());
const overflowing = reactive(new Set<string>());
const commentElements = new Map<string, HTMLElement>();
const now = ref(Date.now());
let timer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
const format = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(value));
function commentElement(id: string, element: unknown) {
  if (element instanceof HTMLElement) {
    commentElements.set(id, element);
    measure(id, element);
  } else commentElements.delete(id);
}
function measure(id: string, element: HTMLElement) {
  if (expanded.has(id)) return;
  if (element.scrollHeight > element.clientHeight + 1) overflowing.add(id);
  else overflowing.delete(id);
}
function measureComments() {
  for (const [id, element] of commentElements) measure(id, element);
}
async function load(target: Group, append = false) {
  const state = pages[target];
  if (append && (state.loading || !state.nextCursor)) return;
  const cursor = append ? state.nextCursor! : undefined;
  const generation = ++state.generation;
  state.loading = true;
  state.failed = false;
  if (!append) {
    state.items = [];
    state.loaded = false;
    state.nextCursor = null;
  }
  try {
    const result = await listOwnerBookings({
      query: { group: target, ...(cursor ? { cursor } : {}) },
    });
    if (!result.data) throw new Error();
    if (disposed || state.generation !== generation) return;
    const unique = new Map((append ? state.items : []).map((b) => [b.id, b]));
    for (const booking of result.data.items) unique.set(booking.id, booking);
    state.items = [...unique.values()];
    state.nextCursor = result.data.nextCursor;
    state.loaded = true;
  } catch (error) {
    if (!disposed && state.generation === generation && !(error instanceof SessionExpired))
      state.failed = true;
  } finally {
    if (!disposed && state.generation === generation) {
      state.loading = false;
      scheduleBoundary();
      await nextTick();
      measureComments();
    }
  }
}
function select(target: Group) {
  group.value = target;
  if (!pages[target].loaded && !pages[target].loading) void load(target);
}
function refresh() {
  for (const target of ['upcoming', 'past'] as const) {
    pages[target].generation++;
    pages[target].loading = false;
    if (target !== group.value)
      Object.assign(pages[target], empty(), { generation: pages[target].generation });
  }
  void load(group.value);
}
function scheduleBoundary() {
  clearTimeout(timer);
  now.value = Date.now();
  const upcoming = pages.upcoming;
  const ended = upcoming.items.filter((b) => Date.parse(b.endsAt) <= now.value);
  if (ended.length) {
    upcoming.items = upcoming.items.filter((b) => Date.parse(b.endsAt) > now.value);
    const merged = new Map([...pages.past.items, ...ended].map((b) => [b.id, b]));
    pages.past.items = [...merged.values()].sort(
      (a, b) => b.startsAt.localeCompare(a.startsAt) || b.id.localeCompare(a.id),
    );
  }
  const boundaries = upcoming.items
    .flatMap((b) => [Date.parse(b.startsAt), Date.parse(b.endsAt)])
    .filter((t) => t > now.value);
  if (boundaries.length)
    timer = setTimeout(
      scheduleBoundary,
      Math.min(2147483647, Math.max(1, Math.min(...boundaries) - now.value)),
    );
}
function visible() {
  if (document.visibilityState === 'visible') refresh();
}
onMounted(() => {
  void load(group.value);
  document.addEventListener('visibilitychange', visible);
  window.addEventListener('resize', measureComments);
});
onBeforeUnmount(() => {
  disposed = true;
  clearTimeout(timer);
  document.removeEventListener('visibilitychange', visible);
  window.removeEventListener('resize', measureComments);
});
</script>
<template>
  <section class="owner-bookings">
    <h1>Встречи</h1>
    <nav aria-label="Группы встреч" class="booking-groups">
      <Button
        v-for="option in groups"
        :key="option.id"
        :label="option.label"
        :aria-pressed="group === option.id"
        @click="select(option.id)"
      />
    </nav>
    <h2>{{ groups.find((option) => option.id === group)!.label }}</h2>
    <Button label="Обновить" :disabled="current.loading" @click="refresh" />
    <p v-if="current.loading" role="status">Загрузка…</p>
    <div v-if="current.failed" role="alert">
      {{
        current.loaded ? 'Не удалось загрузить следующую порцию' : 'Не удалось загрузить встречи'
      }}.
      <Button
        :label="current.loaded ? 'Повторить загрузку' : 'Повторить'"
        @click="load(group, current.loaded)"
      />
    </div>
    <p v-if="current.loaded && !current.items.length && !current.loading && !current.failed">
      {{ groups.find((option) => option.id === group)!.empty }}
    </p>
    <article v-for="booking in current.items" :key="booking.id" class="meeting-card">
      <h3>{{ booking.title }}</h3>
      <strong v-if="group === 'upcoming' && Date.parse(booking.startsAt) <= now">Идёт</strong>
      <p>{{ format(booking.startsAt) }} — {{ format(booking.endsAt) }} (Москва)</p>
      <p>{{ booking.durationMinutes }} минут</p>
      <p class="plain-text">{{ booking.description }}</p>
      <p>{{ booking.guestName }}</p>
      <p>{{ booking.guestEmail }}</p>
      <p
        v-if="booking.comment"
        :id="`comment-${booking.id}`"
        :ref="(element) => commentElement(booking.id, element)"
        class="plain-text booking-comment"
        :class="{ 'comment-collapsed': !expanded.has(booking.id) }"
      >
        {{ booking.comment }}
      </p>
      <Button
        v-if="overflowing.has(booking.id) || expanded.has(booking.id)"
        :label="expanded.has(booking.id) ? 'Свернуть комментарий' : 'Развернуть комментарий'"
        :aria-expanded="expanded.has(booking.id)"
        :aria-controls="`comment-${booking.id}`"
        @click="expanded.has(booking.id) ? expanded.delete(booking.id) : expanded.add(booking.id)"
      />
    </article>
    <Button
      v-if="current.nextCursor && !current.failed"
      label="Показать ещё"
      :disabled="current.loading"
      @click="load(group, true)"
    />
  </section>
</template>
<style scoped>
.owner-bookings {
  width: 100%;
  max-width: 48rem;
  margin-inline: auto;
  min-width: 0;
  overflow-wrap: anywhere;
}
.booking-groups {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.booking-comment {
  line-height: 1.5;
}
.comment-collapsed {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  overflow: hidden;
}
</style>
